/**
 * @file variableChip.ts
 * @description {{...}} token 匹配 + chip 装饰渲染引擎，不包含任何业务语义
 */
import type { DecorationSet, WidgetType } from '@codemirror/view';
import { StateField, EditorState, StateEffect, type Range } from '@codemirror/state';
import { Decoration, EditorView } from '@codemirror/view';

/** {{ ... }} 匹配模式，排除换行和花括号 */
const VARIABLE_PATTERN = /\{\{([^{}\n]+)\}\}/g;

// ─── 类型定义 ────────────────────────────────────────────────────────────────

/**
 * Chip 渲染指令。
 * widget 和 className 互斥，由判别联合类型约束。
 */
export type ChipResult = { widget: WidgetType } | { className: string };

/**
 * Chip 解析器，由消费者提供。
 * 接收 `{{...}}` 内部的 body 文本，返回渲染指令。
 * 返回 null 表示不渲染为 chip（当做普通文本）。
 */
export type ChipResolver = (body: string) => ChipResult | null;

// ─── StateEffect ─────────────────────────────────────────────────────────────

/**
 * 设置当前 chipResolver 的 StateEffect。
 * resolver 变化时由外部派发，触发装饰重建。
 */
export const chipResolverEffect = StateEffect.define<ChipResolver>();

// ─── StateField 内部状态 ─────────────────────────────────────────────────────

/**
 * variableChipField 的内部状态，将 resolver 和 decorations 共同存储。
 * 每个 EditorView 实例独立持有，多实例自然隔离。
 */
interface ChipFieldState {
  /** 当前 resolver */
  resolver: ChipResolver;
  /** 解析后的装饰集 */
  decorations: DecorationSet;
}

// ─── 装饰构建（纯函数） ──────────────────────────────────────────────────────

/**
 * 根据文档文本和 resolver 构建装饰集。
 * 不访问任何外部状态，对 resolver 的调用结果做 widget/mark/跳过 三路分派。
 * @param text - 文档文本
 * @param resolver - chip 解析器
 * @returns 装饰集
 */
function buildDecorations(text: string, resolver: ChipResolver): DecorationSet {
  const decorations: Range<Decoration>[] = [];

  for (const match of text.matchAll(VARIABLE_PATTERN)) {
    const body = match[1];
    const result = resolver(body);
    if (!result) continue;

    if ('widget' in result) {
      decorations.push(Decoration.replace({ widget: result.widget }).range(match.index, match.index + match[0].length));
    } else {
      decorations.push(Decoration.mark({ class: result.className }).range(match.index, match.index + match[0].length));
    }
  }

  return Decoration.set(decorations, true);
}

// ─── StateField ──────────────────────────────────────────────────────────────

/**
 * Chip 装饰 StateField。
 * 初始 resolver 为空函数（不渲染任何 chip），
 * 通过 chipResolverEffect 注入实际 resolver。
 */
export const variableChipField: StateField<ChipFieldState> = StateField.define<ChipFieldState>({
  create(state: EditorState) {
    const resolver: ChipResolver = () => null;
    return { resolver, decorations: buildDecorations(state.doc.toString(), resolver) };
  },

  update({ resolver, decorations }, tr) {
    const nextResolver = tr.effects.find((e) => e.is(chipResolverEffect))?.value ?? resolver;
    const resolverChanged = nextResolver !== resolver;

    if (tr.docChanged || resolverChanged) {
      return {
        resolver: nextResolver,
        decorations: buildDecorations(tr.newDoc.toString(), nextResolver)
      };
    }
    return { resolver, decorations: decorations.map(tr.changes) };
  },

  provide: (field) => EditorView.decorations.from(field, (s) => s.decorations)
});

// ─── 工具函数 ────────────────────────────────────────────────────────────────

/**
 * 检查指定文档位置是否落在 Chip 范围内
 * @param state - 编辑器状态
 * @param pos - 文档位置
 * @returns Chip 范围 { from, to } 或 null
 */
export function getChipAtPos(state: EditorState, pos: number): { from: number; to: number } | null {
  const chipState = state.field(variableChipField, false);
  if (!chipState) return null;

  const { decorations } = chipState;
  const iter = decorations.iter();
  while (iter.value !== null) {
    if (pos >= iter.from && pos < iter.to) {
      return { from: iter.from, to: iter.to };
    }
    iter.next();
  }
  return null;
}
