/**
 * @file monaco-selection.test.ts
 * @description 验证 Monaco 浅色主题选区颜色不会过度压暗语法高亮。
 */
import { describe, expect, it } from 'vitest';
import type { BasePalette } from '@/theme';
import { createThemeTokens, toMonacoColors } from '@/theme';

/**
 * 创建测试用浅色主题基础色板。
 * @returns 浅色主题基础色板
 */
function createLightPalette(): BasePalette {
  return {
    bg0: '#ffffff',
    bg1: '#f6f7f9',
    bg2: '#edf0f4',
    bg3: '#e5e9f0',
    bg4: '#d8dee9',
    fg0: '#20242c',
    fg1: '#4b5563',
    fg2: '#94a3b8',
    red: '#b91c1c',
    green: '#15803d',
    yellow: '#a16207',
    blue: '#2563eb',
    purple: '#7c3aed',
    orange: '#c2410c',
    cyan: '#0891b2',
    syntaxComment: '#64748b',
    syntaxKeyword: '#7c3aed',
    syntaxString: '#b91c1c',
    syntaxFunction: '#2563eb',
    syntaxNumber: '#a16207',
    syntaxType: '#15803d',
    syntaxVariable: '#20242c',
    syntaxOperator: '#4b5563',
    syntaxTag: '#2563eb',
    syntaxAttribute: '#c2410c',
    accent: '#ff0000',
    border: '#cbd5e1',
    selectionBg: '#f1f5f9'
  };
}

describe('Monaco theme selection color', (): void => {
  it('uses a light accent overlay for light theme selections', (): void => {
    const tokens = createThemeTokens(createLightPalette(), 'light');

    expect(tokens.monaco.selectionBg).toBe('rgb(255 0 0 / 18%)');
  });

  it('maps Monaco find highlights to app search colors', (): void => {
    const tokens = createThemeTokens(createLightPalette(), 'light');
    const colors = toMonacoColors(tokens);

    expect(colors['editor.findMatchHighlightBackground']).toBe(tokens.richEditor.searchHighlight);
    expect(colors['editor.findMatchBackground']).toBe(tokens.richEditor.searchActive);
    expect(colors['editor.findMatchBorder']).toBe(tokens.richEditor.searchActiveBorder);
  });
});
