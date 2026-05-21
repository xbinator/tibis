/**
 * @file useCommentActions.ts
 * @description 行内批注交互逻辑 composable，管理批注卡片状态与编辑/删除操作。
 */
import type { Editor } from '@tiptap/core';
import { ref } from 'vue';

/**
 * 批注卡片定位信息。
 */
interface CommentCardPosition {
  /** 相对容器的水平偏移 */
  left: number;
  /** 相对容器的垂直偏移 */
  top: number;
  /** 被批注文本的高度 */
  height: number;
}

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
  /** 卡片相对容器的定位 */
  position: CommentCardPosition;
}

/**
 * composable 参数。
 */
interface UseCommentActionsOptions {
  /** 获取当前 Rich 编辑器实例的 getter */
  getEditor: () => Editor | null;
  /** 获取容器元素 getBoundingClientRect 的 getter */
  getContainerRect: () => DOMRect | null;
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
  const { getEditor, getContainerRect } = options;

  /** 当前激活的批注卡片信息 */
  const activeCommentCard = ref<ActiveCommentCard | null>(null);

  /**
   * 点击批注高亮文本时，计算位置并显示批注卡片。
   * @param event - 鼠标点击事件
   */
  function handleCommentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    const commentEl = target.closest('span[data-comment]') as HTMLElement | null;
    if (!commentEl) return;

    const commentId = commentEl.getAttribute('data-comment-id');
    const commentContent = commentEl.getAttribute('data-comment');
    const annotatedText = commentEl.textContent ?? '';
    if (!commentId || !commentContent) return;

    const rect = commentEl.getBoundingClientRect();
    const containerRect = getContainerRect();
    if (!containerRect) return;

    activeCommentCard.value = {
      id: commentId,
      content: commentContent,
      annotatedText,
      position: {
        left: rect.left - containerRect.left,
        top: rect.top - containerRect.top,
        height: rect.height
      }
    };
  }

  /**
   * 编辑批注内容，通过 ProseMirror 事务更新 comment mark 的 comment 属性。
   * @param id - 批注 ID
   * @param newContent - 新批注内容
   */
  function handleCommentEdit(id: string, newContent: string): void {
    const editor = getEditor();
    if (!editor) return;

    const { state } = editor;
    const markType = state.schema.marks.inlineComment;
    const { tr } = state;
    let found = false;

    state.doc.descendants((node, pos) => {
      if (found) return false;
      const commentMark = node.marks.find((m) => m.type === markType && m.attrs.id === id);
      if (commentMark) {
        const newMark = markType.create({ ...commentMark.attrs, comment: newContent });
        tr.removeMark(pos, pos + node.nodeSize, commentMark);
        tr.addMark(pos, pos + node.nodeSize, newMark);
        found = true;
        return false;
      }
    });

    if (found) {
      editor.view.dispatch(tr);
    }

    activeCommentCard.value = null;
  }

  /**
   * 删除批注，仅移除 comment mark，保留正文文本和其他 marks。
   * @param id - 批注 ID
   */
  function handleCommentDelete(id: string): void {
    const editor = getEditor();
    if (!editor) return;

    const { state } = editor;
    const markType = state.schema.marks.inlineComment;
    const { tr } = state;
    let found = false;

    state.doc.descendants((node, pos) => {
      if (found) return false;
      const commentMark = node.marks.find((m) => m.type === markType && m.attrs.id === id);
      if (commentMark) {
        tr.removeMark(pos, pos + node.nodeSize, commentMark);
        found = true;
        return false;
      }
    });

    if (found) {
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

export type { ActiveCommentCard, CommentCardPosition };
