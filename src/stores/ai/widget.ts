/**
 * @file widget.ts
 * @description Widget Pinia Store，管理目录索引、启用状态与懒加载内容缓存。
 */
import { ref } from 'vue';
import { defineStore } from 'pinia';
import { joinPath, parseWidgetJson, scanWidgetDirectories, type WidgetScannerAPI } from '@/ai/widget';
import type { WidgetEntry, WidgetIndex, WidgetScanConfig } from '@/ai/widget/types';
import { local } from '@/shared/storage/base';
import { asyncTo } from '@/utils/asyncTo';
import { SharedRequest } from '@/utils/sharedRequest';

/** 按目录 ID 持久化禁用状态的键名。 */
const STORAGE_KEY_DISABLED_IDS = 'widget.disabledIds';

/**
 * 从本地存储读取数据。
 * @param key - 存储键名
 * @param defaults - 数据不存在时的默认值
 * @returns 已存储的数据或默认值
 */
function loadFromStorage<T>(key: string, defaults: T): T {
  const saved = local.getItem<unknown>(key);
  return saved !== null && saved !== undefined ? (saved as T) : defaults;
}

/**
 * 统一目录路径分隔符并移除末尾斜杠。
 * @param dirPath - 原始目录路径
 * @returns 规范化目录路径
 */
function normalizeDirPath(dirPath: string): string {
  return dirPath.replace(/\\/g, '/').replace(/\/+$/, '');
}

/**
 * 从目录路径读取资源 ID。
 * @param dirPath - Widget 目录路径
 * @returns 目录末段名称
 */
function readDirectoryId(dirPath: string): string {
  return normalizeDirPath(dirPath).split('/').filter(Boolean).at(-1) ?? '';
}

/**
 * Widget Pinia Store。
 */
export const useWidgetStore = defineStore('widget', () => {
  /** 已发现的 Widget 目录及其可选内容缓存。 */
  const widgets = ref<WidgetEntry[]>([]);

  /** 是否已完成首次目录扫描。 */
  const initialized = ref(false);

  /** 扫描配置。 */
  const scanConfig = ref<WidgetScanConfig>({
    homeDir: ''
  });

  /** 初始化等待屏障。 */
  let initPromise: Promise<void> | null = null;
  /** 初始化等待屏障完成回调。 */
  let resolveInitPromise: (() => void) | null = null;
  /** 合并重复初始化调用的任务。 */
  let initTaskPromise: Promise<void> | null = null;
  /** 合并并发目录刷新的任务。 */
  let refreshPromise: Promise<void> | null = null;
  /** 初始化时注入的平台 API。 */
  let cachedApi: WidgetScannerAPI | null = null;
  /** 目录 watcher 事件修订序号，用于识别扫描期间发生的增删。 */
  let directoryRevision = 0;

  /**
   * 按目录 ID 查找 Widget。
   * @param id - Widget 目录 ID
   * @returns 匹配的 Store 条目
   */
  function getWidgetById(id: string): WidgetEntry | undefined {
    return widgets.value.find((widget: WidgetEntry): boolean => widget.id === id);
  }

  /**
   * 获取已启用且成功解析的 Widget。
   * @returns 当前可用于聊天或工具执行的条目
   */
  function getEnabledWidgets(): WidgetEntry[] {
    return widgets.value.filter((widget: WidgetEntry): boolean => widget.enabled && !!widget.definition && !widget.definition.parseError);
  }

  /**
   * 读取已禁用目录 ID。
   * @returns 已禁用 Widget ID 集合
   */
  function getDisabledIds(): Set<string> {
    return new Set(loadFromStorage<string[]>(STORAGE_KEY_DISABLED_IDS, []));
  }

  /**
   * 持久化当前禁用目录 ID。
   */
  function persistDisabledIds(): void {
    const disabledIds = widgets.value.filter((widget: WidgetEntry): boolean => !widget.enabled).map((widget: WidgetEntry): string => widget.id);
    local.setItem(STORAGE_KEY_DISABLED_IDS, disabledIds);
  }

  /**
   * 为新发现目录创建未加载条目。
   * @param index - Widget 目录索引
   * @param disabledIds - 已持久化的禁用目录 ID
   * @returns Store 条目
   */
  function createWidgetEntry(index: WidgetIndex, disabledIds: Set<string>): WidgetEntry {
    return {
      ...index,
      enabled: !disabledIds.has(index.id),
      revision: 0
    };
  }

  /**
   * 将扫描结果合并到 Store，同时保留未变化目录的内容缓存。
   * @param discovered - 最新目录索引
   */
  function applyWidgetIndices(discovered: WidgetIndex[]): void {
    const previousById = new Map(widgets.value.map((widget: WidgetEntry): [string, WidgetEntry] => [widget.id, widget]));
    const disabledIds = getDisabledIds();
    const nextWidgets = discovered.map((index: WidgetIndex): WidgetEntry => {
      const previous = previousById.get(index.id);
      if (previous && previous.dirPath === index.dirPath && previous.filePath === index.filePath) {
        return previous;
      }

      if (previous) {
        previous.revision += 1;
      }
      return createWidgetEntry(index, disabledIds);
    });

    const nextIds = new Set(discovered.map((index: WidgetIndex): string => index.id));
    for (const previous of widgets.value) {
      if (!nextIds.has(previous.id)) {
        previous.revision += 1;
      }
    }
    widgets.value = nextWidgets;
  }

  /**
   * 将入口文件原文解析并写入当前 Store 条目。
   * @param widget - 目标 Widget 条目
   * @param sourceContent - 完整 widget.json 原文
   */
  function applyWidgetContent(widget: WidgetEntry, sourceContent: string): void {
    widget.sourceContent = sourceContent;
    widget.definition = parseWidgetJson(sourceContent, widget.filePath);
    widget.loadError = undefined;
  }

  /**
   * 从磁盘执行一次 Widget 首次加载。
   * @param id - Widget 目录 ID
   * @returns 已加载或被更新操作替代的当前条目
   */
  async function loadWidget(id: string): Promise<WidgetEntry> {
    const widget = getWidgetById(id);
    if (!widget || !cachedApi) {
      throw new Error(`Widget not found: ${id}`);
    }

    if (widget.sourceContent !== undefined) {
      return widget;
    }

    const { revision } = widget;
    const [readError, file] = await asyncTo(cachedApi.readFile(widget.filePath));
    if (readError) {
      const current = getWidgetById(id);
      if (current === widget && current.revision === revision) {
        current.loadError = readError.message;
        throw readError;
      }

      // 旧 Entry 读取失败时，应用内保存可直接返回缓存，目录替换则继续读取当前 Entry。
      if (!current) {
        throw readError;
      }
      if (current.sourceContent !== undefined) {
        return current;
      }
      return loadWidget(id);
    }

    const current = getWidgetById(id);
    if (!current) {
      throw new Error(`Widget not found: ${id}`);
    }

    if (current === widget && current.revision === revision) {
      applyWidgetContent(current, file.content);
      return current;
    }

    // 应用内保存可以直接返回缓存；目录被替换时递归读取新条目。
    if (current.sourceContent !== undefined) {
      return current;
    }
    return loadWidget(id);
  }

  /** 按 Widget ID 共享执行中的首次加载请求。 */
  const sharedWidgetRequest = new SharedRequest<string, WidgetEntry>(loadWidget);

  /**
   * 获取 Widget 内容；首次从磁盘读取，之后返回 Store 缓存。
   * @param id - Widget 目录 ID
   * @returns 当前 Store 条目；目录不存在时返回 undefined
   */
  async function getWidget(id: string): Promise<WidgetEntry | undefined> {
    const widget = getWidgetById(id);
    if (!widget) {
      return undefined;
    }
    if (widget.sourceContent !== undefined) {
      return widget;
    }

    const [, loadedWidget] = await asyncTo(sharedWidgetRequest.fetch(id));
    return loadedWidget ?? getWidgetById(id);
  }

  /**
   * 获取当前全部 Widget，单项读取失败通过 Entry.loadError 表达。
   * @returns 与当前目录顺序一致且仍存在的 Store 条目
   */
  async function getWidgets(): Promise<WidgetEntry[]> {
    const loadedWidgets = await Promise.all(widgets.value.map((widget: WidgetEntry): Promise<WidgetEntry | undefined> => getWidget(widget.id)));
    return loadedWidgets.filter((widget: WidgetEntry | undefined): widget is WidgetEntry => widget !== undefined);
  }

  /**
   * 用应用内最新原文更新 Widget 内容缓存。
   * @param id - Widget 目录 ID
   * @param sourceContent - 最新完整 widget.json 原文
   * @returns 更新后的条目
   */
  function updateWidgetContent(id: string, sourceContent: string): WidgetEntry | undefined {
    const widget = getWidgetById(id);
    if (!widget) {
      return undefined;
    }

    widget.revision += 1;
    applyWidgetContent(widget, sourceContent);
    return widget;
  }

  /**
   * 切换 Widget 启用状态并按目录 ID 持久化。
   * @param id - Widget 目录 ID
   */
  function toggleWidget(id: string): void {
    const widget = getWidgetById(id);
    if (!widget) {
      return;
    }

    widget.enabled = !widget.enabled;
    persistDisabledIds();
  }

  /**
   * 处理直接子目录的新增或删除事件。
   * @param type - 目录事件类型
   * @param dirPath - Widget 资源目录路径
   */
  function handleWidgetDirectory(type: 'add' | 'unlink', dirPath: string): void {
    const normalizedDirPath = normalizeDirPath(dirPath);
    const id = readDirectoryId(normalizedDirPath);
    if (!id || id.startsWith('.')) {
      return;
    }
    directoryRevision += 1;

    const existingIndex = widgets.value.findIndex((widget: WidgetEntry): boolean => normalizeDirPath(widget.dirPath) === normalizedDirPath);
    if (type === 'unlink') {
      if (existingIndex !== -1) {
        widgets.value[existingIndex].revision += 1;
        widgets.value.splice(existingIndex, 1);
      }
      return;
    }

    const existingById = getWidgetById(id);
    if (existingById?.dirPath === normalizedDirPath) {
      return;
    }
    if (existingById) {
      existingById.revision += 1;
      widgets.value.splice(widgets.value.indexOf(existingById), 1);
    }

    widgets.value.push(
      createWidgetEntry(
        {
          id,
          dirPath: normalizedDirPath,
          filePath: joinPath(normalizedDirPath, 'widget.json')
        },
        getDisabledIds()
      )
    );
  }

  /**
   * 扫描目录直到扫描期间没有新的 watcher 事件。
   * @returns 稳定时刻的 Widget 目录索引
   */
  async function scanStableWidgets(): Promise<WidgetIndex[]> {
    if (!cachedApi) {
      return [];
    }

    const scanRevision = directoryRevision;
    const discovered = await scanWidgetDirectories(scanConfig.value, cachedApi);
    if (scanRevision !== directoryRevision) {
      return scanStableWidgets();
    }

    return discovered;
  }

  /**
   * 重新扫描 Widget 目录索引。
   */
  async function refreshWidgets(): Promise<void> {
    if (!cachedApi || !scanConfig.value.homeDir) {
      return;
    }
    if (!refreshPromise) {
      refreshPromise = scanStableWidgets()
        .then((discovered: WidgetIndex[]): void => {
          applyWidgetIndices(discovered);
        })
        .finally((): void => {
          refreshPromise = null;
        });
    }
    await refreshPromise;
  }

  /**
   * 在异步布局挂载前建立初始化等待屏障。
   */
  function prepareInitialization(): void {
    if (initialized.value || initPromise) {
      return;
    }

    initPromise = new Promise<void>((resolve: () => void): void => {
      resolveInitPromise = resolve;
    });
  }

  /**
   * 完成初始化等待屏障。
   */
  function finishInitialization(): void {
    initialized.value = true;
    resolveInitPromise?.();
    resolveInitPromise = null;
    initPromise ??= Promise.resolve();
  }

  /**
   * 初始化 Widget 目录索引。
   * @param homeDir - 用户主目录路径
   * @param api - 平台文件 API
   */
  async function init(homeDir: string, api: WidgetScannerAPI): Promise<void> {
    if (initTaskPromise) {
      return initTaskPromise;
    }

    prepareInitialization();
    scanConfig.value.homeDir = homeDir;
    cachedApi = api;
    initTaskPromise = (async (): Promise<void> => {
      try {
        await refreshWidgets();
      } catch (error: unknown) {
        console.error('Widget scan failed:', error);
      } finally {
        finishInitialization();
      }
    })();
    return initTaskPromise;
  }

  /**
   * 等待首次目录扫描完成。
   */
  async function waitForInit(): Promise<void> {
    if (initialized.value) {
      return;
    }
    if (initPromise) {
      await initPromise;
    }
  }

  return {
    widgets,
    initialized,
    scanConfig,
    getWidgetById,
    getEnabledWidgets,
    getWidget,
    getWidgets,
    updateWidgetContent,
    toggleWidget,
    handleWidgetDirectory,
    refreshWidgets,
    prepareInitialization,
    finishInitialization,
    init,
    waitForInit
  };
});
