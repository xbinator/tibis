/**
 * @file theme-factory.test.ts
 * @description 验证 createThemeTokens 工厂函数从 BasePalette 正确派生 ThemeTokens。
 */
import { describe, expect, it } from 'vitest';
import { createThemeTokens } from '@/theme/core/factory';
import type { BasePalette } from '@/theme/core/factory';

/** 构造一个最小合法的 BasePalette 用于测试 */
function makePalette(overrides: Partial<BasePalette> = {}): BasePalette {
  return {
    bg0: '#1a1a1a',
    bg1: '#222222',
    bg2: '#2a2a2a',
    bg3: '#333333',
    bg4: '#3a3a3a',
    fg0: '#e0e0e0',
    fg1: '#b0b0b0',
    fg2: '#888888',
    red: '#ff6666',
    green: '#66ff66',
    yellow: '#ffff66',
    blue: '#6666ff',
    purple: '#cc66ff',
    orange: '#ff9933',
    cyan: '#66ffff',
    syntaxComment: '#888888',
    syntaxKeyword: '#ff6666',
    syntaxString: '#66ff66',
    syntaxFunction: '#6666ff',
    syntaxNumber: '#ffff66',
    syntaxType: '#cc66ff',
    syntaxVariable: '#e0e0e0',
    syntaxOperator: '#ff9933',
    syntaxTag: '#ff6666',
    syntaxAttribute: '#ffff66',
    accent: '#6666ff',
    border: '#444444',
    selectionBg: '#333366',
    ...overrides
  };
}

describe('createThemeTokens', () => {
  it('返回完整的 ThemeTokens 对象', () => {
    const tokens = createThemeTokens(makePalette(), 'dark');

    expect(tokens.bg).toBeDefined();
    expect(tokens.text).toBeDefined();
    expect(tokens.border).toBeDefined();
    expect(tokens.color).toBeDefined();
    expect(tokens.usagePanel).toBeDefined();
    expect(tokens.scrollbar).toBeDefined();
    expect(tokens.shadow).toBeDefined();
    expect(tokens.code).toBeDefined();
    expect(tokens.richEditor).toBeDefined();
    expect(tokens.sourceEditor).toBeDefined();
    expect(tokens.monaco).toBeDefined();
    expect(tokens.anchor).toBeDefined();
    expect(tokens.dropdown).toBeDefined();
    expect(tokens.modal).toBeDefined();
    expect(tokens.input).toBeDefined();
    expect(tokens.tag).toBeDefined();
    expect(tokens.hoverIndicator).toBeDefined();
    expect(tokens.frontmatter).toBeDefined();
    expect(tokens.jsonViewer).toBeDefined();
  });

  it('dark 模式下 bg.primary 直接映射 palette.bg0', () => {
    const tokens = createThemeTokens(makePalette({ bg0: '#2b3339' }), 'dark');

    expect(tokens.bg.primary).toBe('#2b3339');
  });

  it('dark 模式下 text.primary 直接映射 palette.fg0', () => {
    const tokens = createThemeTokens(makePalette({ fg0: '#d3c6aa' }), 'dark');

    expect(tokens.text.primary).toBe('#d3c6aa');
  });

  it('border.primary 直接映射 palette.border', () => {
    const tokens = createThemeTokens(makePalette({ border: '#414b55' }), 'dark');

    expect(tokens.border.primary).toBe('#414b55');
  });

  it('color.primary 直接映射 palette.accent', () => {
    const tokens = createThemeTokens(makePalette({ accent: '#83c092' }), 'dark');

    expect(tokens.color.primary).toBe('#83c092');
  });

  it('code.keyword 直接映射 palette.syntaxKeyword', () => {
    const tokens = createThemeTokens(makePalette({ syntaxKeyword: '#a7c080' }), 'dark');

    expect(tokens.code.keyword).toBe('#a7c080');
  });

  it('code.string 直接映射 palette.syntaxString', () => {
    const tokens = createThemeTokens(makePalette({ syntaxString: '#a7c080' }), 'dark');

    expect(tokens.code.string).toBe('#a7c080');
  });

  it('dark 模式下 bg.hover 使用透明叠加格式', () => {
    const tokens = createThemeTokens(makePalette(), 'dark');

    expect(tokens.bg.hover).toMatch(/^rgb\(/);
  });

  it('light 模式下 bg.hover 使用透明叠加格式', () => {
    const tokens = createThemeTokens(makePalette(), 'light');

    expect(tokens.bg.hover).toMatch(/^rgb\(/);
  });

  it('usagePanel.input 和 usagePanel.output 使用 SHARED 常量', () => {
    const tokens = createThemeTokens(makePalette(), 'dark');

    expect(tokens.usagePanel.input).toBe('#1677ff');
    expect(tokens.usagePanel.output).toBe('#18cf62');
  });

  it('dark 和 light 模式生成的 bg.hover 值不同', () => {
    const darkTokens = createThemeTokens(makePalette(), 'dark');
    const lightTokens = createThemeTokens(makePalette(), 'light');

    expect(darkTokens.bg.hover).not.toBe(lightTokens.bg.hover);
  });

  it('shadow 值包含 rgb(', () => {
    const tokens = createThemeTokens(makePalette(), 'dark');

    expect(tokens.shadow.sm).toContain('rgb(');
    expect(tokens.shadow.md).toContain('rgb(');
  });
});
