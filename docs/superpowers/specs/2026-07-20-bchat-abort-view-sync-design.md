# BChat 中止消息即时同步设计

## 背景

`src/components/BChat/index.vue` 通过 `useChatWorkflow` 中止主进程 Chat Runtime。主进程会先删除空的 assistant 草稿，或完成已有部分输出的 assistant 消息，再持久化一条 `interrupt` 消息并广播对应消息事件。

renderer 当前依赖 Runtime 消息事件更新可见消息列表，同时在中止 IPC 返回后立即注销 Runtime 路由。Electron 的事件广播与 IPC 响应存在调度时序差异：如果中止产生的消息事件晚于路由注销到达，`useRuntimeEvents` 会把事件判定为未接管 Runtime 并忽略。数据库已经包含 `interrupt` 消息，因此刷新页面后才会展示“已中断”。

## 目标

- 用户主动中止后，当前会话立即展示主进程已经持久化的最终消息状态。
- 模型尚无输出时，移除空 assistant 草稿并展示单独的“已中断”状态。
- 模型已有部分输出时，保留并完成 assistant 消息，再在其后展示“已中断”状态。
- 保留 Runtime 消息事件，用于后台会话、多窗口和正常流式更新。
- 不依赖固定延时，不通过重新加载整页或重置分页历史修复竞态。

## 设计

### 中止结果

在 `types/chat-runtime.d.ts` 增加结构化的中止结果。结果包含本次中止实际产生的消息变更：

- 被删除的空 assistant 消息 ID；
- 已完成的部分输出 assistant 消息；
- 新建的 `interrupt` 消息。

字段按实际分支可选。Runtime 已经不存在时返回空结果，保持重复中止的幂等行为。

### 主进程收口

`electron/main/modules/chat/runtime/service.mts` 继续作为中止消息状态的唯一写入方。现有删除、更新、创建和事件广播顺序保持不变；`abort` 在所有持久化操作完成后返回同一批最终消息变更。

这样 IPC 成功结果代表数据库写入已经收敛，renderer 不需要推测消息 ID，也不会自行创建可能重复的 `interrupt` 消息。

### Renderer 同步

`src/components/BChat/hooks/useChatRuntime.ts` 返回主进程的结构化中止结果。`src/components/BChat/hooks/useChatWorkflow.ts` 在中止 IPC 成功后，按消息 ID 将结果同步到当前响应式消息列表：

1. 删除空 assistant 草稿；
2. 合并已完成的 assistant 消息；
3. 合并 `interrupt` 消息；
4. 滚动到最新状态；
5. 最后完成 Session 状态迁移并注销 Runtime 路由。

正常 Runtime 消息事件可能先于 IPC 结果到达。消息合并以 ID 为键，因此事件与中止结果重复到达时仍只保留一份消息；删除操作同样保持幂等。

如果用户在中止期间切换会话，只持久化主进程结果，不把原会话消息写入新会话的可见列表。原会话再次打开时从数据库读取最终状态。

## 错误处理

- 中止 IPC 失败时不应用结果，沿用现有 `cancelFailed` 状态和错误传播。
- 消息持久化仍由主进程完成；renderer 同步不再执行额外数据库写入。
- 不改变等待用户选择场景的 renderer 取消逻辑，该分支继续使用现有消息克隆、持久化和可见列表更新流程。

## 测试

- 主进程服务测试验证零输出中止结果包含删除 ID 和 `interrupt` 消息。
- 主进程服务测试验证部分输出中止结果包含完成后的 assistant 消息和 `interrupt` 消息。
- BChat 组件回归测试模拟消息事件未及时到达，验证中止 IPC 结果仍会立即更新可见消息。
- BChat 组件回归测试覆盖部分输出保留，并验证重复事件不会创建重复的“已中断”。
- 运行相关 Vitest、ESLint、Stylelint 和 TypeScript 类型检查。

## 非目标

- 不修改中止状态的视觉样式。
- 不改变 Runtime 正常完成、失败或等待确认的消息协议。
- 不使用定时器延长 Runtime 路由生命周期。
