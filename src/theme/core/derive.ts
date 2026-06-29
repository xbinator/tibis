/**
 * @file core/derive.ts
 * @description 从 ThemeTokens 派生各消费方所需格式的映射函数。
 */

import type { ThemeTokens } from '../types/tokens';

/**
 * Ant Design 全局主题 Token 结构。
 */
interface AntdThemeToken {
  colorBgBase: string;
  colorBgContainer: string;
  colorBgElevated: string;
  colorText: string;
  colorTextSecondary: string;
  colorBorder: string;
  colorPrimary: string;
  colorPrimaryBg: string;
  colorPrimaryBorder: string;
  controlOutline: string;
}

/**
 * Ant Design 组件级 Token 覆盖结构。
 * 每个键对应一个 Ant Design 组件名，值为该组件的 token 覆盖。
 */
interface AntdComponentTokens {
  [component: string]: Record<string, string>;
}

/**
 * Ant Design 完整主题配置，包含全局 token 和组件级 token。
 */
interface AntdThemeConfig {
  token: AntdThemeToken;
  components: AntdComponentTokens;
}

/**
 * 需要使用输入容器背景色的 Ant Design 组件列表。
 * 这些组件的 colorBgContainer 应映射到 tokens.bg.primary，
 * 而非全局的 tokens.bg.secondary，以保持输入区域与卡片容器的视觉层次。
 */
const INPUT_COMPONENTS = ['Input', 'InputNumber', 'Select', 'DatePicker', 'TimePicker', 'Cascader', 'TreeSelect', 'AutoComplete', 'Mentions'] as const;

/**
 * 带下拉弹出层的 Ant Design 组件列表。
 * 这些组件的弹出层背景色应映射到 tokens.dropdown.bg，
 * 以保持下拉面板与主题 dropdown 语义一致。
 */
const DROPDOWN_COMPONENTS = ['Select', 'Cascader', 'TreeSelect', 'AutoComplete'] as const;

/**
 * camelCase 转 kebab-case。
 * @param s - 输入字符串
 * @returns kebab-case 字符串
 */
function toKebab(s: string): string {
  return s.replace(/[A-Z]/g, (m: string): string => `-${m.toLowerCase()}`);
}

/**
 * 分组名到 CSS 变量前缀的映射。
 * richEditor 组保持 --editor- 前缀以兼容现有 Less 引用。
 * usagePanel 组保持 --usage- 前缀以兼容现有 Less 引用。
 */
const GROUP_PREFIX_MAP: Record<string, string> = {
  richEditor: 'editor',
  usagePanel: 'usage'
};

/**
 * 将结构化 Token 扁平化为 CSS 变量映射。
 * @param tokens - 主题 Token 对象
 * @returns CSS 变量名到色值的映射（键名含 -- 前缀）
 */
export function toCssVars(tokens: ThemeTokens): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [groupKey, group] of Object.entries(tokens)) {
    const prefix = GROUP_PREFIX_MAP[groupKey] ?? groupKey;

    for (const [propKey, value] of Object.entries(group as Record<string, string>)) {
      const cssVarName = `--${toKebab(prefix)}-${toKebab(propKey)}`;
      result[cssVarName] = value;
    }
  }

  return result;
}

/**
 * 从 Token 派生 Ant Design 主题配置。
 * 全局 token 中 colorBgContainer 映射到 bg.secondary（用于 Card/Table 等容器），
 * 输入类组件（Input/Select/DatePicker 等）单独覆盖 colorBgContainer 为 bg.primary，
 * 以保持输入区域更亮的背景与卡片容器的视觉层次。
 * 带下拉弹出层的组件额外覆盖 colorBgElevated 为 dropdown.bg，
 * 使弹出面板背景与主题 dropdown 语义保持一致。
 * @param tokens - 主题 Token 对象
 * @returns Ant Design 完整主题配置（全局 token + 组件级 token）
 */
export function toAntdToken(tokens: ThemeTokens): AntdThemeConfig {
  const inputComponentTokens: AntdComponentTokens = {};

  for (const component of INPUT_COMPONENTS) {
    inputComponentTokens[component] = {
      colorBgContainer: tokens.bg.primary
    };
  }

  for (const component of DROPDOWN_COMPONENTS) {
    const existing = inputComponentTokens[component] ?? {};
    inputComponentTokens[component] = {
      ...existing,
      colorBgElevated: tokens.dropdown.bg
    };
  }

  return {
    token: {
      colorBgBase: tokens.bg.primary,
      colorBgContainer: tokens.bg.secondary,
      colorBgElevated: tokens.bg.elevated,
      colorText: tokens.text.primary,
      colorTextSecondary: tokens.text.secondary,
      colorBorder: tokens.border.primary,
      colorPrimary: tokens.color.primary,
      colorPrimaryBg: tokens.color.primaryBg,
      colorPrimaryBorder: tokens.color.primaryBorder,
      controlOutline: tokens.color.controlOutline
    },
    components: inputComponentTokens
  };
}

/**
 * 从 Token 派生 Monaco 编辑器主题颜色。
 * @param tokens - 主题 Token 对象
 * @returns Monaco 主题颜色映射
 */
export function toMonacoColors(tokens: ThemeTokens): Record<string, string> {
  return {
    'editor.background': tokens.bg.primary,
    'editor.foreground': tokens.monaco.foreground,
    'editor.lineHighlightBackground': tokens.monaco.lineHighlightBg,
    'editor.selectionBackground': tokens.monaco.selectionBg,
    'editor.inactiveSelectionBackground': tokens.monaco.inactiveSelectionBg,
    'editor.selectionHighlightBackground': tokens.color.primaryBg,
    'editor.findMatchBackground': tokens.richEditor.searchActive,
    'editor.findMatchHighlightBackground': tokens.richEditor.searchHighlight,
    'editor.findMatchBorder': tokens.richEditor.searchActiveBorder,
    'editor.findMatchHighlightBorder': tokens.richEditor.searchActiveBorder,
    'editor.rangeHighlightBackground': tokens.color.primaryBg,
    'editorLineNumber.foreground': tokens.monaco.lineNumber,
    'editorLineNumber.activeForeground': tokens.monaco.lineNumberActive,
    'editorCursor.foreground': tokens.monaco.cursor,
    'editorGutter.background': tokens.monaco.gutterBg,
    'editorIndentGuide.background1': tokens.monaco.indentGuide,
    'editorIndentGuide.activeBackground1': tokens.monaco.indentGuideActive
  };
}
