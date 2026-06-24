/**
 * @file types.ts
 * @description 定义最近记录搜索弹窗的属性、候选项和归一化展示项类型。
 */

import type { StoredFile, RecentRecord, WebviewRecord } from '@/shared/storage';

/**
 * 最近记录搜索弹窗属性。
 */
export interface BRecentProps {
  /** 搜索结果列表最大高度。 */
  maxHeight?: number;
}

/**
 * 绝对路径搜索结果。
 */
export interface AbsolutePathSearchResult {
  /** 结果项类型。 */
  type: 'absolute-path';
  /** 绝对路径。 */
  path: string;
  /** 展示文件名。 */
  fileName: string;
}

/**
 * URL 搜索结果（http/https）。
 */
export interface UrlSearchResult {
  /** 结果项类型。 */
  type: 'url';
  /** 完整 URL。 */
  url: string;
  /** 展示用的主机名。 */
  host: string;
}

/**
 * 搜索结果归一化展示基础字段。
 */
interface NormalizedItemBase {
  /** 列表项唯一键。 */
  key: string;
  /** 主标题。 */
  title: string;
  /** 最近记录；传入图标组件后自动解析文件图标或 WebView favicon。 */
  record?: RecentRecord;
  /** 左侧显式类型图标。 */
  icon?: string;
  /** 用于路径候选项解析图标的文件名。 */
  fileName?: string;
  /** 路径或 URL 展示文案。 */
  pathLabel: string;
  /** 路径展示状态类。 */
  pathClass: string;
  /** 辅助说明文案。 */
  meta: string;
  /** 是否允许从最近记录中移除。 */
  removable: boolean;
}

/**
 * URL 候选结果项。
 */
export interface UrlNormalizedItem extends NormalizedItemBase {
  /** 结果项类型。 */
  kind: 'url';
  /** 完整 URL。 */
  url: string;
}

/**
 * 绝对路径候选结果项。
 */
export interface AbsolutePathNormalizedItem extends NormalizedItemBase {
  /** 结果项类型。 */
  kind: 'absolute-path';
  /** 待打开的绝对路径。 */
  path: string;
}

/**
 * 文件最近记录结果项。
 */
export interface FileNormalizedItem extends NormalizedItemBase {
  /** 结果项类型。 */
  kind: 'file';
  /** 文件最近记录。 */
  record: StoredFile;
}

/**
 * WebView 最近记录结果项。
 */
export interface WebviewNormalizedItem extends NormalizedItemBase {
  /** 结果项类型。 */
  kind: 'webview';
  /** WebView 最近记录。 */
  record: WebviewRecord;
}

/**
 * 搜索结果归一化展示项。
 */
export type NormalizedItem = UrlNormalizedItem | AbsolutePathNormalizedItem | FileNormalizedItem | WebviewNormalizedItem;

/**
 * 最近记录搜索弹窗事件。
 */
export interface BRecentEmits {
  (e: 'select', file: StoredFile): void;
  (e: 'remove', id: string): void;
}
