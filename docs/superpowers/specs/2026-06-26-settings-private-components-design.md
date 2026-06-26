# Settings 私有布局组件迁移设计

## 背景

`src/components/BSettingsPage/index.vue` 和 `src/components/BSettingsSection/index.vue` 目前作为全局 B 组件注册，但实际使用集中在 `src/views/settings/**`。这说明它们更像设置模块内部的布局组件，而不是跨业务域复用的基础组件。

迁移目标是收窄组件作用域，并同步清理命名，让设置页私有组件和全局组件体系边界更清晰。

## 目标

- 将设置页布局组件迁移到 `src/views/settings/_components`。
- 组件名改为 `SettingsPage` 和 `SettingsSection`。
- 样式类名改为 `.settings-page` 和 `.settings-section`，并保留原有 BEM element 语义。
- 移除这两个组件的全局自动注册配置。
- 更新 settings 视图和测试中的引用，避免运行时依赖旧的 `BSettingsPage` / `BSettingsSection`。

## 非目标

- 不调整设置页视觉样式、间距、交互和 slot API。
- 不迁移其他 B 组件或设置页业务组件。
- 不重构 settings 路由、store 或数据流。

## 方案

采用最小迁移方案：文件位置和组件标签一起改，组件内部结构保持一致。

新文件结构：

- `src/views/settings/_components/SettingsPage.vue`
- `src/views/settings/_components/SettingsSection.vue`

旧文件移除：

- `src/components/BSettingsPage/index.vue`
- `src/components/BSettingsSection/index.vue`

组件命名：

- 模板标签使用 `<SettingsPage>` 和 `<SettingsSection>`。
- 组件内部使用 `defineOptions({ name: 'SettingsPage' })` 和 `defineOptions({ name: 'SettingsSection' })` 明确 DevTools 名称。
- BEM 类名使用 `settings-page` / `settings-section` 前缀，保留 `__header`、`__body`、`__extra`、`__content` 等 element 名称。

导入方式：

- 所有 `src/views/settings/**` 使用局部 import 引入 `_components` 下的组件。
- 不将 `_components` 加入 `unplugin-vue-components` 自动扫描，避免私有组件再次变成隐式全局组件。
- 从 `vite.config.ts` 的 `COMPONENT_DIRS` 移除 `BSettingsPage` 和 `BSettingsSection`。

## 影响范围

需要更新的运行时代码包括：

- `src/views/settings/basic/index.vue`
- `src/views/settings/service-model/index.vue`
- `src/views/settings/service-model/components/ServiceConfig.vue`
- `src/views/settings/speech/index.vue`
- `src/views/settings/logger/index.vue`
- `src/views/settings/tools/search/index.vue`
- `src/views/settings/tools/mcp/index.vue`
- `src/views/settings/tools/memory/index.vue`
- `src/views/settings/tools/skill/index.vue`
- `src/views/settings/tools/skill/detail.vue`

需要更新的测试包括：

- `test/views/settings/basic/index.test.ts`
- `test/views/settings/tools/memory/index.test.ts`
- `test/views/settings/service-model/service-config.test.ts`

同时需要全局搜索并替换旧类名引用：

- `.b-settings-page` -> `.settings-page`
- `.b-settings-section` -> `.settings-section`

## 测试策略

迁移完成后运行：

- `pnpm exec eslint src --ext .vue,.ts,.tsx,.js,.jsx`
- `pnpm exec stylelint 'src/**/*.{vue,less,css}'`
- `pnpm exec tsc --noEmit`
- settings 相关单测，优先覆盖 basic、memory、service-model。

如果完整检查受现有未提交改动影响，需要单独记录失败来源，并至少跑受迁移影响的定向测试。

## 迁移风险

- 全局自动导入移除后，遗漏局部 import 会导致模板组件解析失败。
- deep 选择器仍指向旧 `.b-settings-page__body` 或 `.b-settings-section` 会导致局部样式失效。
- 测试 stub 继续使用旧组件名会让测试与真实模板脱节。

这些风险都可以通过全局搜索旧名称和运行类型检查、单测来发现。
