/**
 * @file core/derive.ts
 * @description 从 ThemeTokens 派生各消费方所需格式的映射函数。
 */

import type { ThemeTokens } from '../types/tokens';

/**
 * Ant Design 主题 Token 结构。
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
 * @param tokens - 主题 Token 对象
 * @returns Ant Design 主题 Token
 */
export function toAntdToken(tokens: ThemeTokens): AntdThemeToken {
  return {
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
    'editorLineNumber.foreground': tokens.monaco.lineNumber,
    'editorLineNumber.activeForeground': tokens.monaco.lineNumberActive,
    'editorCursor.foreground': tokens.monaco.cursor,
    'editorGutter.background': tokens.monaco.gutterBg,
    'editorIndentGuide.background1': tokens.monaco.indentGuide,
    'editorIndentGuide.activeBackground1': tokens.monaco.indentGuideActive
  };
}
