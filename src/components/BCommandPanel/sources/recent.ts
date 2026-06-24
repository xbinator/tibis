/**
 * @file recent.ts
 * @description BCommandPanel 最近记录 source，负责文件、WebView、URL 与绝对路径候选项。
 */
import type { CommandPanelActionItem, CommandPanelGroup, CommandPanelIconContext, CommandPanelSource } from '../types';
import type { VNodeChild } from 'vue';
import { debounce } from 'lodash-es';
import type { RecentRecord, StoredFile } from '@/shared/storage';
import { WEB_RECORD_ICON } from '@/utils/file/icons';
import { resolveFileTitle } from '@/utils/file/title';

/**
 * 路径状态。
 */
interface PathStatus {
  /** 路径是否存在。 */
  exists: boolean;
  /** 路径是否为普通文件。 */
  isFile: boolean;
}

/**
 * 最近记录图标渲染输入。
 */
export interface RecentIconRenderInput {
  /** 最近记录。 */
  record?: RecentRecord;
  /** 独立文件名。 */
  fileName?: string;
  /** 显式图标。 */
  icon?: string;
}

/**
 * 最近记录动作返回值。
 */
type RecentSourceActionResult = Promise<unknown> | unknown;

/**
 * 最近记录 source 依赖。
 */
export interface RecentSourceDeps {
  /** 获取当前最近记录。 */
  getRecords: () => RecentRecord[];
  /** 确保最近记录已加载。 */
  ensureLoaded: () => Promise<void> | void;
  /** 打开文件记录。 */
  openFile: (record: StoredFile) => RecentSourceActionResult;
  /** 按绝对路径打开文件。 */
  openFileByPath: (path: string) => RecentSourceActionResult;
  /** 打开 WebView URL。 */
  openWebview: (url: URL) => void;
  /** 删除最近记录。 */
  removeRecent: (id: string) => Promise<void>;
  /** 删除关联 tab。 */
  removeTab: (id: string) => void;
  /** 获取路径状态。 */
  getPathStatus: (path: string) => Promise<PathStatus>;
  /** 路径状态检查 debounce 时间。 */
  pathDebounceMs?: number;
  /** 渲染最近记录图标。 */
  renderRecentIcon: (item: RecentIconRenderInput, context: CommandPanelIconContext) => VNodeChild;
}

/** 最近记录分组 key。 */
const RECENT_GROUP_KEY = 'recent';

/** 默认路径状态检查 debounce 时间。 */
const DEFAULT_PATH_DEBOUNCE_MS = 120;

/**
 * 判断输入是否为绝对路径。
 * @param value - 输入内容
 * @returns 是否为绝对路径
 */
function isAbsolutePathInput(value: string): boolean {
  return value.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(value);
}

/**
 * 判断输入是否为 http/https URL。
 * @param value - 输入内容
 * @returns 是否为 http/https URL
 */
function isHttpUrlInput(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

/**
 * 转义正则关键字。
 * @param value - 原始字符串
 * @returns 可安全用于正则的字符串
 */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 创建带 debounce 和 token 保护的路径状态检查器。
 * @param deps - source 依赖
 * @returns 路径状态检查函数
 */
function createPathStatusChecker(deps: RecentSourceDeps): (path: string) => Promise<PathStatus | null> {
  const wait = deps.pathDebounceMs ?? DEFAULT_PATH_DEBOUNCE_MS;
  let token = 0;
  let pendingResolve: ((status: PathStatus | null) => void) | undefined;

  /**
   * 执行路径状态检查。
   * @param path - 目标路径
   * @param currentToken - 当前请求 token
   * @param resolve - Promise resolve 函数
   */
  async function run(path: string, currentToken: number, resolve: (status: PathStatus | null) => void): Promise<void> {
    try {
      const status = await deps.getPathStatus(path);
      resolve(currentToken === token ? status : null);
    } catch {
      resolve(null);
    }
  }

  if (wait <= 0) {
    return async (path: string): Promise<PathStatus | null> => {
      const currentToken = ++token;
      return new Promise((resolve) => {
        run(path, currentToken, resolve).catch(() => resolve(null));
      });
    };
  }

  const debouncedRun = debounce((path: string, currentToken: number, resolve: (status: PathStatus | null) => void): void => {
    run(path, currentToken, resolve).catch(() => resolve(null));
  }, wait);

  return (path: string): Promise<PathStatus | null> => {
    const currentToken = ++token;
    pendingResolve?.(null);

    return new Promise((resolve) => {
      pendingResolve = resolve;
      debouncedRun(path, currentToken, (status: PathStatus | null): void => {
        if (pendingResolve === resolve) {
          pendingResolve = undefined;
        }
        resolve(status);
      });
    });
  };
}

/**
 * 创建 URL 候选项。
 * @param value - 输入内容
 * @param deps - source 依赖
 * @returns URL 候选项，不合法时返回 null
 */
function createUrlItem(value: string, deps: RecentSourceDeps): CommandPanelActionItem | null {
  if (!isHttpUrlInput(value)) {
    return null;
  }

  try {
    const url = new URL(value);
    return {
      key: url.href,
      kind: 'url',
      title: url.host,
      description: url.href,
      meta: '在 Webview 中打开',
      onSelect: (): void => deps.openWebview(url),
      renderIcon: (context) => deps.renderRecentIcon({ icon: WEB_RECORD_ICON }, context)
    };
  } catch {
    return null;
  }
}

/**
 * 创建绝对路径候选项。
 * @param value - 输入内容
 * @param deps - source 依赖
 * @param getPathStatus - 路径状态检查函数
 * @returns 绝对路径候选项，不合法时返回 null
 */
async function createAbsolutePathItem(
  value: string,
  deps: RecentSourceDeps,
  getPathStatus: (path: string) => Promise<PathStatus | null>
): Promise<CommandPanelActionItem | null> {
  if (!isAbsolutePathInput(value)) {
    return null;
  }

  const status = await getPathStatus(value);
  if (!status?.exists || !status.isFile) {
    return null;
  }

  const fileName = value.split(/[\\/]/).at(-1) || value;
  return {
    key: value,
    kind: 'absolute-path',
    title: fileName,
    description: value,
    meta: '按路径打开',
    onSelect: async (): Promise<void> => {
      await deps.openFileByPath(value);
    },
    renderIcon: (context) => deps.renderRecentIcon({ fileName }, context)
  };
}

/**
 * 判断最近记录是否匹配关键词。
 * @param record - 最近记录
 * @param re - 搜索正则
 * @returns 是否匹配
 */
function isRecordMatched(record: RecentRecord, re: RegExp): boolean {
  if (record.type === 'file') {
    const searchable = [resolveFileTitle(record), record.name, record.ext, record.path, record.content].filter(Boolean).join('\0');
    return re.test(searchable);
  }

  const searchable = [record.url, record.title].filter(Boolean).join('\0');
  return re.test(searchable);
}

/**
 * 将最近记录转换为命令面板项。
 * @param record - 最近记录
 * @param deps - source 依赖
 * @returns 命令面板动作项
 */
function createRecentRecordItem(record: RecentRecord, deps: RecentSourceDeps): CommandPanelActionItem {
  if (record.type === 'webview') {
    return {
      key: record.id,
      kind: 'webview',
      title: record.title,
      description: record.url,
      removable: true,
      onSelect: (): void => deps.openWebview(new URL(record.url)),
      onRemove: async (): Promise<void> => deps.removeRecent(record.id),
      renderIcon: (context) => deps.renderRecentIcon({ record }, context)
    };
  }

  const isUnsaved = !record.path;
  return {
    key: record.id,
    kind: 'file',
    title: resolveFileTitle(record),
    description: isUnsaved ? '未保存文件' : record.path ?? '',
    descriptionClass: isUnsaved ? 'is-unsaved' : '',
    removable: true,
    onSelect: async (): Promise<void> => {
      await deps.openFile(record);
    },
    onRemove: async (): Promise<void> => {
      await deps.removeRecent(record.id);
      deps.removeTab(record.id);
    },
    renderIcon: (context) => deps.renderRecentIcon({ record }, context)
  };
}

/**
 * 创建最近记录 source。
 * @param deps - source 依赖
 * @returns 最近记录 source
 */
export function createRecentSource(deps: RecentSourceDeps): CommandPanelSource {
  const getPathStatus = createPathStatusChecker(deps);

  return {
    id: 'recent',
    load: deps.ensureLoaded,
    search: async (keyword: string): Promise<CommandPanelGroup[]> => {
      const query = keyword.trim();
      const items: CommandPanelActionItem[] = [];
      const urlItem = createUrlItem(query, deps);
      const pathItem = urlItem ? null : await createAbsolutePathItem(query, deps, getPathStatus);

      if (urlItem) {
        items.push(urlItem);
      }
      if (pathItem) {
        items.push(pathItem);
      }

      const records = deps.getRecords();
      const filteredRecords = query ? records.filter((record) => isRecordMatched(record, new RegExp(escapeRegExp(query), 'i'))) : records;

      for (const record of filteredRecords) {
        if (pathItem && record.type === 'file' && record.path === pathItem.description) {
          continue;
        }
        items.push(createRecentRecordItem(record, deps));
      }

      return [{ key: RECENT_GROUP_KEY, items }];
    }
  };
}
