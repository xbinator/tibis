/**
 * @file pasteHandler.ts
 * @description Paste and drop handler extension for CodeMirror editor
 */

import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

/**
 * 文件粘贴回调类型。
 * 当前仅支持同步返回——返回 string 时插入，返回 null 时跳过。
 * 返回 Promise 时会打 warning 并跳过（异步场景下位置可能因用户编辑而失效）。
 */
type OnPasteFiles = (files: File[]) => Promise<string | null> | string | null;

/**
 * Creates a paste handler extension that delegates to the onPasteFiles callback.
 * @param onPasteFiles - Callback for constructing tokens from pasted/dropped files
 * @returns Extension instance
 */
export function createPasteHandlerExtension(onPasteFiles?: OnPasteFiles): Extension {
  return EditorView.domEventHandlers({
    paste(event: Event, view: EditorView): boolean {
      if (event instanceof ClipboardEvent) {
        const { clipboardData } = event;
        if (!clipboardData) return false;

        const { files } = clipboardData;
        if (files.length > 0 && onPasteFiles) {
          event.preventDefault();
          const pos = view.state.selection.main.head;
          const result = onPasteFiles(Array.from(files));

          if (result instanceof Promise) {
            console.warn('[pasteHandler] Async onPasteFiles not supported — position may be stale. Insertion skipped.');
            return true;
          }
          if (typeof result === 'string') {
            view.dispatch({
              changes: { from: pos, insert: result },
              selection: { anchor: pos + result.length }
            });
          }
          return true;
        }

        return false;
      }
      return false;
    },
    drop(event: Event, view: EditorView): boolean {
      if (event instanceof DragEvent) {
        const { dataTransfer } = event;
        if (!dataTransfer) return false;

        const { files } = dataTransfer;
        if (files.length > 0 && onPasteFiles) {
          event.preventDefault();
          const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
          if (pos === null) return true;

          const result = onPasteFiles(Array.from(files));

          if (result instanceof Promise) {
            console.warn('[pasteHandler] Async onPasteFiles not supported — position may be stale. Insertion skipped.');
            return true;
          }
          if (typeof result === 'string') {
            view.dispatch({
              changes: { from: pos, insert: result },
              selection: { anchor: pos + result.length }
            });
          }
          return true;
        }
      }
      return false;
    },
    dragover(): boolean {
      return false;
    }
  });
}
