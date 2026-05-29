import { noop } from 'lodash-es';

export interface EditorSearchState {
  currentIndex: number;
  matchCount: number;
  term: string;
}

export interface EditorSelection {
  from: number;
  to: number;
  text: string;
}

export const EMPTY_SEARCH_STATE: EditorSearchState = {
  currentIndex: 0,
  matchCount: 0,
  term: ''
};

export interface EditorController {
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  focusEditor: () => void;
  focusEditorAtStart: () => void;
  setSearchTerm: (term: string) => void;
  findNext: () => void;
  findPrevious: () => void;
  clearSearch: () => void;
  getSelection: () => EditorSelection | null;
  insertAtCursor: (content: string) => Promise<void>;
  replaceSelection: (content: string) => Promise<void>;
  replaceDocument: (content: string) => Promise<void>;
  selectLineRange: (startLine: number, endLine: number) => boolean | Promise<boolean>;
  getSearchState: () => EditorSearchState;
  scrollToAnchor: (anchorId: string) => boolean;
  getActiveAnchorId: (scrollContainer: HTMLElement, thresholdPx: number) => string;
}

export function createNoopEditorController(): EditorController {
  return {
    undo: noop,
    redo: noop,
    canUndo(): boolean {
      return false;
    },
    canRedo(): boolean {
      return false;
    },
    focusEditor: noop,
    focusEditorAtStart: noop,
    setSearchTerm: noop,
    findNext: noop,
    findPrevious: noop,
    clearSearch: noop,
    getSelection(): EditorSelection | null {
      return null;
    },
    async insertAtCursor(): Promise<void> {
      return undefined;
    },
    async replaceSelection(): Promise<void> {
      return undefined;
    },
    async replaceDocument(): Promise<void> {
      return undefined;
    },
    selectLineRange(): boolean {
      return false;
    },
    getSearchState(): EditorSearchState {
      return { ...EMPTY_SEARCH_STATE };
    },
    scrollToAnchor(): boolean {
      return false;
    },
    getActiveAnchorId(): string {
      return '';
    }
  };
}

// ============ Rich 编辑器大文档加载相关类型 ============

/**
 * Rich 编辑器加载阶段
 */
export type RichLoadPhase = 'idle' | 'loading' | 'ready' | 'failed';

/**
 * 分帧阶段
 */
export type RichLoadStage = 'parsing' | 'mounting';

/**
 * 取消原因
 */
export type RichLoadCancelReason = 'switch-file' | 'switch-source' | 'external-change' | 'unmount' | 'retry';

/**
 * 加载状态（暴露给 UI）
 */
export interface RichLoadState {
  /** 当前阶段 */
  phase: RichLoadPhase;
  /** 首次加载还是重新加载 */
  isReload: boolean;
  /** 当前子阶段 */
  stage?: RichLoadStage;
  /** 分帧装载进度：parsing 阶段为 indeterminate，mounting 阶段为 0.05→1 */
  progress: number;
  /** 失败时的错误信息，仅 failed 阶段有值 */
  errorMessage?: string;
}

/**
 * 解析接口返回结果
 */
export interface RichParseResult {
  json: import('@tiptap/core').JSONContent;
  stats: {
    durationMs: number;
    nodeCount: number;
  };
}

/**
 * 加载完成 payload
 */
export interface RichLoadCompletePayload {
  rawMarkdown: string;
  json: import('@tiptap/core').JSONContent;
  stats: RichParseResult['stats'];
}
