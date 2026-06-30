/**
 * @file variableChip.ts
 * @description {{...}} token 匹配 + chip 装饰渲染引擎，不包含任何业务语义
 */
import type { DecorationSet } from '@codemirror/view';
import { StateField, EditorState, StateEffect, type Range } from '@codemirror/state';
import { Decoration, EditorView, WidgetType } from '@codemirror/view';

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

/**
 * 默认变量 Chip 选项。
 */
export interface VariableChipOption {
  /** 变量显示名称 */
  label: string;
  /** 变量值，必须与 {{...}} 内部文本一致 */
  value: string;
  /** 子级变量选项 */
  children?: VariableChipOption[];
}

/**
 * 扁平化默认变量 Chip 选项。
 * @param variables - 变量树节点列表
 * @returns 扁平变量节点列表
 */
function flattenVariableChipOptions(variables: readonly VariableChipOption[]): VariableChipOption[] {
  return variables.flatMap((variable: VariableChipOption): VariableChipOption[] => [variable, ...flattenVariableChipOptions(variable.children ?? [])]);
}

/**
 * 默认变量 value Chip Widget。
 */
class VariableValueChipWidget extends WidgetType {
  /**
   * 创建变量 value Chip Widget。
   * @param label - 变量显示名称
   * @param value - 变量原始值
   */
  constructor(private readonly label: string, private readonly value: string) {
    super();
  }

  /**
   * 判断两个 Widget 是否等价，避免 CodeMirror 不必要地重建 DOM。
   * @param other - 另一个 Widget
   * @returns 是否等价
   */
  eq(other: VariableValueChipWidget): boolean {
    return this.label === other.label && this.value === other.value;
  }

  /**
   * 创建变量 Chip DOM。
   * @returns Chip DOM 元素
   */
  toDOM(): HTMLElement {
    const chip = document.createElement('span');
    chip.className = 'b-prompt-variable-chip';
    chip.textContent = this.value;
    chip.title = this.label;
    chip.setAttribute('aria-label', `${this.value}: ${this.label}`);
    return chip;
  }

  /**
   * 允许编辑器继续处理鼠标和键盘事件。
   * @returns 是否忽略事件
   */
  ignoreEvent(): boolean {
    return false;
  }
}

/**
 * 创建默认变量 value Chip 解析器。
 * @param variables - 可识别的变量列表
 * @param customResolver - 消费者自定义 Chip 解析器
 * @returns 合并后的 Chip 解析器
 */
export function createVariableValueChipResolver(variables: readonly VariableChipOption[], customResolver?: ChipResolver): ChipResolver {
  const variableMap = new Map<string, VariableChipOption>(
    flattenVariableChipOptions(variables).map((variable: VariableChipOption): [string, VariableChipOption] => [variable.value, variable])
  );

  return (body: string): ChipResult | null => {
    const customResult = customResolver?.(body);
    if (customResult) {
      return customResult;
    }

    const variable = variableMap.get(body);
    if (!variable) {
      return null;
    }

    return {
      widget: new VariableValueChipWidget(variable.label, variable.value)
    };
  };
}

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
