/**
 * @file velora.ts
 * @description Velora 晴空蓝主题预设，从默认主题结构派生，主色使用 #1890ff。
 */
import type { ThemeTokens } from '../types/tokens';
import { registerPreset } from '../core/registry';

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
  inputErrorText: '#f87171'
} as const;

/**
 * Velora 亮色主题 Token。
 * 仅将应用主色、焦点态和选中态切换为 #1890ff，保留语义色与编辑器高亮的多色层次。
 */
const veloraLight: ThemeTokens = {
  bg: {
    primary: '#ffffff',
    secondary: '#f6f8fb',
    tertiary: '#f3f6fa',
    elevated: '#ffffff',
    hover: 'rgb(31 41 55 / 8%)',
    active: 'rgb(31 41 55 / 12%)',
    selected: 'rgb(24 144 255 / 12%)',
    input: '#ffffff',
    disabled: '#f1f5f9'
  },
  text: {
    primary: '#1a1a1a',
    secondary: '#5f6673',
    tertiary: '#8a94a6',
    quaternary: '#b0b8c4',
    disabled: '#b8c0cc',
    placeholder: '#8f98a8'
  },
  border: {
    primary: '#e5eaf2',
    secondary: '#d8dee8',
    tertiary: '#edf1f7',
    hover: '#1890ff'
  },
  color: {
    primary: '#1890ff',
    primaryHover: '#40a9ff',
    primaryActive: '#096dd9',
    primaryBg: 'rgb(24 144 255 / 10%)',
    primaryBgHover: 'rgb(24 144 255 / 16%)',
    primaryBorder: 'rgb(24 144 255 / 24%)',
    controlOutline: 'rgb(24 144 255 / 20%)',
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
    purpleHover: '#6d28d9'
  },
  usagePanel: {
    input: SHARED.usagePanelInput,
    output: SHARED.usagePanelOutput
  },
  scrollbar: {
    bg: 'rgb(0 0 0 / 10%)',
    hover: 'rgb(0 0 0 / 20%)',
    active: 'rgb(0 0 0 / 25%)',
    lightBg: SHARED.scrollbarLightBg,
    lightHover: SHARED.scrollbarLightHover,
    lightActive: SHARED.scrollbarLightActive
  },
  shadow: {
    sm: '0 1px 2px rgb(15 23 42 / 5%)',
    md: '0 4px 12px rgb(15 23 42 / 9%)',
    lg: '0 12px 32px rgb(15 23 42 / 12%)',
    dropdown: '0 4px 10px rgb(15 23 42 / 8%)'
  },
  code: {
    bg: '#f8f9fa',
    border: '#e9ecef',
    headerBg: '#f8f9fa',
    lineBg: 'rgb(0 0 0 / 4%)',
    lineHoverBg: 'rgb(24 144 255 / 8%)',
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
    variable: '#fd7e14'
  },
  richEditor: {
    text: '#212529',
    placeholder: '#6c757d',
    caret: '#212529',
    headingBorder: '#e5eaf2',
    blockquoteText: '#5f6673',
    blockquoteBg: '#f3f6fa',
    blockquoteBorder: '#d8dee8',
    link: '#1890ff',
    hr: '#e5eaf2',
    tableHeaderBg: '#f3f6fa',
    tableBorder: '#e5eaf2',
    tableEvenBg: '#f3f6fa',
    searchHighlight: 'rgb(255 239 92 / 40%)',
    searchActive: '#ffef5c',
    searchActiveBorder: 'rgb(0 0 0 / 10%)'
  },
  sourceEditor: {
    markdownBackground: '#ffffff',
    markdownForeground: '#2a2a28',
    markdownCaret: '#1890ff',
    markdownSelection: 'rgb(24 144 255 / 18%)',
    markdownSelectionMatch: 'rgb(24 144 255 / 30%)',
    markdownLineHighlight: 'rgb(0 0 0 / 5%)',
    markdownGutterForeground: '#8a94a6',
    markdownHeading1: '#1890ff',
    markdownHeading2: '#40a9ff',
    markdownHeading3: '#69c0ff',
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
    markdownEscape: '#4a4540'
  },
  monaco: {
    foreground: '#243042',
    lineHighlightBg: '#f1f5f9',
    selectionBg: 'rgb(24 144 255 / 18%)',
    inactiveSelectionBg: '#e6edf5',
    lineNumber: '#a0aec0',
    lineNumberActive: '#334155',
    cursor: '#1890ff',
    gutterBg: '#ffffff',
    indentGuide: '#e5e7eb',
    indentGuideActive: '#cbd5e1'
  },
  anchor: {
    text: '#5f6673',
    hoverText: '#1a1a1a',
    hoverBg: 'rgb(24 144 255 / 10%)'
  },
  dropdown: {
    bg: '#fff',
    border: '#e9ecef',
    itemHoverBg: '#f8f9fa',
    divider: '#e9ecef'
  },
  modal: {
    text: '#212529',
    headerBg: '#f8f9fa'
  },
  input: {
    bg: '#ffffff',
    border: '#d8dee8',
    focusBorder: '#1890ff',
    focusShadow: 'rgb(24 144 255 / 20%)',
    errorText: SHARED.inputErrorText,
    errorBorder: '#f59e0b',
    errorShadow: 'rgb(245 158 11 / 20%)'
  },
  tag: {
    bg: '#f8f9fa',
    hoverBg: '#e9ecef',
    text: '#495057',
    secondaryText: '#6c757d',
    placeholder: '#adb5bd'
  },
  hoverIndicator: {
    bg: 'rgb(255 255 255 / 96%)',
    border: '#e5eaf2',
    text: '#5f6673',
    hoverText: '#1a1a1a',
    hoverBorder: 'rgb(24 144 255 / 24%)'
  },
  frontmatter: {
    bg: '#f3f6fa',
    border: '#e5eaf2',
    divider: '#e5eaf2',
    keyText: '#5f6673',
    valueText: '#334155'
  },
  jsonViewer: {
    nodeBg: '#ffffff',
    nodeBorder: '#d8dee8',
    rowDivider: '#edf1f7',
    key: '#1761d2',
    value: '#1a1a1a',
    number: '#b7791f',
    boolean: '#059669',
    null: '#8a94a6',
    edge: 'rgb(24 144 255 / 82%)',
    edgeLabel: '#1a1a1a'
  }
};

/**
 * Velora 暗色主题 Token。
 * 暗色模式沿用默认暗色结构，只替换应用主色和焦点态，避免整套界面变成蓝色。
 */
const veloraDark: ThemeTokens = {
  bg: {
    primary: '#13151a',
    secondary: '#0d0f12',
    tertiary: '#0f1115',
    elevated: '#1c1f26',
    hover: 'rgb(148 163 184 / 6%)',
    active: 'rgb(148 163 184 / 10%)',
    selected: 'rgb(24 144 255 / 18%)',
    input: '#181b21',
    disabled: '#1e2230'
  },
  text: {
    primary: '#e8ecf2',
    secondary: '#7a8494',
    tertiary: '#5a6272',
    quaternary: '#404858',
    disabled: '#363d4a',
    placeholder: '#4a5264'
  },
  border: {
    primary: '#252a35',
    secondary: '#2e3340',
    tertiary: '#1a1e28',
    hover: '#1890ff'
  },
  color: {
    primary: '#1890ff',
    primaryHover: '#40a9ff',
    primaryActive: '#096dd9',
    primaryBg: 'rgb(24 144 255 / 10%)',
    primaryBgHover: 'rgb(24 144 255 / 16%)',
    primaryBorder: 'rgb(24 144 255 / 22%)',
    controlOutline: 'rgb(24 144 255 / 15%)',
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
    purpleHover: '#8b5cf6'
  },
  usagePanel: {
    input: SHARED.usagePanelInput,
    output: SHARED.usagePanelOutput
  },
  scrollbar: {
    bg: 'rgb(255 255 255 / 10%)',
    hover: 'rgb(255 255 255 / 20%)',
    active: 'rgb(255 255 255 / 25%)',
    lightBg: SHARED.scrollbarLightBg,
    lightHover: SHARED.scrollbarLightHover,
    lightActive: SHARED.scrollbarLightActive
  },
  shadow: {
    sm: '0 1px 2px rgb(0 0 0 / 40%)',
    md: '0 4px 12px rgb(0 0 0 / 55%)',
    lg: '0 12px 32px rgb(0 0 0 / 65%)',
    dropdown: '0 8px 24px rgb(0 0 0 / 30%)'
  },
  code: {
    bg: '#0c0e12',
    border: '#1e2230',
    headerBg: '#13151a',
    lineBg: 'rgb(255 255 255 / 4%)',
    lineHoverBg: 'rgb(24 144 255 / 12%)',
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
    variable: '#ffa657'
  },
  richEditor: {
    text: '#f3efe8',
    placeholder: '#8a827a',
    caret: '#f3efe8',
    headingBorder: '#4a453f',
    blockquoteText: '#b7aea6',
    blockquoteBg: '#232323',
    blockquoteBorder: '#5a554f',
    link: '#69c0ff',
    hr: '#4a453f',
    tableHeaderBg: '#232323',
    tableBorder: '#4a453f',
    tableEvenBg: '#1a1a1a',
    searchHighlight: 'rgb(255 239 92 / 30%)',
    searchActive: '#ffef5c',
    searchActiveBorder: 'rgb(0 0 0 / 20%)'
  },
  sourceEditor: {
    markdownBackground: '#1a1916',
    markdownForeground: '#e8e6dc',
    markdownCaret: '#69c0ff',
    markdownSelection: 'rgb(24 144 255 / 30%)',
    markdownSelectionMatch: 'rgb(24 144 255 / 40%)',
    markdownLineHighlight: 'rgb(136 135 128 / 10%)',
    markdownGutterForeground: '#a8a6a0',
    markdownHeading1: '#69c0ff',
    markdownHeading2: '#91d5ff',
    markdownHeading3: '#bae7ff',
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
    markdownEscape: '#c0b8b0'
  },
  monaco: {
    foreground: '#dbe4f0',
    lineHighlightBg: '#1a1d24',
    selectionBg: 'rgb(24 144 255 / 30%)',
    inactiveSelectionBg: '#2a3544',
    lineNumber: '#64748b',
    lineNumberActive: '#e2e8f0',
    cursor: '#69c0ff',
    gutterBg: '#13151a',
    indentGuide: '#223045',
    indentGuideActive: '#475569'
  },
  anchor: {
    text: '#b7aea6',
    hoverText: '#f3efe8',
    hoverBg: 'rgb(24 144 255 / 16%)'
  },
  dropdown: {
    bg: '#0d0d0d',
    border: '#2a2a2a',
    itemHoverBg: '#1a1a1a',
    divider: '#1e1e1e'
  },
  modal: {
    text: '#f3efe8',
    headerBg: '#232323'
  },
  input: {
    bg: '#0d0f12',
    border: '#2a303d',
    focusBorder: '#1890ff',
    focusShadow: 'rgb(24 144 255 / 12%)',
    errorText: SHARED.inputErrorText,
    errorBorder: '#f59e0b',
    errorShadow: 'rgb(245 158 11 / 20%)'
  },
  tag: {
    bg: '#353535',
    hoverBg: '#404040',
    text: '#f3efe8',
    secondaryText: '#b7aea6',
    placeholder: '#8a827a'
  },
  hoverIndicator: {
    bg: 'rgb(26 26 26 / 96%)',
    border: '#5a554f',
    text: '#b7aea6',
    hoverText: '#f3efe8',
    hoverBorder: 'rgb(24 144 255 / 32%)'
  },
  frontmatter: {
    bg: '#232323',
    border: '#4a453f',
    divider: '#3a3530',
    keyText: '#b7aea6',
    valueText: '#f3efe8'
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
    edge: 'rgb(24 144 255 / 82%)',
    edgeLabel: '#f3efe8'
  }
};

/**
 * 注册 Velora 晴空蓝主题预设。
 * 预设使用手工定义的完整 ThemeTokens，不走色板派生工厂，避免整套色板被派生为蓝色。
 */
registerPreset({
  id: 'velora',
  label: '晴空蓝「Velora」',
  light: veloraLight,
  dark: veloraDark
});

export { veloraLight, veloraDark };
