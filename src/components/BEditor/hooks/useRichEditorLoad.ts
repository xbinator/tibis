/**
 * @file useRichEditorLoad.ts
 * @description Rich 编辑器大文档异步加载状态机。
 * 管理 idle/loading/ready/failed 状态转移、取消令牌、事务 meta。
 * Markdown → JSON 解析统一走 parseMarkdownForRichLoad（MarkdownManager + schema 扩展）。
 */
import type { RichLoadState, RichLoadCancelReason, RichLoadCompletePayload } from '../adapters/types';
import type { Editor, JSONContent } from '@tiptap/core';
import type { Transaction } from '@tiptap/pm/state';
import { ref, computed, type Ref } from 'vue';
import { parseMarkdownForRichLoad } from './richMarkdownParser';

export const EMPTY_PARAGRAPH_JSON: JSONContent = {
  type: 'doc',
  content: [{ type: 'paragraph' }]
};

const ERROR_MESSAGES: Record<string, string> = {
  PARSE_FAILED: '富文本加载失败：文档解析错误，请切换回源码模式检查内容',
  DISPATCH_FAILED: '富文本加载失败：内容写入错误',
  UNKNOWN: '富文本加载失败，请重试或切换回源码模式'
};

function clearEditorToEmptyPlaceholder(editor: Editor): void {
  const emptyNode = editor.schema.nodeFromJSON(EMPTY_PARAGRAPH_JSON);
  const tr = editor.state.tr
    .replaceWith(0, editor.state.doc.content.size, emptyNode.content)
    .setMeta('preventUpdate', true)
    .setMeta('addToHistory', false)
    .setMeta('bEditorRichLoad', true);
  editor.view.dispatch(tr);
}

interface UseRichEditorLoadParams {
  getEditor: () => Editor | undefined;
  getEditorInstanceId: () => string;
  onLoadComplete: (payload: RichLoadCompletePayload) => void;
  onLoadFailed: (error: string) => void;
}

interface UseRichEditorLoadResult {
  loadState: Readonly<Ref<RichLoadState>>;
  startLoad: (markdown: string, options?: { isReload?: boolean }) => Promise<void>;
  cancelLoad: (reason: RichLoadCancelReason) => void;
  retryLoad: () => Promise<void>;
  isLoadTransaction: (transaction: Transaction) => boolean;
  isCurrentToken: (token: symbol) => boolean;
  getLoadSource: () => string | null;
}

export function useRichEditorLoad({ getEditor, getEditorInstanceId, onLoadComplete, onLoadFailed }: UseRichEditorLoadParams): UseRichEditorLoadResult {
  const internalLoadState = ref<RichLoadState>({
    phase: 'idle',
    isReload: false,
    progress: 0
  });

  let currentLoadToken = Symbol('rich-load-init');
  let loadSourceMarkdown: string | null = null;

  function isLoadTransaction(transaction: Transaction): boolean {
    return transaction.getMeta('bEditorRichLoad') === true;
  }

  function isCurrentToken(token: symbol): boolean {
    return token === currentLoadToken;
  }

  function getLoadSource(): string | null {
    return loadSourceMarkdown;
  }

  function invalidateCurrentTask(): void {
    currentLoadToken = Symbol('rich-load-canceled');
  }

  function finishLoad(_editor: Editor, _token: symbol, rawMarkdown: string, json: JSONContent, stats: { durationMs: number; nodeCount: number }): void {
    internalLoadState.value = {
      phase: 'ready',
      isReload: internalLoadState.value.isReload,
      progress: 1
    };
    onLoadComplete({ rawMarkdown, json, stats });
  }

  async function startLoad(markdown: string, options?: { isReload?: boolean }): Promise<void> {
    invalidateCurrentTask();

    const editor = getEditor();
    if (!editor || editor.isDestroyed) return;

    const token = Symbol('rich-load');
    currentLoadToken = token;
    const isReload = options?.isReload ?? false;

    internalLoadState.value = {
      phase: 'loading',
      isReload,
      stage: 'parsing',
      progress: 0
    };
    loadSourceMarkdown = markdown;

    clearEditorToEmptyPlaceholder(editor);

    try {
      // YIELD 主线程让 UI 渲染 loading 遮罩
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });

      if (!isCurrentToken(token)) return;

      // Stage 1: Markdown → JSON 解析
      let parseResult;
      try {
        parseResult = await parseMarkdownForRichLoad(markdown, getEditorInstanceId(), String(token));
      } catch {
        if (!isCurrentToken(token)) return;
        clearEditorToEmptyPlaceholder(editor);
        internalLoadState.value = { phase: 'failed', isReload, progress: 0, errorMessage: ERROR_MESSAGES.PARSE_FAILED };
        onLoadFailed(ERROR_MESSAGES.PARSE_FAILED);
        return;
      }

      if (!isCurrentToken(token)) return;

      internalLoadState.value = { ...internalLoadState.value, stage: 'mounting', progress: 0.05 };

      // Stage 2: JSON → ProseMirror 装载
      try {
        const nextDoc = editor.schema.nodeFromJSON(parseResult.json);
        const tr = editor.state.tr
          .replaceWith(0, editor.state.doc.content.size, nextDoc.content)
          .setMeta('preventUpdate', true)
          .setMeta('addToHistory', false)
          .setMeta('bEditorRichLoad', true);
        editor.view.dispatch(tr);
      } catch {
        if (!isCurrentToken(token)) return;
        clearEditorToEmptyPlaceholder(editor);
        internalLoadState.value = { phase: 'failed', isReload, progress: 0, errorMessage: ERROR_MESSAGES.DISPATCH_FAILED };
        onLoadFailed(ERROR_MESSAGES.DISPATCH_FAILED);
        return;
      }

      if (!isCurrentToken(token)) return;

      finishLoad(editor, token, markdown, parseResult.json, parseResult.stats);
    } catch (_error) {
      if (!isCurrentToken(token)) return;
      clearEditorToEmptyPlaceholder(editor);
      internalLoadState.value = { phase: 'failed', isReload, progress: 0, errorMessage: ERROR_MESSAGES.UNKNOWN };
      onLoadFailed(ERROR_MESSAGES.UNKNOWN);
    }
  }

  function cancelLoad(reason: RichLoadCancelReason): void {
    invalidateCurrentTask();

    const editor = getEditor();
    if (editor && !editor.isDestroyed && reason !== 'retry') {
      clearEditorToEmptyPlaceholder(editor);
    }

    internalLoadState.value = {
      phase: 'idle',
      isReload: false,
      progress: 0
    };
    loadSourceMarkdown = null;
  }

  async function retryLoad(): Promise<void> {
    if (internalLoadState.value.phase !== 'failed') return;

    const source = loadSourceMarkdown;
    if (!source) {
      internalLoadState.value = { phase: 'idle', isReload: false, progress: 0 };
      return;
    }

    await startLoad(source, { isReload: true });
  }

  return {
    loadState: computed(() => internalLoadState.value),
    startLoad,
    cancelLoad,
    retryLoad,
    isLoadTransaction,
    isCurrentToken,
    getLoadSource
  };
}
