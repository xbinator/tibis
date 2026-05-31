# 主题 Token 统一设计

## 背景

当前项目主题色值分散在三处，同一颜色需要重复维护：

| 位置 | 格式 | 变量数 |
|------|------|--------|
| `src/assets/styles/theme/light.less` + `dark.less` | CSS 变量 | ~200 |
| `src/hooks/useAntdTheme.ts` | Ant Design token | ~10 |
| `src/components/BMonaco/utils/createMonaco.ts` | Monaco 主题色 | ~12 |

修改一个颜色需要同步 2~3 个文件，容易遗漏导致视觉不一致。

## 目标

- **单一真相源**：所有色值只在 TypeScript 中定义一次
- **类型安全**：IDE 自动补全，拼错即报错
- **派生自动**：CSS 变量、Ant Design token、Monaco 主题色均从同一对象派生
- **运行时切换**：主题切换时动态更新 CSS 变量，无需页面刷新

## 方案：结构化 Token + 扁平化派生

### 文件结构

```
src/theme/
  tokens.ts          # 唯一真相源：ThemeTokens 接口 + SHARED 常量 + light/dark 对象
  derive.ts          # 派生函数：toCssVars / toAntdToken / toMonacoColors
  apply.ts           # 运行时注入 CSS 变量到 document.documentElement
  index.ts           # 统一导出
```

### ThemeTokens 接口

按语义分组，与现有 CSS 变量一一对应。关键变更说明：

- `editor` 组重命名为 `richEditor`，明确语义为 TipTap 富文本编辑器
- 新增 `monaco` 组，独立承载 Monaco 源码编辑器专有色值
- `usage` 组重命名为 `usagePanel`，自描述"用量面板进度条"
- `color` 组新增 `controlOutline`，不再与 `primaryBg` 强行绑定

```typescript
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
```

### 共享常量

light 和 dark 主题中部分颜色值完全相同（主题不变色），提取为 `SHARED` 常量避免改一边漏一边：

```typescript
const SHARED = {
  usagePanelInput: '#1677ff',
  usagePanelOutput: '#18cf62',
  scrollbarLightBg: 'rgb(255 255 255 / 15%)',
  scrollbarLightHover: 'rgb(255 255 255 / 25%)',
  scrollbarLightActive: 'rgb(255 255 255 / 30%)',
  inputErrorText: '#f87171',
} as const;
```

### 派生函数

#### `toCssVars(tokens: ThemeTokens): Record<string, string>`

将结构化 token 扁平化为 `--bg-primary` 格式的 CSS 变量映射。键名规则：分组名 + 属性名，用 `-` 连接，camelCase 转 kebab-case。

映射关系（与现有 CSS 变量名一一对应）：

| Token 路径 | CSS 变量名 |
|-----------|-----------|
| `tokens.bg.primary` | `--bg-primary` |
| `tokens.color.primaryBg` | `--color-primary-bg` |
| `tokens.richEditor.text` | `--editor-text` |
| `tokens.usagePanel.input` | `--usage-input` |
| `tokens.monaco.foreground` | `--monaco-foreground`（新增，Monaco 专有） |

注意：`richEditor` 组的 CSS 变量名保持 `--editor-*` 前缀不变（与现有 Less 一致，避免大范围重构 Less 引用）。`monaco` 组使用 `--monaco-*` 前缀。

#### `toAntdToken(tokens: ThemeTokens): AntdThemeToken`

从 token 中提取 Ant Design 需要的字段：

```typescript
{
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
}
```

#### `toMonacoColors(tokens: ThemeTokens): Record<string, string>`

从 token 中提取 Monaco 编辑器需要的 11 个颜色，完整映射：

```typescript
{
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
}
```

### 运行时注入

`applyCssVars(tokens: ThemeTokens)` 函数：

1. 调用 `toCssVars()` 得到扁平映射
2. 遍历设置到 `document.documentElement.style`
3. 在 `settingStore.initTheme()` 中调用，主题切换时重新调用

### 首屏闪烁防御

CSS 变量由 JS 注入，若晚于首帧渲染会导致短暂白屏或错误颜色。防御方案：在 `index.html` 的 `<head>` 中内联同步脚本，在 DOM 构建前注入关键 CSS 变量：

```html
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
```

此脚本仅注入 3 个最关键的色值（背景 + 文本），确保首帧不闪烁。App 初始化时 `applyCssVars` 会全量覆盖这些初始值。

### 消费方改造

#### `useAntdTheme.ts`

不再硬编码色值，保持现有接口 `{ antdTheme: ComputedRef<AntdThemeConfig> }` 不变：

```typescript
import { light, dark, toAntdToken } from '@/theme';

const antdTheme = computed<AntdThemeConfig>(() => {
  const isDark = settingStore.resolvedTheme === 'dark';
  const tokens = isDark ? dark : light;
  return {
    algorithm: isDark ? darkAlgorithm : defaultAlgorithm,
    token: toAntdToken(tokens),
  };
});

return { antdTheme };
```

#### `createMonaco.ts`

`ensureThemes()` 不再硬编码颜色，改为从 token 派生。增加幂等保护避免重复注册：

```typescript
import { light, dark, toMonacoColors } from '@/theme';

const definedThemes = new Set<string>();

function ensureThemes(monaco: typeof Monaco): void {
  if (definedThemes.has('tibis-light')) return;

  monaco.editor.defineTheme('tibis-light', {
    base: 'vs', inherit: true, rules: [],
    colors: toMonacoColors(light),
  });
  monaco.editor.defineTheme('tibis-dark', {
    base: 'vs-dark', inherit: true, rules: [],
    colors: toMonacoColors(dark),
  });

  definedThemes.add('tibis-light');
  definedThemes.add('tibis-dark');
}
```

#### `setting.ts`

`applyTheme()` 函数改为同时注入 CSS 变量：

```typescript
import { light, dark, applyCssVars } from '@/theme';

function applyTheme(theme: ThemeMode): void {
  const resolved = theme === 'system' ? getSystemTheme() : theme;
  applyCssVars(resolved === 'dark' ? dark : light);
  if (resolved === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
}
```

### 开发时颜色格式校验

在 DEV 环境下对 token 值做轻量级运行时校验，帮助发现格式错误：

```typescript
const COLOR_RE = /^(#([0-9a-f]{3,8})|rgb\(\d{1,3}\s+\d{1,3}\s+\d{1,3}(\s*\/\s*\d{1,3}%)?\))$/i;

function validateTokens(tokens: ThemeTokens, name: string): void {
  if (!import.meta.env.DEV) return;
  const flat = toCssVars(tokens);
  for (const [key, value] of Object.entries(flat)) {
    if (!COLOR_RE.test(value)) {
      console.warn(`[theme] Unexpected color format in ${name}: ${key}=${value}`);
    }
  }
}
```

## 迁移计划

分三个阶段执行，每阶段可独立验证和回滚：

### Phase 1：共存

| 操作 | 说明 |
|------|------|
| 新建 `src/theme/` 目录 | 实现 `tokens.ts` + `derive.ts` + `apply.ts` + `index.ts` |
| `setting.ts` 中 `applyTheme()` 调用 `applyCssVars` | JS 注入的变量会覆盖 Less 变量，两者共存 |
| 保留 `variables.less` 的 import | 不删除，作为降级保障 |

**验证标准**：所有页面视觉与改造前一致（JS 注入覆盖 Less 变量，行为等价）

**回滚方案**：移除 `applyCssVars` 调用即可，Less 文件未受影响

### Phase 2：收敛

| 操作 | 说明 |
|------|------|
| 改造 `useAntdTheme.ts` | 从 token 派生，删除硬编码色值 |
| 改造 `createMonaco.ts` | 从 token 派生，删除硬编码色值 |
| 添加 `index.html` 内联脚本 | 防御首屏闪烁 |

**验证标准**：三个消费方全部切换到 token 派生，无硬编码色值残留

**回滚方案**：还原消费方代码，Less 文件仍在

### Phase 3：清理

| 操作 | 说明 |
|------|------|
| 删除 `src/assets/styles/theme/dark.less` | — |
| 删除 `src/assets/styles/theme/light.less` | — |
| 删除 `src/assets/styles/theme/variables.less` | — |
| 移除 `src/assets/styles/index.less` 中的 `@import './theme/variables.less'` | — |

**验证标准**：`git grep` 确认无遗留的 Less 主题文件引用

**回滚方案**：从 git 恢复被删除的 Less 文件，移除 `applyCssVars` 调用

## 风险与注意事项

1. **首屏闪烁**：已通过 `index.html` 内联脚本防御，见"首屏闪烁防御"章节。
2. **SSR / 预渲染**：本项目为 Electron 桌面应用，无 SSR 场景，不受影响。
3. **Less 中引用 CSS 变量**：现有 Less 样式中通过 `var(--xxx)` 引用的代码无需修改，变量名保持一致。`richEditor` 组的 CSS 变量名仍为 `--editor-*` 前缀。
4. **`data-theme` 属性**：保留用于少数无法通过 CSS 变量实现的场景（如第三方库的属性选择器）。
5. **Monaco vs TipTap 色值差异**：`monaco.foreground`（light: `#243042`）与 `richEditor.text`（light: `#212529`）是**有意的视觉差异**——Monaco 源码编辑器使用更深的蓝灰色前景以提升代码可读性，TipTap 富文本编辑器使用纯黑灰色。两者不应合并。
