/**
 * @file widget.ts
 * @description 小组件 Pinia Store，管理 .tibis/widgets/<name>/widget.json 发现结果和启用状态。
 */
import { ref } from 'vue';
import { defineStore } from 'pinia';
import { scanWidgets, type WidgetScannerAPI } from '@/ai/widget';
import type { WidgetDefinition, WidgetScanConfig } from '@/ai/widget/types';
import { local } from '@/shared/storage/base';

/** localStorage 持久化键名。 */
const STORAGE_KEY_DISABLED_IDS = 'widget.disabledIds';

/**
 * 从 localStorage 加载数据。
 * @param key - 存储键名
 * @param defaults - 默认值
 * @returns 加载的数据或默认值
 */
function loadFromStorage<T>(key: string, defaults: T): T {
  const saved = local.getItem<unknown>(key);

  return saved !== null && saved !== undefined ? (saved as T) : defaults;
}

/**
 * 小组件 Pinia Store。
 */
export const useWidgetStore = defineStore('widget', () => {
  /** 已发现的所有小组件。 */
  const widgets = ref<WidgetDefinition[]>([]);
  /** 是否已完成初始化扫描。 */
  const initialized = ref(false);
  /** 初始化 Promise，用于合并并发扫描。 */
  let initPromise: Promise<void> | null = null;
  /** 缓存的扫描 API，用于 rescan。 */
  let cachedApi: WidgetScannerAPI | null = null;
  /** 扫描配置。 */
  const scanConfig = ref<WidgetScanConfig>({
    homeDir: ''
  });

  /**
   * 按 ID 查找小组件。
   * @param id - 小组件 ID
   * @returns 匹配的小组件或 undefined
   */
  function getWidgetById(id: string): WidgetDefinition | undefined {
    return widgets.value.find((widget: WidgetDefinition): boolean => widget.id === id);
  }

  /**
   * 获取已启用且无解析错误的小组件列表。
   * @returns 可用小组件列表
   */
  function getEnabledWidgets(): WidgetDefinition[] {
    return widgets.value.filter((widget: WidgetDefinition): boolean => widget.enabled && !widget.parseError);
  }

  /**
   * 持久化禁用小组件 ID 列表。
   */
  function persistDisabledIds(): void {
    const disabledIds = widgets.value.filter((widget: WidgetDefinition): boolean => !widget.enabled).map((widget: WidgetDefinition): string => widget.id);
    local.setItem(STORAGE_KEY_DISABLED_IDS, disabledIds);
  }

  /**
   * 切换小组件启用状态。
   * @param id - 小组件 ID
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
   * 添加或更新小组件定义。
   * @param widget - 小组件定义
   */
  function upsertWidget(widget: WidgetDefinition): void {
    const index = widgets.value.findIndex((item: WidgetDefinition): boolean => item.id === widget.id);

    if (index >= 0) {
      widgets.value.splice(index, 1, widget);
    } else {
      widgets.value.push(widget);
    }

    persistDisabledIds();
  }

  /**
   * 初始化小组件列表。
   * @param homeDir - 用户主目录路径
   * @param api - 扫描依赖 API
   * @returns 初始化完成信号
   */
  async function init(homeDir: string, api: WidgetScannerAPI): Promise<void> {
    if (initPromise) {
      return initPromise;
    }

    scanConfig.value.homeDir = homeDir;
    cachedApi = api;
    initPromise = (async (): Promise<void> => {
      try {
        const discovered = await scanWidgets({ homeDir }, api);
        const disabledIds = loadFromStorage<string[]>(STORAGE_KEY_DISABLED_IDS, []);

        for (const widget of discovered) {
          if (disabledIds.includes(widget.id)) {
            widget.enabled = false;
          }
        }

        widgets.value = discovered;
        initialized.value = true;
      } catch (error: unknown) {
        console.error('Widget scan failed:', error);
        initialized.value = true;
      }
    })();

    return initPromise;
  }

  /**
   * 重新扫描小组件目录。
   * @returns 重新扫描完成信号
   */
  async function rescan(): Promise<void> {
    if (!cachedApi || !scanConfig.value.homeDir) {
      console.warn('Widget rescan called before init');
      return;
    }

    initPromise = null;
    initialized.value = false;
    await init(scanConfig.value.homeDir, cachedApi);
  }

  /**
   * 等待初始化完成。
   * @returns 初始化完成信号
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
    toggleWidget,
    upsertWidget,
    init,
    rescan,
    waitForInit
  };
});
