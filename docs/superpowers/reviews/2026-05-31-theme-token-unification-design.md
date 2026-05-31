# 主题 Token 统一设计评审

> 评审日期：2026-05-31
> 评审人：Claude Code
> 设计文档：[../specs/2026-05-31-theme-token-unification-design.md](../specs/2026-05-31-theme-token-unification-design.md)

## 整体评价

设计方向正确——"单一 TS 源 → 多路派生"的架构完全契合项目"先规划后编码"的风格。方案解决的痛点真实存在（修改一个颜色需同步 2~3 个文件），技术路径清晰。与现有 skill 系统评审的分节审查方式一致，以下按严重程度逐一分析。前 4 个为关键问题，建议编码前明确方案。

---

## 关键问题

### 1. `toMonacoColors()` 映射严重不完整

设计文档中 `toMonacoColors` 仅示例如下 4 个映射：

```typescript
{
  'editor.background': tokens.bg.primary,
  'editor.foreground': tokens.editor.text,
  'editor.lineHighlightBackground': tokens.bg.hover,
  'editor.selectionBackground': tokens.bg.selected,
  // ...
}
```

但当前 `createMonaco.ts:168-206` 的 `ensureThemes()` 实际上定义了 **11 个 Monaco 颜色**，还有以下 7 个字段没有在 `ThemeTokens` 中有对应的 token：

| Monaco 键 | 当前值（light） | 可用 token | 问题 |
|-----------|----------------|-----------|------|
| `editor.inactiveSelectionBackground` | `#e6edf5` | **无对应** | 需新增 `editor.inactiveSelectionBg` |
| `editorLineNumber.foreground` | `#a0aec0` | 可用 `code.lineNumber`，但语义不同 | Monaco 行号色 ≠ 代码块行号色 |
| `editorLineNumber.activeForeground` | `#334155` | **无对应** | 需新增 `editor.lineNumberActive` |
| `editorCursor.foreground` | `#2563eb` | 可用 `editor.caret`，但颜色值不同（`#2563eb` vs `#212529`） | 现有 `editor.caret` 是 TipTap 光标色，非 Monaco 光标色 |
| `editorGutter.background` | `#faf9f6` | 可用 `bg.primary`，语义匹配 | 需要加一条硬编码映射规则 |
| `editorIndentGuide.background1` | `#e5e7eb` | **无对应** | 需新增 `editor.indentGuide` |
| `editorIndentGuide.activeBackground1` | `#cbd5e1` | **无对应** | 需新增 `editor.indentGuideActive` |

**建议**：两种处理方式——

| 方案 | 做法 | 优点 | 缺点 |
|------|------|------|------|
| a. 扩展 ThemeTokens | 在 `editor` 组新增 5 个缺失字段，`toMonacoColors` 做纯映射 | 类型安全、单一源 | `editor` 组变得更大（15→20+），TipTap 和 Monaco 混在一起 |
| b. 新增 `monaco` 组 | 将 Monaco 专有色独立为一个新组 `monaco: { inactiveSelectionBg, lineNumber, lineNumberActive, gutterBg, indentGuide, indentGuideActive }` | 语义清晰，关注点分离 | 部分值可能与其他组重复（如 `gutterBg` = `bg.primary`） |

**推荐方案 b**。Monaco 编辑器是一个独立子系统，其颜色需求与 TipTap 编辑器是不同的抽象层次。当前 `editor` 组混用已造成困惑。`toMonacoColors` 中可以这样映射：

```typescript
function toMonacoColors(tokens: ThemeTokens): Record<string, string> {
  return {
    'editor.background': tokens.bg.primary,
    'editor.foreground': tokens.editor.text,
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
```

---

### 2. `editor` 组语义歧义——TipTap vs Monaco 未明确区分

设计文档中 `editor` 组变量（如 `headingBorder`、`blockquoteText`、`tableHeaderBg`）是 TipTap 富文本编辑器的样式，`sourceEditor` 组是 Monaco 源码编辑器的 Markdown token 高亮颜色。但 `toMonacoColors` 中却引用了 `tokens.editor.text`：

```typescript
'editor.foreground': tokens.editor.text,  // 拿 TipTap 的文本色给 Monaco 用？
```

对比当前代码：
- `--editor-text: #212529`（light.less）→ TipTap 编辑器文本色
- `'editor.foreground': '#243042'`（createMonaco.ts）→ Monaco 编辑器前景色
- **这两个值不同！** `#212529` ≠ `#243042`

这揭示了一个深层问题：目前 TipTap 编辑器和 Monaco 编辑器使用**不同的**前景色。如果 `toMonacoColors` 复用 `tokens.editor.text`，Monaco 的前景色会从 `#243042` 变成 `#212529`——这可能不符合设计意图。

**建议**：
1. 将 `editor` 组明确重命名为 `richEditor`（或保留 `editor` 但加注释说明 "TipTap 富文本编辑器"）
2. Monaco 主题色通过独立的 `monaco` 组（见问题 1 的方案 b）或显式硬编码映射在 `toMonacoColors` 中
3. 对 `toMonacoColors` 中的每个映射都验证当前值与目标 token 值是否一致，不一致的需要标记为**有意的视觉调整**

---

### 3. 首屏闪烁——缺少具体防御方案

设计文档在风险部分提到：

> 需确保 `applyCssVars` 在 App 挂载前同步执行。

但仅此一句，缺少具体实现方案。当前 `variables.less` 在 CSS 加载时即生效（`link` 标签加载后 CSS 变量立即可用），改为 JS 注入后存在时序差：

```
CSS 加载完成 → CSS 变量可用（当前方案，零延迟）
     ↓ 改为 JS 注入后
HTML 解析 → <script> 执行 → applyCssVars() → CSS 变量可用（有几毫秒延迟）
```

**关键窗口**：如果 `applyCssVars` 在 Vue App `createApp().mount()` 之后执行，Vue 组件的首次渲染将使用**未定义的 CSS 变量**，表现为短暂白屏或错误颜色。

**建议**：在 `index.html` 的 `<head>` 中内联一个**同步脚本**，在任何外部资源加载前设置默认 CSS 变量：

```html
<!-- index.html -->
<head>
  <script>
    // 在 DOM 构建前同步执行，零闪烁
    (function() {
      var t = localStorage.getItem('tibis-theme');
      var isDark = t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      // 注入最关键的背景色，防止白屏
      var root = document.documentElement;
      root.style.setProperty('--bg-primary', isDark ? '#13151a' : '#faf9f6');
      root.style.setProperty('--bg-secondary', isDark ? '#0d0f12' : '#f0ebe1');
      root.style.setProperty('--text-primary', isDark ? '#e8ecf2' : '#1a1a1a');
      root.setAttribute('data-theme', isDark ? 'dark' : '');
    })();
  </script>
  <!-- 其他资源... -->
</head>
```

然后在 App 初始化时再全量注入（`applyCssVars` 会覆盖这些初始值）。这样做的好处是首帧已有正确的背景色和文本色，视觉上感知不到闪烁。

---

### 4. 缺少迁移计划与回滚方案

设计文档只描述了"目标状态"，没有说明如何从当前三个独立源平滑过渡到目标状态。删除 `dark.less` / `light.less` / `variables.less` 是破坏性操作。

**建议**：分三个阶段执行：

| 阶段 | 内容 | 验证标准 |
|------|------|---------|
| Phase 1：共存 | 新建 `src/theme/`，实现 token + 派生函数。`applyCssVars` 与现有 Less 主题**同时运行**（JS 注入的变量会覆盖 Less 变量）。保留 `variables.less` 的 import 不删除。 | 所有页面视觉与改造前一致 |
| Phase 2：收敛 | 逐个消费方改造（`useAntdTheme.ts` → 从 token 读取，`createMonaco.ts` → 从 token 读取）。每改一个消费方，就消除一处硬编码。 | 三个消费方全部切换到 token 派生 |
| Phase 3：清理 | 确认所有消费方已迁移后，删除 Less 主题文件和 `variables.less` import。 | `git grep` 确认无遗留引用 |

回滚方案：Phase 1/2 期间，还原代码即可（Less 文件还在）。Phase 3 后，需从 git 恢复被删除的 Less 文件并移除 `applyCssVars` 调用。

---

## 中等问题

### 5. `toAntdToken` 中 `controlOutline` 映射存在语义偏差

```typescript
controlOutline: tokens.color.primaryBg,  // 近似
```

注释写了"近似"，说明设计者已意识到这不完全准确。Ant Design 的 `controlOutline` 是控件聚焦时的外发光颜色（通常半透明），而 `color.primaryBg` 是主题色的浅色背景。当前 `useAntdTheme.ts` 中是独立定义的：

- light: `controlOutline: 'rgb(138 111 90 / 20%)'`
- dark: `controlOutline: 'rgb(200 169 139 / 15%)'`

这两个值可以表达为主题色 + 不透明度的组合，但 `color.primaryBg` 是固定色值（light: `rgb(138 111 90 / 10%)`，dark: `rgb(200 169 139 / 10%)`），透明度不同。

**建议**：在 ThemeTokens 中新增 `color.controlOutline`：

```typescript
color: {
  // ...existing
  controlOutline: string;  // light: rgb(138 111 90 / 20%), dark: rgb(200 169 139 / 15%)
}
```

这不是"过度设计"——Ant Design 的 `controlOutline` 有自己独立的视觉语义，不应与 `primaryBg` 强行绑定。

---

### 6. `usage` 组命名不够自描述

`usage.input` 和 `usage.output` 从命名上看不出用途。对比 CSS 注释 `// 用量面板进度条语义色` 才能理解。

**建议**：重命名为 `usagePanel` 或添加 `/** 用量面板进度条 */` JSDoc 注释。

---

### 7. ThemeTokens 中硬编码 RGB 函数字符串的类型安全

当前 light.less 中有：

```less
--bg-hover: rgb(107 101 96 / 8%);
```

迁移到 ThemeTokens 后：

```typescript
bg: {
  hover: 'rgb(107 101 96 / 8%)',  // 是 string，无编译时校验
}
```

TypeScript 无法校验 RGB 字符串格式的正确性。这不算设计缺陷（TS 不支持这种级别的类型约束），但值得在实现时加一个轻量级的运行时校验：

```typescript
const RGB_FUNC_RE = /^rgb\(\d{1,3}\s+\d{1,3}\s+\d{1,3}\s*\/\s*\d{1,3}%\)$/;
function assertValidColor(value: string, key: string): void {
  if (import.meta.env.DEV && !value.startsWith('#') && !RGB_FUNC_RE.test(value)) {
    console.warn(`[theme] Unexpected color format: ${key}=${value}`);
  }
}
```

---

## 建议改进

### 8. 考虑在 `tokens.ts` 中提取共享常量

light 和 dark 主题中有部分颜色是**主题不变色**（如 `usage.input`、`usage.output`、`color.success` 的部分衍生色）。当前 Less 文件中，`--usage-input` 在 light 和 dark 中都是 `#1677ff`。

```typescript
// tokens.ts
const SHARED = {
  usageInput: '#1677ff',
  usageOutput: '#18cf62',
  scrollbarLightBg: 'rgb(255 255 255 / 15%)',
  scrollbarLightHover: 'rgb(255 255 255 / 25%)',
  scrollbarLightActive: 'rgb(255 255 255 / 30%)',
  inputErrorText: '#f87171',
} as const;

export const light: ThemeTokens = {
  usage: { input: SHARED.usageInput, output: SHARED.usageOutput },
  // ...
};
```

这样做的好处：修改不变色时只需改一处，不会出现 light/dark 改一边漏一边的错误。

### 9. `createMonaco.ts` 主题定义方式的改进建议

当前 `ensureThemes` 只设置 `colors` 映射，`rules: []` 为空（继承 base 的 token 颜色）。设计文档中 `toMonacoColors` 的实现似乎也延续这个模式。但注意 Monaco 的 `defineTheme` 要求主题名称唯一——当前代码没有幂等保护。

**建议**：`toMonacoColors` 的实现中加一层去重：

```typescript
const definedThemes = new Set<string>();

function ensureThemes(monaco: typeof Monaco): void {
  if (definedThemes.has('tibis-light')) return;
  monaco.editor.defineTheme('tibis-light', { /* ... */ });
  definedThemes.add('tibis-light');
  // ...
}
```

### 10. 文档中消费方改造代码示例不完全准确

`useAntdTheme.ts` 的改造示例：

```typescript
// 设计文档中的写法
const antdTheme = computed(() => {
  const tokens = settingStore.resolvedTheme === 'dark' ? dark : light;
  return {
    algorithm: settingStore.resolvedTheme === 'dark' ? darkAlgorithm : defaultAlgorithm,
    token: toAntdToken(tokens),
  };
});
```

当前 `useAntdTheme()` 的返回值是 `{ antdTheme: ComputedRef<AntdThemeConfig> }`，外部通过 `const { antdTheme } = useAntdTheme()` 解构使用。设计文档的示例如果直接 `return { algorithm, token }` 而不包装，会破坏现有调用方的接口兼容性。

**建议**：在设计中注明保持 `return { antdTheme: computed(...) }` 的接口不变。

---

## 检查清单

| 检查项 | 状态 | 说明 |
|--------|------|------|
| ThemeTokens 覆盖所有 CSS 变量 | ✅ | 162 个字段全部覆盖，与现有 `--xxx` 一一对应 |
| `toCssVars` 命名转换规则正确 | ✅ | camelCase → kebab-case 转换无误 |
| Ant Design token 映射方向正确 | ⚠️ | `controlOutline` 映射不精确，见问题 5 |
| Monaco 主题色映射完整 | ❌ | 11 个颜色仅映射了 4 个，见问题 1 |
| 首屏闪烁有防御方案 | ❌ | 仅提及原则，无具体实现，见问题 3 |
| 迁移计划可执行 | ❌ | 缺少分阶段迁移方案，见问题 4 |
| `data-theme` 属性保留决策合理 | ✅ | 第三方库（如 ant-design-vue）可能需要属性选择器 |
| Less `var()` 引用兼容 | ✅ | Less 不解析 CSS 自定义属性，原样输出 |

---

## 总结

设计方向正确，但**实施细节有 4 个必须解决的关键缺口**：

1. **Monaco 颜色映射不完整**（阻断级——实现时无法通过）
2. **`editor` 组语义歧义**（可能导致错误颜色值传递给 Monaco）
3. **首屏闪烁无具体方案**（影响用户体验）
4. **无迁移/回滚计划**（删除 Less 文件是破坏性操作）

建议在编码前补充上述 4 点的具体方案，中等问题可在实现时一并处理。
