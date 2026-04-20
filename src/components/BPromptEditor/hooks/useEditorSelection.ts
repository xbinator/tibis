import type { Ref } from 'vue';
import { ref } from 'vue';
import { ZERO_WIDTH_SPACE } from './useVariableEncoder';

export interface MenuPosition {
  top: number;
  left: number;
  bottom: number;
}

export function useEditorSelection(editorRef: Ref<HTMLDivElement | undefined>) {
  const cachedRange = ref<Range | null>(null);

  /**
   * 将折叠选区恢复到父节点的指定 child offset，避免引用已脱离 DOM 的节点。
   * @param selection - 当前浏览器选区
   * @param parentNode - 目标父节点
   * @param restoredOffset - 目标 child offset
   */
  function restoreCollapsedSelectionAtOffset(selection: Selection, parentNode: Node, restoredOffset: number): void {
    const restored = document.createRange();
    restored.setStart(parentNode, restoredOffset);
    restored.collapse(true);
    selection.removeAllRanges();
    selection.addRange(restored);
  }

  function getActiveSelection(): Selection | null {
    const sel = window.getSelection();
    return sel && sel.rangeCount > 0 ? sel : null;
  }

  function getActiveRange(): Range | null {
    return getActiveSelection()?.getRangeAt(0) ?? null;
  }

  function cacheCurrentRange(): void {
    const range = getActiveRange();
    if (range) cachedRange.value = range.cloneRange();
  }

  function getCursorPosition(): MenuPosition | null {
    const selection = getActiveSelection();
    if (!selection) return null;

    const range = selection.getRangeAt(0).cloneRange();
    range.collapse(true);
    let rect = range.getBoundingClientRect();

    if (rect.top === 0 && rect.left === 0 && rect.width === 0 && rect.height === 0) {
      const span = document.createElement('span');
      span.textContent = ZERO_WIDTH_SPACE;
      range.insertNode(span);
      rect = span.getBoundingClientRect();
      const { parentNode } = span;
      const restoredOffset = parentNode ? Array.from(parentNode.childNodes).indexOf(span) : -1;

      span.remove();

      if (parentNode && restoredOffset >= 0) {
        restoreCollapsedSelectionAtOffset(selection, parentNode, restoredOffset);
      }
    }

    return { top: rect.top, left: rect.left, bottom: rect.bottom };
  }

  function getTextBeforeCursor(): string {
    const range = getActiveRange();
    if (!range) return '';
    const { startContainer, startOffset } = range;
    return startContainer.nodeType === Node.TEXT_NODE ? startContainer.textContent?.slice(0, startOffset) ?? '' : '';
  }

  function isSelectionInsideEditor(): boolean {
    const sel = getActiveSelection();
    return !!(sel && editorRef.value?.contains(sel.anchorNode));
  }

  function getVariableQueryBeforeCursor(): string | null {
    const match = getTextBeforeCursor().match(/\{\{([^{}]*)$/);
    return match ? match[1] ?? '' : null;
  }

  function insertTextAtCursor(text: string): boolean {
    const selection = getActiveSelection();
    if (!selection) return false;

    const range = selection.getRangeAt(0);
    range.deleteContents();
    const textNode = document.createTextNode(text);
    range.insertNode(textNode);
    range.setStartAfter(textNode);
    range.setEndAfter(textNode);
    selection.removeAllRanges();
    selection.addRange(range);
    return true;
  }

  return {
    cachedRange,
    getActiveSelection,
    getActiveRange,
    cacheCurrentRange,
    getCursorPosition,
    getTextBeforeCursor,
    isSelectionInsideEditor,
    getVariableQueryBeforeCursor,
    insertTextAtCursor
  };
}
