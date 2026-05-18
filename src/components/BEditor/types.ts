/**
 * @file types.ts
 * @description BEditor 统一类型出口。
 */

export type { BMarkdownPublicInstance, EditorController, EditorSearchState, EditorSelection as SelectionRange } from './adapters/types';

/**
 * 编辑器视图模式。
 */
export type BMarkdownViewMode = 'rich' | 'source';

/**
 * 编辑器状态。
 */
export interface EditorState {
  /** 编辑器内容 */
  content: string;
  /** 文件名 */
  name: string;
  /** 文件路径 */
  path: string | null;
  /** 编辑器实例 ID */
  id: string;
  /** 文件扩展名 */
  ext: string;
}
