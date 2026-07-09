# Widget 运行代码当前页编辑器设计

## 背景

`src/views/widget/components/PageSetter.vue` 原来在右侧设置面板中通过 `src/views/widget/components/PageSetter/MethodEditor.vue` 弹窗编辑运行代码。现在保留在 `src/views/widget/index.vue` 当前页面内编辑，避免新增 `/widget/:id/code` 路由和独立标签页带来的状态同步复杂度。

## 目标

- `PageSetter` 的运行代码编辑按钮向上触发编辑请求，不再打开弹窗。
- `src/views/widget/index.vue` 在当前页面内通过覆盖层展示 `src/views/widget/components/CodeEditor.vue`。
- `src/views/widget/components/CodeEditor.vue` 顶部提供“运行代码”标题和关闭按钮。
- 编辑期间通过 `v-model:value` 双向绑定实时写回 `WidgetData.execute`，关闭按钮只收起覆盖层。
- 继续复用现有 Monaco 编辑器和 Widget 脚本类型提示能力。

## 非目标

- 不新增 `/widget/:id/code` 路由。
- 不新增独立 tab 或独立 KeepAlive cache key。
- 不改运行代码运行时协议。
- 不改 input schema 编辑体验。

## 页面拆分

`src/views/widget/components/PageSetter.vue`：

- 移除 `MethodEditor` 弹窗状态和确认回调。
- 运行代码“编辑”按钮只 emit `edit-code`。
- 保留运行代码摘要预览和高亮逻辑。

`src/views/widget/components/PanelSettings.vue`：

- 接收 `PageSetter` 的 `edit-code`，继续转发给 `src/views/widget/index.vue`。

`src/views/widget/index.vue`：

- 用 `isCodeEditorOpen` 控制代码编辑覆盖层是否可见，设计器组件始终保持挂载。
- 收到 `edit-code` 后显示 `CodeEditor` 覆盖层。
- 通过 `v-model:value` 接收 `CodeEditor` 的实时数据更新。
- 收到 `close` 后只收起覆盖层。

`src/views/widget/components/CodeEditor.vue`：

- 使用 `v-model:value` 接收并更新当前 `WidgetData`。
- 接收 `active` 标识，在覆盖层打开时重置本地草稿。
- 从 `value.execute` 读取初始脚本，维护 `scriptCodeDraft` 本地草稿。
- 用草稿内容驱动 `buildWidgetStateSchema` 和 `createWidgetMethodScriptTypes`。
- 顶部渲染“运行代码”标题和关闭按钮。
- 不直接使用 `useFileSession`，不直接写最近文件，不直接保存磁盘。

## 数据流

编辑入口由 `PageSetter -> PanelSettings -> WidgetPage` 逐层传递。进入代码编辑器时，`WidgetPage` 显示覆盖层，`CodeEditor` 从当前 widget 数据读取脚本并初始化本地草稿。

用户修改代码时，`CodeEditor` 更新本地草稿和类型提示，同时通过 `update:value` emit 标准化后的 `WidgetData`。`WidgetPage` 通过 `v-model:value` 写回当前文件会话；随后 `useFileSession` 的原有 deep watch 将业务数据序列化到 `.tibis` 内容，并沿用现有 dirty 和自动保存链路。点击关闭按钮时只收起覆盖层，不改变数据。

## 保存行为

`useFileSession` 在保存前会主动把最新 `data.value` 序列化到 `fileState.content`。这样即使用户修改脚本后立刻触发保存，也会保存最新脚本内容，而不是等待 watcher 下一轮刷新。

## 错误处理

- 脚本配置缺失或格式不完整时，通过 `readWidgetExecuteMethod` 补齐默认 `enabled`、`description` 和默认代码。
- 脚本为空字符串时，通过双向绑定按用户输入实时写回空字符串。
- 类型提示生成失败时不阻断 Monaco 基础编辑能力。

## 测试

- 路由测试：确认不注册 `widget-code` 路由。
- PageSetter 测试：点击运行代码编辑按钮会 emit `edit-code`，不再渲染脚本编辑弹窗。
- WidgetPage 测试：收到 `edit-code` 后显示 `CodeEditor` 覆盖层，同时保留设计页组件；`update:value` 实时同步数据；`close` 收起覆盖层。
- 代码编辑器测试：加载当前脚本、渲染“运行代码 / 关闭”、生成 input/state 类型提示、编辑时通过 `update:value` 同步数据，并在重新激活时同步最新模型数据。
- 文件会话测试：业务数据变化会同步到 `.tibis` 内容；保存前会同步最新业务数据。

## 验收标准

- 从 widget 设置面板点击运行代码“编辑”后，当前页面显示代码编辑覆盖层。
- 顶部显示“运行代码”标题和关闭按钮。
- 修改脚本后，设计页摘要和原有 dirty/save 链路跟随 `v-model:value` 实时更新。
- 点击关闭按钮只收起覆盖层，不额外修改数据。
- 相关单元测试、ESLint、Stylelint、TypeScript 检查通过。
