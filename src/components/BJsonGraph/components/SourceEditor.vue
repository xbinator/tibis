<template>
  <div class="b-json-source-editor" @focusout="emit('editor-blur', $event)">
    <div ref="editorViewHostRef" class="b-json-source-editor__host"></div>
  </div>
</template>

<script setup lang="ts">
/**
 * @file SourceEditor.vue
 * @description JSON 源码编辑器，提供 EditorController 所需能力。
 */

import type { Extension } from '@codemirror/state';
import type { ViewUpdate } from '@codemirror/view';
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
  redo as codemirrorRedo,
  redoDepth,
  undo as codemirrorUndo,
  undoDepth
} from '@codemirror/commands';
import { json } from '@codemirror/lang-json';
import { Compartment, EditorSelection, EditorState } from '@codemirror/state';
import { EditorView, keymap, placeholder } from '@codemirror/view';
import {
  clearSourceEditorSearch,
  createSourceEditorSearchExtension,
  findNextSourceEditorMatch,
  findPreviousSourceEditorMatch,
  getSourceEditorSearchState,
  setSourceEditorSearchTerm
} from '@/components/BMarkdown/adapters/sourceEditorSearch';
import type { EditorController, EditorSearchState, EditorSelection as EditorSelectionRange } from '@/components/BMarkdown/adapters/types';

interface Props {
  /** 是否可编辑。 */
  editable?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  editable: true
});

const emit = defineEmits<{
  /** 内容变更。 */
  (e: 'update:value', value: string): void;
  /** 选区变更。 */
  (e: 'selection-change', selection: { from: number; to: number }): void;
  /** 编辑器失焦。 */
  (e: 'editor-blur', event: FocusEvent): void;
}>();

const editorContent = defineModel<string>('value', { default: '' });
const editorViewHostRef = ref<HTMLDivElement | null>(null);
const editorView = shallowRef<EditorView | null>(null);
const editableCompartment = new Compartment();

/**
 * 创建可编辑扩展。
 * @param editable - 是否可编辑
 * @returns 扩展
 */
function createEditableExtension(editable: boolean): Extension {
  return EditorView.editable.of(editable);
}

/**
 * 获取当前 EditorView。
 * @returns 当前实例
 */
function getView(): EditorView | null {
  return editorView.value;
}

/**
 * 创建 JSON 编辑器扩展。
 * @returns 扩展列表
 */
function createEditorExtensions(): Extension[] {
  return [
    history(),
    json(),
    createSourceEditorSearchExtension(),
    keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap]),
    placeholder('请输入 JSON 内容'),
    EditorView.lineWrapping,
    EditorView.contentAttributes.of({ spellcheck: 'false' }),
    editableCompartment.of(createEditableExtension(props.editable)),
    EditorView.theme({
      '&': {
        minHeight: '100%',
        backgroundColor: 'transparent'
      },
      '.cm-editor': {
        minHeight: '100%'
      },
      '.cm-content, .cm-scroller': {
        fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace",
        lineHeight: '1.7'
      },
      '.cm-focused': {
        outline: 'none'
      },
      '.cm-gutters': {
        backgroundColor: 'transparent',
        borderRight: '0'
      },
      '.search-match': {
        backgroundColor: 'var(--editor-search-highlight)'
      },
      '.search-match-current': {
        backgroundColor: 'var(--editor-search-active)'
      }
    }),
    EditorView.updateListener.of((update: ViewUpdate): void => {
      if (update.docChanged) {
        const nextContent = update.state.doc.toString();
        if (nextContent !== editorContent.value) {
          editorContent.value = nextContent;
        }
      }

      if (update.selectionSet) {
        const selection = update.state.selection.main;
        emit('selection-change', { from: selection.from, to: selection.to });
      }
    })
  ];
}

/**
 * 聚焦编辑器。
 */
function focusEditor(): void {
  getView()?.focus();
}

/**
 * 聚焦到文档起始位置。
 */
function focusEditorAtStart(): void {
  const view = getView();
  if (!view) {
    return;
  }

  view.dispatch({
    selection: EditorSelection.cursor(0),
    scrollIntoView: true
  });
  view.focus();
}

/**
 * 撤销。
 */
function undo(): void {
  const view = getView();
  if (view) {
    codemirrorUndo(view);
  }
}

/**
 * 重做。
 */
function redo(): void {
  const view = getView();
  if (view) {
    codemirrorRedo(view);
  }
}

/**
 * 是否可撤销。
 * @returns 是否可撤销
 */
function canUndo(): boolean {
  const view = getView();
  return view ? undoDepth(view.state) > 0 : false;
}

/**
 * 是否可重做。
 * @returns 是否可重做
 */
function canRedo(): boolean {
  const view = getView();
  return view ? redoDepth(view.state) > 0 : false;
}

/**
 * 设置搜索词。
 * @param term - 搜索词
 */
function setSearchTerm(term: string): void {
  const view = getView();
  if (view) {
    setSourceEditorSearchTerm(view, term);
  }
}

/**
 * 查找下一项。
 */
function findNext(): void {
  const view = getView();
  if (view) {
    findNextSourceEditorMatch(view);
  }
}

/**
 * 查找上一项。
 */
function findPrevious(): void {
  const view = getView();
  if (view) {
    findPreviousSourceEditorMatch(view);
  }
}

/**
 * 清除搜索。
 */
function clearSearch(): void {
  const view = getView();
  if (view) {
    clearSourceEditorSearch(view);
  }
}

/**
 * 获取当前选区。
 * @returns 当前选区
 */
function getSelection(): EditorSelectionRange | null {
  const view = getView();
  if (!view) {
    return null;
  }

  const selection = view.state.selection.main;
  if (selection.from === selection.to) {
    return null;
  }

  return {
    from: selection.from,
    to: selection.to,
    text: view.state.sliceDoc(selection.from, selection.to)
  };
}

/**
 * 在光标处插入内容。
 * @param content - 插入内容
 */
async function insertAtCursor(content: string): Promise<void> {
  const view = getView();
  if (!view) {
    return;
  }

  const selection = view.state.selection.main;
  view.dispatch({
    changes: {
      from: selection.from,
      to: selection.to,
      insert: content
    },
    selection: EditorSelection.cursor(selection.from + content.length),
    scrollIntoView: true
  });
  view.focus();
}

/**
 * 替换当前选区。
 * @param content - 替换内容
 */
async function replaceSelection(content: string): Promise<void> {
  const view = getView();
  if (!view) {
    return;
  }

  const selection = view.state.selection.main;
  if (selection.from === selection.to) {
    throw new Error('NO_SELECTION');
  }

  view.dispatch({
    changes: {
      from: selection.from,
      to: selection.to,
      insert: content
    },
    selection: EditorSelection.cursor(selection.from + content.length),
    scrollIntoView: true
  });
  view.focus();
}

/**
 * 替换整个文档。
 * @param content - 新文档
 */
async function replaceDocument(content: string): Promise<void> {
  const view = getView();
  if (!view) {
    return;
  }

  view.dispatch({
    changes: {
      from: 0,
      to: view.state.doc.length,
      insert: content
    },
    selection: EditorSelection.cursor(content.length),
    scrollIntoView: true
  });
  view.focus();
}

/**
 * 设置选区。
 * @param start - 起始偏移
 * @param end - 结束偏移
 */
function dispatchSelection(start: number, end: number): void {
  const view = getView();
  if (!view) {
    return;
  }

  view.dispatch({
    selection: EditorSelection.range(start, end),
    scrollIntoView: true
  });
  view.focus();
}

/**
 * 按行号选区。
 * @param startLine - 起始行
 * @param endLine - 结束行
 * @returns 是否成功
 */
function selectLineRange(startLine: number, endLine: number): boolean {
  const view = getView();
  if (!view) {
    return false;
  }

  const totalLines = view.state.doc.lines;
  const safeStartLine = Math.min(Math.max(1, startLine), totalLines);
  const safeEndLine = Math.min(Math.max(safeStartLine, endLine), totalLines);
  const fromLine = view.state.doc.line(safeStartLine);
  const toLine = view.state.doc.line(safeEndLine);

  dispatchSelection(fromLine.from, toLine.to);
  return true;
}

/**
 * 读取搜索状态。
 * @returns 搜索状态
 */
function getSearchState(): EditorSearchState {
  const view = getView();
  return view ? getSourceEditorSearchState(view.state) : { currentIndex: 0, matchCount: 0, term: '' };
}

watch(editorContent, (nextContent: string): void => {
  const view = getView();
  if (!view) {
    return;
  }

  const currentContent = view.state.doc.toString();
  if (nextContent === currentContent) {
    return;
  }

  view.dispatch({
    changes: {
      from: 0,
      to: view.state.doc.length,
      insert: nextContent
    }
  });
});

watch(
  () => props.editable,
  (editable: boolean): void => {
    const view = getView();
    if (!view) {
      return;
    }

    view.dispatch({
      effects: editableCompartment.reconfigure(createEditableExtension(editable))
    });
  }
);

onMounted((): void => {
  const parent = editorViewHostRef.value;
  if (!parent) {
    return;
  }

  editorView.value = new EditorView({
    parent,
    state: EditorState.create({
      doc: editorContent.value,
      extensions: createEditorExtensions()
    })
  });
});

onBeforeUnmount((): void => {
  editorView.value?.destroy();
  editorView.value = null;
});

defineExpose<
  EditorController & {
    getEditorView: () => EditorView | null;
    dispatchSelection: (start: number, end: number) => void;
  }
>({
  getEditorView: getView,
  dispatchSelection,
  undo,
  redo,
  canUndo,
  canRedo,
  focusEditor,
  focusEditorAtStart,
  setSearchTerm,
  findNext,
  findPrevious,
  clearSearch,
  getSelection,
  insertAtCursor,
  replaceSelection,
  replaceDocument,
  selectLineRange,
  getSearchState,
  scrollToAnchor(): boolean {
    return false;
  },
  getActiveAnchorId(): string {
    return '';
  }
});
</script>

<style scoped lang="less">
.b-json-source-editor {
  height: 100%;
}

.b-json-source-editor__host {
  height: 100%;

  :deep(.cm-editor) {
    min-height: 100%;
    padding: 20px 24px 80px;
  }
}
</style>
