/**
 * @file useCommentActions.ts
 * @description 行内批注交互逻辑 composable，管理批注卡片状态与编辑/删除操作。
 */
import type { SelectionAssistantPosition } from '../adapters/selectionAssistant';
import type { Editor } from '@tiptap/core';
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
 * composable 参数。
 */
interface UseCommentActionsOptions {
  /** 获取当前 Rich 编辑器实例的 getter */
  getEditor: () => Editor | null;
  /** 获取面板定位信息的函数，与 SelectionAIInput 使用相同的定位方式 */
  getPanelPosition: (from: number, to: number) => SelectionAssistantPosition | null;
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
  const { getEditor, getPanelPosition } = options;

  /** 当前激活的批注卡片信息 */
  const activeCommentCard = ref<ActiveCommentCard | null>(null);

  /**
   * 点击批注高亮文本时，通过 adapter 计算位置并显示批注卡片。
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

    const editor = getEditor();
    if (!editor) return;

    let pos: number;
    try {
      pos = editor.view.posAtDOM(commentEl, 0);
    } catch {
      return;
    }

    const node = editor.state.doc.nodeAt(pos);
    if (!node) return;

    const mark = editor.state.schema.marks.inlineComment;
    if (!mark) return;

    let from = pos;
    for (let i = pos - 1; i >= 0; i--) {
      const prevNode = editor.state.doc.nodeAt(i);
      if (!prevNode || !prevNode.marks.some((m) => m.type === mark)) break;
      from = i;
    }

    let to = pos + (node.nodeSize ?? 1);
    for (let i = to; i < editor.state.doc.content.size; i++) {
      const nextNode = editor.state.doc.nodeAt(i);
      if (!nextNode || !nextNode.marks.some((m) => m.type === mark)) break;
      to = i + (nextNode.nodeSize ?? 1);
    }

    const position = getPanelPosition(from, to);
    if (!position) return;

    activeCommentCard.value = {
      id: commentId,
      content: commentContent,
      annotatedText,
      position
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

export type { ActiveCommentCard };
