import { noop } from 'lodash-es';

export interface EditorSearchState {
  currentIndex: number;
  matchCount: number;
  term: string;
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
  getSearchState: () => EditorSearchState;
  scrollToAnchor: (anchorId: string) => boolean;
  getActiveAnchorId: (scrollContainer: HTMLElement, thresholdPx: number) => string;
}

export type BEditorPublicInstance = Omit<EditorController, 'focusEditorAtStart' | 'scrollToAnchor' | 'getActiveAnchorId'>;

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
