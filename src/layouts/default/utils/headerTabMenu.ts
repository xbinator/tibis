/**
 * @file headerTabMenu.ts
 * @description 解析顶部标签右键菜单命令和资源复制动作。
 */
import type { RecentRecord, WebviewRecord } from '@/shared/storage';
import { createRecentKey, isDocumentRecord } from '@/shared/storage';
import type { Tab } from '@/stores/workspace/tabs';

/**
 * 顶部标签右键菜单命令。
 */
export type HeaderTabMenuCommand = 'close' | 'closeOthers' | 'closeRight' | 'closeAll' | 'copyPath' | 'copyAddress';

/**
 * 顶部标签资源复制命令。
 */
export type HeaderTabCopyCommand = Extract<HeaderTabMenuCommand, 'copyPath' | 'copyAddress'>;

/**
 * 顶部标签资源复制动作。
 */
export interface HeaderTabCopyAction {
  /** 复制命令。 */
  command: HeaderTabCopyCommand;
  /** 需要写入剪贴板的内容。 */
  content: string;
  /** 复制成功提示文案。 */
  successMessage: string;
}

const COPY_PATH_MESSAGE = '已复制路径';
const COPY_ADDRESS_MESSAGE = '已复制地址';

/**
 * 判断最近记录是否为 WebView 记录。
 * @param record - 最近记录
 * @returns 是否为 WebView 记录
 */
function isWebviewRecord(record: RecentRecord | undefined): record is WebviewRecord {
  return record?.type === 'webview';
}

/**
 * 安全解码路由中的 URL 字段。
 * @param value - 原始 URL 字段
 * @returns 解码后的 URL 字段
 */
function decodeRouteValue(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * 将最近记录列表索引为稳定键映射。
 * @param records - 最近记录列表
 * @returns 最近记录稳定键映射
 */
function createRecentRecordMap(records: RecentRecord[]): Map<string, RecentRecord> {
  return new Map(records.map((record: RecentRecord): [string, RecentRecord] => [createRecentKey(record), record]));
}

/**
 * 从 WebView 标签路径解析页面 URL。
 * @param path - 标签页路由路径
 * @returns 页面 URL；非 WebView 路由或缺少 URL 时返回空字符串
 */
export function getWebviewUrlFromTabPath(path: string): string {
  if (!path.startsWith('/webview/')) return '';

  const queryStartIndex = path.indexOf('?');
  if (queryStartIndex === -1) return '';

  const url = new URLSearchParams(path.slice(queryStartIndex + 1)).get('url') ?? '';
  return url ? decodeRouteValue(url).trim() : '';
}

/**
 * 根据标签页 recentKey 读取最近记录。
 * @param tab - 标签页
 * @param recordsByKey - 最近记录稳定键映射
 * @returns 命中的最近记录
 */
function getRecordByRecentKey(tab: Tab, recordsByKey: ReadonlyMap<string, RecentRecord>): RecentRecord | undefined {
  const recentKey = tab.recentKey?.trim() ?? '';
  return recentKey ? recordsByKey.get(recentKey) : undefined;
}

/**
 * 根据标签页路径匹配 WebView 最近记录。
 * @param tab - 标签页
 * @param records - 最近记录列表
 * @returns 命中的 WebView 最近记录
 */
function getWebviewRecordByPath(tab: Tab, records: RecentRecord[]): WebviewRecord | undefined {
  const webviewUrl = getWebviewUrlFromTabPath(tab.path);
  if (!webviewUrl) return undefined;

  return records.find((record: RecentRecord): record is WebviewRecord => isWebviewRecord(record) && record.url === webviewUrl);
}

/**
 * 创建文件路径复制动作。
 * @param record - 最近记录
 * @returns 文件路径复制动作；非文件或路径为空时返回 null
 */
function createCopyPathAction(record: RecentRecord | undefined): HeaderTabCopyAction | null {
  if (!isDocumentRecord(record) || !record.path) return null;

  return {
    command: 'copyPath',
    content: record.path,
    successMessage: COPY_PATH_MESSAGE
  };
}

/**
 * 创建 WebView 地址复制动作。
 * @param tab - 标签页
 * @param record - 最近记录
 * @param records - 最近记录列表
 * @returns WebView 地址复制动作；非 WebView 标签时返回 null
 */
function createCopyAddressAction(tab: Tab, record: RecentRecord | undefined, records: RecentRecord[]): HeaderTabCopyAction | null {
  const webviewRecord = isWebviewRecord(record) ? record : getWebviewRecordByPath(tab, records);
  const content = webviewRecord?.url || getWebviewUrlFromTabPath(tab.path);
  if (!content) return null;

  return {
    command: 'copyAddress',
    content,
    successMessage: COPY_ADDRESS_MESSAGE
  };
}

/**
 * 解析顶部标签可用的资源复制动作。
 * @param tab - 标签页
 * @param records - 最近记录列表
 * @returns 资源复制动作；当前标签没有资源复制能力时返回 null
 */
export function getHeaderTabCopyAction(tab: Tab, records: RecentRecord[]): HeaderTabCopyAction | null {
  const recordsByKey = createRecentRecordMap(records);
  const record = getRecordByRecentKey(tab, recordsByKey);

  return createCopyPathAction(record) ?? createCopyAddressAction(tab, record, records);
}
