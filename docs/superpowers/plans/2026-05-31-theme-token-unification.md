# 主题 Token 统一实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将分散在三处的主题色值（Less CSS 变量、Ant Design token、Monaco 主题色）统一到 TypeScript 单一真相源，通过派生函数生成各消费方所需格式。

**Architecture:** `src/theme/tokens.ts` 定义 `ThemeTokens` 接口 + `light`/`dark` 对象作为唯一真相源；`derive.ts` 提供三个派生函数（`toCssVars`/`toAntdToken`/`toMonacoColors`）；`apply.ts` 运行时注入 CSS 变量。三阶段迁移：共存 → 收敛 → 清理。

**Tech Stack:** TypeScript, Vue 3 Composition API, Pinia, Ant Design Vue, Monaco Editor, Less

---

## File Structure

| 操作 | 文件 | 职责 |
|------|------|------|
| Create | `src/theme/tokens.ts` | ThemeTokens 接口 + SHARED 常量 + light/dark 对象 |
| Create | `src/theme/derive.ts` | toCssVars / toAntdToken / toMonacoColors 派生函数 |
| Create | `src/theme/apply.ts` | applyCssVars / validateTokens |
| Create | `src/theme/index.ts` | 统一导出 |
| Modify | `src/stores/ui/setting.ts` | applyTheme() 调用 applyCssVars |
| Modify | `src/hooks/useAntdTheme.ts` | 从 token 派生，删除硬编码色值 |
| Modify | `src/components/BMonaco/utils/createMonaco.ts` | 从 token 派生，删除硬编码色值 |
| Modify | `index.html` | 内联首屏闪烁防御脚本 |
| Delete | `src/assets/styles/theme/dark.less` | Phase 3 清理 |
| Delete | `src/assets/styles/theme/light.less` | Phase 3 清理 |
| Delete | `src/assets/styles/theme/variables.less` | Phase 3 清理 |
| Modify | `src/assets/styles/index.less` | 移除 variables.less import |

---

## Phase 1：共存

### Task 1: 创建 tokens.ts — ThemeTokens 接口与 light/dark 对象

**Files:**
- Create: `src/theme/tokens.ts`

- [ ] **Step 1: 创建 tokens.ts，包含 ThemeTokens 接口、SHARED 常量、light 和 dark 对象**

```typescript
/**
 * @file tokens.ts
 * @description 主题色值唯一真相源，所有消费方（CSS 变量、Ant Design、Monaco）均从此派生。
 */

/**
 * 主题 Token 结构定义。
 * 按语义分组，与现有 CSS 变量一一对应。
 */
export interface ThemeTokens {
  bg: {
    primary: string;
    secondary: string;
    tertiary: string;
    elevated: string;
    hover: string;
    active: string;
    selected: string;
    input: string;
    disabled: string;
  };
  text: {
    primary: string;
    secondary: string;
    tertiary: string;
    quaternary: string;
    disabled: string;
    placeholder: string;
  };
  border: {
    primary: string;
    secondary: string;
    tertiary: string;
    hover: string;
  };
  color: {
    primary: string;
    primaryHover: string;
    primaryActive: string;
    primaryBg: string;
    primaryBgHover: string;
    primaryBorder: string;
    controlOutline: string;
    success: string;
    successBg: string;
    warning: string;
    warningBg: string;
    warningBorder: string;
    error: string;
    errorBg: string;
    danger: string;
    dangerHover: string;
    dangerActive: string;
    info: string;
    orange: string;
    purple: string;
    purpleBg: string;
    purpleBorder: string;
    purpleHover: string;
  };
  /** 用量面板进度条语义色 */
  usagePanel: {
    input: string;
    output: string;
  };
  scrollbar: {
    bg: string;
    hover: string;
    active: string;
    lightBg: string;
    lightHover: string;
    lightActive: string;
  };
  shadow: {
    sm: string;
    md: string;
    lg: string;
    dropdown: string;
  };
  code: {
    bg: string;
    border: string;
    headerBg: string;
    lineBg: string;
    lineHoverBg: string;
    lineNumber: string;
    text: string;
    keyword: string;
    string: string;
    comment: string;
    function: string;
    number: string;
    operator: string;
    punctuation: string;
    property: string;
    tag: string;
    attrName: string;
    attrValue: string;
    builtin: string;
    boolean: string;
    class: string;
    constant: string;
    deleted: string;
    inserted: string;
    regex: string;
    symbol: string;
    variable: string;
  };
  /** TipTap 富文本编辑器 */
  richEditor: {
    text: string;
    placeholder: string;
    caret: string;
    headingBorder: string;
    blockquoteText: string;
    blockquoteBg: string;
    blockquoteBorder: string;
    link: string;
    hr: string;
    tableHeaderBg: string;
    tableBorder: string;
    tableEvenBg: string;
    searchHighlight: string;
    searchActive: string;
    searchActiveBorder: string;
  };
  /** Monaco 源码编辑器 Markdown token 高亮 */
  sourceEditor: {
    markdownBackground: string;
    markdownForeground: string;
    markdownCaret: string;
    markdownSelection: string;
    markdownSelectionMatch: string;
    markdownLineHighlight: string;
    markdownGutterForeground: string;
    markdownHeading1: string;
    markdownHeading2: string;
    markdownHeading3: string;
    markdownCode: string;
    markdownLink: string;
    markdownQuote: string;
    markdownStrikethrough: string;
    markdownBold: string;
    markdownItalic: string;
    markdownListMarker: string;
    markdownBlockquoteMarker: string;
    markdownHr: string;
    markdownLinkBracket: string;
    markdownLinkParen: string;
    markdownImageMarker: string;
    markdownCodeMarker: string;
    markdownCodeFence: string;
    markdownCodeInfo: string;
    markdownTablePipe: string;
    markdownTableAlign: string;
    markdownTaskBracket: string;
    markdownTaskUnchecked: string;
    markdownTaskChecked: string;
    markdownEscape: string;
  };
  /** Monaco 源码编辑器专有色值（与 richEditor 独立） */
  monaco: {
    foreground: string;
    lineHighlightBg: string;
    selectionBg: string;
    inactiveSelectionBg: string;
    lineNumber: string;
    lineNumberActive: string;
    cursor: string;
    gutterBg: string;
    indentGuide: string;
    indentGuideActive: string;
  };
  anchor: {
    text: string;
    hoverText: string;
    hoverBg: string;
  };
  dropdown: {
    bg: string;
    border: string;
    itemHoverBg: string;
    divider: string;
  };
  modal: {
    text: string;
    headerBg: string;
  };
  input: {
    bg: string;
    border: string;
    focusBorder: string;
    focusShadow: string;
    errorText: string;
    errorBorder: string;
    errorShadow: string;
  };
  tag: {
    bg: string;
    hoverBg: string;
    text: string;
    secondaryText: string;
    placeholder: string;
  };
  hoverIndicator: {
    bg: string;
    border: string;
    text: string;
    hoverText: string;
    hoverBorder: string;
  };
  frontmatter: {
    bg: string;
    border: string;
    divider: string;
    keyText: string;
    valueText: string;
  };
  jsonViewer: {
    nodeBg: string;
    nodeBorder: string;
    rowDivider: string;
    key: string;
    value: string;
    number: string;
    boolean: string;
    null: string;
    edge: string;
    edgeLabel: string;
  };
}

/**
 * 主题不变色——light 和 dark 中值完全相同的颜色。
 * 提取为常量避免改一边漏一边。
 */
const SHARED = {
  usagePanelInput: '#1677ff',
  usagePanelOutput: '#18cf62',
  scrollbarLightBg: 'rgb(255 255 255 / 15%)',
  scrollbarLightHover: 'rgb(255 255 255 / 25%)',
  scrollbarLightActive: 'rgb(255 255 255 / 30%)',
  inputErrorText: '#f87171',
} as const;

/**
 * 亮色主题 Token。
 */
export const light: ThemeTokens = {
  bg: {
    primary: '#faf9f6',
    secondary: '#f0ebe1',
    tertiary: '#f5f1e8',
    elevated: '#fffdf8',
    hover: 'rgb(107 101 96 / 8%)',
    active: 'rgb(107 101 96 / 12%)',
    selected: 'rgb(138 111 90 / 12%)',
    input: '#fffdf8',
    disabled: '#f3eee6',
  },
  text: {
    primary: '#1a1a1a',
    secondary: '#6b6560',
    tertiary: '#8a837d',
    quaternary: '#b0a8a1',
    disabled: '#b7afa7',
    placeholder: '#938b84',
  },
  border: {
    primary: '#e3dccf',
    secondary: '#d8d0c2',
    tertiary: '#ede7db',
    hover: '#8a6f5a',
  },
  color: {
    primary: '#8a6f5a',
    primaryHover: '#755d4b',
    primaryActive: '#614c3e',
    primaryBg: 'rgb(138 111 90 / 10%)',
    primaryBgHover: 'rgb(138 111 90 / 16%)',
    primaryBorder: 'rgb(138 111 90 / 24%)',
    controlOutline: 'rgb(138 111 90 / 20%)',
    success: '#10b981',
    successBg: '#d1fae5',
    warning: '#f59e0b',
    warningBg: 'rgb(250 204 21 / 28%)',
    warningBorder: '#f59e0b',
    error: '#dc2626',
    errorBg: '#fee2e2',
    danger: '#ff4d4f',
    dangerHover: '#ff7875',
    dangerActive: '#ff9c9a',
    info: '#1761d2',
    orange: '#fa8c16',
    purple: '#7c3aed',
    purpleBg: '#ede9fe',
    purpleBorder: '#c4b5fd',
    purpleHover: '#6d28d9',
  },
  usagePanel: {
    input: SHARED.usagePanelInput,
    output: SHARED.usagePanelOutput,
  },
  scrollbar: {
    bg: 'rgb(0 0 0 / 10%)',
    hover: 'rgb(0 0 0 / 20%)',
    active: 'rgb(0 0 0 / 25%)',
    lightBg: SHARED.scrollbarLightBg,
    lightHover: SHARED.scrollbarLightHover,
    lightActive: SHARED.scrollbarLightActive,
  },
  shadow: {
    sm: '0 1px 2px rgb(53 43 33 / 5%)',
    md: '0 4px 12px rgb(53 43 33 / 9%)',
    lg: '0 12px 32px rgb(53 43 33 / 12%)',
    dropdown: '0 4px 10px rgb(53 43 33 / 8%)',
  },
  code: {
    bg: '#f8f9fa',
    border: '#e9ecef',
    headerBg: '#f8f9fa',
    lineBg: 'rgb(0 0 0 / 4%)',
    lineHoverBg: 'rgb(9 105 218 / 8%)',
    lineNumber: '#6c757d',
    text: '#212529',
    keyword: '#dc3545',
    string: '#0d6efd',
    comment: '#6c757d',
    function: '#6f42c1',
    number: '#0dcaf0',
    operator: '#212529',
    punctuation: '#212529',
    property: '#0d6efd',
    tag: '#198754',
    attrName: '#0d6efd',
    attrValue: '#0d6efd',
    builtin: '#fd7e14',
    boolean: '#0dcaf0',
    class: '#6f42c1',
    constant: '#0dcaf0',
    deleted: '#dc3545',
    inserted: '#198754',
    regex: '#0d6efd',
    symbol: '#0dcaf0',
    variable: '#fd7e14',
  },
  richEditor: {
    text: '#212529',
    placeholder: '#6c757d',
    caret: '#212529',
    headingBorder: '#e3dccf',
    blockquoteText: '#6b6560',
    blockquoteBg: '#f5f1e8',
    blockquoteBorder: '#d8d0c2',
    link: '#8a6f5a',
    hr: '#e3dccf',
    tableHeaderBg: '#f5f1e8',
    tableBorder: '#e3dccf',
    tableEvenBg: '#f5f1e8',
    searchHighlight: 'rgb(255 239 92 / 40%)',
    searchActive: '#ffef5c',
    searchActiveBorder: 'rgb(0 0 0 / 10%)',
  },
  sourceEditor: {
    markdownBackground: '#faf9f7',
    markdownForeground: '#2a2a28',
    markdownCaret: '#3d34a8',
    markdownSelection: 'rgb(61 52 168 / 18%)',
    markdownSelectionMatch: 'rgb(61 52 168 / 30%)',
    markdownLineHighlight: 'rgb(0 0 0 / 5%)',
    markdownGutterForeground: '#8a8880',
    markdownHeading1: '#3d34a8',
    markdownHeading2: '#5f56cc',
    markdownHeading3: '#8880e0',
    markdownCode: '#7a2e10',
    markdownLink: '#0a5a40',
    markdownQuote: '#4a4840',
    markdownStrikethrough: '#4a4742',
    markdownBold: '#7a1a1a',
    markdownItalic: '#441880',
    markdownListMarker: '#302e28',
    markdownBlockquoteMarker: '#4a3e30',
    markdownHr: '#6a5a48',
    markdownLinkBracket: '#4a3820',
    markdownLinkParen: '#1a5a38',
    markdownImageMarker: '#4a3820',
    markdownCodeMarker: '#5a1e08',
    markdownCodeFence: '#3a3530',
    markdownCodeInfo: '#4a4540',
    markdownTablePipe: '#5a5450',
    markdownTableAlign: '#4a3820',
    markdownTaskBracket: '#3a3530',
    markdownTaskUnchecked: '#6a6560',
    markdownTaskChecked: '#0a7848',
    markdownEscape: '#4a4540',
  },
  monaco: {
    foreground: '#243042',
    lineHighlightBg: '#eef2f7',
    selectionBg: '#cfe3ff',
    inactiveSelectionBg: '#e6edf5',
    lineNumber: '#a0aec0',
    lineNumberActive: '#334155',
    cursor: '#2563eb',
    gutterBg: '#faf9f6',
    indentGuide: '#e5e7eb',
    indentGuideActive: '#cbd5e1',
  },
  anchor: {
    text: '#6b6560',
    hoverText: '#1a1a1a',
    hoverBg: 'rgb(138 111 90 / 10%)',
  },
  dropdown: {
    bg: '#fff',
    border: '#e9ecef',
    itemHoverBg: '#f8f9fa',
    divider: '#e9ecef',
  },
  modal: {
    text: '#212529',
    headerBg: '#f8f9fa',
  },
  input: {
    bg: '#fffdf8',
    border: '#d8d0c2',
    focusBorder: '#8a6f5a',
    focusShadow: 'rgb(138 111 90 / 20%)',
    errorText: SHARED.inputErrorText,
    errorBorder: '#f59e0b',
    errorShadow: 'rgb(245 158 11 / 20%)',
  },
  tag: {
    bg: '#f8f9fa',
    hoverBg: '#e9ecef',
    text: '#495057',
    secondaryText: '#6c757d',
    placeholder: '#adb5bd',
  },
  hoverIndicator: {
    bg: 'rgb(255 253 248 / 96%)',
    border: '#e3dccf',
    text: '#6b6560',
    hoverText: '#1a1a1a',
    hoverBorder: 'rgb(138 111 90 / 24%)',
  },
  frontmatter: {
    bg: '#f5f1e8',
    border: '#e3dccf',
    divider: '#e3dccf',
    keyText: '#6b6560',
    valueText: '#3c3835',
  },
  jsonViewer: {
    nodeBg: '#fffdf8',
    nodeBorder: '#d8d0c2',
    rowDivider: '#ede7db',
    key: '#1761d2',
    value: '#1a1a1a',
    number: '#b7791f',
    boolean: '#059669',
    null: '#8a837d',
    edge: 'rgb(138 111 90 / 82%)',
    edgeLabel: '#1a1a1a',
  },
};

/**
 * 暗色主题 Token。
 */
export const dark: ThemeTokens = {
  bg: {
    primary: '#13151a',
    secondary: '#0d0f12',
    tertiary: '#0f1115',
    elevated: '#1c1f26',
    hover: 'rgb(148 163 184 / 6%)',
    active: 'rgb(148 163 184 / 10%)',
    selected: 'rgb(120 120 200 / 18%)',
    input: '#181b21',
    disabled: '#141720',
  },
  text: {
    primary: '#e8ecf2',
    secondary: '#7a8494',
    tertiary: '#5a6272',
    quaternary: '#404858',
    disabled: '#363d4a',
    placeholder: '#4a5264',
  },
  border: {
    primary: '#252a35',
    secondary: '#2e3340',
    tertiary: '#1a1e28',
    hover: '#3d4455',
  },
  color: {
    primary: '#c8a98b',
    primaryHover: '#d4b49a',
    primaryActive: '#b09070',
    primaryBg: 'rgb(200 169 139 / 10%)',
    primaryBgHover: 'rgb(200 169 139 / 16%)',
    primaryBorder: 'rgb(200 169 139 / 22%)',
    controlOutline: 'rgb(200 169 139 / 15%)',
    success: '#34d399',
    successBg: 'rgb(16 185 129 / 16%)',
    warning: '#fbbf24',
    warningBg: 'rgb(250 204 21 / 20%)',
    warningBorder: '#f59e0b',
    error: '#f87171',
    errorBg: 'rgb(220 38 38 / 16%)',
    danger: '#ff7875',
    dangerHover: '#ff9c9a',
    dangerActive: '#ffa8a6',
    info: '#60a5fa',
    orange: '#ffa940',
    purple: '#a78bfa',
    purpleBg: 'rgb(124 58 237 / 16%)',
    purpleBorder: 'rgb(124 58 237 / 32%)',
    purpleHover: '#8b5cf6',
  },
  usagePanel: {
    input: SHARED.usagePanelInput,
    output: SHARED.usagePanelOutput,
  },
  scrollbar: {
    bg: 'rgb(255 255 255 / 10%)',
    hover: 'rgb(255 255 255 / 20%)',
    active: 'rgb(255 255 255 / 25%)',
    lightBg: SHARED.scrollbarLightBg,
    lightHover: SHARED.scrollbarLightHover,
    lightActive: SHARED.scrollbarLightActive,
  },
  shadow: {
    sm: '0 1px 2px rgb(0 0 0 / 40%)',
    md: '0 4px 12px rgb(0 0 0 / 55%)',
    lg: '0 12px 32px rgb(0 0 0 / 65%)',
    dropdown: '0 4px 10px rgb(0 0 0 / 34%)',
  },
  code: {
    bg: '#0c0e12',
    border: '#1e2230',
    headerBg: '#13151a',
    lineBg: 'rgb(255 255 255 / 4%)',
    lineHoverBg: 'rgb(22 119 255 / 12%)',
    lineNumber: '#6b7280',
    text: '#e5e5e5',
    keyword: '#ff7b72',
    string: '#a5d6ff',
    comment: '#8b949e',
    function: '#d2a8ff',
    number: '#79c0ff',
    operator: '#e5e5e5',
    punctuation: '#e5e5e5',
    property: '#79c0ff',
    tag: '#7ee787',
    attrName: '#79c0ff',
    attrValue: '#a5d6ff',
    builtin: '#ffa657',
    boolean: '#79c0ff',
    class: '#d2a8ff',
    constant: '#79c0ff',
    deleted: '#ff7b72',
    inserted: '#7ee787',
    regex: '#a5d6ff',
    symbol: '#79c0ff',
    variable: '#ffa657',
  },
  richEditor: {
    text: '#f3efe8',
    placeholder: '#8a827a',
    caret: '#f3efe8',
    headingBorder: '#4a453f',
    blockquoteText: '#b7aea6',
    blockquoteBg: '#232323',
    blockquoteBorder: '#5a554f',
    link: '#d6b79a',
    hr: '#4a453f',
    tableHeaderBg: '#232323',
    tableBorder: '#4a453f',
    tableEvenBg: '#1a1a1a',
    searchHighlight: 'rgb(255 239 92 / 30%)',
    searchActive: '#ffef5c',
    searchActiveBorder: 'rgb(0 0 0 / 20%)',
  },
  sourceEditor: {
    markdownBackground: '#1a1916',
    markdownForeground: '#e8e6dc',
    markdownCaret: '#b8b0f0',
    markdownSelection: 'rgb(60 52 137 / 30%)',
    markdownSelectionMatch: 'rgb(60 52 137 / 40%)',
    markdownLineHighlight: 'rgb(136 135 128 / 10%)',
    markdownGutterForeground: '#a8a6a0',
    markdownHeading1: '#b8b0f0',
    markdownHeading2: '#ccc7f4',
    markdownHeading3: '#e2e0fa',
    markdownCode: '#f5a882',
    markdownLink: '#3dc99a',
    markdownQuote: '#a8bfcf',
    markdownStrikethrough: '#e89090',
    markdownBold: '#f08888',
    markdownItalic: '#d8a8f8',
    markdownListMarker: '#d8d0c8',
    markdownBlockquoteMarker: '#a8d8ee',
    markdownHr: '#c0b8b0',
    markdownLinkBracket: '#f0d0b0',
    markdownLinkParen: '#70e0b0',
    markdownImageMarker: '#f0d0b0',
    markdownCodeMarker: '#f09868',
    markdownCodeFence: '#c8c0b8',
    markdownCodeInfo: '#c0b8b0',
    markdownTablePipe: '#c0b8b0',
    markdownTableAlign: '#f0d0b0',
    markdownTaskBracket: '#c8c0b8',
    markdownTaskUnchecked: '#c0b8b0',
    markdownTaskChecked: '#60f0b0',
    markdownEscape: '#c0b8b0',
  },
  monaco: {
    foreground: '#dbe4f0',
    lineHighlightBg: '#1a1d24',
    selectionBg: '#3a4e69',
    inactiveSelectionBg: '#2a3544',
    lineNumber: '#64748b',
    lineNumberActive: '#e2e8f0',
    cursor: '#93c5fd',
    gutterBg: '#13151a',
    indentGuide: '#223045',
    indentGuideActive: '#475569',
  },
  anchor: {
    text: '#b7aea6',
    hoverText: '#f3efe8',
    hoverBg: 'rgb(200 169 139 / 16%)',
  },
  dropdown: {
    bg: '#0d0d0d',
    border: '#2a2a2a',
    itemHoverBg: '#1a1a1a',
    divider: '#1e1e1e',
  },
  modal: {
    text: '#f3efe8',
    headerBg: '#232323',
  },
  input: {
    bg: '#0d0f12',
    border: '#2a303d',
    focusBorder: '#c8a98b',
    focusShadow: 'rgb(200 169 139 / 12%)',
    errorText: SHARED.inputErrorText,
    errorBorder: '#f59e0b',
    errorShadow: 'rgb(245 158 11 / 20%)',
  },
  tag: {
    bg: '#353535',
    hoverBg: '#404040',
    text: '#f3efe8',
    secondaryText: '#b7aea6',
    placeholder: '#8a827a',
  },
  hoverIndicator: {
    bg: 'rgb(26 26 26 / 96%)',
    border: '#5a554f',
    text: '#b7aea6',
    hoverText: '#f3efe8',
    hoverBorder: 'rgb(200 169 139 / 32%)',
  },
  frontmatter: {
    bg: '#232323',
    border: '#4a453f',
    divider: '#3a3530',
    keyText: '#b7aea6',
    valueText: '#f3efe8',
  },
  jsonViewer: {
    nodeBg: '#292929',
    nodeBorder: '#4b4b4b',
    rowDivider: '#3b3b3b',
    key: '#57b8ff',
    value: '#e5e7eb',
    number: '#f8d777',
    boolean: '#00e785',
    null: '#9ca3af',
    edge: 'rgb(200 169 139 / 82%)',
    edgeLabel: '#f3efe8',
  },
};
```

- [ ] **Step 2: 运行 TypeScript 类型检查确认无错误**

Run: `pnpm exec tsc --noEmit 2>&1 | head -20`
Expected: 无 tokens.ts 相关错误（文件尚未被引用，但自身类型应正确）

- [ ] **Step 3: Commit**

```bash
git add src/theme/tokens.ts
git commit -m "feat(theme): add ThemeTokens interface with light/dark token objects"
```

---

### Task 2: 创建 derive.ts — 派生函数

**Files:**
- Create: `src/theme/derive.ts`

- [ ] **Step 1: 创建 derive.ts，实现 toCssVars / toAntdToken / toMonacoColors**

```typescript
/**
 * @file derive.ts
 * @description 从 ThemeTokens 派生各消费方所需格式的映射函数。
 */

import type { ThemeTokens } from './tokens';
import { light, dark } from './tokens';

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
  usagePanel: 'usage',
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
    controlOutline: tokens.color.controlOutline,
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
    'editorIndentGuide.activeBackground1': tokens.monaco.indentGuideActive,
  };
}

/**
 * 获取亮色主题 Token。
 * @returns 亮色主题 Token
 */
export function getLightTokens(): ThemeTokens {
  return light;
}

/**
 * 获取暗色主题 Token。
 * @returns 暗色主题 Token
 */
export function getDarkTokens(): ThemeTokens {
  return dark;
}
```

- [ ] **Step 2: 运行 TypeScript 类型检查**

Run: `pnpm exec tsc --noEmit 2>&1 | head -20`
Expected: 无 derive.ts 相关错误

- [ ] **Step 3: Commit**

```bash
git add src/theme/derive.ts
git commit -m "feat(theme): add derive functions (toCssVars/toAntdToken/toMonacoColors)"
```

---

### Task 3: 创建 apply.ts — 运行时注入与校验

**Files:**
- Create: `src/theme/apply.ts`

- [ ] **Step 1: 创建 apply.ts，实现 applyCssVars 和 validateTokens**

```typescript
/**
 * @file apply.ts
 * @description 运行时将主题 Token 注入为 CSS 变量，并提供开发时格式校验。
 */

import type { ThemeTokens } from './tokens';
import { toCssVars } from './derive';

/**
 * 合法颜色格式正则：#hex 或 rgb() 函数。
 */
const COLOR_RE = /^(#([0-9a-f]{3,8})|rgb\(\d{1,3}\s+\d{1,3}\s+\d{1,3}(\s*\/\s*\d{1,3}%)?\))$/i;

/**
 * 在开发环境下校验 Token 值的颜色格式。
 * @param tokens - 主题 Token 对象
 * @param name - 主题名称（用于日志）
 */
export function validateTokens(tokens: ThemeTokens, name: string): void {
  if (!import.meta.env.DEV) {
    return;
  }

  const flat = toCssVars(tokens);
  for (const [key, value] of Object.entries(flat)) {
    if (!COLOR_RE.test(value)) {
      console.warn(`[theme] Unexpected color format in ${name}: ${key}=${value}`);
    }
  }
}

/**
 * 将主题 Token 注入为 document.documentElement 的 CSS 变量。
 * @param tokens - 主题 Token 对象
 */
export function applyCssVars(tokens: ThemeTokens): void {
  const vars = toCssVars(tokens);
  const root = document.documentElement;

  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value);
  }
}
```

- [ ] **Step 2: 运行 TypeScript 类型检查**

Run: `pnpm exec tsc --noEmit 2>&1 | head -20`
Expected: 无 apply.ts 相关错误

- [ ] **Step 3: Commit**

```bash
git add src/theme/apply.ts
git commit -m "feat(theme): add applyCssVars and validateTokens"
```

---

### Task 4: 创建 index.ts — 统一导出

**Files:**
- Create: `src/theme/index.ts`

- [ ] **Step 1: 创建 index.ts**

```typescript
/**
 * @file index.ts
 * @description 主题模块统一导出。
 */

export type { ThemeTokens } from './tokens';
export { light, dark } from './tokens';
export { toCssVars, toAntdToken, toMonacoColors, getLightTokens, getDarkTokens } from './derive';
export { applyCssVars, validateTokens } from './apply';
```

- [ ] **Step 2: 运行 TypeScript 类型检查**

Run: `pnpm exec tsc --noEmit 2>&1 | head -20`
Expected: 无 index.ts 相关错误

- [ ] **Step 3: Commit**

```bash
git add src/theme/index.ts
git commit -m "feat(theme): add unified exports"
```

---

### Task 5: 修改 setting.ts — applyTheme 调用 applyCssVars

**Files:**
- Modify: `src/stores/ui/setting.ts`

- [ ] **Step 1: 在 setting.ts 中引入 applyCssVars 并在 applyTheme 中调用**

在文件顶部 import 区域添加：

```typescript
import { light, dark, applyCssVars } from '@/theme';
```

修改 `applyTheme` 函数：

```typescript
function applyTheme(theme: ThemeMode): void {
  const resolvedTheme = theme === 'system' ? getSystemTheme() : theme;
  applyCssVars(resolvedTheme === 'dark' ? dark : light);
  if (resolvedTheme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
}
```

- [ ] **Step 2: 运行 TypeScript 类型检查**

Run: `pnpm exec tsc --noEmit 2>&1 | head -20`
Expected: 无 setting.ts 相关错误

- [ ] **Step 3: 手动验证——启动应用，切换主题，确认视觉无变化**

Run: `pnpm dev`

验证项：
1. 亮色主题下页面背景、文本、边框颜色与改造前一致
2. 切换到暗色主题，颜色正确切换
3. 切回亮色主题，颜色正确恢复
4. 刷新页面后主题保持

- [ ] **Step 4: Commit**

```bash
git add src/stores/ui/setting.ts
git commit -m "feat(theme): integrate applyCssVars into setting store applyTheme"
```

---

## Phase 2：收敛

### Task 6: 改造 useAntdTheme.ts — 从 token 派生

**Files:**
- Modify: `src/hooks/useAntdTheme.ts`

- [ ] **Step 1: 重写 useAntdTheme.ts，从 token 派生 Ant Design 配置**

将整个文件替换为：

```typescript
/**
 * @file useAntdTheme.ts
 * @description Ant Design Vue 主题 Hook，从统一 Token 派生主题配置。
 */
import type { ComputedRef } from 'vue';
import { computed } from 'vue';
import theme from 'ant-design-vue/es/theme';
import { useSettingStore } from '@/stores/ui/setting';
import { light, dark, toAntdToken } from '@/theme';

const { darkAlgorithm, defaultAlgorithm } = theme;

/**
 * Ant Design 主题配置。
 */
interface AntdThemeConfig {
  algorithm: typeof darkAlgorithm | typeof defaultAlgorithm;
  token: ReturnType<typeof toAntdToken>;
}

/**
 * useAntdTheme 返回值。
 */
interface UseAntdThemeResult {
  antdTheme: ComputedRef<AntdThemeConfig>;
}

/**
 * 提供 Ant Design Vue 主题配置，从统一 Token 派生。
 * @returns 包含 antdTheme 计算属性的对象
 */
export function useAntdTheme(): UseAntdThemeResult {
  const settingStore = useSettingStore();

  const antdTheme = computed<AntdThemeConfig>(() => {
    const isDark = settingStore.resolvedTheme === 'dark';
    const tokens = isDark ? dark : light;
    return {
      algorithm: isDark ? darkAlgorithm : defaultAlgorithm,
      token: toAntdToken(tokens),
    };
  });

  return { antdTheme };
}
```

- [ ] **Step 2: 运行 TypeScript 类型检查**

Run: `pnpm exec tsc --noEmit 2>&1 | head -20`
Expected: 无 useAntdTheme.ts 相关错误

- [ ] **Step 3: 手动验证——确认 Ant Design 组件颜色与改造前一致**

验证项：
1. 亮色主题下 Ant Design 按钮、输入框、弹窗等组件颜色正确
2. 暗色主题下 Ant Design 组件颜色正确
3. `controlOutline` 聚焦外发光效果正确

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useAntdTheme.ts
git commit -m "refactor(theme): derive Ant Design tokens from unified ThemeTokens"
```

---

### Task 7: 改造 createMonaco.ts — 从 token 派生

**Files:**
- Modify: `src/components/BMonaco/utils/createMonaco.ts`

- [ ] **Step 1: 修改 createMonaco.ts，替换 ensureThemes 中的硬编码色值**

在文件顶部 import 区域添加：

```typescript
import { light, dark, toMonacoColors } from '@/theme';
```

替换 `ensureThemes` 函数为：

```typescript
/**
 * 已注册的 Monaco 主题名集合，用于幂等保护。
 */
const definedThemes = new Set<string>();

/**
 * 注册 Tibis 使用的基础主题，从统一 Token 派生颜色。
 * @param monaco - Monaco API
 */
function ensureThemes(monaco: typeof Monaco): void {
  if (definedThemes.has('tibis-light')) {
    return;
  }

  monaco.editor.defineTheme('tibis-light', {
    base: 'vs',
    inherit: true,
    rules: [],
    colors: toMonacoColors(light),
  });

  monaco.editor.defineTheme('tibis-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: toMonacoColors(dark),
  });

  definedThemes.add('tibis-light');
  definedThemes.add('tibis-dark');
}
```

- [ ] **Step 2: 运行 TypeScript 类型检查**

Run: `pnpm exec tsc --noEmit 2>&1 | head -20`
Expected: 无 createMonaco.ts 相关错误

- [ ] **Step 3: 手动验证——确认 Monaco 编辑器颜色与改造前一致**

验证项：
1. 亮色主题下 Monaco 编辑器背景、前景、行号、光标颜色正确
2. 暗色主题下 Monaco 编辑器颜色正确
3. 选中文字高亮颜色正确
4. 缩进参考线颜色正确

- [ ] **Step 4: Commit**

```bash
git add src/components/BMonaco/utils/createMonaco.ts
git commit -m "refactor(theme): derive Monaco theme colors from unified ThemeTokens"
```

---

### Task 8: 添加 index.html 首屏闪烁防御脚本

**Files:**
- Modify: `index.html`

- [ ] **Step 1: 在 index.html 的 `<head>` 中添加内联脚本**

将 `index.html` 替换为：

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/app.ico" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Tibis</title>
    <script>
      (function() {
        var t = localStorage.getItem('app_settings');
        var isDark = false;
        try {
          var s = JSON.parse(t);
          if (s.theme === 'dark') isDark = true;
          else if (s.theme === 'system') isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        } catch(e) {}
        var r = document.documentElement.style;
        r.setProperty('--bg-primary', isDark ? '#13151a' : '#faf9f6');
        r.setProperty('--bg-secondary', isDark ? '#0d0f12' : '#f0ebe1');
        r.setProperty('--text-primary', isDark ? '#e8ecf2' : '#1a1a1a');
        if (isDark) document.documentElement.setAttribute('data-theme', 'dark');
      })();
    </script>
  </head>

  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 2: 手动验证——刷新页面，确认首帧无白屏闪烁**

验证项：
1. 刷新页面时背景色立即正确，无白屏闪烁
2. 暗色主题下刷新页面背景立即为深色
3. 亮色主题下刷新页面背景立即为浅色

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat(theme): add inline script to prevent flash of unstyled content"
```

---

## Phase 3：清理

### Task 9: 删除 Less 主题文件并移除 import

**Files:**
- Delete: `src/assets/styles/theme/dark.less`
- Delete: `src/assets/styles/theme/light.less`
- Delete: `src/assets/styles/theme/variables.less`
- Modify: `src/assets/styles/index.less`

- [ ] **Step 1: 删除三个 Less 主题文件**

```bash
rm src/assets/styles/theme/dark.less
rm src/assets/styles/theme/light.less
rm src/assets/styles/theme/variables.less
```

- [ ] **Step 2: 修改 index.less，移除 variables.less import**

将 `src/assets/styles/index.less` 修改为：

```less
@import './normalize.less';
@import './scrollbar.less';
@import './markdown.less';
@import 'katex/dist/katex.min.css';
@import './reset.less';


::selection {
    color: #000;
    background: #ffef5c;
    -webkit-text-fill-color: unset !important;
}
```

- [ ] **Step 3: 运行 TypeScript 类型检查和 ESLint**

Run: `pnpm exec tsc --noEmit 2>&1 | head -20`
Run: `pnpm lint 2>&1 | tail -20`
Expected: 无错误

- [ ] **Step 4: 确认无遗留引用**

Run: `git grep -l "theme/variables\|theme/dark\|theme/light" -- src/`
Expected: 无结果

- [ ] **Step 5: 手动验证——全量回归测试**

验证项：
1. 亮色/暗色主题切换正常
2. Ant Design 组件颜色正确
3. Monaco 编辑器颜色正确
4. CSS 变量在 DevTools 中可见且值正确
5. 页面刷新无闪烁
6. 所有页面视觉与改造前一致

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(theme): remove Less theme files, CSS vars now fully driven by TypeScript"
```

---

### Task 10: 添加 DEV 环境颜色校验

**Files:**
- Modify: `src/stores/ui/setting.ts`

- [ ] **Step 1: 在 setting.ts 的 initTheme 中添加 validateTokens 调用**

在 import 区域添加：

```typescript
import { light, dark, applyCssVars, validateTokens } from '@/theme';
```

在 `initTheme` 方法中添加校验调用：

```typescript
initTheme(): void {
  validateTokens(light, 'light');
  validateTokens(dark, 'dark');
  applyTheme(this.theme);

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (this.theme === 'system') {
      applyTheme('system');
    }
  });
},
```

- [ ] **Step 2: 运行 TypeScript 类型检查**

Run: `pnpm exec tsc --noEmit 2>&1 | head -20`
Expected: 无错误

- [ ] **Step 3: 在 DEV 环境下验证校验功能**

Run: `pnpm dev`

打开浏览器控制台，确认无 `[theme] Unexpected color format` 警告（所有颜色格式应合法）。

- [ ] **Step 4: Commit**

```bash
git add src/stores/ui/setting.ts
git commit -m "feat(theme): add DEV-only color format validation for theme tokens"
```

---

## Self-Review

### 1. Spec Coverage

| 设计文档要求 | 对应 Task |
|-------------|----------|
| ThemeTokens 接口 + light/dark 对象 | Task 1 |
| SHARED 共享常量 | Task 1 |
| toCssVars 派生函数 | Task 2 |
| toAntdToken 派生函数 | Task 2 |
| toMonacoColors 派生函数（完整 11 色） | Task 2 |
| applyCssVars 运行时注入 | Task 3 |
| validateTokens DEV 校验 | Task 3 + Task 10 |
| setting.ts applyTheme 集成 | Task 5 |
| useAntdTheme.ts 改造 | Task 6 |
| createMonaco.ts 改造 | Task 7 |
| index.html 首屏闪烁防御 | Task 8 |
| 删除 Less 主题文件 | Task 9 |
| richEditor 重命名 | Task 1（接口）+ Task 2（映射） |
| monaco 独立组 | Task 1（接口）+ Task 2（映射） |
| usagePanel 重命名 | Task 1（接口）+ Task 2（映射） |
| controlOutline 独立字段 | Task 1（接口）+ Task 2（映射） |
| Monaco ensureThemes 幂等保护 | Task 7 |
| 三阶段迁移 | Phase 1 (Task 1-5) → Phase 2 (Task 6-8) → Phase 3 (Task 9-10) |

### 2. Placeholder Scan

无 TBD / TODO / "implement later" / "fill in details" 等占位符。

### 3. Type Consistency

- `ThemeTokens` 在 Task 1 定义，Task 2/3/5/6/7/10 引用——接口名一致
- `toCssVars` / `toAntdToken` / `toMonacoColors` 在 Task 2 定义，Task 3/5/6/7/10 引用——函数签名一致
- `applyCssVars` / `validateTokens` 在 Task 3 定义，Task 5/10 引用——函数签名一致
- `light` / `dark` 在 Task 1 导出，Task 2/5/6/7/10 引用——变量名一致
- `AntdThemeConfig` 在 Task 6 定义，与 App.vue 中 `useAntdTheme()` 返回值类型兼容
