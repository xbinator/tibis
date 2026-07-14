# BChat 工作流持久化内聚与分支竞态修复设计

## 背景

`src/components/BChat/index.vue` 当前将 `chatStore.setSessionMessages` 与 `chatStore.updateSessionMessage` 包装成无额外策略的回调，再传入 `useChatWorkflow`。同时，创建会话分支的异步请求完成后会无条件发送 `session-created`；如果用户在请求期间切换了会话，完成事件会把界面重新切到新分支。

## 目标

- `useChatWorkflow` 内部使用 `useChatSessionStore`，移除消息持久化回调的页面级透传。
- 保持 `useRollback`、`useChatSubmitter` 和 Runtime 错误消息写入的现有持久化行为不变。
- 分支请求完成时，仅在当前活动会话仍是请求源会话时自动切换到新分支。
- 移除 `containerRef` 的 `@ts-ignore`，并修正本次触达代码中的函数命名和返回类型规范。
- 不覆盖 `src/components/BChat/components/MessageBubble.vue` 中已有的用户改动。

## 设计

`useChatWorkflow` 在初始化时获取 `useChatSessionStore()`，并将 `chatStore.setSessionMessages` 作为持久化依赖继续传给 `appendRuntimeErrorMessage` 和 `useRollback`；`useChatSubmitter` 使用 `chatStore.updateSessionMessage`。这样只改变依赖获取位置，不改变底层 hook 的可测试接口和数据流。

`handleBranch` 在调用 Store 前捕获 `sourceSessionId`。请求成功后再次比较 `activeSessionId.value`：相同则发送 `session-created` 并沿用现有自动切换流程；不同则保留已创建分支，但不改变用户当前会话。请求错误仍通过现有 Toast 展示。

`containerRef` 由 `index.vue` 直接创建并传给 `useChatComposer`，让 DOM Ref 的所有权与模板保持在同一组件，同时避免 Volar 将 composable 解构变量误判为未使用。超过四个单词的本地函数改用更短名称，相关匿名回调补充显式返回类型。

## 测试

- 在 `test/components/BChat/session-id-runtime.test.ts` 增加回归测试：分支请求未决时切换 `sessionId`，请求成功后不得发送 `session-created`。
- 先运行新增测试确认其因无条件发送事件而失败，再实现最小修复并确认通过。
- 运行 BChat 聚焦测试、ESLint、Stylelint 和 TypeScript 类型检查。

## 错误与兼容性

不新增 IPC、Store 或持久化格式。分支创建成功但用户已切换会话时不显示错误，因为数据库操作已经成功；新分支仍可从会话历史访问。
