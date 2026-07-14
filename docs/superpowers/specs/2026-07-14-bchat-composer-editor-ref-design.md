# BChat Composer 编辑器引用收口设计

## 背景

`src/components/BChat/index.vue` 当前将 `promptEditorRef` 的五个方法包装成 `editor` 对象后传给 `useChatComposer`。这些回调没有页面级策略，只是重复执行可选链调用，导致入口组件暴露不必要的编辑器实现细节。

## 目标

- `useChatComposer` 直接接收 `promptEditorRef`，移除入口组件的 `editor` 回调对象。
- `focusInput` 由 `useChatComposer` 返回并供会话生命周期、工作流与组件暴露接口复用。
- 将斜杠命令的 `clearInput` 纯转发改为直接传递 `inputEvents.clear`。
- 不扩大到需要延迟取值、事件映射或 UI 副作用的其他回调。
- 不修改 `src/components/BChat/components/MessageBubble.vue` 中已有用户改动，不执行 Git 提交。

## 方案

`UseChatComposerOptions` 新增 `promptEditorRef: Ref<InstanceType<typeof BTextEditor> | undefined>`，删除 `editor` 对象。`useChatComposer` 内部通过具名函数访问最新组件实例，并继续把最小编辑能力传给 `useFileReference` 与 `useVoiceInput`。

`src/components/BChat/index.vue` 保留 `promptEditorRef` 的所有权，因为它直接绑定模板 `ref`。入口调用 `useChatComposer` 时只传 `promptEditorRef`，再从返回值解构 `focusInput`。这既消除页面级样板代码，也避免让底层 hook 依赖完整 Vue 组件实例。

`useSlashCommands` 的 `clearInput` 已经接受无参数函数，`inputEvents.clear` 与所需签名一致，因此直接传递；`openUsagePanel`、`isBusy`、会话事件和 Runtime 回调仍保留，因为它们承担当前值读取、形状转换或外部副作用。

## 测试

- 增加 `useChatComposer` 单元测试，以组件实例 Ref 调用 `focusInput`，验证新依赖接口和可选实例行为。
- 先确认测试因当前接口仍要求 `editor` 而失败，再实现最小改动并确认通过。
- 运行 BChat 会话运行时测试、ESLint、Stylelint、TypeScript 类型检查及完整测试套件。

## 兼容性

不改变编辑器交互行为、草稿状态、语音输入或文件引用数据流。编辑器尚未挂载时，所有编辑操作继续安全地无操作，读取光标位置继续返回 `0`。
