/**
 * @file useCommentActions.ts
 * @description 行内批注交互逻辑 composable，管理批注卡片状态与编辑/删除操作。
 */
import type { SelectionAssistantPosition, SelectionAssistantRect } from '../adapters/selectionAssistant';
import type { Editor } from '@tiptap/core';
import type { MarkType, Node as PMNode } from '@tiptap/pm/model';
import { ref } from 'vue';

/**
 * 当前激活的批注卡片状态。
 */
interface ActiveCommentCard {
  /** 批注 ID */
  id: string;
  /** 批注正文 */
  content: string;
  /** 被批注的原文 */
  annotatedText: string;
  /** 卡片定位信息（由 adapter 计算为相对 overlayRoot 的坐标） */
  position: SelectionAssistantPosition;
}

/**
 * 批注 mark 在文档中的连续范围。
 */
interface CommentMarkRange {
  /** 批注起始位置 */
  from: number;
  /** 批注结束位置 */
  to: number;
  /** 批注覆盖的完整正文 */
  annotatedText: string;
}

/**
 * viewport 坐标系中的 DOM 矩形。
 */
interface CommentViewportRect extends SelectionAssistantRect {
  /** 右侧坐标 */
  right: number;
  /** 底部坐标 */
  bottom: number;
}

/**
 * composable 参数。
 */
interface UseCommentActionsOptions {
  /** 获取当前 Rich 编辑器实例的 getter */
  getEditor: () => Editor | null;
  /** 获取面板定位信息的函数，与 SelectionAIInput 使用相同的定位方式 */
  getPanelPosition: (from: number, to: number) => SelectionAssistantPosition | null;
  /** 获取当前 Rich 编辑器浮层根节点 */
  getOverlayRoot?: () => HTMLElement | null;
}

/**
 * 判断 DOMRect 是否具有可见面积。
 * @param rect - 待判断矩形
 * @returns 是否为可见矩形
 */
function isVisibleDomRect(rect: DOMRect): boolean {
  return rect.width > 0 && rect.height > 0;
}

/**
 * 合并多个 viewport 矩形。
 * @param rects - 待合并的矩形列表
 * @returns 合并后的矩形；无有效矩形时返回 null
 */
function mergeDomRects(rects: DOMRect[]): CommentViewportRect | null {
  if (rects.length === 0) {
    return null;
  }

  const top = Math.min(...rects.map((rect) => rect.top));
  const left = Math.min(...rects.map((rect) => rect.left));
  const right = Math.max(...rects.map((rect) => rect.right));
  const bottom = Math.max(...rects.map((rect) => rect.bottom));

  return {
    top,
    left,
    right,
    bottom,
    width: right - left,
    height: bottom - top
  };
}

/**
 * 读取元素的可见客户端矩形，必要时回退到 bounding rect。
 * @param element - 目标元素
 * @returns 可见矩形列表
 */
function getVisibleElementRects(element: HTMLElement): DOMRect[] {
  const clientRects = Array.from(element.getClientRects()).filter(isVisibleDomRect);
  if (clientRects.length > 0) {
    return clientRects;
  }

  const fallbackRect = element.getBoundingClientRect();
  return isVisibleDomRect(fallbackRect) ? [fallbackRect] : [];
}

/**
 * 获取同一批注 ID 对应的所有 DOM 片段。
 * @param root - 编辑器 DOM 根节点
 * @param commentId - 批注 ID
 * @returns 同 ID 批注元素列表
 */
function getCommentElementsById(root: HTMLElement, commentId: string): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('span[data-comment-id]')).filter(
    (element: HTMLElement): boolean => element.getAttribute('data-comment-id') === commentId
  );
}

/**
 * 拼接同一批注所有 DOM 片段的可读文本。
 * @param elements - 同 ID 批注元素列表
 * @returns 批注正文文本
 */
function getCommentElementsText(elements: HTMLElement[]): string {
  return elements.map((element: HTMLElement): string => element.textContent ?? '').join('');
}

/**
 * 计算 overlayRoot 坐标系下的可见容器矩形。
 * @param overlayRoot - 浮层根节点
 * @returns overlayRoot 坐标系中的可见区域
 */
function resolveOverlayViewportContainerRect(overlayRoot: HTMLElement): SelectionAssistantRect {
  const overlayRect = overlayRoot.getBoundingClientRect();
  const top = Math.max(0, -overlayRect.top);
  const left = Math.max(0, -overlayRect.left);

  return {
    top,
    left,
    width: window.innerWidth - left,
    height: window.innerHeight - top
  };
}

/**
 * 从 DOM 批注片段计算批注卡片定位。
 * @param commentElements - 同 ID 批注元素列表
 * @param overlayRoot - 浮层根节点
 * @param fallbackPosition - adapter 给出的基础定位信息
 * @returns 卡片定位信息；无可见 DOM 片段时返回 null
 */
function resolveCommentDomPosition(
  commentElements: HTMLElement[],
  overlayRoot: HTMLElement,
  fallbackPosition: SelectionAssistantPosition | null
): SelectionAssistantPosition | null {
  const mergedRect = mergeDomRects(commentElements.flatMap(getVisibleElementRects));
  if (!mergedRect) {
    return null;
  }

  const overlayRect = overlayRoot.getBoundingClientRect();
  const anchorRect: SelectionAssistantRect = {
    top: mergedRect.top - overlayRect.top,
    left: mergedRect.left - overlayRect.left,
    width: mergedRect.width,
    height: mergedRect.height
  };

  return {
    anchorRect,
    selectionRect: anchorRect,
    lineHeight: anchorRect.height,
    containerRect: fallbackPosition?.containerRect ?? resolveOverlayViewportContainerRect(overlayRoot)
  };
}

/**
 * 在 ProseMirror 文档中查找同 ID 批注 mark 的完整范围。
 * @param doc - ProseMirror 文档节点
 * @param markType - inlineComment mark 类型
 * @param commentId - 批注 ID
 * @returns 同 ID 批注范围；未找到时返回 null
 */
function findCommentMarkRangeById(doc: PMNode, markType: MarkType, commentId: string): CommentMarkRange | null {
  let from: number | null = null;
  let to: number | null = null;
  const annotatedParts: string[] = [];

  doc.descendants((node: PMNode, pos: number): void => {
    const commentMark = node.marks.find((mark) => mark.type === markType && mark.attrs.id === commentId);
    if (!commentMark) {
      return;
    }

    from = from === null ? pos : Math.min(from, pos);
    to = to === null ? pos + node.nodeSize : Math.max(to, pos + node.nodeSize);
    annotatedParts.push(node.textContent);
  });

  if (from === null || to === null) {
    return null;
  }

  return {
    from,
    to,
    annotatedText: annotatedParts.join('')
  };
}

/**
 * 行内批注交互逻辑 composable。
 *
 * 管理批注卡片的显隐状态，以及点击批注、编辑批注、删除批注三个核心操作。
 * 编辑和删除通过 ProseMirror 事务直接操作 comment mark，保留正文文本和其他 marks。
 *
 * @param options - composable 参数
 * @returns 批注卡片状态与操作方法
 */
export function useCommentActions(options: UseCommentActionsOptions) {
  const { getEditor, getPanelPosition, getOverlayRoot } = options;

  /** 当前激活的批注卡片信息 */
  const activeCommentCard = ref<ActiveCommentCard | null>(null);

  /**
   * 点击批注高亮文本时，通过 adapter 计算位置并显示批注卡片。
   * @param event - 鼠标点击事件
   */
  function handleCommentClick(event: MouseEvent): void {
    const { target } = event;
    if (!(target instanceof Element)) return;

    const commentEl = target.closest('span[data-comment]') as HTMLElement | null;
    if (!commentEl) return;

    const commentId = commentEl.getAttribute('data-comment-id');
    const commentContent = commentEl.getAttribute('data-comment');
    const annotatedText = commentEl.textContent ?? '';
    if (!commentId || !commentContent) return;

    const editor = getEditor();
    if (!editor) return;

    const mark = editor.state.schema.marks.inlineComment;
    if (!mark) return;

    const range = findCommentMarkRangeById(editor.state.doc, mark, commentId);
    const fallbackPosition = range ? getPanelPosition(range.from, range.to) : null;
    const overlayRoot = getOverlayRoot?.() ?? null;
    const commentElements = getCommentElementsById(editor.view.dom, commentId);
    const domPosition = overlayRoot
      ? resolveCommentDomPosition(commentElements.length > 0 ? commentElements : [commentEl], overlayRoot, fallbackPosition)
      : null;
    const position = domPosition ?? fallbackPosition;
    if (!position) return;

    activeCommentCard.value = {
      id: commentId,
      content: commentContent,
      annotatedText: range?.annotatedText || getCommentElementsText(commentElements) || annotatedText,
      position
    };
  }

  /**
   * 编辑批注内容，通过 ProseMirror 事务更新 comment mark 的 comment 属性。
   * 遍历文档中所有具有相同 id 的 mark 节点，逐个替换为新 mark。
   * @param id - 批注 ID
   * @param newContent - 新批注内容
   */
  function handleCommentEdit(id: string, newContent: string): void {
    const editor = getEditor();
    if (!editor) return;

    const { state } = editor;
    const markType = state.schema.marks.inlineComment;
    const { tr } = state;

    state.doc.descendants((node, pos) => {
      const commentMark = node.marks.find((m) => m.type === markType && m.attrs.id === id);
      if (commentMark) {
        const newMark = markType.create({ ...commentMark.attrs, comment: newContent });
        tr.removeMark(pos, pos + node.nodeSize, commentMark);
        tr.addMark(pos, pos + node.nodeSize, newMark);
      }
    });

    if (tr.docChanged) {
      editor.view.dispatch(tr);
    }

    activeCommentCard.value = null;
  }

  /**
   * 删除批注，仅移除 comment mark，保留正文文本和其他 marks。
   * 遍历文档中所有具有相同 id 的 mark 节点，逐个移除。
   * @param id - 批注 ID
   */
  function handleCommentDelete(id: string): void {
    const editor = getEditor();
    if (!editor) return;

    const { state } = editor;
    const markType = state.schema.marks.inlineComment;
    const { tr } = state;

    state.doc.descendants((node, pos) => {
      const commentMark = node.marks.find((m) => m.type === markType && m.attrs.id === id);
      if (commentMark) {
        tr.removeMark(pos, pos + node.nodeSize, commentMark);
      }
    });

    if (tr.docChanged) {
      editor.view.dispatch(tr);
    }

    activeCommentCard.value = null;
  }

  return {
    activeCommentCard,
    handleCommentClick,
    handleCommentEdit,
    handleCommentDelete
  };
}

export type { ActiveCommentCard };
