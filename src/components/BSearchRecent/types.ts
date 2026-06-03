import type { StoredFile } from '@/shared/storage';

export interface BSearchRecentProps {
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

export interface NormalizedItem {
  key: string;
  title: string;
  pathLabel: string;
  pathClass: string;
  meta: string;
  isActive: boolean;
  removable: boolean;
  onSelect: () => void;
  onRemove: (() => void) | undefined;
}

export interface BSearchRecentEmits {
  (e: 'select', file: StoredFile): void;
  (e: 'remove', id: string): void;
}
