/**
 * @file use-comment-actions.test.ts
 * @description Markdown Rich 批注点击交互回归测试。
 * @vitest-environment jsdom
 */
import type { Editor } from '@tiptap/core';
import type { Mark, Node as PMNode } from '@tiptap/pm/model';
import { Schema } from '@tiptap/pm/model';
import { describe, expect, it, vi } from 'vitest';
import type { SelectionAssistantPosition } from '@/components/BEditor/adapters/selectionAssistant';
import { useCommentActions } from '@/components/BEditor/hooks/useCommentActions';

/**
 * 创建测试 DOMRect。
 * @param left - 左侧坐标
 * @param top - 顶部坐标
 * @param width - 宽度
 * @param height - 高度
 * @returns DOMRect 测试替身
 */
function createDomRect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON: () => ({})
  } as DOMRect;
}

/**
 * 为测试元素注入布局矩形。
 * @param element - 目标元素
 * @param rects - 目标元素返回的客户端矩形列表
 */
function mockElementRects(element: HTMLElement, rects: DOMRect[]): void {
  Object.defineProperty(element, 'getClientRects', {
    value: (): DOMRectList => rects as unknown as DOMRectList
  });
  Object.defineProperty(element, 'getBoundingClientRect', {
    value: (): DOMRect => rects[0] ?? createDomRect(0, 0, 0, 0)
  });
}

/**
 * 创建带 inlineComment mark 的 ProseMirror 文档。
 * @returns 测试文档与 schema
 */
function createCommentDoc(): { doc: PMNode; schema: Schema } {
  const schema = new Schema({
    nodes: {
      doc: { content: 'block+' },
      paragraph: {
        content: 'text*',
        group: 'block',
        parseDOM: [{ tag: 'p' }],
        toDOM: (): [string, number] => ['p', 0]
      },
      text: { group: 'inline' }
    },
    marks: {
      inlineComment: {
        attrs: {
          id: { default: null },
          comment: { default: null }
        },
        parseDOM: [{ tag: 'span[data-comment]' }],
        toDOM: (mark: Mark): [string, Record<string, string>, number] => [
          'span',
          {
            'data-comment-id': String(mark.attrs.id ?? ''),
            'data-comment': String(mark.attrs.comment ?? '')
          },
          0
        ]
      }
    }
  });

  const commentMark = schema.marks.inlineComment.create({ id: 'comment-a', comment: '跟你说' });
  const otherCommentMark = schema.marks.inlineComment.create({ id: 'comment-b', comment: '其他批注' });

  const doc = schema.node('doc', null, [
    schema.node('paragraph', null, [
      schema.text('v1 ', [commentMark]),
      schema.text('invoke', [commentMark]),
      schema.text(' plain '),
      schema.text('other', [otherCommentMark])
    ])
  ]);

  return { doc, schema };
}

/**
 * 创建带批注 DOM 片段的富文本编辑器替身。
 * @returns 编辑器、overlayRoot 与被点击片段
 */
function createEditorHarness(): { editor: Editor; overlayRoot: HTMLElement; clickedCommentElement: HTMLElement } {
  const { doc, schema } = createCommentDoc();
  const overlayRoot = document.createElement('div');
  const firstCommentElement = document.createElement('span');
  const clickedCommentElement = document.createElement('span');
  const otherCommentElement = document.createElement('span');

  firstCommentElement.setAttribute('data-comment-id', 'comment-a');
  firstCommentElement.setAttribute('data-comment', '跟你说');
  firstCommentElement.textContent = 'v1 ';
  clickedCommentElement.setAttribute('data-comment-id', 'comment-a');
  clickedCommentElement.setAttribute('data-comment', '跟你说');
  clickedCommentElement.textContent = 'invoke';
  otherCommentElement.setAttribute('data-comment-id', 'comment-b');
  otherCommentElement.setAttribute('data-comment', '其他批注');
  otherCommentElement.textContent = 'other';

  overlayRoot.append(firstCommentElement, clickedCommentElement, otherCommentElement);

  mockElementRects(overlayRoot, [createDomRect(40, 100, 600, 400)]);
  mockElementRects(firstCommentElement, [createDomRect(50, 120, 100, 20)]);
  mockElementRects(clickedCommentElement, [createDomRect(50, 150, 140, 20)]);
  mockElementRects(otherCommentElement, [createDomRect(300, 500, 80, 20)]);

  const editor = {
    state: { doc, schema },
    view: {
      dom: overlayRoot,
      posAtDOM: vi.fn<(node: Node, offset: number) => number>().mockReturnValue(1),
      dispatch: vi.fn<(transaction: unknown) => void>()
    }
  } as unknown as Editor;

  return { editor, overlayRoot, clickedCommentElement };
}

describe('useCommentActions', (): void => {
  it('positions the comment card from every DOM fragment with the same comment id', (): void => {
    const { editor, overlayRoot, clickedCommentElement } = createEditorHarness();
    const fallbackPosition: SelectionAssistantPosition = {
      anchorRect: { top: 400, left: 900, width: 0, height: 20 },
      lineHeight: 20,
      containerRect: { top: 0, left: 0, width: 1000, height: 800 }
    };
    const getPanelPosition = vi.fn<(from: number, to: number) => SelectionAssistantPosition | null>().mockReturnValue(fallbackPosition);
    const { activeCommentCard, handleCommentClick } = useCommentActions({
      getEditor: () => editor,
      getPanelPosition,
      getOverlayRoot: () => overlayRoot
    });

    const event = new MouseEvent('click', { bubbles: true });
    Object.defineProperty(event, 'target', { value: clickedCommentElement });
    handleCommentClick(event);

    expect(getPanelPosition).toHaveBeenCalledWith(1, 10);
    expect(activeCommentCard.value?.annotatedText).toBe('v1 invoke');
    expect(activeCommentCard.value?.position).toEqual({
      anchorRect: { top: 20, left: 10, width: 140, height: 50 },
      selectionRect: { top: 20, left: 10, width: 140, height: 50 },
      lineHeight: 50,
      containerRect: { top: 0, left: 0, width: 1000, height: 800 }
    });
  });
});
