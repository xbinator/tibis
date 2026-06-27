/**
 * @file rich-select-all.test.ts
 * @description BEditor Rich 模式逐级全选快捷键测试。
 * @vitest-environment jsdom
 */
import type { Node as PMNode } from '@tiptap/pm/model';
import type { Selection } from '@tiptap/pm/state';
import { Schema } from '@tiptap/pm/model';
import { AllSelection, EditorState, TextSelection } from '@tiptap/pm/state';
import { CellSelection, selectedRect, tableNodes } from '@tiptap/pm/tables';
import { describe, expect, it, vi } from 'vitest';
import { createRichSelectAllTransaction, handleRichSelectAllKeyboardEvent } from '@/components/BEditor/extensions/richSelectAll';

/**
 * 文本节点在文档中的范围。
 */
interface TextRange {
  /** 文本起始位置。 */
  from: number;
  /** 文本结束位置。 */
  to: number;
}

/**
 * 创建包含两个段落的测试文档。
 * @returns ProseMirror 文档节点
 */
function createParagraphDoc(): PMNode {
  const schema = new Schema({
    nodes: {
      doc: { content: 'block+' },
      paragraph: {
        content: 'text*',
        group: 'block',
        parseDOM: [{ tag: 'p' }],
        toDOM: () => ['p', 0]
      },
      text: { group: 'inline' }
    },
    marks: {}
  });

  return schema.node('doc', null, [schema.node('paragraph', null, schema.text('第一段')), schema.node('paragraph', null, schema.text('第二段'))]);
}

/**
 * 创建包含 2x2 表格的测试文档。
 * @returns ProseMirror 文档节点
 */
function createTableDoc(): PMNode {
  const schema = new Schema({
    nodes: {
      doc: { content: 'block+' },
      text: { group: 'inline' },
      paragraph: {
        content: 'text*',
        group: 'block',
        parseDOM: [{ tag: 'p' }],
        toDOM: () => ['p', 0]
      },
      ...tableNodes({ tableGroup: 'block', cellContent: 'paragraph+', cellAttributes: {} })
    },
    marks: {}
  });

  const createParagraph = (text: string): PMNode => schema.node('paragraph', null, schema.text(text));
  const createCell = (text: string): PMNode => schema.nodes.table_cell.create(null, createParagraph(text));
  const firstRow = schema.nodes.table_row.create(null, [createCell('A1'), createCell('A2')]);
  const secondRow = schema.nodes.table_row.create(null, [createCell('B1'), createCell('B2')]);
  const table = schema.nodes.table.create(null, [firstRow, secondRow]);

  return schema.node('doc', null, [table]);
}

/**
 * 查找指定文本在文档中的位置。
 * @param doc - ProseMirror 文档节点
 * @param text - 需要查找的文本
 * @returns 文本范围
 */
function findTextRange(doc: PMNode, text: string): TextRange {
  let range: TextRange | null = null;

  doc.descendants((node: PMNode, pos: number): boolean => {
    if (node.isText && node.text === text) {
      range = { from: pos, to: pos + node.nodeSize };
      return false;
    }

    return true;
  });

  if (!range) {
    throw new Error(`未找到文本：${text}`);
  }

  return range;
}

/**
 * 对当前状态执行一次 Rich 全选扩大动作。
 * @param state - 当前编辑器状态
 * @returns 应用选择事务后的新状态
 */
function applySelectAll(state: EditorState): EditorState {
  const transaction = createRichSelectAllTransaction(state);
  if (!transaction) {
    throw new Error('未创建全选事务');
  }

  return state.apply(transaction);
}

/**
 * 断言当前选区是指定文本范围。
 * @param selection - 当前选区
 * @param range - 期望文本范围
 */
function expectTextSelection(selection: Selection, range: TextRange): void {
  expect(selection).toBeInstanceOf(TextSelection);
  expect(selection.from).toBe(range.from);
  expect(selection.to).toBe(range.to);
}

/**
 * 创建最小 Rich 编辑器键盘事件测试替身。
 * @param state - 当前编辑器状态
 * @returns 可记录 dispatch 的编辑器替身
 */
function createEditorHarness(state: EditorState): {
  /** Rich 编辑器替身。 */
  editor: Parameters<typeof handleRichSelectAllKeyboardEvent>[0];
  /** dispatch 调用列表。 */
  dispatchedTransactions: ReturnType<typeof vi.fn>;
} {
  const dispatchedTransactions = vi.fn();
  const editor = {
    state,
    view: {
      dispatch: dispatchedTransactions
    }
  } as Parameters<typeof handleRichSelectAllKeyboardEvent>[0];

  return { editor, dispatchedTransactions };
}

describe('createRichSelectAllTransaction', (): void => {
  it('bubbles from current block to full document outside tables', (): void => {
    const doc = createParagraphDoc();
    const firstParagraph = findTextRange(doc, '第一段');
    let state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, firstParagraph.from + 1)
    });

    state = applySelectAll(state);
    expectTextSelection(state.selection, firstParagraph);

    state = applySelectAll(state);
    expect(state.selection).toBeInstanceOf(AllSelection);
    expect(state.selection.from).toBe(0);
    expect(state.selection.to).toBe(doc.content.size);
  });

  it('bubbles from current block to current cell to whole table to full document inside tables', (): void => {
    const doc = createTableDoc();
    const firstCellText = findTextRange(doc, 'A1');
    let state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, firstCellText.from + 1)
    });

    state = applySelectAll(state);
    expectTextSelection(state.selection, firstCellText);

    state = applySelectAll(state);
    expect(state.selection).toBeInstanceOf(CellSelection);
    expect(selectedRect(state)).toMatchObject({ left: 0, right: 1, top: 0, bottom: 1 });

    state = applySelectAll(state);
    expect(state.selection).toBeInstanceOf(CellSelection);
    expect(selectedRect(state)).toMatchObject({ left: 0, right: 2, top: 0, bottom: 2 });

    state = applySelectAll(state);
    expect(state.selection).toBeInstanceOf(AllSelection);
    expect(state.selection.from).toBe(0);
    expect(state.selection.to).toBe(doc.content.size);
  });
});

describe('handleRichSelectAllKeyboardEvent', (): void => {
  it('prevents native select-all and dispatches the next rich selection transaction', (): void => {
    const doc = createParagraphDoc();
    const firstParagraph = findTextRange(doc, '第一段');
    const state = EditorState.create({
      doc,
      selection: TextSelection.create(doc, firstParagraph.from + 1)
    });
    const { editor, dispatchedTransactions } = createEditorHarness(state);
    const event = new KeyboardEvent('keydown', { key: 'a', metaKey: true, bubbles: true, cancelable: true });

    const handled = handleRichSelectAllKeyboardEvent(editor, event);

    expect(handled).toBe(true);
    expect(event.defaultPrevented).toBe(true);
    expect(dispatchedTransactions).toHaveBeenCalledTimes(1);
    expect(state.apply(dispatchedTransactions.mock.calls[0][0]).selection).toMatchObject({
      from: firstParagraph.from,
      to: firstParagraph.to
    });
  });
});
