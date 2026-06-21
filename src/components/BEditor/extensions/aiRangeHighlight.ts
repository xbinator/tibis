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
const baseHighlightClassName = 'ai-selection-highlight';
const codeStartHighlightClassName = 'ai-selection-highlight--code-start';
const codeEndHighlightClassName = 'ai-selection-highlight--code-end';

/**
 * 当前节点是否为 Rich 表格节点。
 * @param node - ProseMirror 节点
 * @returns 节点是否为 table
 */
function isTableNode(node: PMNode): boolean {
  return node.type.name === 'table';
}

/**
 * 当前节点是否带有 Rich 行内 code mark。
 * @param node - ProseMirror 节点
 * @returns 节点是否带有 code mark
 */
function hasCodeMark(node: PMNode): boolean {
  return node.marks.some((mark) => mark.type.name === 'code');
}

/**
 * 指定文档字符位置是否位于行内 code mark 文本中。
 * @param doc - 当前 ProseMirror 文档
 * @param position - 需要检查的文档位置
 * @returns 该位置对应字符是否带有 code mark
 */
function hasCodeMarkAt(doc: PMNode, position: number): boolean {
  if (position < 0 || position >= doc.content.size) {
    return false;
  }

  let result = false;
  doc.nodesBetween(position, position + 1, (node, pos) => {
    if (!node.isText || pos > position || pos + node.nodeSize <= position) {
      return true;
    }

    result = hasCodeMark(node);
    return false;
  });

  return result;
}

/**
 * 创建 AI 高亮 className。
 * @param doc - 当前 ProseMirror 文档
 * @param from - 高亮起点
 * @param to - 高亮终点
 * @param isCodeMarked - 当前高亮片段是否位于行内 code mark 内
 * @returns 高亮 className
 */
function createHighlightClassName(doc: PMNode, from: number, to: number, isCodeMarked: boolean): string {
  const classNames = [baseHighlightClassName];

  if (isCodeMarked && !hasCodeMarkAt(doc, from - 1)) {
    classNames.push(codeStartHighlightClassName);
  }

  if (isCodeMarked && !hasCodeMarkAt(doc, to)) {
    classNames.push(codeEndHighlightClassName);
  }

  return classNames.join(' ');
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
 * @param doc - 当前 ProseMirror 文档
 * @param range - 当前高亮范围
 * @param tableDecorations - 已创建的表格容器装饰
 * @returns inline decorations
 */
function createInlineDecorationsOutsideTables(doc: PMNode, range: AISelectionRange, tableDecorations: Decoration[]): Decoration[] {
  const decorations: Decoration[] = [];
  let cursor = range.from;

  /**
   * 追加普通 inline 高亮，并在 code mark 边界处加上 padding 补偿所需的修饰类。
   * @param from - 高亮起点
   * @param to - 高亮终点
   */
  function pushInlineDecorations(from: number, to: number): void {
    let segmentCursor = from;

    doc.nodesBetween(from, to, (node, pos) => {
      if (!node.isText || !hasCodeMark(node)) {
        return true;
      }

      const codeFrom = Math.max(from, pos);
      const codeTo = Math.min(to, pos + node.nodeSize);
      if (segmentCursor < codeFrom) {
        decorations.push(Decoration.inline(segmentCursor, codeFrom, { class: baseHighlightClassName }));
      }

      decorations.push(Decoration.inline(codeFrom, codeTo, { class: createHighlightClassName(doc, codeFrom, codeTo, true) }));
      segmentCursor = codeTo;
      return false;
    });

    if (segmentCursor < to) {
      decorations.push(Decoration.inline(segmentCursor, to, { class: baseHighlightClassName }));
    }
  }

  tableDecorations
    .map((decoration) => ({ from: decoration.from, to: decoration.to }))
    .sort((left, right) => left.from - right.from)
    .forEach((tableRange) => {
      if (cursor < tableRange.from) {
        pushInlineDecorations(cursor, tableRange.from);
      }
      cursor = Math.max(cursor, tableRange.to);
    });

  if (cursor < range.to) {
    pushInlineDecorations(cursor, range.to);
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
    return DecorationSet.create(doc, [Decoration.node(range.from, range.to, { class: baseHighlightClassName })]);
  }

  const tableDecorations = createTableContainerDecorations(doc, range);
  const inlineDecorations = createInlineDecorationsOutsideTables(doc, range, tableDecorations);

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
