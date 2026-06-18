/**
 * @file rich-selection-assistant.test.ts
 * @description BEditor Rich 模式选区工具适配器回归测试。
 */
import type { Node as PMNode } from '@tiptap/pm/model';
import { Schema } from '@tiptap/pm/model';
import { AllSelection, EditorState, NodeSelection, TextSelection } from '@tiptap/pm/state';
import { CellSelection, tableNodes } from '@tiptap/pm/tables';
import { describe, expect, it } from 'vitest';
import { getRichSelectionCapabilities, resolveRichSelectionRange } from '@/components/BEditor/adapters/richSelectionAssistant';

/**
 * 创建包含两个段落的 ProseMirror 测试文档。
 * @returns ProseMirror 文档节点
 */
function createTestDoc(): PMNode {
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
 * 创建包含 2x2 表格的 ProseMirror 测试文档。
 * @returns ProseMirror 表格文档节点
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

describe('resolveRichSelectionRange', (): void => {
  it('keeps Ctrl+A AllSelection as a selectable range so AI highlight can cover the full document', (): void => {
    const doc = createTestDoc();
    const state = EditorState.create({ doc, selection: new AllSelection(doc) });
    const range = resolveRichSelectionRange(state.selection, doc);

    expect(range).toEqual({
      from: 0,
      to: doc.content.size,
      text: '第一段第二段',
      docVersion: doc.nodeSize
    });
  });

  it('keeps normal text selections available for the rich selection toolbar', (): void => {
    const doc = createTestDoc();
    const selection = TextSelection.create(doc, 1, 4);
    const range = resolveRichSelectionRange(selection, doc);

    expect(range).toEqual({
      from: 1,
      to: 4,
      text: '第一段',
      docVersion: doc.nodeSize
    });
  });

  it('still ignores non-text node selections', (): void => {
    const doc = createTestDoc();
    const selection = NodeSelection.create(doc, 0);
    const range = resolveRichSelectionRange(selection, doc);

    expect(range).toBeNull();
  });

  it('resolves table cell selections to the whole table container range', (): void => {
    const doc = createTableDoc();
    const selection = CellSelection.create(doc, 2, 22);
    const range = resolveRichSelectionRange(selection, doc);

    expect(range).toEqual({
      from: 0,
      to: doc.content.size,
      text: 'A1A2B1B2',
      docVersion: doc.nodeSize,
      highlightKind: 'node'
    });
  });

  it('does not treat a single dragged table cell as the whole table container selection', (): void => {
    const doc = createTableDoc();
    const selection = CellSelection.create(doc, 2);
    const range = resolveRichSelectionRange(selection, doc);

    expect(range).toBeNull();
  });
});

describe('getRichSelectionCapabilities', (): void => {
  it('keeps text format actions available for normal text selections', (): void => {
    const capabilities = getRichSelectionCapabilities({ from: 1, to: 4, text: '第一段', docVersion: 10 });

    expect(capabilities.actions.bold).toBe(true);
    expect(capabilities.actions.italic).toBe(true);
    expect(capabilities.actions.underline).toBe(true);
    expect(capabilities.actions.strike).toBe(true);
    expect(capabilities.actions.code).toBe(true);
    expect(capabilities.actions.link).toBe(true);
  });

  it('disables text format actions for table container selections', (): void => {
    const capabilities = getRichSelectionCapabilities({ from: 0, to: 10, text: 'A1A2', docVersion: 12, highlightKind: 'node' });

    expect(capabilities.actions.ai).toBe(true);
    expect(capabilities.actions.reference).toBe(true);
    expect(capabilities.actions.comment).toBe(true);
    expect(capabilities.actions.bold).toBe(false);
    expect(capabilities.actions.italic).toBe(false);
    expect(capabilities.actions.underline).toBe(false);
    expect(capabilities.actions.strike).toBe(false);
    expect(capabilities.actions.code).toBe(false);
    expect(capabilities.actions.link).toBe(false);
  });
});
