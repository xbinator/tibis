/**
 * @file useRichEditorLoad.ts
 * @description Rich 编辑器大文档异步加载状态机。
 * 管理 idle/loading/ready/failed 状态转移、取消令牌、事务 meta。
 * Markdown → JSON 解析统一走 parseMarkdownForRichLoad（MarkdownManager + schema 扩展）。
 * JSON → ProseMirror 装载采用分帧 dispatch，每帧 12ms 时间预算，避免主线程长时间阻塞。
 */
import type { RichLoadState, RichLoadCancelReason, RichLoadCompletePayload } from '../adapters/types';
import type { Editor, JSONContent } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { Transaction } from '@tiptap/pm/state';
import { ref, computed, type Ref } from 'vue';
import { Fragment } from '@tiptap/pm/model';
import { parseMarkdownForRichLoad } from '../utils/richMarkdownParser';

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

  interface FinishLoadOptions {
    rawMarkdown: string;
    json: JSONContent;
    durationMs: number;
    nodeCount: number;
    headingCount: number;
    mountDurationMs: number;
  }

  function finishLoad(options: FinishLoadOptions): void {
    const { rawMarkdown, json, durationMs, nodeCount, headingCount, mountDurationMs } = options;
    internalLoadState.value = {
      phase: 'ready',
      isReload: internalLoadState.value.isReload,
      progress: 1,
      parseDurationMs: durationMs,
      mountDurationMs,
      totalDurationMs: durationMs + mountDurationMs,
      contentSize: rawMarkdown.length,
      nodeCount
    };
    onLoadComplete({
      rawMarkdown,
      json,
      stats: {
        durationMs,
        mountDurationMs,
        nodeCount,
        headingCount
      }
    });
  }

  /**
   * 分帧时间预算（毫秒）。
   * 每帧在超过此预算后 yield 给浏览器，避免阻塞用户交互。
   */
  const FRAME_TIME_BUDGET_MS = 12;

  /**
   * 取消当前已调度的下一帧回调。
   * 在 cancelLoad 或新 startLoad 时调用，防止旧任务继续 dispatch。
   */
  let scheduledFrameCancel: (() => void) | null = null;

  /**
   * 通过 requestAnimationFrame 调度回调，返回取消函数。
   */
  function scheduleByAnimationFrame(fn: () => void): () => void {
    const handle = requestAnimationFrame(fn);
    return () => cancelAnimationFrame(handle);
  }

  /**
   * 分帧装载 JSON 顶层 block 到 ProseMirror editor。
   * 每帧累积 block 直到超过 TIME_BUDGET，然后 dispatch 一个 transaction，
   * 通过 requestAnimationFrame yield 给浏览器，再继续下一帧。
   *
   * @param editor - 当前 editor 实例
   * @param token - 当前加载令牌
   * @param json - 完整解析后的 Tiptap JSON
   */
  function mountContentInChunks(editor: Editor, token: symbol, json: JSONContent): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const blocks = json.content ?? [];
      const totalBlocks = blocks.length;
      let cursor = 0;
      let isFirstChunk = true;

      function scheduleNextChunk(): void {
        if (!isCurrentToken(token)) {
          resolve();
          return;
        }

        scheduledFrameCancel = null;

        try {
          const frameStart = performance.now();
          const chunkNodes: ProseMirrorNode[] = [];

          while (cursor < totalBlocks) {
            const block = blocks[cursor];
            if (!block) {
              cursor++;
              continue;
            }
            const node = editor.schema.nodeFromJSON(block);
            chunkNodes.push(node);
            cursor++;

            if (performance.now() - frameStart >= FRAME_TIME_BUDGET_MS) break;
          }

          if (chunkNodes.length === 0) {
            resolve();
            return;
          }

          let { tr } = editor.state;

          if (isFirstChunk) {
            // 首帧：替换占位段落为实际内容
            const fragment = Fragment.from(chunkNodes);
            tr = tr.replaceWith(0, editor.state.doc.content.size, fragment);
            isFirstChunk = false;
          } else {
            // 后续帧：追加到文档末尾
            for (const node of chunkNodes) {
              tr = tr.insert(tr.doc.content.size, node);
            }
          }

          tr.setMeta('preventUpdate', true).setMeta('addToHistory', false).setMeta('bEditorRichLoad', true);
          editor.view.dispatch(tr);

          // 更新进度
          internalLoadState.value = {
            ...internalLoadState.value,
            progress: 0.05 + 0.9 * (cursor / totalBlocks)
          };

          if (cursor < totalBlocks) {
            scheduledFrameCancel = scheduleByAnimationFrame(scheduleNextChunk);
          } else {
            resolve();
          }
        } catch (error) {
          reject(error);
        }
      }

      scheduledFrameCancel = scheduleByAnimationFrame(scheduleNextChunk);
    });
  }

  async function startLoad(markdown: string, options?: { isReload?: boolean }): Promise<void> {
    invalidateCurrentTask();

    // 取消旧加载可能残留的调度帧
    scheduledFrameCancel?.();
    scheduledFrameCancel = null;

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

      internalLoadState.value = { ...internalLoadState.value, stage: 'mounting', progress: 0.05, parseDurationMs: parseResult.stats.durationMs };

      // Stage 2: JSON → ProseMirror 分帧装载
      const mountStart = performance.now();
      try {
        await mountContentInChunks(editor, token, parseResult.json);
      } catch {
        if (!isCurrentToken(token)) return;
        clearEditorToEmptyPlaceholder(editor);
        internalLoadState.value = { phase: 'failed', isReload, progress: 0, errorMessage: ERROR_MESSAGES.DISPATCH_FAILED };
        onLoadFailed(ERROR_MESSAGES.DISPATCH_FAILED);
        return;
      }

      const mountDurationMs = performance.now() - mountStart;
      internalLoadState.value = { ...internalLoadState.value, mountDurationMs };

      if (!isCurrentToken(token)) return;

      finishLoad({
        rawMarkdown: markdown,
        json: parseResult.json,
        durationMs: parseResult.stats.durationMs,
        nodeCount: parseResult.stats.nodeCount,
        headingCount: parseResult.stats.headingCount,
        mountDurationMs
      });
    } catch (_error) {
      if (!isCurrentToken(token)) return;
      clearEditorToEmptyPlaceholder(editor);
      internalLoadState.value = { phase: 'failed', isReload, progress: 0, errorMessage: ERROR_MESSAGES.UNKNOWN };
      onLoadFailed(ERROR_MESSAGES.UNKNOWN);
    }
  }

  function cancelLoad(reason: RichLoadCancelReason): void {
    invalidateCurrentTask();

    // 取消已调度的下一帧回调
    scheduledFrameCancel?.();
    scheduledFrameCancel = null;

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
