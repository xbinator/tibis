/**
 * @file sourceInlineCompletion.ts
 * @description Source 模式 CodeMirror 内联补全 ghost text 扩展与适配器。
 */
import type { InlineCompletionAdapter, InlineCompletionRequestToken, InlineCompletionUserInteraction } from '../adapters/inlineCompletionAdapter';
import type { Extension } from '@codemirror/state';
import type { EditorView, ViewUpdate } from '@codemirror/view';
import { Compartment, EditorSelection, StateEffect, StateField, Transaction } from '@codemirror/state';
import { Decoration, EditorView as CodeMirrorEditorView, WidgetType } from '@codemirror/view';

/**
 * Source 内联补全状态字段值。
 */
export interface SourceInlineCompletionState {
  /** 当前 ghost text */
  text: string;
  /** 当前请求令牌 */
  token: InlineCompletionRequestToken | null;
}

/**
 * 创建空 Source 内联补全状态。
 * @returns 空状态
 */
function createEmptyState(): SourceInlineCompletionState {
  return {
    text: '',
    token: null
  };
}

/**
 * Source 内联补全状态更新 effect。
 */
const sourceInlineCompletionEffect = StateEffect.define<SourceInlineCompletionState>();

/**
 * Source 内联补全状态字段。
 */
export const sourceInlineCompletionField = StateField.define<SourceInlineCompletionState>({
  create(): SourceInlineCompletionState {
    return createEmptyState();
  },

  update(value, transaction): SourceInlineCompletionState {
    for (const effect of transaction.effects) {
      if (effect.is(sourceInlineCompletionEffect)) {
        return effect.value;
      }
    }

    if (transaction.docChanged && value.text) {
      return createEmptyState();
    }

    return value;
  }
});

/**
 * Source 文档修订号字段。
 * @description CodeMirror 文档长度无法识别等长替换，因此用单调递增修订号做 stale 校验。
 */
const sourceInlineCompletionRevisionField = StateField.define<number>({
  create(): number {
    return 0;
  },

  update(value, transaction): number {
    return transaction.docChanged ? value + 1 : value;
  }
});

/**
 * Source ghost text widget。
 */
class SourceInlineCompletionWidget extends WidgetType {
  /**
   * @param text - ghost text
   */
  constructor(private readonly text: string) {
    super();
  }

  /**
   * 判断 widget 是否等价。
   * @param other - 另一个 widget
   * @returns 是否等价
   */
  eq(other: SourceInlineCompletionWidget): boolean {
    return other.text === this.text;
  }

  /**
   * 渲染 widget DOM。
   * @returns ghost text DOM
   */
  toDOM(): HTMLElement {
    const element = document.createElement('span');
    element.className = 'b-markdown-source__inline-completion-ghost';
    element.textContent = this.text;
    return element;
  }
}

/**
 * 将请求位置收敛到 CodeMirror 文档内。
 * @param view - CodeMirror editor view
 * @param requestToken - 请求令牌
 * @returns 可用于 decoration 的位置
 */
function resolveGhostPosition(view: EditorView, requestToken: InlineCompletionRequestToken): number {
  return Math.min(Math.max(0, requestToken.cursorPosition.absolutePosition), view.state.doc.length);
}

/**
 * 创建 Source 内联补全扩展。
 * @returns CodeMirror extension
 */
export function createSourceInlineCompletionExtension(): Extension {
  return [
    sourceInlineCompletionField,
    sourceInlineCompletionRevisionField,
    CodeMirrorEditorView.decorations.compute([sourceInlineCompletionField], (state) => {
      const value = state.field(sourceInlineCompletionField);
      if (!value.text || !value.token) {
        return Decoration.none;
      }

      const position = Math.min(Math.max(0, value.token.cursorPosition.absolutePosition), state.doc.length);
      return Decoration.set([
        Decoration.widget({
          widget: new SourceInlineCompletionWidget(value.text),
          side: 1
        }).range(position)
      ]);
    })
  ];
}

/**
 * 判断当前 view 是否存在可见 ghost text。
 * @param view - CodeMirror editor view
 * @returns 是否存在 ghost text
 */
function hasVisibleGhost(view: EditorView): boolean {
  return Boolean(view.state.field(sourceInlineCompletionField).text);
}

/**
 * 判断 CodeMirror transaction 是否为用户输入造成的文本增长。
 * @param transaction - CodeMirror transaction
 * @returns 是否属于用户正向输入
 */
function isSourceUserTextInsertionTransaction(transaction: Transaction): boolean {
  return (
    transaction.docChanged &&
    transaction.isUserEvent('input') &&
    transaction.annotation(Transaction.remote) !== true &&
    transaction.newDoc.length > transaction.startState.doc.length
  );
}

/**
 * 判断 CodeMirror update 是否应触发内联补全。
 * @param update - CodeMirror view update
 * @returns 是否为用户输入后的文档净增长
 */
function isSourceUserTextInsertionUpdate(update: ViewUpdate): boolean {
  return update.docChanged && update.state.doc.length > update.startState.doc.length && update.transactions.some(isSourceUserTextInsertionTransaction);
}

/**
 * 创建 Source 模式内联补全适配器。
 * @param view - CodeMirror editor view
 * @param editableGetter - 可编辑状态 getter
 * @returns Source 内联补全适配器
 */
export function createSourceInlineCompletionAdapter(view: EditorView, editableGetter: () => boolean): InlineCompletionAdapter {
  const interactionCompartment = new Compartment();
  let hasInteractionExtension = false;

  /**
   * 设置 Source ghost 状态。
   * @param value - 新状态
   */
  function setGhostState(value: SourceInlineCompletionState): void {
    view.dispatch({
      effects: sourceInlineCompletionEffect.of(value)
    });
  }

  return {
    pane: 'source',

    isEditable(): boolean {
      return editableGetter();
    },

    canTriggerInlineCompletion(): boolean {
      return this.isEditable() && view.state.selection.main.empty;
    },

    getCursorPosition() {
      const selection = view.state.selection.main;
      if (!selection.empty) {
        return null;
      }

      return {
        absolutePosition: selection.from
      };
    },

    getDocVersion(): number {
      return view.state.field(sourceInlineCompletionRevisionField);
    },

    getDocumentText(): string {
      return view.state.doc.toString();
    },

    showGhost(text: string, requestToken: InlineCompletionRequestToken): void {
      setGhostState({
        text,
        token: {
          ...requestToken,
          cursorPosition: {
            absolutePosition: resolveGhostPosition(view, requestToken)
          }
        }
      });
    },

    hideGhost(): void {
      setGhostState(createEmptyState());
    },

    async acceptGhostText(text: string): Promise<void> {
      const selection = view.state.selection.main;
      const nextPosition = selection.from + text.length;
      view.dispatch({
        changes: {
          from: selection.from,
          to: selection.to,
          insert: text
        },
        selection: EditorSelection.cursor(nextPosition),
        scrollIntoView: true
      });
      view.focus();
    },

    onUserInteraction(callback: (type: InlineCompletionUserInteraction) => void): () => void {
      const handleMouseCursor = (): void => callback('cursor');
      const handleBlur = (): void => callback('blur');
      const handleCompositionStart = (): void => callback('compositionStart');
      const handleCompositionEnd = (): void => callback('compositionEnd');
      const handleUpdate = (update: ViewUpdate): void => {
        if (isSourceUserTextInsertionUpdate(update)) {
          callback('input');
          return;
        }

        if (update.docChanged) {
          callback('documentChange');
          return;
        }

        // CodeMirror typing also changes the cursor; only pure selection updates should cancel completion.
        if (update.selectionSet && !update.docChanged) {
          callback('cursor');
        }
      };
      const handleKeydown = (event: KeyboardEvent): void => {
        if (!hasVisibleGhost(view) || event.isComposing) {
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

      view.dispatch({
        effects: StateEffect.appendConfig.of(interactionCompartment.of(CodeMirrorEditorView.updateListener.of(handleUpdate)))
      });
      hasInteractionExtension = true;
      view.dom.addEventListener('mouseup', handleMouseCursor);
      view.dom.addEventListener('blur', handleBlur);
      view.dom.addEventListener('compositionstart', handleCompositionStart);
      view.dom.addEventListener('compositionend', handleCompositionEnd);
      view.dom.addEventListener('keydown', handleKeydown, true);

      return (): void => {
        if (hasInteractionExtension && interactionCompartment.get(view.state) !== undefined) {
          view.dispatch({
            effects: interactionCompartment.reconfigure([])
          });
          hasInteractionExtension = false;
        }

        view.dom.removeEventListener('mouseup', handleMouseCursor);
        view.dom.removeEventListener('blur', handleBlur);
        view.dom.removeEventListener('compositionstart', handleCompositionStart);
        view.dom.removeEventListener('compositionend', handleCompositionEnd);
        view.dom.removeEventListener('keydown', handleKeydown, true);
      };
    },

    destroy(): void {
      this.hideGhost();
    }
  };
}
