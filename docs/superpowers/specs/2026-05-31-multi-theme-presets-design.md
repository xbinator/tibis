# 多主题预设系统设计

> **依赖**：本设计依赖主题 Token 统一设计（`2026-05-31-theme-token-unification-design.md`）已完成 `ThemeTokens` 接口和 `src/theme/` 目录结构搭建。前置设计的 `tokens.ts` 仅包含 default 预设的 light/dark，本设计将其迁移至 `presets/default.ts`。

## 背景

当前主题系统仅支持 light/dark 两套色值，用户希望添加更多主题预设（everforest、tokyonight、ayu、catppuccin、catppuccin-macchiato、gruvbox、kanagawa、nord、matrix、one-dark），每个预设提供 light + dark 两套。

## 目标

- 支持多主题预设，每个预设包含 light/dark 两套 `ThemeTokens`
- 新增主题只需声明 ~30 个基础色 + 调用 `registerPreset()`，无需改动消费方
- `ThemeMode`（light/dark/system）保持不变，新增 `themePreset` 字段控制预设选择
- `themePreset` 和 `ThemeMode` 完全正交：`themePreset` 控制"哪套色值"，`ThemeMode` 控制"亮还是暗"。system 模式仅影响 mode 解析，不影响 preset 选择
- 首批实现 everforest + tokyonight 两个预设验证架构，其余后续追加

## 数据模型

### BasePalette 接口 — 主题基础色板

每个主题官方仓库提供约 30 个基础色，`BasePalette` 是预设作者唯一需要填写的结构：

```typescript
interface BasePalette {
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
```

### ThemePreset 接口

```typescript
interface ThemePreset {
  /** 预设 ID，如 'default'、'everforest' */
  id: string;
  /** 显示名称，如 '默认'、'Everforest' */
  label: string;
  /** 亮色 Token */
  light: ThemeTokens;
  /** 暗色 Token */
  dark: ThemeTokens;
}
```

### Setting Store 变更

```typescript
interface PersistedSettingState {
  // ... 现有字段不变
  /** 主题预设 ID，默认 'default' */
  themePreset: string;
}

const DEFAULT_SETTINGS: PersistedSettingState = {
  // ... 现有字段
  themePreset: 'default',
};
```

`ThemeMode` 保持 `'light' | 'dark' | 'system'` 不变，只控制明暗模式。`themePreset` 控制选哪套预设色值。

## 文件结构

```
src/theme/
  tokens.ts              ← ThemeTokens 接口 + SHARED（不变）
  presets/
    factory.ts           ← createThemeTokens() 工厂函数
    default.ts           ← 现有 light/dark，从 tokens.ts 迁移
    everforest.ts        ← everforest 的 BasePalette + registerPreset
    tokyonight.ts        ← tokyonight 的 BasePalette + registerPreset
    ...                  ← 后续预设
  registry.ts            ← 主题注册表 + getResolvedTokens()
  derive.ts              ← 不变
  apply.ts               ← 不变
  index.ts               ← 统一导出（先导入预设，再导出 API）
```

## 核心模块

### presets/factory.ts — 预设工厂函数

集中维护从 `BasePalette` 到 `ThemeTokens` 的派生逻辑，所有预设共享同一套派生规则：

```typescript
/**
 * 从基础色板派生出完整的 ThemeTokens。
 * 所有预设共享同一套派生规则，保证一致性。
 * @param palette - 基础色板（约 30 个色值）
 * @param mode - 明暗模式，影响透明叠加方向
 */
function createThemeTokens(palette: BasePalette, mode: 'light' | 'dark'): ThemeTokens {
  // 透明叠加辅助函数：dark 模式叠加白色，light 模式叠加黑色
  const alpha = (color: string, a: number): string => {
    // 使用项目已有的 rgb(r g b / a%) 格式
    // ...
  };

  return {
    bg: {
      primary: palette.bg0,
      secondary: palette.bg1,
      tertiary: palette.bg2,
      elevated: palette.bg3,
      hover: alpha(mode === 'dark' ? palette.fg0 : palette.fg0, 0.08),
      active: alpha(palette.fg0, 0.12),
      selected: alpha(palette.blue, 0.15),
      input: palette.bg2,
      disabled: alpha(palette.fg0, 0.04),
    },
    text: {
      primary: palette.fg0,
      secondary: palette.fg1,
      tertiary: palette.fg2,
      disabled: alpha(palette.fg0, 0.3),
    },
    border: {
      primary: palette.border,
      secondary: alpha(palette.border, 0.6),
    },
    color: {
      primary: palette.accent,
      // ... 其余字段全部由工厂函数派生
    },
    code: {
      keyword: palette.syntaxKeyword,
      string: palette.syntaxString,
      function: palette.syntaxFunction,
      number: palette.syntaxNumber,
      comment: palette.syntaxComment,
      type: palette.syntaxType,
      variable: palette.syntaxVariable,
      operator: palette.syntaxOperator,
      tag: palette.syntaxTag,
      attribute: palette.syntaxAttribute,
      // ... 其余语法色从基础色派生
    },
    // ... 其余 ~180 字段全部由工厂函数派生
  };
}
```

**收益**：
- 每个预设文件只需 ~60 行（light BasePalette + dark BasePalette + registerPreset）
- 派生规则集中维护，修改 hover 透明度等只需改 `factory.ts` 一处
- 新人添加主题只需选 30 个基础色，无需理解 180 个字段的语义

### registry.ts — 主题注册表

```typescript
/** 注册一个主题预设（幂等：同 id 覆盖，支持 HMR） */
function registerPreset(preset: ThemePreset): void;

/** 获取所有已注册预设的元信息（default 始终排首位，其余按注册顺序） */
function getPresetList(): Array<{ id: string; label: string }>;

/** 根据预设 ID + 明暗模式获取解析后的 ThemeTokens（找不到时 fallback 到 default） */
function getResolvedTokens(presetId: string, mode: 'light' | 'dark'): ThemeTokens;
```

- 内部维护 `Map<string, ThemePreset>` 注册表
- `registerPreset` 幂等：同 id 覆盖，DEV 环境输出 warning
- `getResolvedTokens` 找不到预设时 fallback 到 `default`
- 预设文件在模块顶层调用 `registerPreset()` 完成自注册

```typescript
function registerPreset(preset: ThemePreset): void {
  if (registry.has(preset.id) && import.meta.env.DEV) {
    console.warn(`[theme] Preset "${preset.id}" is being re-registered (HMR)`);
  }
  registry.set(preset.id, preset);
}
```

### presets/default.ts

将 `tokens.ts` 中现有的 `light` 和 `dark` 对象迁移至此文件。由于 default 预设已有完整的 `ThemeTokens`，不需要通过 `createThemeTokens` 派生，直接使用现有色值。

### presets/everforest.ts 示例

```typescript
import { registerPreset } from '../registry';
import { createThemeTokens } from './factory';

const everforestLight: BasePalette = {
  bg0: '#fdf6e3', bg1: '#efebd4', bg2: '#e6e0c4', bg3: '#ddd8b8', bg4: '#d5ceb0',
  fg0: '#5c6a72', fg1: '#65777e', fg2: '#7a8589',
  red: '#f85552', green: '#8da101', yellow: '#dfa000', blue: '#3a94c5',
  purple: '#df69ba', orange: '#f57d26', cyan: '#35a77c',
  syntaxComment: '#859289', syntaxKeyword: '#8da101', syntaxString: '#8da101',
  syntaxFunction: '#4db5bd', syntaxNumber: '#dfa000', syntaxType: '#df69ba',
  syntaxVariable: '#5c6a72', syntaxOperator: '#8da101', syntaxTag: '#f85552',
  syntaxAttribute: '#dfa000',
  accent: '#35a77c', border: '#d0d8ca', selectionBg: '#e0dcc0',
};

const everforestDark: BasePalette = {
  bg0: '#2b3339', bg1: '#323c41', bg2: '#3a4248', bg3: '#404850', bg4: '#4b5558',
  fg0: '#d3c6aa', fg1: '#bdaa8f', fg2: '#a69380',
  red: '#e67e80', green: '#a7c080', yellow: '#dbbc7f', blue: '#7fbbb3',
  purple: '#d699b6', orange: '#e69875', cyan: '#83c092',
  syntaxComment: '#859289', syntaxKeyword: '#a7c080', syntaxString: '#a7c080',
  syntaxFunction: '#7fbbb3', syntaxNumber: '#dbbc7f', syntaxType: '#d699b6',
  syntaxVariable: '#d3c6aa', syntaxOperator: '#a7c080', syntaxTag: '#e67e80',
  syntaxAttribute: '#dbbc7f',
  accent: '#83c092', border: '#414b55', selectionBg: '#414b55',
};

registerPreset({
  id: 'everforest',
  label: 'Everforest',
  light: createThemeTokens(everforestLight, 'light'),
  dark: createThemeTokens(everforestDark, 'dark'),
});
```

## 消费方适配

### setting.ts — applyTheme

```typescript
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

### useAntdTheme.ts

```typescript
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

### createMonaco.ts — Monaco 主题命名空间

Monaco 主题名改为 `tibis-{presetId}-{mode}`，预设注册时自动注册对应 Monaco 主题：

```typescript
/** 获取当前预设的 Monaco 主题名 */
function getMonacoThemeName(presetId: string, mode: 'light' | 'dark'): string {
  return `tibis-${presetId}-${mode}`;
}
```

`MonacoThemeName` 类型改为 `string`，调用方通过 `getMonacoThemeName()` 动态获取：

```typescript
// 使用处
const monacoTheme = getMonacoThemeName(settingStore.themePreset, resolvedTheme);
createMonacoEditor({ ..., theme: monacoTheme });
```

Monaco 主题注册与主题注册表同步：预设注册时标记待注册，等 Monaco 实例可用时再 `defineTheme`。

### useViewActive.ts — 主题菜单

菜单从「3 项（跟随系统 / 浅色 / 深色）」变为：
1. 预设选择（default / everforest / tokyonight / ...）
2. 明暗模式（跟随系统 / 浅色 / 深色）

## index.ts — 模块导入顺序

```typescript
// 1. 先导入所有预设（触发 registerPreset）
import './presets/default';
import './presets/everforest';
import './presets/tokyonight';

// 2. 再导出 light/dark（此时 registry 中已有 default，可安全取值）
export { light, dark } from './tokens';

// 3. 导出其余 API
export { getResolvedTokens, getPresetList, registerPreset } from './registry';
export { toCssVars, toAntdToken, toMonacoColors } from './derive';
export { applyCssVars, validateTokens } from './apply';
```

## 首屏防御脚本

`index.html` 内联脚本读取 `themePreset` 并注入对应的关键色值：

- **default 预设**：注入精确的关键色值（bg-primary、bg-secondary、text-primary）
- **非 default 预设**：注入安全的 fallback 色值（暗色用 #1a1a1a 背景 + #e0e0e0 文字，亮色用 #ffffff 背景 + #1a1a1a 文字），避免完全白屏

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

**已知限制**：非 default 预设在 JS 加载前会短暂显示 fallback 色值（而非预设的真实色值），JS 加载后 `applyTheme()` 会立即替换。这是可接受的——因为预设色值太多无法内联到 HTML 中。后续可通过构建时内联关键色值优化。

## 色值映射策略

每个主题官方仓库只提供 ~30 个基础色（`BasePalette`），但 `ThemeTokens` 有 ~180 个字段。映射由 `createThemeTokens()` 工厂函数集中处理：

1. **直接映射**：bg/text/border 等基础色直接对应 `BasePalette` 字段
2. **透明叠加**：hover/active/selected 等交互色通过基础色 + 透明度计算（dark 模式叠加白色，light 模式叠加黑色）
3. **代码高亮映射**：code/richEditor/sourceEditor/monaco 的语法高亮色从 `BasePalette.syntax*` 字段映射
4. **SHARED 复用**：usagePanel 等不变色继续用 SHARED

## 性能策略

v1 方案采用全量加载（所有预设文件在启动时通过 `index.ts` 导入）。10 个预设 × 2 套 ThemeTokens ≈ 108KB 字符串数据，对 Electron 桌面应用可接受。

当预设数量超过 15 时，评估引入动态导入按需加载：

```typescript
async function loadPreset(id: string): Promise<void> {
  if (registry.has(id)) return;
  await import(`./presets/${id}.ts`);
}
```

## 迁移步骤

### Phase 1：架构搭建

1. 创建 `src/theme/presets/` 目录
2. 创建 `presets/factory.ts`（`BasePalette` 接口 + `createThemeTokens()` 工厂函数）
3. 将 `tokens.ts` 中的 light/dark 迁移到 `presets/default.ts`
4. 创建 `registry.ts`（registerPreset + getPresetList + getResolvedTokens）
5. 更新 `index.ts`（先导入预设，再导出 API）
6. 适配 `setting.ts`（新增 themePreset 字段 + applyTheme 改造）
7. 适配 `useAntdTheme.ts`（从 getResolvedTokens 获取 tokens）
8. 适配 `createMonaco.ts`（Monaco 主题命名空间 + 动态注册）
9. 编写 factory + registry 测试

### Phase 2：首批预设

10. 创建 `presets/everforest.ts`（从官方仓库提取 BasePalette）
11. 创建 `presets/tokyonight.ts`（从官方仓库提取 BasePalette）
12. 适配主题选择 UI

### Phase 3：后续预设

13. 逐个添加剩余预设（ayu、catppuccin、catppuccin-macchiato、gruvbox、kanagawa、nord、matrix、one-dark）

## 向后兼容

- `themePreset` 字段默认值为 `'default'`，现有用户升级后行为不变
- `ThemeMode` 不变，所有依赖 `theme` 字段的代码无需修改
- `tokens.ts` 仍导出 `light`/`dark`（从 default 预设 re-export），保持向后兼容
- `DEFAULT_SETTINGS` 中显式声明 `themePreset: 'default'`
