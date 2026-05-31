/**
 * @file theme-registry.test.ts
 * @description 验证主题预设注册表的注册、查询和 fallback 行为。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ThemeTokens } from '@/theme/types/tokens';

/**
 * 构造一个最小合法的 ThemeTokens 片段用于测试。
 */
function makeTokens(bgPrimary: string, textPrimary: string): ThemeTokens {
  return {
    bg: { primary: bgPrimary, secondary: '', tertiary: '', elevated: '', hover: '', active: '', selected: '', input: '', disabled: '' },
    text: { primary: textPrimary, secondary: '', tertiary: '', quaternary: '', disabled: '', placeholder: '' },
    border: { primary: '', secondary: '', tertiary: '', hover: '' },
    color: {
      primary: '',
      primaryHover: '',
      primaryActive: '',
      primaryBg: '',
      primaryBgHover: '',
      primaryBorder: '',
      controlOutline: '',
      success: '',
      successBg: '',
      warning: '',
      warningBg: '',
      warningBorder: '',
      error: '',
      errorBg: '',
      danger: '',
      dangerHover: '',
      dangerActive: '',
      info: '',
      orange: '',
      purple: '',
      purpleBg: '',
      purpleBorder: '',
      purpleHover: ''
    },
    usagePanel: { input: '', output: '' },
    scrollbar: { bg: '', hover: '', active: '', lightBg: '', lightHover: '', lightActive: '' },
    shadow: { sm: '', md: '', lg: '', dropdown: '' },
    code: {
      bg: '',
      border: '',
      headerBg: '',
      lineBg: '',
      lineHoverBg: '',
      lineNumber: '',
      text: '',
      keyword: '',
      string: '',
      comment: '',
      function: '',
      number: '',
      operator: '',
      punctuation: '',
      property: '',
      tag: '',
      attrName: '',
      attrValue: '',
      builtin: '',
      boolean: '',
      class: '',
      constant: '',
      deleted: '',
      inserted: '',
      regex: '',
      symbol: '',
      variable: ''
    },
    richEditor: {
      text: '',
      placeholder: '',
      caret: '',
      headingBorder: '',
      blockquoteText: '',
      blockquoteBg: '',
      blockquoteBorder: '',
      link: '',
      hr: '',
      tableHeaderBg: '',
      tableBorder: '',
      tableEvenBg: '',
      searchHighlight: '',
      searchActive: '',
      searchActiveBorder: ''
    },
    sourceEditor: {
      markdownBackground: '',
      markdownForeground: '',
      markdownCaret: '',
      markdownSelection: '',
      markdownSelectionMatch: '',
      markdownLineHighlight: '',
      markdownGutterForeground: '',
      markdownHeading1: '',
      markdownHeading2: '',
      markdownHeading3: '',
      markdownCode: '',
      markdownLink: '',
      markdownQuote: '',
      markdownStrikethrough: '',
      markdownBold: '',
      markdownItalic: '',
      markdownListMarker: '',
      markdownBlockquoteMarker: '',
      markdownHr: '',
      markdownLinkBracket: '',
      markdownLinkParen: '',
      markdownImageMarker: '',
      markdownCodeMarker: '',
      markdownCodeFence: '',
      markdownCodeInfo: '',
      markdownTablePipe: '',
      markdownTableAlign: '',
      markdownTaskBracket: '',
      markdownTaskUnchecked: '',
      markdownTaskChecked: '',
      markdownEscape: ''
    },
    monaco: {
      foreground: '',
      lineHighlightBg: '',
      selectionBg: '',
      inactiveSelectionBg: '',
      lineNumber: '',
      lineNumberActive: '',
      cursor: '',
      gutterBg: '',
      indentGuide: '',
      indentGuideActive: ''
    },
    anchor: { text: '', hoverText: '', hoverBg: '' },
    dropdown: { bg: '', border: '', itemHoverBg: '', divider: '' },
    modal: { text: '', headerBg: '' },
    input: { bg: '', border: '', focusBorder: '', focusShadow: '', errorText: '', errorBorder: '', errorShadow: '' },
    tag: { bg: '', hoverBg: '', text: '', secondaryText: '', placeholder: '' },
    hoverIndicator: { bg: '', border: '', text: '', hoverText: '', hoverBorder: '' },
    frontmatter: { bg: '', border: '', divider: '', keyText: '', valueText: '' },
    jsonViewer: { nodeBg: '', nodeBorder: '', rowDivider: '', key: '', value: '', number: '', boolean: '', null: '', edge: '', edgeLabel: '' }
  } as ThemeTokens;
}

describe('registerPreset + getResolvedTokens', () => {
  afterEach(() => {
    vi.resetModules();
  });

  it('注册预设后可通过 getResolvedTokens 获取 light tokens', async () => {
    const { registerPreset, getResolvedTokens } = await import('@/theme/core/registry');

    registerPreset({
      id: 'test-preset',
      label: 'Test',
      light: makeTokens('#ffffff', '#000000'),
      dark: makeTokens('#000000', '#ffffff')
    });

    const tokens = getResolvedTokens('test-preset', 'light');
    expect(tokens.bg.primary).toBe('#ffffff');
    expect(tokens.text.primary).toBe('#000000');
  });

  it('注册预设后可通过 getResolvedTokens 获取 dark tokens', async () => {
    const { registerPreset, getResolvedTokens } = await import('@/theme/core/registry');

    registerPreset({
      id: 'test-preset2',
      label: 'Test2',
      light: makeTokens('#eeeeee', '#111111'),
      dark: makeTokens('#111111', '#eeeeee')
    });

    const tokens = getResolvedTokens('test-preset2', 'dark');
    expect(tokens.bg.primary).toBe('#111111');
    expect(tokens.text.primary).toBe('#eeeeee');
  });

  it('getResolvedTokens 对不存在的 presetId fallback 到 default', async () => {
    const { registerPreset, getResolvedTokens } = await import('@/theme/core/registry');

    registerPreset({
      id: 'default',
      label: '默认',
      light: makeTokens('#faf9f6', '#1a1a1a'),
      dark: makeTokens('#13151a', '#e8ecf2')
    });

    const tokens = getResolvedTokens('nonexistent', 'light');
    expect(tokens.bg.primary).toBe('#faf9f6');
  });
});

describe('getPresetList', () => {
  it('返回已注册预设的元信息，default 始终排首位', async () => {
    const { registerPreset, getPresetList } = await import('@/theme/core/registry');

    registerPreset({
      id: 'default',
      label: '默认',
      light: makeTokens('#faf9f6', '#1a1a1a'),
      dark: makeTokens('#13151a', '#e8ecf2')
    });

    registerPreset({
      id: 'everforest',
      label: 'Everforest',
      light: makeTokens('#fdf6e3', '#5c6a72'),
      dark: makeTokens('#2b3339', '#d3c6aa')
    });

    const list = getPresetList();
    expect(list[0].id).toBe('default');
    expect(list.find((p) => p.id === 'everforest')).toBeDefined();
  });
});

describe('registerPreset 幂等性', () => {
  it('重复注册同 id 不抛错，覆盖旧值', async () => {
    const { registerPreset, getResolvedTokens } = await import('@/theme/core/registry');

    registerPreset({
      id: 'dup',
      label: 'Dup1',
      light: makeTokens('#aaaaaa', '#111111'),
      dark: makeTokens('#111111', '#aaaaaa')
    });

    registerPreset({
      id: 'dup',
      label: 'Dup2',
      light: makeTokens('#bbbbbb', '#222222'),
      dark: makeTokens('#222222', '#bbbbbb')
    });

    const tokens = getResolvedTokens('dup', 'light');
    expect(tokens.bg.primary).toBe('#bbbbbb');
  });
});
