/**
 * @file ai-selection-highlight.test.ts
 * @description BEditor Rich 模式 AI 选区高亮装饰回归测试。
 */
import type { Node as PMNode } from '@tiptap/pm/model';
import { Schema } from '@tiptap/pm/model';
import { tableNodes } from '@tiptap/pm/tables';
import { describe, expect, it } from 'vitest';
import { createAISelectionDecorationSet } from '@/components/BEditor/extensions/aiRangeHighlight';

/**
 * ProseMirror Decoration 运行时持有的装饰类型信息。
 */
interface RuntimeDecorationInfo {
  /** 装饰类型，包含运行时类型名与属性。 */
  type: {
    /** 运行时构造函数。 */
    constructor: { name: string };
    /** Decoration attrs。 */
    attrs: Record<string, string>;
  };
}

/**
 * 读取 Decoration 的运行时类型信息。
 * @param decoration - ProseMirror decoration
 * @returns Decoration 运行时类型信息
 */
function getRuntimeDecorationInfo(decoration: unknown): RuntimeDecorationInfo {
  return decoration as RuntimeDecorationInfo;
}

/**
 * 创建用于高亮装饰测试的简单 ProseMirror 文档。
 * @returns ProseMirror 文档节点
 */
function createDoc(): PMNode {
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

  return schema.node('doc', null, [schema.node('paragraph', null, schema.text('hello'))]);
}

/**
 * 创建包含表格的 ProseMirror 文档。
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
  const row = schema.nodes.table_row.create(null, [createCell('A1'), createCell('A2')]);
  const table = schema.nodes.table.create(null, [row]);

  return schema.node('doc', null, [table]);
}

describe('createAISelectionDecorationSet', (): void => {
  it('uses inline decorations for normal rich text selections', (): void => {
    const doc = createDoc();
    const decorations = createAISelectionDecorationSet(doc, { from: 1, to: 4 });
    const [decoration] = decorations.find();
    const decorationInfo = getRuntimeDecorationInfo(decoration);

    expect(decorationInfo.type.constructor.name).toBe('InlineType');
    expect(decorationInfo.type.attrs).toEqual({ class: 'ai-selection-highlight' });
  });

  it('uses node decorations when table selections need container highlighting', (): void => {
    const doc = createDoc();
    const decorations = createAISelectionDecorationSet(doc, { from: 0, to: doc.content.size, highlightKind: 'node' });
    const [decoration] = decorations.find();
    const decorationInfo = getRuntimeDecorationInfo(decoration);

    expect(decorationInfo.type.constructor.name).toBe('NodeType');
    expect(decorationInfo.type.attrs).toEqual({ class: 'ai-selection-highlight' });
  });

  it('adds table container decorations when Ctrl+A full-document selection includes a table', (): void => {
    const doc = createTableDoc();
    const decorations = createAISelectionDecorationSet(doc, { from: 0, to: doc.content.size });
    const decorationTypes = decorations.find().map((decoration) => getRuntimeDecorationInfo(decoration).type.constructor.name);

    expect(decorationTypes).toContain('NodeType');
  });

  it('does not add inline text decorations inside a table that is already highlighted as a container', (): void => {
    const doc = createTableDoc();
    const decorations = createAISelectionDecorationSet(doc, { from: 0, to: doc.content.size });
    const decorationTypes = decorations.find().map((decoration) => getRuntimeDecorationInfo(decoration).type.constructor.name);

    expect(decorationTypes).toEqual(['NodeType']);
  });
});
