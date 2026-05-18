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

export type BMarkdownPublicInstance = Omit<EditorController, 'focusEditorAtStart' | 'scrollToAnchor' | 'getActiveAnchorId'>;

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
