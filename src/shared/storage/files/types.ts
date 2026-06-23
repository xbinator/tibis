/**
 * @file types.ts
 * @description 定义最近文件存储记录及其时间元数据结构。
 */

/**
 * 文件主记录。
 */
export interface StoredFile {
  /** 记录类型 */
  type: 'file';
  /** 文件唯一标识。 */
  id: string;
  /** 文件唯一路径，未保存文件为 null。 */
  path: string | null;
  /** 当前文件内容。 */
  content: string;
  /** 最近一次与磁盘同步的内容基线。 */
  savedContent?: string;
  /** 文件名。 */
  name: string;
  /** 文件扩展名。 */
  ext: string;
  /** 本地记录首次创建时间（毫秒时间戳）。 */
  createdAt?: number;
  /** 最近一次显式打开时间。 */
  openedAt?: number;
  /** 最近一次内容变更时间。 */
  modifiedAt?: number;
  /** 最近一次成功保存时间。 */
  savedAt?: number;
  /** 文件被固定的时间（预留字段）。 */
  pinnedAt?: number;
  /** 文件所属工作区 ID（预留字段）。 */
  workspaceId?: string | null;
}

/**
 * WebView 网页记录。
 */
export interface WebviewRecord {
  /** 记录类型 */
  type: 'webview';
  /** 记录唯一标识（URL 的 hash 值，用于去重） */
  id: string;
  /** 打开的 URL */
  url: string;
  /** 页面标题 */
  title: string;
  /** 首次打开该 URL 的时间戳（记录首次进入列表的时刻） */
  createdAt: number;
  /** 最近一次打开/跳转到该 URL 的时间戳 */
  openedAt: number;
  /** 网站 favicon URL */
  favicon?: string;
}

/**
 * 添加或更新 WebView 最近记录的可选参数。
 */
export interface WebviewRecordOptions {
  /** 网站 favicon URL */
  favicon?: string;
}

/**
 * 最近记录联合类型（文件 + WebView 网页）。
 */
export type RecentRecord = StoredFile | WebviewRecord;
