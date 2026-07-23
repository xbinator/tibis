/**
 * @file types.ts
 * @description 定义混合最近记录及其时间元数据结构。
 */

/**
 * 最近记录类型。
 */
export type RecentRecordType = 'file' | 'widget' | 'webview' | 'chat';

/**
 * 最近记录公共字段。
 */
export interface RecentRecordBase {
  /** 记录类型。 */
  type: RecentRecordType;
  /** 业务对象唯一标识。 */
  id: string;
  /** 点击后打开的目标 URL 或应用内路由。 */
  url: string;
  /** 展示标题。 */
  title: string;
  /** 展示描述。 */
  description?: string;
  /** 展示图标。 */
  icon?: string;
  /** 本地记录首次创建时间（毫秒时间戳）。 */
  createdAt?: number;
  /** 最近一次显式打开时间。 */
  openedAt?: number;
}

/**
 * 文件型最近记录公共字段。
 */
export interface StoredDocumentRecord extends RecentRecordBase {
  /** 记录类型。 */
  type: 'file' | 'widget';
  /** 文件唯一路径，未保存文件为 null。 */
  path: string | null;
  /** 当前文件内容。 */
  content: string;
  /** 最近一次与磁盘同步的内容基线。 */
  savedContent?: string;
  /** 文件名主体。 */
  name: string;
  /** 文件扩展名。 */
  ext: string;
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
 * 普通文件主记录。
 */
export interface StoredFile extends StoredDocumentRecord {
  /** 记录类型。 */
  type: 'file';
}

/**
 * Widget 文件主记录。
 */
export interface StoredWidget extends StoredDocumentRecord {
  /** 记录类型。 */
  type: 'widget';
}

/**
 * WebView 网页记录。
 */
export interface WebviewRecord extends RecentRecordBase {
  /** 记录类型 */
  type: 'webview';
  /** 记录唯一标识（URL 的 hash 值，用于去重） */
  id: string;
  /** 网站 favicon URL */
  favicon?: string;
}

/**
 * 聊天会话最近记录。
 */
export interface ChatRecentRecord extends RecentRecordBase {
  /** 记录类型 */
  type: 'chat';
  /** 聊天会话 ID。 */
  id: string;
}

/**
 * 添加或更新 WebView 最近记录的可选参数。
 */
export interface WebviewRecordOptions {
  /** 网站 favicon URL */
  favicon?: string;
}

/**
 * 最近记录联合类型（文件 + Widget + WebView 网页 + 聊天会话）。
 */
export type RecentRecord = StoredFile | StoredWidget | WebviewRecord | ChatRecentRecord;

/**
 * 判断最近记录是否为文件型记录。
 * @param record - 最近记录
 * @returns 是否为普通文件或 Widget 记录
 */
export function isDocumentRecord(record: RecentRecord | null | undefined): record is StoredFile | StoredWidget {
  return record?.type === 'file' || record?.type === 'widget';
}

/**
 * 判断最近记录是否为聊天会话记录。
 * @param record - 最近记录
 * @returns 是否为聊天会话记录
 */
export function isChatRecord(record: RecentRecord | null | undefined): record is ChatRecentRecord {
  return record?.type === 'chat';
}
