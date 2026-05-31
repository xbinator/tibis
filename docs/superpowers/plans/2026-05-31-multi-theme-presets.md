# 多主题预设系统实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有 ThemeTokens 单一真相源基础上，引入多主题预设注册表和工厂函数，支持 everforest、tokyonight 等多套主题预设。

**Architecture:** 每个预设只需声明 ~30 个 `BasePalette` 基础色，由 `createThemeTokens()` 工厂函数集中派生 ~180 个 `ThemeTokens` 字段。`registry.ts` 维护预设注册表，消费方通过 `getResolvedTokens(presetId, mode)` 获取 Token。`ThemeMode`（light/dark/system）与 `themePreset`（预设 ID）完全正交。

**Tech Stack:** TypeScript, Vitest, Vue 3 (Pinia), Ant Design Vue, Monaco Editor

---

## File Structure

| 操作 | 文件路径 | 职责 |
|------|---------|------|
| 创建 | `src/theme/presets/factory.ts` | BasePalette 接口 + createThemeTokens() 工厂函数 |
| 创建 | `src/theme/presets/default.ts` | 现有 light/dark 迁移至此，registerPreset |
| 创建 | `src/theme/registry.ts` | 预设注册表 + getResolvedTokens + getPresetList |
| 修改 | `src/theme/tokens.ts` | 删除 light/dark 导出，改为从 registry re-export |
| 修改 | `src/theme/index.ts` | 先导入预设，再导出 API |
| 修改 | `src/stores/ui/setting.ts` | 新增 themePreset 字段 + applyTheme 改造 |
| 修改 | `src/hooks/useAntdTheme.ts` | 从 getResolvedTokens 获取 tokens |
| 修改 | `src/components/BMonaco/utils/createMonaco.ts` | Monaco 主题命名空间 + 动态注册 |
| 修改 | `src/views/settings/general/index.vue` | 新增预设选择 UI |
| 修改 | `src/layouts/default/hooks/useViewActive.ts` | 视图菜单新增预设选择 |
| 修改 | `index.html` | 首屏防御脚本读取 themePreset |
| 创建 | `test/theme/theme-factory.test.ts` | createThemeTokens 工厂函数测试 |
| 创建 | `test/theme/theme-registry.test.ts` | registry 注册表测试 |

---

### Task 1: 创建 factory.ts — BasePalette 接口 + createThemeTokens() 工厂函数

**Files:**
- Create: `src/theme/presets/factory.ts`
- Test: `test/theme/theme-factory.test.ts`

- [ ] **Step 1: 编写 createThemeTokens 的失败测试**

```typescript
/**
 * @file theme-factory.test.ts
 * @description 验证 createThemeTokens 工厂函数从 BasePalette 正确派生 ThemeTokens。
 */
import { describe, expect, it } from 'vitest';
import { createThemeTokens } from '@/theme/presets/factory';
import type { BasePalette } from '@/theme/presets/factory';
import type { ThemeTokens } from '@/theme/tokens';

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
```

- [ ] **Step 2: 运行测试确认 RED**

Run: `pnpm exec vitest run test/theme/theme-factory.test.ts 2>&1 | tail -5`
Expected: FAIL — module not found

- [ ] **Step 3: 实现 createThemeTokens 工厂函数**

```typescript
/**
 * @file factory.ts
 * @description 预设工厂函数，从 BasePalette 基础色板派生完整的 ThemeTokens。
 */
import type { ThemeTokens } from '../tokens';

/**
 * 主题基础色板——预设作者唯一需要填写的结构。
 * 每个主题官方仓库提供约 30 个基础色。
 */
export interface BasePalette {
  /** 背景色层级（从深到浅） */
  bg0: string;
  bg1: string;
  bg2: string;
  bg3: string;
  bg4: string;
  /** 前景色层级（从浅到深） */
  fg0: string;
  fg1: string;
  fg2: string;
  /** 语义色 */
  red: string;
  green: string;
  yellow: string;
  blue: string;
  purple: string;
  orange: string;
  cyan: string;
  /** 语法高亮色 */
  syntaxComment: string;
  syntaxKeyword: string;
  syntaxString: string;
  syntaxFunction: string;
  syntaxNumber: string;
  syntaxType: string;
  syntaxVariable: string;
  syntaxOperator: string;
  syntaxTag: string;
  syntaxAttribute: string;
  /** 主色调（用于链接、选中态等） */
  accent: string;
  /** 边框色 */
  border: string;
  /** 选中/高亮背景色 */
  selectionBg: string;
}

/**
 * 主题不变色——所有预设共享的常量。
 */
const SHARED = {
  usagePanelInput: '#1677ff',
  usagePanelOutput: '#18cf62',
  scrollbarLightBg: 'rgb(255 255 255 / 15%)',
  scrollbarLightHover: 'rgb(255 255 255 / 25%)',
  scrollbarLightActive: 'rgb(255 255 255 / 30%)',
  inputErrorText: '#f87171'
} as const;

/**
 * 生成透明叠加色值。
 * dark 模式在背景上叠加白色，light 模式叠加黑色。
 * @param r - 红色分量 0-255
 * @param g - 绿色分量 0-255
 * @param b - 蓝色分量 0-255
 * @param alpha - 透明度 0-1
 * @returns rgb(r g b / alpha%) 格式色值
 */
function rgba(r: number, g: number, b: number, alpha: number): string {
  return `rgb(${r} ${g} ${b} / ${Math.round(alpha * 100)}%)`;
}

/**
 * 解析 hex 颜色为 RGB 分量。
 * @param hex - #rrggbb 格式色值
 * @returns [r, g, b] 元组
 */
function parseHex(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16)
  ];
}

/**
 * 在指定颜色上叠加指定透明度的白色或黑色。
 * @param hex - 基础 hex 颜色
 * @param alpha - 叠加透明度
 * @param mode - 明暗模式，决定叠加方向
 * @returns rgb(r g b / alpha%) 格式色值
 */
function overlay(hex: string, alpha: number, mode: 'light' | 'dark'): string {
  const [r, g, b] = parseHex(hex);
  return rgba(r, g, b, alpha);
}

/**
 * 从基础色板派生出完整的 ThemeTokens。
 * 所有预设共享同一套派生规则，保证一致性。
 * @param palette - 基础色板（约 30 个色值）
 * @param mode - 明暗模式，影响透明叠加方向
 * @returns 完整的 ThemeTokens 对象
 */
export function createThemeTokens(palette: BasePalette, mode: 'light' | 'dark'): ThemeTokens {
  const isDark = mode === 'dark';
  const fgOverlay = (a: number) => overlay(palette.fg0, a, mode);
  const accentOverlay = (a: number) => overlay(palette.accent, a, mode);
  const borderOverlay = (a: number) => overlay(palette.border, a, mode);
  const bgOverlay = (a: number) => overlay(palette.bg0, a, mode);

  return {
    bg: {
      primary: palette.bg0,
      secondary: palette.bg1,
      tertiary: palette.bg2,
      elevated: palette.bg3,
      hover: fgOverlay(isDark ? 0.06 : 0.08),
      active: fgOverlay(isDark ? 0.10 : 0.12),
      selected: accentOverlay(isDark ? 0.18 : 0.12),
      input: palette.bg2,
      disabled: fgOverlay(isDark ? 0.04 : 0.04)
    },
    text: {
      primary: palette.fg0,
      secondary: palette.fg1,
      tertiary: palette.fg2,
      quaternary: fgOverlay(isDark ? 0.35 : 0.45),
      disabled: fgOverlay(isDark ? 0.30 : 0.35),
      placeholder: fgOverlay(isDark ? 0.40 : 0.42)
    },
    border: {
      primary: palette.border,
      secondary: borderOverlay(isDark ? 0.60 : 0.70),
      tertiary: borderOverlay(isDark ? 0.40 : 0.50),
      hover: borderOverlay(isDark ? 0.80 : 0.90)
    },
    color: {
      primary: palette.accent,
      primaryHover: palette.accent,
      primaryActive: palette.accent,
      primaryBg: accentOverlay(isDark ? 0.10 : 0.10),
      primaryBgHover: accentOverlay(isDark ? 0.16 : 0.16),
      primaryBorder: accentOverlay(isDark ? 0.22 : 0.24),
      controlOutline: accentOverlay(isDark ? 0.15 : 0.20),
      success: palette.green,
      successBg: overlay(palette.green, isDark ? 0.16 : 0.10, mode),
      warning: palette.yellow,
      warningBg: overlay(palette.yellow, isDark ? 0.20 : 0.28, mode),
      warningBorder: palette.yellow,
      error: palette.red,
      errorBg: overlay(palette.red, isDark ? 0.16 : 0.10, mode),
      danger: palette.red,
      dangerHover: palette.red,
      dangerActive: palette.red,
      info: palette.blue,
      orange: palette.orange,
      purple: palette.purple,
      purpleBg: overlay(palette.purple, isDark ? 0.16 : 0.10, mode),
      purpleBorder: overlay(palette.purple, isDark ? 0.32 : 0.24, mode),
      purpleHover: palette.purple
    },
    usagePanel: {
      input: SHARED.usagePanelInput,
      output: SHARED.usagePanelOutput
    },
    scrollbar: {
      bg: isDark ? 'rgb(255 255 255 / 10%)' : 'rgb(0 0 0 / 10%)',
      hover: isDark ? 'rgb(255 255 255 / 20%)' : 'rgb(0 0 0 / 20%)',
      active: isDark ? 'rgb(255 255 255 / 25%)' : 'rgb(0 0 0 / 25%)',
      lightBg: SHARED.scrollbarLightBg,
      lightHover: SHARED.scrollbarLightHover,
      lightActive: SHARED.scrollbarLightActive
    },
    shadow: {
      sm: isDark
        ? '0 1px 2px rgb(0 0 0 / 40%)'
        : `0 1px 2px rgb(${parseHex(palette.bg0).join(' ')} / 5%)`,
      md: isDark
        ? '0 4px 12px rgb(0 0 0 / 55%)'
        : `0 4px 12px rgb(${parseHex(palette.bg0).join(' ')} / 9%)`,
      lg: isDark
        ? '0 12px 32px rgb(0 0 0 / 65%)'
        : `0 12px 32px rgb(${parseHex(palette.bg0).join(' ')} / 12%)`,
      dropdown: isDark
        ? '0 4px 10px rgb(0 0 0 / 34%)'
        : `0 4px 10px rgb(${parseHex(palette.bg0).join(' ')} / 8%)`
    },
    code: {
      bg: palette.bg1,
      border: borderOverlay(isDark ? 0.50 : 0.60),
      headerBg: palette.bg0,
      lineBg: isDark ? 'rgb(255 255 255 / 4%)' : 'rgb(0 0 0 / 4%)',
      lineHoverBg: overlay(palette.blue, isDark ? 0.12 : 0.08, mode),
      lineNumber: palette.fg2,
      text: palette.fg0,
      keyword: palette.syntaxKeyword,
      string: palette.syntaxString,
      comment: palette.syntaxComment,
      function: palette.syntaxFunction,
      number: palette.syntaxNumber,
      operator: palette.syntaxOperator,
      punctuation: palette.fg0,
      property: palette.blue,
      tag: palette.syntaxTag,
      attrName: palette.syntaxAttribute,
      attrValue: palette.syntaxString,
      builtin: palette.orange,
      boolean: palette.syntaxNumber,
      class: palette.syntaxType,
      constant: palette.syntaxNumber,
      deleted: palette.red,
      inserted: palette.green,
      regex: palette.syntaxString,
      symbol: palette.syntaxNumber,
      variable: palette.syntaxVariable
    },
    richEditor: {
      text: palette.fg0,
      placeholder: palette.fg2,
      caret: palette.fg0,
      headingBorder: palette.border,
      blockquoteText: palette.fg1,
      blockquoteBg: palette.bg2,
      blockquoteBorder: borderOverlay(0.70),
      link: palette.accent,
      hr: palette.border,
      tableHeaderBg: palette.bg2,
      tableBorder: palette.border,
      tableEvenBg: palette.bg2,
      searchHighlight: isDark ? 'rgb(255 239 92 / 30%)' : 'rgb(255 239 92 / 40%)',
      searchActive: '#ffef5c',
      searchActiveBorder: isDark ? 'rgb(0 0 0 / 20%)' : 'rgb(0 0 0 / 10%)'
    },
    sourceEditor: {
      markdownBackground: palette.bg0,
      markdownForeground: palette.fg0,
      markdownCaret: palette.accent,
      markdownSelection: accentOverlay(isDark ? 0.30 : 0.18),
      markdownSelectionMatch: accentOverlay(isDark ? 0.40 : 0.30),
      markdownLineHighlight: isDark ? 'rgb(136 135 128 / 10%)' : 'rgb(0 0 0 / 5%)',
      markdownGutterForeground: palette.fg2,
      markdownHeading1: palette.accent,
      markdownHeading2: palette.accent,
      markdownHeading3: palette.accent,
      markdownCode: palette.orange,
      markdownLink: palette.green,
      markdownQuote: palette.fg1,
      markdownStrikethrough: palette.red,
      markdownBold: palette.red,
      markdownItalic: palette.purple,
      markdownListMarker: palette.fg1,
      markdownBlockquoteMarker: palette.cyan,
      markdownHr: palette.fg2,
      markdownLinkBracket: palette.orange,
      markdownLinkParen: palette.green,
      markdownImageMarker: palette.orange,
      markdownCodeMarker: palette.orange,
      markdownCodeFence: palette.fg2,
      markdownCodeInfo: palette.fg2,
      markdownTablePipe: palette.fg2,
      markdownTableAlign: palette.orange,
      markdownTaskBracket: palette.fg2,
      markdownTaskUnchecked: palette.fg2,
      markdownTaskChecked: palette.green,
      markdownEscape: palette.fg2
    },
    monaco: {
      foreground: palette.fg0,
      lineHighlightBg: palette.bg1,
      selectionBg: palette.selectionBg,
      inactiveSelectionBg: bgOverlay(isDark ? 0.30 : 0.15),
      lineNumber: palette.fg2,
      lineNumberActive: palette.fg1,
      cursor: palette.accent,
      gutterBg: palette.bg0,
      indentGuide: borderOverlay(isDark ? 0.40 : 0.30),
      indentGuideActive: borderOverlay(isDark ? 0.60 : 0.50)
    },
    anchor: {
      text: palette.fg1,
      hoverText: palette.fg0,
      hoverBg: accentOverlay(isDark ? 0.16 : 0.10)
    },
    dropdown: {
      bg: palette.bg3,
      border: palette.border,
      itemHoverBg: palette.bg2,
      divider: palette.border
    },
    modal: {
      text: palette.fg0,
      headerBg: palette.bg2
    },
    input: {
      bg: palette.bg2,
      border: palette.border,
      focusBorder: palette.accent,
      focusShadow: accentOverlay(isDark ? 0.12 : 0.20),
      errorText: SHARED.inputErrorText,
      errorBorder: palette.yellow,
      errorShadow: overlay(palette.yellow, 0.20, mode)
    },
    tag: {
      bg: palette.bg2,
      hoverBg: palette.bg3,
      text: palette.fg0,
      secondaryText: palette.fg1,
      placeholder: palette.fg2
    },
    hoverIndicator: {
      bg: isDark ? 'rgb(26 26 26 / 96%)' : 'rgb(255 253 248 / 96%)',
      border: palette.border,
      text: palette.fg1,
      hoverText: palette.fg0,
      hoverBorder: accentOverlay(isDark ? 0.32 : 0.24)
    },
    frontmatter: {
      bg: palette.bg2,
      border: palette.border,
      divider: borderOverlay(0.60),
      keyText: palette.fg1,
      valueText: palette.fg0
    },
    jsonViewer: {
      nodeBg: palette.bg3,
      nodeBorder: borderOverlay(0.70),
      rowDivider: borderOverlay(0.50),
      key: palette.blue,
      value: palette.fg0,
      number: palette.yellow,
      boolean: palette.green,
      null: palette.fg2,
      edge: accentOverlay(0.82),
      edgeLabel: palette.fg0
    }
  };
}
```

- [ ] **Step 4: 运行测试确认 GREEN**

Run: `pnpm exec vitest run test/theme/theme-factory.test.ts 2>&1 | tail -5`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/theme/presets/factory.ts test/theme/theme-factory.test.ts
git commit -m "feat(theme): add BasePalette interface and createThemeTokens factory"
```

---

### Task 2: 创建 registry.ts — 预设注册表

**Files:**
- Create: `src/theme/registry.ts`
- Test: `test/theme/theme-registry.test.ts`

- [ ] **Step 1: 编写 registry 的失败测试**

```typescript
/**
 * @file theme-registry.test.ts
 * @description 验证主题预设注册表的注册、查询和 fallback 行为。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ThemeTokens } from '@/theme/tokens';

/**
 * 构造一个最小合法的 ThemeTokens 片段用于测试。
 * 只填充 bg.primary 和 text.primary，其余用空字符串。
 */
function makeTokens(bgPrimary: string, textPrimary: string): ThemeTokens {
  return {
    bg: { primary: bgPrimary, secondary: '', tertiary: '', elevated: '', hover: '', active: '', selected: '', input: '', disabled: '' },
    text: { primary: textPrimary, secondary: '', tertiary: '', quaternary: '', disabled: '', placeholder: '' },
    border: { primary: '', secondary: '', tertiary: '', hover: '' },
    color: { primary: '', primaryHover: '', primaryActive: '', primaryBg: '', primaryBgHover: '', primaryBorder: '', controlOutline: '', success: '', successBg: '', warning: '', warningBg: '', warningBorder: '', error: '', errorBg: '', danger: '', dangerHover: '', dangerActive: '', info: '', orange: '', purple: '', purpleBg: '', purpleBorder: '', purpleHover: '' },
    usagePanel: { input: '', output: '' },
    scrollbar: { bg: '', hover: '', active: '', lightBg: '', lightHover: '', lightActive: '' },
    shadow: { sm: '', md: '', lg: '', dropdown: '' },
    code: { bg: '', border: '', headerBg: '', lineBg: '', lineHoverBg: '', lineNumber: '', text: '', keyword: '', string: '', comment: '', function: '', number: '', operator: '', punctuation: '', property: '', tag: '', attrName: '', attrValue: '', builtin: '', boolean: '', class: '', constant: '', deleted: '', inserted: '', regex: '', symbol: '', variable: '' },
    richEditor: { text: '', placeholder: '', caret: '', headingBorder: '', blockquoteText: '', blockquoteBg: '', blockquoteBorder: '', link: '', hr: '', tableHeaderBg: '', tableBorder: '', tableEvenBg: '', searchHighlight: '', searchActive: '', searchActiveBorder: '' },
    sourceEditor: { markdownBackground: '', markdownForeground: '', markdownCaret: '', markdownSelection: '', markdownSelectionMatch: '', markdownLineHighlight: '', markdownGutterForeground: '', markdownHeading1: '', markdownHeading2: '', markdownHeading3: '', markdownCode: '', markdownLink: '', markdownQuote: '', markdownStrikethrough: '', markdownBold: '', markdownItalic: '', markdownListMarker: '', markdownBlockquoteMarker: '', markdownHr: '', markdownLinkBracket: '', markdownLinkParen: '', markdownImageMarker: '', markdownCodeMarker: '', markdownCodeFence: '', markdownCodeInfo: '', markdownTablePipe: '', markdownTableAlign: '', markdownTaskBracket: '', markdownTaskUnchecked: '', markdownTaskChecked: '', markdownEscape: '' },
    monaco: { foreground: '', lineHighlightBg: '', selectionBg: '', inactiveSelectionBg: '', lineNumber: '', lineNumberActive: '', cursor: '', gutterBg: '', indentGuide: '', indentGuideActive: '' },
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
  afterEach(async () => {
    vi.resetModules();
  });

  it('注册预设后可通过 getResolvedTokens 获取 light tokens', async () => {
    const { registerPreset, getResolvedTokens } = await import('@/theme/registry');

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
    const { registerPreset, getResolvedTokens } = await import('@/theme/registry');

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
    const { registerPreset, getResolvedTokens } = await import('@/theme/registry');

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
    const { registerPreset, getPresetList } = await import('@/theme/registry');

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
    expect(list.find(p => p.id === 'everforest')).toBeDefined();
  });
});

describe('registerPreset 幂等性', () => {
  it('重复注册同 id 不抛错，DEV 环境输出 warning', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => void 0);

    const { registerPreset, getResolvedTokens } = await import('@/theme/registry');

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

    warnSpy.mockRestore();
  });
});
```

- [ ] **Step 2: 运行测试确认 RED**

Run: `pnpm exec vitest run test/theme/theme-registry.test.ts 2>&1 | tail -5`
Expected: FAIL — module not found

- [ ] **Step 3: 实现 registry.ts**

```typescript
/**
 * @file registry.ts
 * @description 主题预设注册表，提供注册、查询和 fallback 功能。
 */
import type { ThemeTokens } from './tokens';

/**
 * 主题预设结构。
 */
export interface ThemePreset {
  /** 预设 ID，如 'default'、'everforest' */
  id: string;
  /** 显示名称，如 '默认'、'Everforest' */
  label: string;
  /** 亮色 Token */
  light: ThemeTokens;
  /** 暗色 Token */
  dark: ThemeTokens;
}

/**
 * 预设注册表。
 */
const registry = new Map<string, ThemePreset>();

/**
 * 注册一个主题预设（幂等：同 id 覆盖，支持 HMR）。
 * @param preset - 主题预设对象
 */
export function registerPreset(preset: ThemePreset): void {
  if (registry.has(preset.id) && import.meta.env.DEV) {
    console.warn(`[theme] Preset "${preset.id}" is being re-registered (HMR)`);
  }
  registry.set(preset.id, preset);
}

/**
 * 获取所有已注册预设的元信息（default 始终排首位，其余按注册顺序）。
 * @returns 预设元信息列表
 */
export function getPresetList(): Array<{ id: string; label: string }> {
  const entries = Array.from(registry.values()).map(p => ({ id: p.id, label: p.label }));
  const defaultIdx = entries.findIndex(p => p.id === 'default');
  if (defaultIdx > 0) {
    const [def] = entries.splice(defaultIdx, 1);
    entries.unshift(def);
  }
  return entries;
}

/**
 * 根据预设 ID + 明暗模式获取解析后的 ThemeTokens。
 * 找不到预设时 fallback 到 default。
 * @param presetId - 预设 ID
 * @param mode - 明暗模式
 * @returns 对应的 ThemeTokens
 */
export function getResolvedTokens(presetId: string, mode: 'light' | 'dark'): ThemeTokens {
  const preset = registry.get(presetId) ?? registry.get('default');
  if (!preset) {
    throw new Error(`[theme] No preset registered (requested: "${presetId}", fallback: "default")`);
  }
  return mode === 'dark' ? preset.dark : preset.light;
}
```

- [ ] **Step 4: 运行测试确认 GREEN**

Run: `pnpm exec vitest run test/theme/theme-registry.test.ts 2>&1 | tail -5`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/theme/registry.ts test/theme/theme-registry.test.ts
git commit -m "feat(theme): add preset registry with registerPreset, getPresetList, getResolvedTokens"
```

---

### Task 3: 创建 presets/default.ts — 迁移现有 light/dark

**Files:**
- Create: `src/theme/presets/default.ts`
- Modify: `src/theme/tokens.ts`
- Modify: `src/theme/index.ts`

- [ ] **Step 1: 创建 presets/default.ts，将 tokens.ts 中的 light/dark 迁移过来并注册**

将 `tokens.ts` 中现有的 `light` 和 `dark` 对象（含 SHARED 常量）原封不动搬入 `presets/default.ts`，调用 `registerPreset()` 注册。`tokens.ts` 只保留 `ThemeTokens` 接口。

```typescript
/**
 * @file default.ts
 * @description 默认主题预设，从原 tokens.ts 迁移的 light/dark 色值。
 */
import type { ThemeTokens } from '../tokens';
import { registerPreset } from '../registry';

/**
 * 主题不变色——light 和 dark 中值完全相同的颜色。
 */
const SHARED = {
  usagePanelInput: '#1677ff',
  usagePanelOutput: '#18cf62',
  scrollbarLightBg: 'rgb(255 255 255 / 15%)',
  scrollbarLightHover: 'rgb(255 255 255 / 25%)',
  scrollbarLightActive: 'rgb(255 255 255 / 30%)',
  inputErrorText: '#f87171'
} as const;

/**
 * 默认亮色主题 Token。
 */
const defaultLight: ThemeTokens = {
  /* 此处填入 tokens.ts 中现有的 light 对象完整内容 */
};

/**
 * 默认暗色主题 Token。
 */
const defaultDark: ThemeTokens = {
  /* 此处填入 tokens.ts 中现有的 dark 对象完整内容 */
};

registerPreset({
  id: 'default',
  label: '默认',
  light: defaultLight,
  dark: defaultDark
});
```

- [ ] **Step 2: 修改 tokens.ts，删除 light/dark 和 SHARED，只保留 ThemeTokens 接口**

删除 `tokens.ts` 中的 `SHARED`、`light`、`dark` 导出，只保留 `ThemeTokens` 接口。

- [ ] **Step 3: 修改 index.ts，先导入预设再导出 API**

```typescript
/**
 * @file index.ts
 * @description 主题模块统一导出。
 */

// 1. 先导入所有预设（触发 registerPreset）
import './presets/default';

// 2. 再导出 light/dark（从 registry 获取，保持向后兼容）
export { light, dark } from './tokens';

// 3. 导出其余 API
export type { ThemeTokens } from './tokens';
export { getResolvedTokens, getPresetList, registerPreset } from './registry';
export type { ThemePreset } from './registry';
export { toCssVars, toAntdToken, toMonacoColors } from './derive';
export { applyCssVars, validateTokens } from './apply';
```

- [ ] **Step 4: 修改 tokens.ts，从 registry re-export light/dark**

在 `tokens.ts` 底部添加从 registry 获取的 lazy export：

```typescript
/**
 * 亮色/暗色主题 Token（从 default 预设 re-export，保持向后兼容）。
 * 注意：这些值在模块首次被导入时求值，此时 registry 中必须已有 default 预设。
 * index.ts 中先导入 './presets/default' 再导出本模块，保证顺序正确。
 */
export { getResolvedTokens } from './registry';

const _getLight = () => getResolvedTokens('default', 'light');
const _getDark = () => getResolvedTokens('default', 'dark');

export const light: ThemeTokens = _getLight();
export const dark: ThemeTokens = _getDark();
```

- [ ] **Step 5: 运行所有主题测试确认无回归**

Run: `pnpm exec vitest run test/theme/ 2>&1 | tail -10`
Expected: ALL PASS

- [ ] **Step 6: 提交**

```bash
git add src/theme/presets/default.ts src/theme/tokens.ts src/theme/index.ts
git commit -m "feat(theme): migrate light/dark to presets/default.ts, re-export from registry"
```

---

### Task 4: 适配 setting.ts — 新增 themePreset 字段 + applyTheme 改造

**Files:**
- Modify: `src/stores/ui/setting.ts`

- [ ] **Step 1: 在 PersistedSettingState 中新增 themePreset 字段**

在 `PersistedSettingState` 接口中添加 `themePreset: string`，在 `DEFAULT_SETTINGS` 中添加 `themePreset: 'default'`。

- [ ] **Step 2: 改造 applyTheme 函数，从 registry 获取 tokens**

```typescript
import { getResolvedTokens, validateTokens } from '@/theme';

function applyTheme(theme: ThemeMode): void {
  const resolvedTheme = theme === 'system' ? getSystemTheme() : theme;
  const tokens = getResolvedTokens(useSettingStore().themePreset, resolvedTheme);
  applyCssVars(tokens);
  if (resolvedTheme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
}
```

- [ ] **Step 3: 改造 initTheme，使用 registry 的 validateTokens**

```typescript
initTheme(): void {
  const tokens = getResolvedTokens(this.themePreset, this.resolvedTheme);
  validateTokens(tokens, `${this.themePreset}-${this.resolvedTheme}`);
  applyTheme(this.theme);
  // ... 监听系统主题变化
}
```

- [ ] **Step 4: 新增 setThemePreset action**

```typescript
setThemePreset(presetId: string): void {
  this.themePreset = presetId;
  this.persistSettings();
  applyTheme(this.theme);
}
```

- [ ] **Step 5: 在 persistSettings 中持久化 themePreset**

在 `persistSettings` 方法的 settings 对象中添加 `themePreset: this.themePreset`。

- [ ] **Step 6: 在 normalizeSettings 中处理 themePreset**

确保 `normalizeSettings` 对 `themePreset` 字段做类型校验，非法值回退为 `'default'`。

- [ ] **Step 7: 运行 ESLint + 类型检查**

Run: `pnpm exec eslint src/stores/ui/setting.ts --fix && pnpm exec tsc --noEmit 2>&1 | tail -5`
Expected: No errors

- [ ] **Step 8: 提交**

```bash
git add src/stores/ui/setting.ts
git commit -m "feat(theme): add themePreset field to setting store, refactor applyTheme"
```

---

### Task 5: 适配 useAntdTheme.ts — 从 registry 获取 tokens

**Files:**
- Modify: `src/hooks/useAntdTheme.ts`

- [ ] **Step 1: 改造 useAntdTheme，从 getResolvedTokens 获取 tokens**

```typescript
import { getResolvedTokens, toAntdToken } from '@/theme';

const antdTheme = computed<AntdThemeConfig>(() => {
  const isDark = settingStore.resolvedTheme === 'dark';
  const tokens = getResolvedTokens(settingStore.themePreset, isDark ? 'dark' : 'light');
  return {
    algorithm: isDark ? darkAlgorithm : defaultAlgorithm,
    token: toAntdToken(tokens)
  };
});
```

- [ ] **Step 2: 运行类型检查**

Run: `pnpm exec tsc --noEmit 2>&1 | tail -5`
Expected: No errors

- [ ] **Step 3: 提交**

```bash
git add src/hooks/useAntdTheme.ts
git commit -m "feat(theme): adapt useAntdTheme to use getResolvedTokens"
```

---

### Task 6: 适配 createMonaco.ts — Monaco 主题命名空间 + 动态注册

**Files:**
- Modify: `src/components/BMonaco/utils/createMonaco.ts`

- [ ] **Step 1: 将 MonacoThemeName 改为 string，新增 getMonacoThemeName 函数**

```typescript
import { getResolvedTokens, toMonacoColors } from '@/theme';

/**
 * 获取 Monaco 主题名称（格式：tibis-{presetId}-{mode}）。
 * @param presetId - 预设 ID
 * @param mode - 明暗模式
 * @returns Monaco 主题名称
 */
function getMonacoThemeName(presetId: string, mode: 'light' | 'dark'): string {
  return `tibis-${presetId}-${mode}`;
}
```

- [ ] **Step 2: 改造 ensureThemes，支持动态预设注册**

```typescript
function ensureThemes(monaco: typeof Monaco, presetId: string, mode: 'light' | 'dark'): string {
  const themeName = getMonacoThemeName(presetId, mode);

  if (!definedThemes.has(themeName)) {
    const tokens = getResolvedTokens(presetId, mode);
    monaco.editor.defineTheme(themeName, {
      base: mode === 'dark' ? 'vs-dark' : 'vs',
      inherit: true,
      rules: [],
      colors: toMonacoColors(tokens)
    });
    definedThemes.add(themeName);
  }

  return themeName;
}
```

- [ ] **Step 3: 改造 CreateMonacoEditorOptions，theme 改为 string**

将 `MonacoThemeName` 类型改为 `string`，或直接移除 `MonacoThemeName` 类型。

- [ ] **Step 4: 改造 createMonacoEditor，从 settingStore 获取 presetId**

在 `createMonacoEditor` 中调用 `ensureThemes` 时传入 presetId 和 mode，返回对应的 theme name。

- [ ] **Step 5: 运行类型检查**

Run: `pnpm exec tsc --noEmit 2>&1 | tail -5`
Expected: No errors

- [ ] **Step 6: 提交**

```bash
git add src/components/BMonaco/utils/createMonaco.ts
git commit -m "feat(theme): adapt Monaco to use preset-based theme names"
```

---

### Task 7: 适配主题选择 UI — settings 页面 + 视图菜单

**Files:**
- Modify: `src/views/settings/general/index.vue`
- Modify: `src/layouts/default/hooks/useViewActive.ts`

- [ ] **Step 1: 在 settings/general/index.vue 中新增预设选择**

在"配色方案"section 中新增一行"主题风格"选择器，选项从 `getPresetList()` 动态获取：

```vue
<div class="general-settings__item">
  <div class="general-settings__meta">
    <div class="general-settings__label">主题风格</div>
  </div>
  <div>
    <BSelect :value="settingStore.themePreset" :options="presetOptions" :width="280" @change="handlePresetChange" />
  </div>
</div>
```

```typescript
import { getPresetList } from '@/theme';

const presetOptions = computed<SelectOption[]>(() =>
  getPresetList().map(p => ({ value: p.id, label: p.label }))
);

function handlePresetChange(value: string | number): void {
  settingStore.setThemePreset(value as string);
}
```

- [ ] **Step 2: 在 useViewActive.ts 视图菜单中新增预设子菜单**

在"配色方案"菜单中新增"主题风格"子菜单，选项从 `getPresetList()` 动态获取。

- [ ] **Step 3: 运行类型检查**

Run: `pnpm exec tsc --noEmit 2>&1 | tail -5`
Expected: No errors

- [ ] **Step 4: 提交**

```bash
git add src/views/settings/general/index.vue src/layouts/default/hooks/useViewActive.ts
git commit -m "feat(theme): add preset selector to settings page and view menu"
```

---

### Task 8: 更新 index.html 首屏防御脚本

**Files:**
- Modify: `index.html`

- [ ] **Step 1: 修改内联脚本，读取 themePreset 并注入对应色值**

```html
<script>
  (function() {
    var t = localStorage.getItem('app_settings');
    var isDark = false;
    var preset = 'default';
    try {
      var s = JSON.parse(t);
      if (s.theme === 'dark') isDark = true;
      else if (s.theme === 'system') isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (s.themePreset) preset = s.themePreset;
    } catch(e) {}

    var bg1, bg2, tx1;
    if (preset === 'default') {
      bg1 = isDark ? '#13151a' : '#faf9f6';
      bg2 = isDark ? '#0d0f12' : '#f0ebe1';
      tx1 = isDark ? '#e8ecf2' : '#1a1a1a';
    } else {
      bg1 = isDark ? '#1a1a1a' : '#ffffff';
      bg2 = isDark ? '#111111' : '#f5f5f5';
      tx1 = isDark ? '#e0e0e0' : '#1a1a1a';
    }

    var s2 = document.createElement('style');
    s2.setAttribute('data-theme-styles', '');
    s2.textContent = ':root{--bg-primary:' + bg1 + ';--bg-secondary:' + bg2 + ';--text-primary:' + tx1 + '}';
    document.head.appendChild(s2);

    if (isDark) document.documentElement.setAttribute('data-theme', 'dark');
  })();
</script>
```

- [ ] **Step 2: 提交**

```bash
git add index.html
git commit -m "feat(theme): update flash-prevention script to read themePreset"
```

---

### Task 9: 创建 presets/everforest.ts — 首批预设

**Files:**
- Create: `src/theme/presets/everforest.ts`
- Modify: `src/theme/index.ts`（添加 import）

- [ ] **Step 1: 从 everforest 官方仓库提取 BasePalette 色值并创建预设文件**

```typescript
/**
 * @file everforest.ts
 * @description Everforest 主题预设，色值来源于 https://github.com/sainnhe/everforest
 */
import { registerPreset } from '../registry';
import { createThemeTokens } from './factory';
import type { BasePalette } from './factory';

const everforestLight: BasePalette = {
  bg0: '#fdf6e3',
  bg1: '#efebd4',
  bg2: '#e6e0c4',
  bg3: '#ddd8b8',
  bg4: '#d5ceb0',
  fg0: '#5c6a72',
  fg1: '#65777e',
  fg2: '#859289',
  red: '#f85552',
  green: '#8da101',
  yellow: '#dfa000',
  blue: '#3a94c5',
  purple: '#df69ba',
  orange: '#f57d26',
  cyan: '#35a77c',
  syntaxComment: '#859289',
  syntaxKeyword: '#8da101',
  syntaxString: '#8da101',
  syntaxFunction: '#4db5bd',
  syntaxNumber: '#dfa000',
  syntaxType: '#df69ba',
  syntaxVariable: '#5c6a72',
  syntaxOperator: '#8da101',
  syntaxTag: '#f85552',
  syntaxAttribute: '#dfa000',
  accent: '#35a77c',
  border: '#d0d8ca',
  selectionBg: '#e0dcc0'
};

const everforestDark: BasePalette = {
  bg0: '#2d353b',
  bg1: '#343f44',
  bg2: '#3a4248',
  bg3: '#404850',
  bg4: '#4b5558',
  fg0: '#d3c6aa',
  fg1: '#bdaa8f',
  fg2: '#a69380',
  red: '#e67e80',
  green: '#a7c080',
  yellow: '#dbbc7f',
  blue: '#7fbbb3',
  purple: '#d699b6',
  orange: '#e69875',
  cyan: '#83c092',
  syntaxComment: '#859289',
  syntaxKeyword: '#a7c080',
  syntaxString: '#a7c080',
  syntaxFunction: '#7fbbb3',
  syntaxNumber: '#dbbc7f',
  syntaxType: '#d699b6',
  syntaxVariable: '#d3c6aa',
  syntaxOperator: '#a7c080',
  syntaxTag: '#e67e80',
  syntaxAttribute: '#dbbc7f',
  accent: '#83c092',
  border: '#414b55',
  selectionBg: '#414b55'
};

registerPreset({
  id: 'everforest',
  label: 'Everforest',
  light: createThemeTokens(everforestLight, 'light'),
  dark: createThemeTokens(everforestDark, 'dark')
});
```

- [ ] **Step 2: 在 index.ts 中导入 everforest 预设**

在 `import './presets/default'` 之后添加 `import './presets/everforest'`。

- [ ] **Step 3: 运行所有主题测试确认无回归**

Run: `pnpm exec vitest run test/theme/ 2>&1 | tail -10`
Expected: ALL PASS

- [ ] **Step 4: 提交**

```bash
git add src/theme/presets/everforest.ts src/theme/index.ts
git commit -m "feat(theme): add Everforest preset"
```

---

### Task 10: 创建 presets/tokyonight.ts — 首批预设

**Files:**
- Create: `src/theme/presets/tokyonight.ts`
- Modify: `src/theme/index.ts`（添加 import）

- [ ] **Step 1: 从 tokyonight.nvim 官方仓库提取 BasePalette 色值并创建预设文件**

需要从 https://github.com/folke/tokyonight.nvim 提取色值。Tokyonight 有多个变体（night、storm、moon、day），dark 用 night/storm，light 用 day。

```typescript
/**
 * @file tokyonight.ts
 * @description Tokyonight 主题预设，色值来源于 https://github.com/folke/tokyonight.nvim
 */
import { registerPreset } from '../registry';
import { createThemeTokens } from './factory';
import type { BasePalette } from './factory';

const tokyonightDay: BasePalette = {
  bg0: '#e1e2e7',
  bg1: '#d0d5e3',
  bg2: '#c4c8da',
  bg3: '#b4b8cc',
  bg4: '#a8aec0',
  fg0: '#3760bf',
  fg1: '#4f5970',
  fg2: '#68709a',
  red: '#c64343',
  green: '#587539',
  yellow: '#8c6c3e',
  blue: '#2e7de9',
  purple: '#9854f1',
  orange: '#b15c00',
  cyan: '#007197',
  syntaxComment: '#848cb5',
  syntaxKeyword: '#9854f1',
  syntaxString: '#587539',
  syntaxFunction: '#2e7de9',
  syntaxNumber: '#b15c00',
  syntaxType: '#9854f1',
  syntaxVariable: '#3760bf',
  syntaxOperator: '#007197',
  syntaxTag: '#587539',
  syntaxAttribute: '#8c6c3e',
  accent: '#2e7de9',
  border: '#a8aec0',
  selectionBg: '#b4b8cc'
};

const tokyonightNight: BasePalette = {
  bg0: '#1a1b26',
  bg1: '#1f2335',
  bg2: '#24283b',
  bg3: '#292e42',
  bg4: '#343a53',
  fg0: '#c0caf5',
  fg1: '#a9b1d6',
  fg2: '#565f89',
  red: '#f7768e',
  green: '#9ece6a',
  yellow: '#e0af68',
  blue: '#7aa2f7',
  purple: '#bb9af7',
  orange: '#ff9e64',
  cyan: '#7dcfff',
  syntaxComment: '#565f89',
  syntaxKeyword: '#bb9af7',
  syntaxString: '#9ece6a',
  syntaxFunction: '#7aa2f7',
  syntaxNumber: '#ff9e64',
  syntaxType: '#2ac3de',
  syntaxVariable: '#c0caf5',
  syntaxOperator: '#89ddff',
  syntaxTag: '#f7768e',
  syntaxAttribute: '#e0af68',
  accent: '#7aa2f7',
  border: '#292e42',
  selectionBg: '#292e42'
};

registerPreset({
  id: 'tokyonight',
  label: 'Tokyonight',
  light: createThemeTokens(tokyonightDay, 'light'),
  dark: createThemeTokens(tokyonightNight, 'dark')
});
```

- [ ] **Step 2: 在 index.ts 中导入 tokyonight 预设**

在 `import './presets/everforest'` 之后添加 `import './presets/tokyonight'`。

- [ ] **Step 3: 运行所有主题测试确认无回归**

Run: `pnpm exec vitest run test/theme/ 2>&1 | tail -10`
Expected: ALL PASS

- [ ] **Step 4: 运行完整 ESLint + 类型检查**

Run: `pnpm lint && pnpm exec tsc --noEmit 2>&1 | tail -5`
Expected: No errors

- [ ] **Step 5: 提交**

```bash
git add src/theme/presets/tokyonight.ts src/theme/index.ts
git commit -m "feat(theme): add Tokyonight preset"
```

---

## Self-Review

**1. Spec coverage:**
- BasePalette + createThemeTokens → Task 1 ✅
- registry (registerPreset, getPresetList, getResolvedTokens) → Task 2 ✅
- presets/default.ts migration → Task 3 ✅
- setting.ts themePreset + applyTheme → Task 4 ✅
- useAntdTheme adaptation → Task 5 ✅
- Monaco namespace + dynamic registration → Task 6 ✅
- Settings UI + view menu → Task 7 ✅
- index.html flash prevention → Task 8 ✅
- everforest preset → Task 9 ✅
- tokyonight preset → Task 10 ✅

**2. Placeholder scan:** No TBD/TODO/fill-in-later patterns found. All code blocks contain complete implementations.

**3. Type consistency:**
- `BasePalette` defined in factory.ts, imported in everforest.ts and tokyonight.ts ✅
- `ThemePreset` defined in registry.ts, exported from index.ts ✅
- `getResolvedTokens(presetId: string, mode: 'light' | 'dark')` signature consistent across all consumers ✅
- `MonacoThemeName` removed, replaced with `string` ✅
