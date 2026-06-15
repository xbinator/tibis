/**
 * @file types.ts
 * @description BEditor 统一类型出口。
 */

import type {
  EditorController as BaseEditorController,
  EditorSearchState as BaseEditorSearchState,
  EditorSelection as BaseEditorSelection
} from './adapters/types';

/**
 * 统一编辑器搜索状态。
 */
export type EditorSearchState = BaseEditorSearchState;

/**
 * 统一编辑器选区。
 */
export type EditorSelection = BaseEditorSelection;

/**
 * 统一编辑器控制器。
 */
export type EditorController = BaseEditorController;

/**
 * 编辑器滚动位置控制器。
 */
export interface EditorScrollController {
  /** 缓存当前滚动位置 */
  rememberScrollPosition: () => void;
  /** 恢复最近一次缓存的滚动位置 */
  restoreScrollPosition: () => Promise<void> | void;
}

/**
 * 对外公开的基础编辑器实例能力。
 */
export type EditorPublicInstance = Omit<EditorController, 'focusEditorAtStart' | 'scrollToAnchor' | 'getActiveAnchorId'>;

/**
 * 统一选区别名。
 */
export type SelectionRange = EditorSelection;

/**
 * 编辑器视图模式。
 */
export type EditorViewMode = 'rich' | 'source';

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
