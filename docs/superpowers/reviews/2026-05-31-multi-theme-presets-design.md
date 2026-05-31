# 多主题预设系统设计评审

> 评审日期：2026-05-31
> 评审人：WorkBuddy
> 设计文档：[../specs/2026-05-31-multi-theme-presets-design.md](../specs/2026-05-31-multi-theme-presets-design.md)

## 整体评价

设计方向正确——"预设文件自注册 + 注册表查询"的模式简洁清晰。与 [主题 Token 统一设计](./2026-05-31-theme-token-unification-design.md) 衔接自然：统一设计先建立了 `ThemeTokens` 单一真相源，本设计在此基础上做预设扩展。`ThemeMode`（light/dark/system）与 `themePreset`（预设色值选择）的职责分离是好的架构决策。

但实现层面有 5 个需要编码前明确的关键问题。

---

## 关键问题

### 1. 预设色值派生逻辑将大量重复

设计文档的"色值映射策略"描述了一种理想化的流程：

> 每个主题官方仓库只提供 ~30 个基础色，但 ThemeTokens 有 ~180 个字段。

这意味着每个预设文件（10 个预设 × 1 个文件 = 10 个文件）都需要独立实现从 ~30 基础色到 ~180 ThemeTokens 字段的派生逻辑。具体来说：

| 派生类型 | 举例 | 每个预设需手写的字段数 |
|----------|------|----------------------|
| 直接映射 | `bg.primary` → 主题 bg0 | ~10 |
| 透明叠加 | `bg.hover` → bg + 8% 白色/黑色 | ~15 |
| 状态色映射 | `bg.active`、`bg.selected` | ~20 |
| 代码高亮映射 | `code.keyword`、`code.string` 等 26 个语法色 | ~26 |
| 源编辑器映射 | `sourceEditor.*` 27 个 Markdown token 色 | ~27 |
| Monaco 基本色 | `monaco.*` 10 个编辑器 chrome 色 | ~10 |
| 组件语义色 | `anchor`/`dropdown`/`modal`/`input`/`tag`/`frontmatter` 等 | ~50 |
| SHARED 复用 | `usagePanel.*`、`scrollbar.light*` 等 | ~10 |

**问题**：

1. **一致性灾难**：如果后续想调整"hover 态颜色派生规则"（比如从"bg + 8% opacity"改为"bg + 12% opacity"），需要**修改 10 个预设文件**，极易遗漏。
2. **新人门槛高**：贡献新预设需要理解 180 个字段的语义和派生关系，远超"选 30 个基础色"的预期工作量。
3. **色值质量无保障**：每个预设作者独立派生，容易出现某个预设的 hover 色太亮、另一个太暗的不一致体验。

**建议**：

引入**预设工厂函数**，将派生逻辑集中化：

```typescript
// src/theme/presets/factory.ts

/** 基础色板：主题仓库直接提供的 30 个色值 */
interface BasePalette {
  bg0: string;    // 最深背景
  bg1: string;    // 次深背景
  bg2: string;    // 中等背景
  bg3: string;    // 较浅背景
  bg4: string;    // 悬浮态背景
  fg0: string;    // 前景主色
  fg1: string;    // 前景次色
  fg2: string;    // 前景辅色
  red: string;
  green: string;
  yellow: string;
  blue: string;
  purple: string;
  orange: string;
  // ... 等约 30 个基础色
  syntaxComment: string;
  syntaxKeyword: string;
  syntaxString: string;
  syntaxFunction: string;
  syntaxNumber: string;
  // ... 等语法高亮色
}

/**
 * 从基础色板派生出完整的 ThemeTokens。
 * 所有预设共享同一套派生规则，保证一致性。
 */
function createThemeTokens(palette: BasePalette, mode: 'light' | 'dark'): ThemeTokens {
  // 透明叠加辅助函数
  const alpha = (color: string, a: number) => `rgb(from ${color} r g b / ${a})`;
  // 或更兼容的写法：预计算 rgba 值

  return {
    bg: {
      primary: palette.bg0,
      secondary: palette.bg1,
      tertiary: palette.bg2,
      elevated: palette.bg3,
      hover: alpha(palette.fg0, 0.08),
      active: alpha(palette.fg0, 0.12),
      selected: alpha(palette.blue, 0.15),
      input: palette.bg2,
      disabled: alpha(palette.fg0, 0.04),
    },
    // ... 其余 ~170 字段全部由工厂函数派生
  };
}
```

每个预设文件简化为仅声明基础色板：

```typescript
// src/theme/presets/everforest.ts
import { registerPreset } from '../registry';
import { createThemeTokens } from './factory';

registerPreset({
  id: 'everforest',
  label: 'Everforest',
  light: createThemeTokens({
    bg0: '#fdf6e3',
    bg1: '#efebd4',
    // ... 约 30 个值
  }, 'light'),
  dark: createThemeTokens({
    bg0: '#2b3339',
    bg1: '#323c41',
    // ... 约 30 个值
  }, 'dark'),
});
```

**收益**：
- 每个预设只需 ~60 行（30 个 light 色值 + 30 个 dark 色值）
- 派生规则集中维护，改一处全局生效
- 新人添加主题只需选 30 个基础色，降低门槛

**兼容的 CSS 颜色格式**：如果担心 `rgb(from ...)` 的浏览器兼容性，可以预计算或在工厂函数中使用简单的字符串拼接生成 `rgba(r, g, b, a%)` 格式。当前项目已使用 `rgb(r g b / a%)` 格式（见 `tokens.ts` 中的 `bg.hover: 'rgb(107 101 96 / 8%)'`），继续沿用即可。

---

### 2. Monaco 主题名称命名空间缺失

当前 `createMonaco.ts` 注册两种主题：

```typescript
export type MonacoThemeName = 'tibis-light' | 'tibis-dark';
```

引入多预设后，每个预设都需要自己的 Monaco 主题。一个 everforest dark 预设的 Monaco 编辑器不应使用 default dark 的颜色。

**问题**：

1. **主题名称冲突**：如果命名规则是 `'{presetId}-{mode}'`，'everforest-light' 是合理的。但 `MonacoThemeName` 类型需要动态扩展，当前是硬编码的联合类型。
2. **注册时机**：当前 `ensureThemes` 只注册 `tibis-light` 和 `tibis-dark`。引入多预设后，需要注册所有预设的主题，还是按需懒注册？
3. **调用方变更**：所有使用 `MonacoThemeName` 的地方（Monaco 编辑器实例化处）需要改为动态主题名。

**建议**：

**方案 A（推荐）**：Monaco 注册表与主题注册表同步，在预设注册时自动注册对应的 Monaco 主题：

```typescript
// registry.ts 中
function registerPreset(preset: ThemePreset): void {
  registry.set(preset.id, preset);
  // 同时注册 Monaco 主题
  registerMonacoTheme(preset);
}

// createMonaco.ts 中
const definedThemes = new Set<string>();

function registerMonacoTheme(preset: ThemePreset): void {
  const lightName = `tibis-${preset.id}-light`;
  const darkName = `tibis-${preset.id}-dark`;

  if (definedThemes.has(lightName)) return;

  // 懒加载：标记待注册，等 monaco 实例可用时再真正 defineTheme
  pendingThemes.set(lightName, { base: 'vs', tokens: preset.light });
  pendingThemes.set(darkName, { base: 'vs-dark', tokens: preset.dark });
}

/** 获取当前预设的 Monaco 主题名 */
function getMonacoThemeName(presetId: string, mode: 'light' | 'dark'): string {
  return `tibis-${presetId}-${mode}`;
}
```

`MonacoThemeName` 类型改为 `string`（或品牌类型），调用方通过 `getMonacoThemeName()` 获取：

```typescript
// 使用处
const monacoTheme = getMonacoThemeName(settingStore.themePreset, resolvedTheme);
createMonacoEditor({ ..., theme: monacoTheme });
```

**方案 B**：Monaco 主题改用 `tibis-light` / `tibis-dark` 统一名称，切换预设时**动态覆盖**已注册主题的颜色。Monaco 的 `defineTheme` 可以重新定义同名主题（会覆盖旧的）。不推荐——Monaco 内部缓存可能导致旧颜色残留。

推荐**方案 A**，因为它与当前的设计哲学一致（自注册），且不会产生缓存问题。

---

### 3. 首屏闪烁在非 default 预设下更严重

设计文档在"首屏防御脚本"章节承认：

> 若用户选择了非 default 预设，首屏会有极短暂的 default 色值闪烁，但这是可接受的。

**这一判断过于乐观**。理由：

1. 当前 `index.html` **没有任何内联脚本**（见实际文件）。`applyCssVars` 在 `settingStore.init()` → `initTheme()` 中调用，这个调用链经过 `createApp().mount()` → `App.vue` → `useMenuAction` → `onMounted` → `settingStore.init()`。这是一个较长的初始化路径，首屏闪烁**已经存在**。

2. 引入预设后问题加剧：default 预设的闪烁是"颜色一闪而过"，非 default 预设则是"**完全错误的颜色方案闪一下**"（比如 everforest 用户看到白底暖棕色，然后跳到绿底）。视觉冲击更大。

3. 主题 Token 统一设计评审（[2026-05-31-theme-token-unification-design.md](./2026-05-31-theme-token-unification-design.md)）已建议在 `index.html` 中添加内联脚本。本设计可以在此基础上扩展。

**建议**：

在内联脚本中读取 `themePreset` 并注入对应的关键色值：

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

    // 仅注入 default 预设的关键色值（内联脚本不宜太大）
    // 非 default 预设会有短暂闪烁，但至少 bg/text 颜色用的是 default，
    // 比"完全未定义 CSS 变量导致的白屏"好得多
    var r = document.documentElement.style;
    if (preset === 'default') {
      r.setProperty('--bg-primary', isDark ? '#13151a' : '#faf9f6');
      r.setProperty('--bg-secondary', isDark ? '#0d0f12' : '#f0ebe1');
      r.setProperty('--text-primary', isDark ? '#e8ecf2' : '#1a1a1a');
    } else {
      // 非 default 预设：注入安全的 fallback 色值
      // 避免完全空白，视觉至少是可读的
      r.setProperty('--bg-primary', isDark ? '#1a1a1a' : '#ffffff');
      r.setProperty('--text-primary', isDark ? '#e0e0e0' : '#1a1a1a');
    }

    if (isDark) document.documentElement.setAttribute('data-theme', 'dark');
  })();
</script>
```

更进一步：如果高度关注非 default 预设的首屏体验，可以在 **构建时** 将 `default.ts` 的关键色值内联到 HTML（Vite 插件或构建脚本）。但这增加了复杂度，建议作为 Phase 2 的优化项。

**至少**：文档不应宣称"可接受的"，而应明确标注为"已知限制"并记录优化计划。

---

### 4. `getResolvedTokens` 签名过于原始，缺少消费方集成设计

设计文档中：

```typescript
function getResolvedTokens(presetId: string, mode: 'light' | 'dark'): ThemeTokens;
```

但**没有说明消费方（`applyTheme`、`useAntdTheme`、`createMonaco`）如何获取 `presetId`**。

当前消费方模式：

| 消费方 | 当前获取方式 |
|--------|-------------|
| `applyTheme()` | 直接 `import { light, dark }` |
| `useAntdTheme()` | 直接 `import { light, dark }`，通过 `settingStore.resolvedTheme` 选择 |
| `createMonaco` → `ensureThemes()` | 直接 `import { light, dark }` |
| `createMonaco` → `setTheme()` | 通过 `CreateMonacoEditorOptions.theme` 传入 `'tibis-light' | 'tibis-dark'` |

**问题**：

1. `applyTheme()` 是模块级函数（非 store 方法），它需要从哪获取 `presetId`？
2. `useAntdTheme()` 是 Vue composable，它可以从 `settingStore.themePreset` 获取，但设计文档没有展示这个变更。
3. `ensureThemes()` 需要注册所有预设的 Monaco 主题（或按需懒注册），设计文档没有说明。

**建议**：补充消费方改造的具体代码示例：

```typescript
// setting.ts — applyTheme 改造
function applyTheme(theme: ThemeMode): void {
  const resolvedTheme = theme === 'system' ? getSystemTheme() : theme;
  // 从 store 实例获取 presetId（store 已初始化，此处可安全调用）
  const presetId = useSettingStore().themePreset;
  const tokens = getResolvedTokens(presetId, resolvedTheme);
  applyCssVars(tokens);
  if (resolvedTheme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
}
```

```typescript
// useAntdTheme.ts — 改造
const antdTheme = computed<AntdThemeConfig>(() => {
  const isDark = settingStore.resolvedTheme === 'dark';
  const presetId = settingStore.themePreset;
  const tokens = getResolvedTokens(presetId, isDark ? 'dark' : 'light');
  return {
    algorithm: isDark ? darkAlgorithm : defaultAlgorithm,
    token: toAntdToken(tokens),
  };
});
```

```typescript
// createMonaco.ts — 改造
// 从 MonacoThemeName 改为动态获取
function getMonacoThemeName(): string {
  const store = useSettingStore();
  return `tibis-${store.themePreset}-${store.resolvedTheme}`;
}
```

---

### 5. 预设文件的模块导入顺序问题

设计文档说：

> 预设文件在模块顶层调用 `registerPreset()` 完成自注册

但 `tokens.ts` 还要从 default 预设 re-export `light`/`dark`：

> tokens.ts 仍导出 light/dark（从 default 预设 re-export），保持向后兼容

**问题**：如果 `tokens.ts` 的 `light`/`dark` 是通过 `getResolvedTokens('default', ...)` 从 registry 获取的，那么 `light`/`dark` 的值取决于 registry 是否已注册 default 预设。而 default 预设的注册发生在 `presets/default.ts` 被导入时。

`useAntdTheme.ts` 当前这样导入：
```typescript
import { light, dark, toAntdToken } from '@/theme';
```

这意味着 `tokens.ts` 需要在被导入时就能提供 `light`/`dark` 的值，即 registry 必须在 `tokens.ts` 的模块求值时已经包含 default 预设。

**建议**：明确入口文件的导入顺序：

```typescript
// src/theme/index.ts
// 1. 先导入所有预设（触发 registerPreset）
import './presets/default';
import './presets/everforest';
import './presets/tokyonight';

// 2. 再导出 light/dark（此时 registry 中已有 default）
export { light, dark } from './tokens'; // 现在可以安全地从 registry 取值

// 3. 导出其余 API
export { getResolvedTokens, getPresetList, registerPreset } from './registry';
export { toCssVars, toAntdToken, toMonacoColors } from './derive';
export { applyCssVars, validateTokens } from './apply';
```

或者在 `tokens.ts` 中用 lazy getter：

```typescript
// tokens.ts
export const light = new Proxy({} as ThemeTokens, {
  get(_, prop) {
    return getResolvedTokens('default', 'light')[prop as keyof ThemeTokens];
  }
});
```

推荐第一种（显式导入顺序），更直观可调试。

---

## 中等问题

### 6. `getPresetList()` 的设计意图不清晰

```typescript
function getPresetList(): Array<{ id: string; label: string }>;
```

注释说"不含 Token 数据，用于 UI 展示"。但有两点未明确：

1. **排序规则**：default 是否始终排第一？还是按注册顺序？建议 default 始终在首位，其余按注册顺序或字母序。
2. **`registerPreset` 的幂等性**：如果同一个 `id` 被注册两次（如热更新），应该覆盖还是抛错？建议**覆盖**（支持 HMR），同时 dev 模式下输出 warning。

```typescript
function registerPreset(preset: ThemePreset): void {
  if (registry.has(preset.id) && import.meta.env.DEV) {
    console.warn(`[theme] Preset "${preset.id}" is being re-registered (HMR)`);
  }
  registry.set(preset.id, preset);
}
```

---

### 7. 预设文件的懒加载未被考虑

设计文档假设所有预设文件**启动时全部加载**。10 个预设 × 2 套 ThemeTokens = 20 个完整 Token 对象（~180 字段/个）。按每个色值约 30 字节计，约 108KB 的字符串数据。加上解析开销，对 Electron 桌面应用来说问题不大。

但**代码包体积**会受影响：10 个预设文件 = 10 个模块被打包。如果后续预设数量持续增长（20+），可能需要考虑动态导入：

```typescript
// 按需加载预设
async function loadPreset(id: string): Promise<ThemeTokens> {
  if (registry.has(id)) return registry.get(id)!;
  // 动态导入预设文件
  await import(`./presets/${id}.ts`);
  return registry.get(id)!;
}
```

建议在文档中注明：**v1 方案采用全量加载，预设数量 < 15 时不引入懒加载。预设数超过阈值时再评估。** 避免过早优化。

---

### 8. 主题预设与"跟随系统"模式的行为定义缺失

当前 `system` 模式的语义：用户选择 system → 自动跟随 OS 明暗偏好 → 色值使用 default 预设的对应明暗。

引入多预设后，`system` 模式的行为需要明确：

| 场景 | 预期行为 |
|------|---------|
| preset=everforest, theme=system, OS=dark | 使用 everforest dark 色值 |
| preset=everforest, theme=system, OS=light | 使用 everforest light 色值 |
| preset=default, theme=system | 与现在一致 |

这个行为应该是自然的——`themePreset` 只控制"哪套色值"，`ThemeMode` 控制"亮还是暗"。设计文档虽然没有明确写，但从 `getResolvedTokens(presetId, mode)` 的签名可以推断。建议在文档中补充一句："`themePreset` 和 `ThemeMode` 完全正交，system 模式仅影响 mode 解析，不影响 preset 选择"。

---

### 9. 与主题 Token 统一设计的关系未说明

本设计文档假设 `src/theme/` 目录结构已经存在（`tokens.ts` + `derive.ts` + `apply.ts` + `index.ts`），但这些文件是主题 Token 统一设计的产出物。两个设计文档存在依赖关系：

```
主题 Token 统一设计 (2026-05-31-theme-token-unification-design.md)
    ↓ 建立 ThemeTokens 接口 + 派生体系
多主题预设设计 (2026-05-31-multi-theme-presets-design.md)  ← 本设计
    ↓ 在此基础上做预设扩展
```

建议在文档的"背景"章节加入一行：

> 本设计**依赖**主题 Token 统一设计（`2026-05-31-theme-token-unification-design.md`）已完成 `ThemeTokens` 接口和 `src/theme/` 目录结构搭建。前置设计的 `tokens.ts` 仅包含 default 预设的 light/dark，本设计将其迁移至 `presets/default.ts`。

这样阅读者不会对"为什么已经有 `tokens.ts` 还要再创建 `presets/default.ts`"感到困惑。

---

## 建议改进

### 10. 预设文件结构可加入 `readme.md`

在 `src/theme/presets/` 目录下可加入一个简短的 `README.md`：

```markdown
# 主题预设

## 添加新预设

1. 复制 `_template.ts` 为 `your-theme.ts`
2. 填写 `BasePalette`（约 30 个基础色值）
3. 调用 `createThemeTokens()` 生成 light/dark 两套 Token
4. 调用 `registerPreset()` 注册
5. 在 `src/theme/index.ts` 中导入新预设文件

## 基础色值参考

参考现有预设文件的注释，每个色值的语义说明。
```

降低新人贡献门槛。

---

### 11. `themePreset` 字段的存储键名

设计文档在 `PersistedSettingState` 中新增：

```typescript
themePreset: string;
```

当前持久化使用 `localStorage` 键 `'app_settings'`。无需额外迁移——已存在的用户没有这个字段，`normalizeSettings` 会填充默认值。建议在 DEFAULT_SETTINGS 中显式声明：

```typescript
const DEFAULT_SETTINGS: PersistedSettingState = {
  // ... 现有字段
  themePreset: 'default',
};
```

---

## 检查清单

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 预设注册表 API 设计合理 | ✅ | `registerPreset` + `getResolvedTokens` + `getPresetList` 职责清晰 |
| `ThemeMode` 与 `themePreset` 正交 | ✅ | 职责分离干净，system 模式行为正确 |
| 向后兼容 | ✅ | `tokens.ts` re-export light/dark，现有消费方不受影响 |
| 迁移分阶段 | ✅ | Phase 1-3 规划合理 |
| 预设色值派生逻辑 | ❌ | 每个预设需重复实现 ~180 字段的派生，应提取工厂函数（见问题 1） |
| Monaco 主题命名空间 | ❌ | 未说明如何注册多个预设的 Monaco 主题（见问题 2） |
| 首屏闪烁处理 | ❌ | 对非 default 预设的闪烁问题过于乐观，需补充方案（见问题 3） |
| 消费方如何获取 presetId | ❌ | `applyTheme`/`useAntdTheme`/`createMonaco` 的适配细节缺失（见问题 4） |
| 模块导入顺序保证 | ⚠️ | `tokens.ts` 的 light/dark re-export 依赖注册表已填充（见问题 5） |
| 预设懒加载 | ⚠️ | 10 个预设全量加载可接受，但应注明扩展策略（见问题 7） |
| 与前置设计的关系 | ⚠️ | 应明确标注对 `theme-token-unification-design` 的依赖（见问题 9） |

---

## 总结

设计架构正确——"预设注册表 + ThemeTokens 复用"的方案简洁且易于扩展。但**实施细节有 5 个关键缺口**：

1. **预设色值派生逻辑重复**（架构级——影响长期维护）
2. **Monaco 主题命名空间缺失**（阻断级——实现时无法绕过）
3. **首屏闪烁评估不足**（体验级——非 default 预设用户受影响）
4. **消费方适配细节缺失**（实现级——`applyTheme`/`useAntdTheme`/`createMonaco` 的改造未细化）
5. **模块导入顺序问题**（实现级——`tokens.ts` re-export 的初始化时序）

建议在编码前：
- 确认是否采用"工厂函数"方案（问题 1），这将决定预设文件的代码量（180 字段 vs 30 字段）
- 确定 Monaco 多主题注册方案（问题 2），这将影响 `MonacoThemeName` 类型设计
- 补充消费方改造代码示例（问题 4）
- 在文档中标注与前置设计的依赖关系（问题 9）
