import type { RichLoadPhase } from '../adapters/types';
import type { Editor, JSONContent } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { Transaction } from '@tiptap/pm/state';
import type { Ref } from 'vue';
import { watch } from 'vue';
import { normalizeEditorContent } from '../extensions/emptyContent';
import { getPersistedMarkdown } from '../utils/editorMarkdown';
import { EMPTY_PARAGRAPH_JSON } from './useRichEditorLoad';

interface UseEditorContentParams {
  assignHeadingIds: (editor: Editor, options?: { silent?: boolean }) => void;
  editable: Readonly<Ref<boolean>>;
  editorContent: Ref<string | undefined>;
  getEditorInstance: () => Editor | undefined;
  resetHeadingIndex: () => void;
  resetSourceLineTracker: () => void;
  onContentChange?: () => void;
  /** 判断 transaction 是否为加载事务（大文档路径传入） */
  isLoadTransaction?: (transaction: Transaction) => boolean;
  /** 当前加载阶段（大文档路径传入，小文档不传则不做守卫） */
  loadPhase?: () => RichLoadPhase;
}

interface UseEditorContentResult {
  isEquivalentToImportedContent: (externalContent: string | undefined, currentMarkdown: string) => boolean;
  rememberImportedContent: (text: string) => void;
  onEditorUpdate: ({ editor, transaction }: { editor: Editor; transaction: Transaction }) => void;
  onPaste: (_view: unknown, event: ClipboardEvent) => boolean;
  setEditorContent: (text: string, emitUpdate?: boolean) => void;
  /** 大文档：直接 dispatch ProseMirror transaction 装载完整 JSON */
  dispatchLoadContent: (json: JSONContent) => void;
  /** 大文档：分帧装载一个 chunk 的 ProseMirror Node */
  dispatchLoadChunk: (blockNodes: ProseMirrorNode[]) => void;
  /** 装载完成后记录快照 */
  onLoadComplete: (rawMarkdown: string) => void;
  /** 清空 editor 为空占位文档 */
  clearEditorToEmptyPlaceholder: () => void;
}

export function useContent({
  assignHeadingIds,
  editable,
  editorContent,
  getEditorInstance,
  resetHeadingIndex,
  resetSourceLineTracker,
  onContentChange,
  isLoadTransaction,
  loadPhase
}: UseEditorContentParams): UseEditorContentResult {
  let lastImportedRawContent = '';
  let lastImportedCanonicalContent = '';

  function rememberImportedContent(text: string): void {
    const instance = getEditorInstance();
    lastImportedRawContent = text;
    lastImportedCanonicalContent = instance ? getPersistedMarkdown(instance) : text;
  }

  function setEditorContent(text: string, emitUpdate = true): void {
    const instance = getEditorInstance();
    if (!instance) {
      return;
    }

    resetHeadingIndex();
    resetSourceLineTracker();
    instance.commands.setContent(normalizeEditorContent(text), {
      emitUpdate,
      contentType: text ? 'markdown' : undefined
    });

    rememberImportedContent(text);
  }

  function onPaste(_view: unknown, event: ClipboardEvent): boolean {
    const instance = getEditorInstance();
    if (!instance) {
      return false;
    }

    const text = event.clipboardData?.getData('text/plain') || '';

    if (!text.trim()) {
      return false;
    }

    if (instance.state.doc.textContent.trim().length > 0) {
      return false;
    }

    event.preventDefault();
    setEditorContent(text);

    return true;
  }

  function onEditorUpdate({ editor, transaction: _transaction }: { editor: Editor; transaction: Transaction }): void {
    // 加载事务 → 不写回、不触发 onContentChange（仅大文档路径传入 isLoadTransaction 时生效）
    if (isLoadTransaction && _transaction && isLoadTransaction(_transaction)) return;
    // loading/failed/idle 状态 → 不写回（小文档不传 loadPhase 时，undefined 不走这个分支）
    if (loadPhase !== undefined && loadPhase() !== 'ready') return;

    assignHeadingIds(editor);
    const markdown = getPersistedMarkdown(editor);

    editorContent.value = markdown === lastImportedCanonicalContent ? lastImportedRawContent : markdown;
    onContentChange?.();
  }

  function isEquivalentToImportedContent(externalContent: string | undefined, currentMarkdown: string): boolean {
    return currentMarkdown === lastImportedCanonicalContent && (externalContent ?? '') === lastImportedRawContent;
  }

  /**
   * 大文档：直接 dispatch ProseMirror transaction 装载完整 JSON
   * @param json - 完整的 Tiptap JSON 文档
   */
  function dispatchLoadContent(json: JSONContent): void {
    const instance = getEditorInstance();
    if (!instance) return;

    const nextDoc = instance.schema.nodeFromJSON(json);
    const tr = instance.state.tr
      .replaceWith(0, instance.state.doc.content.size, nextDoc.content)
      .setMeta('preventUpdate', true)
      .setMeta('addToHistory', false)
      .setMeta('bEditorRichLoad', true);
    instance.view.dispatch(tr);
  }

  /**
   * 大文档：分帧装载一个 chunk 的 ProseMirror Node
   * @param blockNodes - 本帧要插入的顶层 block 节点数组
   */
  function dispatchLoadChunk(blockNodes: ProseMirrorNode[]): void {
    const instance = getEditorInstance();
    if (!instance) return;

    let { tr } = instance.state;
    for (const node of blockNodes) {
      tr = tr.insert(tr.doc.content.size, node);
    }
    tr.setMeta('preventUpdate', true).setMeta('addToHistory', false).setMeta('bEditorRichLoad', true);
    instance.view.dispatch(tr);
  }

  /**
   * 装载完成后记录导入快照
   * @param rawMarkdown - 原始 Markdown 文本
   */
  function onLoadComplete(rawMarkdown: string): void {
    rememberImportedContent(rawMarkdown);
  }

  /**
   * 清空 editor 为空占位文档（带 silent meta，不进入 history/update）
   */
  function clearEditorToEmptyPlaceholder(): void {
    const editor = getEditorInstance();
    if (!editor) return;
    const emptyDoc = editor.schema.nodeFromJSON(EMPTY_PARAGRAPH_JSON);
    const tr = editor.state.tr
      .replaceWith(0, editor.state.doc.content.size, emptyDoc.content)
      .setMeta('preventUpdate', true)
      .setMeta('addToHistory', false)
      .setMeta('bEditorRichLoad', true);
    editor.view.dispatch(tr);
  }

  watch(
    () => editable.value,
    (isEditable) => {
      getEditorInstance()?.setEditable(isEditable);
    }
  );

  return {
    isEquivalentToImportedContent,
    rememberImportedContent,
    onEditorUpdate,
    onPaste,
    setEditorContent,
    dispatchLoadContent,
    dispatchLoadChunk,
    onLoadComplete,
    clearEditorToEmptyPlaceholder
  };
}
