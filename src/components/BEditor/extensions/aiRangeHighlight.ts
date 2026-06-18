import type { DecorationRange } from './editorDecorations';
import type { Editor } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

interface AISelectionRange extends DecorationRange {
  highlightKind?: 'inline' | 'node';
}

interface AISelectionHighlightState {
  decorations: DecorationSet;
  range: AISelectionRange | null;
}

interface AISelectionHighlightMeta {
  range?: AISelectionRange | null;
}

const aiSelectionHighlightPluginKey = new PluginKey<AISelectionHighlightState>('b-markdown-ai-selection-highlight');

/**
 * 当前节点是否为 Rich 表格节点。
 * @param node - ProseMirror 节点
 * @returns 节点是否为 table
 */
function isTableNode(node: PMNode): boolean {
  return node.type.name === 'table';
}

/**
 * 创建普通 inline 范围内需要同步高亮的表格容器装饰。
 * @param doc - 当前 ProseMirror 文档
 * @param range - 当前高亮范围
 * @returns table node decorations
 */
function createTableContainerDecorations(doc: PMNode, range: AISelectionRange): Decoration[] {
  const decorations: Decoration[] = [];

  doc.nodesBetween(range.from, range.to, (node, pos) => {
    if (!isTableNode(node)) {
      return true;
    }

    const tableTo = pos + node.nodeSize;
    if (pos >= range.from && tableTo <= range.to) {
      decorations.push(Decoration.node(pos, tableTo, { class: 'ai-selection-highlight' }));
    }

    return false;
  });

  return decorations;
}

/**
 * 创建普通 inline 文本高亮，并跳过已经用 node decoration 高亮的表格容器。
 * @param range - 当前高亮范围
 * @param tableDecorations - 已创建的表格容器装饰
 * @returns inline decorations
 */
function createInlineDecorationsOutsideTables(range: AISelectionRange, tableDecorations: Decoration[]): Decoration[] {
  const decorations: Decoration[] = [];
  let cursor = range.from;

  tableDecorations
    .map((decoration) => ({ from: decoration.from, to: decoration.to }))
    .sort((left, right) => left.from - right.from)
    .forEach((tableRange) => {
      if (cursor < tableRange.from) {
        decorations.push(Decoration.inline(cursor, tableRange.from, { class: 'ai-selection-highlight' }));
      }
      cursor = Math.max(cursor, tableRange.to);
    });

  if (cursor < range.to) {
    decorations.push(Decoration.inline(cursor, range.to, { class: 'ai-selection-highlight' }));
  }

  return decorations;
}

/**
 * 创建 AI 选区高亮装饰。
 * 普通文本使用 inline decoration，table 容器选区使用 node decoration。
 * @param doc - 当前 ProseMirror 文档
 * @param range - 高亮范围
 * @returns ProseMirror decoration set
 */
export function createAISelectionDecorationSet(doc: PMNode, range: AISelectionRange | null): DecorationSet {
  if (!range || range.from === range.to) {
    return DecorationSet.create(doc, []);
  }

  if (range.highlightKind === 'node') {
    return DecorationSet.create(doc, [Decoration.node(range.from, range.to, { class: 'ai-selection-highlight' })]);
  }

  const tableDecorations = createTableContainerDecorations(doc, range);
  const inlineDecorations = createInlineDecorationsOutsideTables(range, tableDecorations);

  return DecorationSet.create(doc, [...inlineDecorations, ...tableDecorations]);
}

function createHighlightState(doc: PMNode, range: AISelectionRange | null = null): AISelectionHighlightState {
  return {
    decorations: createAISelectionDecorationSet(doc, range),
    range
  };
}

/**
 * 判断两个高亮范围是否等价。
 * @param left - 左侧高亮范围
 * @param right - 右侧高亮范围
 * @returns 范围完全一致时返回 true
 */
function isSameRange(left: AISelectionRange | null, right: AISelectionRange | null): boolean {
  if (!left && !right) {
    return true;
  }

  if (!left || !right) {
    return false;
  }

  return left.from === right.from && left.to === right.to && (left.highlightKind ?? 'inline') === (right.highlightKind ?? 'inline');
}

export function setAISelectionHighlight(editor: Editor | null | undefined, range: AISelectionRange): void {
  if (!editor) return;

  const currentRange = aiSelectionHighlightPluginKey.getState(editor.state)?.range ?? null;
  if (isSameRange(currentRange, range)) return;

  editor.view.dispatch(editor.state.tr.setMeta(aiSelectionHighlightPluginKey, { range }));
}

export function clearAISelectionHighlight(editor: Editor | null | undefined): void {
  if (!editor) return;

  const currentRange = aiSelectionHighlightPluginKey.getState(editor.state)?.range ?? null;
  if (!currentRange) return;

  editor.view.dispatch(editor.state.tr.setMeta(aiSelectionHighlightPluginKey, { range: null }));
}

export const AISelectionHighlight = Extension.create({
  name: 'aiSelectionHighlight',

  addProseMirrorPlugins() {
    return [
      new Plugin<AISelectionHighlightState>({
        key: aiSelectionHighlightPluginKey,
        state: {
          init: (_, state) => createHighlightState(state.doc),
          apply(tr, pluginState, _oldState, newState) {
            const meta = tr.getMeta(aiSelectionHighlightPluginKey) as AISelectionHighlightMeta | undefined;

            if (meta && 'range' in meta) {
              return createHighlightState(newState.doc, meta.range ?? null);
            }

            if (tr.docChanged && pluginState.range) {
              const mappedFrom = tr.mapping.map(pluginState.range.from);
              const mappedTo = tr.mapping.map(pluginState.range.to);

              return createHighlightState(newState.doc, { ...pluginState.range, from: mappedFrom, to: mappedTo });
            }

            return pluginState;
          }
        },
        props: {
          decorations(state) {
            return aiSelectionHighlightPluginKey.getState(state)?.decorations ?? DecorationSet.create(state.doc, []);
          }
        }
      })
    ];
  }
});
