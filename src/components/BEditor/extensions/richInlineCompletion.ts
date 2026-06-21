/**
 * @file richInlineCompletion.ts
 * @description Rich 模式 TipTap/ProseMirror 内联补全 ghost text 扩展与适配器。
 */
import type {
  InlineCompletionAdapter,
  InlineCompletionDocumentContext,
  InlineCompletionRequestToken,
  InlineCompletionUserInteraction
} from '../adapters/inlineCompletionAdapter';
import type { Editor } from '@tiptap/core';
import { Extension } from '@tiptap/core';
import { closeHistory, isHistoryTransaction } from '@tiptap/pm/history';
import { Plugin, PluginKey, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

/**
 * Rich 内联补全 plugin 状态。
 */
export interface RichInlineCompletionPluginState {
  /** 当前 ghost text */
  text: string;
  /** 当前请求令牌 */
  token: InlineCompletionRequestToken | null;
  /** 文档修订号，任意 docChanged transaction 都会递增 */
  docRevision: number;
}

/**
 * Rich 内联补全 plugin meta 动作。
 */
interface RichInlineCompletionMeta {
  /** 动作类型 */
  type: 'show' | 'hide';
  /** ghost text */
  text?: string;
  /** 请求令牌 */
  token?: InlineCompletionRequestToken;
}

/**
 * Rich 内联补全 plugin key。
 */
export const richInlineCompletionPluginKey = new PluginKey<RichInlineCompletionPluginState>('richInlineCompletion');

/**
 * 创建空 Rich 内联补全状态。
 * @returns plugin 初始状态
 */
function createEmptyState(): RichInlineCompletionPluginState {
  return {
    text: '',
    token: null,
    docRevision: 0
  };
}

/**
 * 从 transaction 中读取内联补全 meta。
 * @param value - 原始 meta
 * @returns 合法 meta 或 null
 */
function normalizeMeta(value: unknown): RichInlineCompletionMeta | null {
  if (!value || typeof value !== 'object' || !('type' in value)) {
    return null;
  }

  const meta = value as RichInlineCompletionMeta;
  return meta.type === 'show' || meta.type === 'hide' ? meta : null;
}

/**
 * 将请求位置收敛到当前 ProseMirror 文档内。
 * @param editor - TipTap editor
 * @param requestToken - 请求令牌
 * @returns 可用于 decoration 的位置
 */
function resolveGhostPosition(editor: Editor, requestToken: InlineCompletionRequestToken): number {
  const maxPosition = editor.state.doc.content.size;
  return Math.min(Math.max(1, requestToken.cursorPosition.absolutePosition), maxPosition);
}

/**
 * 创建 ghost text DOM。
 * @param text - ghost text
 * @returns ghost text span
 */
function createGhostElement(text: string): HTMLElement {
  const element = document.createElement('span');
  element.className = 'b-markdown-rich__inline-completion-ghost';
  element.textContent = text;
  return element;
}

/**
 * 安全读取 Rich editor DOM。
 * TipTap 在 unmount 后访问 editor.view.dom 会抛错，因此 cleanup 必须通过此函数兜底。
 * @param editor - TipTap editor
 * @returns editor DOM；不可用时返回 null
 */
function getRichEditorDom(editor: Editor): HTMLElement | null {
  try {
    return editor.view.dom;
  } catch {
    return null;
  }
}

/**
 * Rich 内联补全 TipTap 扩展。
 */
export const RichInlineCompletion = Extension.create({
  name: 'richInlineCompletion',

  addProseMirrorPlugins() {
    const { editor } = this;
    return [
      new Plugin<RichInlineCompletionPluginState>({
        key: richInlineCompletionPluginKey,
        state: {
          init(): RichInlineCompletionPluginState {
            return createEmptyState();
          },
          apply(transaction, value): RichInlineCompletionPluginState {
            const meta = normalizeMeta(transaction.getMeta(richInlineCompletionPluginKey));
            const docRevision = transaction.docChanged ? value.docRevision + 1 : value.docRevision;
            if (!meta) {
              return docRevision === value.docRevision ? value : { ...value, docRevision };
            }

            if (meta.type === 'hide') {
              return {
                ...createEmptyState(),
                docRevision
              };
            }

            return {
              text: meta.text ?? '',
              token: meta.token ?? null,
              docRevision
            };
          }
        },
        props: {
          decorations(state) {
            const pluginState = richInlineCompletionPluginKey.getState(state);
            if (!pluginState?.text || !pluginState.token) {
              return DecorationSet.empty;
            }

            const position = resolveGhostPosition(editor, pluginState.token);
            return DecorationSet.create(state.doc, [
              Decoration.widget(position, () => createGhostElement(pluginState.text), {
                side: 1
              })
            ]);
          }
        }
      })
    ];
  }
});

/**
 * 判断当前 plugin 是否存在可见 ghost text。
 * @param editor - TipTap editor
 * @returns 是否存在 ghost text
 */
function hasVisibleGhost(editor: Editor): boolean {
  return Boolean(richInlineCompletionPluginKey.getState(editor.state)?.text);
}

/**
 * 将 ghost text 收敛为可安全插入当前 Rich 光标位置的一行纯文本。
 * @param text - 原始 ghost text
 * @returns 单行纯文本
 */
function normalizeAcceptedGhostText(text: string): string {
  const lineBreak = /\r?\n/.exec(text);
  return lineBreak ? text.slice(0, lineBreak.index) : text;
}

/**
 * 从 Rich 文档中解析光标前的标题路径。
 * @param editor - TipTap editor
 * @param cursorPosition - ProseMirror 光标位置
 * @returns 标题路径
 */
function resolveRichHeadingPath(editor: Editor, cursorPosition: number): string[] {
  const headings: string[] = [];
  editor.state.doc.descendants((node, pos): boolean | void => {
    if (pos >= cursorPosition) {
      return false;
    }

    if (node.type.name !== 'heading') {
      return;
    }

    const level = Number(node.attrs.level);
    const text = node.textContent.trim();
    if (!Number.isInteger(level) || level < 1 || level > 6 || !text) {
      return false;
    }

    headings.splice(level - 1);
    headings[level - 1] = text;
    return false;
  });

  return headings.filter(Boolean).slice(0, 6);
}

/**
 * 创建与 ProseMirror 光标位置同坐标系的纯文本上下文。
 * @param editor - TipTap editor
 * @param requestToken - 请求令牌
 * @returns prompt 上下文
 */
function createRichCompletionContext(editor: Editor, requestToken: InlineCompletionRequestToken): InlineCompletionDocumentContext {
  const { doc } = editor.state;
  const safePosition = Math.min(Math.max(0, requestToken.cursorPosition.absolutePosition), doc.content.size);
  const documentText = doc.textBetween(0, doc.content.size, '\n', '\n');
  const cursorPosition = doc.textBetween(0, safePosition, '\n', '\n').length;

  return {
    documentText,
    cursorPosition,
    headingPath: resolveRichHeadingPath(editor, safePosition)
  };
}

/**
 * 判断 transaction 是否为应触发补全的文本插入。
 * Rich 模式会把加粗、链接等标记变化也归为 docChanged，因此仅以纯文本增长作为触发边界。
 * @param transaction - ProseMirror transaction
 * @returns 是否属于用户正向输入文本
 */
function isTextInsertionTransaction(transaction: Transaction): boolean {
  return transaction.docChanged && transaction.doc.textContent.length > transaction.before.textContent.length;
}

/**
 * 创建 Rich 模式内联补全适配器。
 * @param editor - TipTap editor
 * @param editableGetter - 可编辑状态 getter
 * @param documentTextGetter - 可选文档文本 getter
 * @returns Rich 内联补全适配器
 */
export function createRichInlineCompletionAdapter(editor: Editor, editableGetter: () => boolean, documentTextGetter?: () => string): InlineCompletionAdapter {
  /**
   * 派发 Rich 内联补全 meta。
   * @param meta - plugin meta
   */
  function dispatchMeta(meta: RichInlineCompletionMeta): void {
    if (editor.isDestroyed) {
      return;
    }

    editor.view.dispatch(editor.state.tr.setMeta(richInlineCompletionPluginKey, meta).setMeta('addToHistory', false));
  }

  return {
    pane: 'rich',

    isEditable(): boolean {
      return editor.isEditable && editableGetter();
    },

    canTriggerInlineCompletion(): boolean {
      return this.isEditable() && editor.state.selection.empty;
    },

    getCursorPosition() {
      const { selection } = editor.state;
      if (!selection.empty) {
        return null;
      }

      return {
        absolutePosition: selection.from
      };
    },

    getDocVersion(): number {
      return richInlineCompletionPluginKey.getState(editor.state)?.docRevision ?? 0;
    },

    getDocumentText(): string {
      return documentTextGetter?.() ?? editor.getText({ blockSeparator: '\n' });
    },

    getCompletionContext(requestToken: InlineCompletionRequestToken): InlineCompletionDocumentContext {
      return createRichCompletionContext(editor, requestToken);
    },

    showGhost(text: string, requestToken: InlineCompletionRequestToken): void {
      dispatchMeta({ type: 'show', text, token: requestToken });
    },

    hideGhost(): void {
      dispatchMeta({ type: 'hide' });
    },

    async acceptGhostText(text: string): Promise<void> {
      if (editor.isDestroyed) {
        return;
      }

      const acceptedText = normalizeAcceptedGhostText(text);
      if (!acceptedText) {
        return;
      }

      const { selection } = editor.state;
      const transaction = closeHistory(editor.state.tr.insertText(acceptedText, selection.from, selection.to).scrollIntoView());
      editor.view.dispatch(transaction);
      editor.commands.focus();
    },

    onUserInteraction(callback: (type: InlineCompletionUserInteraction) => void): () => void {
      const handleUpdate = ({ transaction }: { transaction: Transaction }): void => {
        if (!transaction.docChanged) {
          return;
        }

        if (!isHistoryTransaction(transaction) && isTextInsertionTransaction(transaction)) {
          callback('input');
          return;
        }

        callback('documentChange');
      };
      const handleSelectionUpdate = (): void => callback('cursor');
      const handleBlur = (): void => callback('blur');
      const handleCompositionStart = (): void => callback('compositionStart');
      const handleCompositionEnd = (): void => callback('compositionEnd');
      const editorDom = getRichEditorDom(editor);
      const handleKeydown = (event: KeyboardEvent): void => {
        if (!hasVisibleGhost(editor) || event.isComposing) {
          return;
        }

        if (event.key === 'Tab' && !event.ctrlKey && !event.metaKey && !event.altKey) {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          callback('accept');
          return;
        }

        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          callback('escape');
        }
      };

      editor.on('update', handleUpdate);
      editor.on('selectionUpdate', handleSelectionUpdate);
      editor.on('blur', handleBlur);
      editorDom?.addEventListener('compositionstart', handleCompositionStart);
      editorDom?.addEventListener('compositionend', handleCompositionEnd);
      editorDom?.addEventListener('keydown', handleKeydown, true);

      return (): void => {
        editor.off('update', handleUpdate);
        editor.off('selectionUpdate', handleSelectionUpdate);
        editor.off('blur', handleBlur);
        editorDom?.removeEventListener('compositionstart', handleCompositionStart);
        editorDom?.removeEventListener('compositionend', handleCompositionEnd);
        editorDom?.removeEventListener('keydown', handleKeydown, true);
      };
    },

    destroy(): void {
      this.hideGhost();
    }
  };
}
