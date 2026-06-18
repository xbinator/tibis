# 2026-06-18 Main Process Chat Context Runtime Design

## Summary

重构 BChat 的上下文估算、压缩和工具执行体系，把当前由 renderer 侧 `useChatStream`、`useCompactContext`、`useContextUsage` 分散编排的逻辑，收敛为 Electron main process 中的完整 `ChatRuntime`。

新 runtime 拥有一次 chat turn 的完整 agent loop：会话消息持久化、模型消息组装、上下文预算估算、手动 `/compact`、自动压缩、overflow replay、工具执行、权限确认、prune 和事件推送。Renderer 负责输入、展示、确认 UI，以及提供 editor/drawing/webview 的快照和必要 RPC。

第一期目标是单 agent、同一 session 单 active writing runtime；类型、事件和锁按多 chat / 多 agent 预留。

## Goals

- 让上下文估算和压缩决策使用同一套预算模型，避免 UI、自动压缩和压缩规划各算各的。
- 让 `/compact`、自动压缩、provider overflow 都走同一条 compaction create/process 流程。
- 将工具执行搬到 main process，renderer 只通过受控 bridge 提供 UI 状态和确认交互。
- 用消息流自身表达 compaction marker 和 summary，不再依赖旧的 `role: 'compression'` 边界消息和外部 compression record 作为新增路径。
- 支持 provider usage、估算 usage、媒体降级和 tool output prune 的清晰分层。
- 让 runtime 事件按 `runtimeId`、`sessionId`、`clientId` 路由，为多 chat / 多 agent 做结构预留。

## Non-Goals

- 第一期不实现完整多 agent UI 或多 agent 调度器。
- 第一期不要求一次性批量迁移所有历史 compression records。
- 第一期不追求 provider 真实 tokenizer 完全一致；真实触发优先使用 provider usage，规划和 UI 使用便宜估算。
- 第一期不把 renderer 的 editor/drawing/webview 状态复制成 main process 的长期 authoritative state。

## Architecture

新增 main process runtime 层：

- `ChatRuntimeService`：拥有 send、compact、abort、submit confirmation、submit user choice 的 agent loop。
- `ContextBudgetService`：计算 usable input、reserved output、threshold、状态等级和 UI 快照。
- `ContextEstimator`：基于实际 `ModelMessage[]` 组装路径做序列化估算。
- `CompactionService`：创建和处理 compaction marker，选择 head/tail，生成 anchor summary，处理 manual/auto/overflow。
- `ToolRuntimeService`：在 main process 执行工具，管理 tool-call、tool-result、续轮。
- `RendererContextBridge`：混合桥接 editor/drawing/webview 快照、实时 RPC、确认和用户选择。
- `ChatRepository`：封装 chat session、message、summary、usage、runtime state 的事务持久化。

Renderer 侧替换为更薄的 `useChatRuntime`：

- 调用 `chat:runtime:send`、`chat:runtime:compact`、`chat:runtime:abort`。
- 订阅 runtime 事件并更新本地响应式消息列表。
- 展示 `ContextUsage`，其数据来自 main process 的 `context-usage-updated` 事件。
- 展示 confirmation 和 user choice UI，并把结果提交回 runtime。
- 提供 `clientId` 作用域内的 editor/drawing/webview snapshot 和 RPC handler。

## IPC Contract

Renderer -> main:

- `chat:runtime:send`
- `chat:runtime:compact`
- `chat:runtime:abort`
- `chat:runtime:submit-confirmation`
- `chat:runtime:submit-user-choice`
- `chat:runtime:bridge-response`

Main -> renderer:

- `chat:runtime:message-created`
- `chat:runtime:message-updated`
- `chat:runtime:stream-text`
- `chat:runtime:tool-call`
- `chat:runtime:tool-result`
- `chat:runtime:confirmation-requested`
- `chat:runtime:user-choice-requested`
- `chat:runtime:bridge-requested`
- `chat:runtime:context-usage-updated`
- `chat:runtime:compaction-started`
- `chat:runtime:compaction-ended`
- `chat:runtime:error`
- `chat:runtime:complete`

所有事件必须包含：

- `runtimeId`
- `sessionId`
- `clientId`
- `agentId`

与工具相关的事件还必须包含 `toolCallId`。与子 runtime 相关的事件预留 `parentRuntimeId`。

## Data Model

废弃新增路径中的 `role: 'compression'`。压缩不再是一种独立 message role，而是普通会话消息中的特殊 part/meta。

`ChatMessageRole` 第一期保留兼容读取旧值，但新 runtime 不再写入 `compression`。

新增 part：

```ts
interface ChatMessageCompactionPart {
  type: 'compaction';
  auto: boolean;
  reason: 'manual' | 'auto' | 'overflow';
  status: 'pending' | 'success' | 'failed' | 'cancelled';
  tailStartMessageId?: string;
  errorMessage?: string;
}
```

调整 message record：

```ts
interface ChatMessageRecord {
  id: string;
  sessionId: string;
  role: ChatMessageRole;
  content: string;
  parts: ChatMessagePart[];
  usage?: AIUsage;
  summary?: boolean;
  agentId?: string;
  runtimeId?: string;
  parentRuntimeId?: string;
  meta?: ChatMessageMeta;
  createdAt: string;
}

interface ChatMessageMeta {
  compaction?: {
    anchorSummary?: string;
    previousSummaryMessageId?: string;
    hiddenMessageIds?: string[];
    recentModelMessagesJson?: string;
  };
  contextUsage?: ContextUsageSnapshot;
}
```

SQLite changes:

- `chat_messages.summary INTEGER`
- `chat_messages.meta_json TEXT`
- `chat_messages.agent_id TEXT`
- `chat_messages.runtime_id TEXT`
- `chat_messages.parent_runtime_id TEXT`

`compression_json` 停止写入。`chat_session_compression_records` 停止新增。

新的 completed compaction 由消息流推导：

- 一条包含 `compaction` part 的 user message 表示压缩触发器。
- 后续成功的 `assistant` summary message 保存 anchor summary，并设置 `summary = true`。
- `compaction.tailStartMessageId` 记录 tail 起点。

## Runtime Flow

### Send

1. Renderer 调用 `chat:runtime:send`，传入用户输入、附件、`clientId`、`agentId` 和当前 UI snapshot。
2. Main 创建 `runtimeId`，获取同 session writing lock。
3. Main 创建或更新 session，持久化 user message。
4. `ContextBudgetService` 基于当前消息和模型生成 snapshot，并推送 `context-usage-updated`。
5. 若发送前估算超过阈值，插入 auto compaction marker，先执行 compaction。
6. Main 组装实际 `ModelMessage[]`，调用 `AIService.streamText`。
7. Main 创建 assistant draft message，流式更新并推送 message events。
8. Tool calls 由 `ToolRuntimeService` 执行，结果写回 assistant parts，必要时继续下一轮模型调用。
9. Finish 后保存 provider usage，更新 session usage，并根据 provider usage 判断是否需要后置 auto compaction。
10. 成功普通 turn 后后台执行 prune。

### Manual `/compact`

1. Renderer 调用 `chat:runtime:compact(sessionId)`。
2. Main 插入 user compaction marker：`auto = false`、`reason = 'manual'`。
3. 进入同一个 `CompactionService.process`。
4. 成功后生成 assistant summary message。
5. 手动压缩默认不自动发送 “continue”。
6. 如果最新 compaction 后没有新增真实 user/assistant turn，返回无需压缩提示。

### Auto Compaction

自动压缩只改变入口原因：

- `auto = true`
- `reason = 'auto'`

处理流程与手动压缩一致。自动压缩完成后可以按 runtime 决策继续当前 agent loop。

### Overflow Replay

1. Provider 返回 413 或 context overflow 错误。
2. Main 插入 `reason = 'overflow'` 的 compaction marker。
3. `CompactionService` 从失败 turn 往前找上一条真实 user message 作为 replay 候选。
4. 压缩成功后复制 replay user message。
5. replay 中媒体附件降级为文本占位，例如 `[Attached image/png: file.png]`。
6. Runtime 继续 agent loop。

如果 compaction model 自己也 overflow，runtime 写入错误 summary 并停止自动恢复。

## Context Budget Policy

使用两层估算：

- Provider usage：用于高风险触发判断。优先使用最近 assistant turn 的 `usage.totalTokens`，否则使用 input + output。
- Heuristic estimate：用于 UI、发送前预判、head/tail 规划。基于真实 `ModelMessage[]` 组装路径和序列化 payload。

预算字段：

- `contextWindow`：当前模型上下文窗口。缺失或为 `0` 时不自动压缩。
- `maxOutputTokens`：优先来自模型配置或用户设置；缺失时使用保守默认值。
- `reservedOutputTokens`：给普通回复和压缩器回复预留。
- `compactionBufferTokens`：默认 `20_000`，小上下文模型按比例降级。
- `usableInputTokens`：可被历史和当前输入占用的预算。

触发规则：

- 发送前：`estimatedInputTokens >= usableInputTokens * 0.85` 时先 auto compact。
- 完成后：`providerUsageTokens >= usableInputTokens` 时 auto compact。
- 异常时：provider 413 / context overflow 立即 overflow compaction + replay。
- 手动：`/compact` 永远允许请求；无新增内容时返回无需压缩。

## Compaction Policy

Tail 策略：

- 默认保留最近 `2` 个 user turn。
- Tail budget 默认 `clamp(usableInputTokens * 0.25, 2_000, 8_000)`。
- 从新到旧贪心保留完整 turn。
- 第一个放不下的 turn 尝试 split。
- 更旧内容全部进入 head，由 summary 覆盖。
- Compaction marker 不算真实 user turn。

Summary 生成：

- 若已有 anchor summary，压缩器收到“更新摘要”指令。
- 若没有 anchor summary，压缩器收到“创建摘要”指令。
- Summary assistant message 设置 `summary = true`，并记录 `agentId`。
- 旧 summary 与产生它的 compaction marker 在下一次 select 时隐藏，避免重复摘要。

媒体处理：

- UI/发送前估算看实际发送 payload。
- Compaction head 视角剥离媒体，替换为占位文本。
- Overflow replay 剥离媒体，避免再次撞同一类 overflow。
- 文本文件和文本型 SVG 按文本处理。

Prune：

- 成功 turn 后后台执行。
- 保护最近至少 `2` 个 user turn。
- 保护最近约 `40_000` token 等价的 tool output。
- 旧 tool output body 可软删，但保留 part 结构、tool name、状态和摘要。
- `skill`、confirmation、awaiting user input 相关结果不 prune。

## Tool Runtime And Renderer Bridge

工具执行迁移到 main process。

工具分三类：

- 纯 main process 工具：文件读写、shell、settings、logs、memory、MCP、skill、时间、目录读取。
- 需要 renderer snapshot 的工具：读取当前文档、读取当前 drawing、读取当前 webpage。
- 必须 renderer RPC 的工具：替换选区、替换文档、打开草稿、打开文件标签、打开 webview、drawing 写操作、确认弹窗、用户选择题。

`RendererContextBridge` 使用混合模式：

- 发送或手动压缩前，renderer 上报基础 snapshot。
- 工具执行前如需最新状态，main 按需发 `bridge-requested`。
- 写操作一律通过 RPC 到 renderer 执行。
- Confirmation 和 user choice 也通过 bridge 等待用户响应。

可靠性规则：

- 每个 bridge request 都有 timeout。
- Renderer 断开、client mismatch、session 切换时，pending tool 失败为 `EDITOR_UNAVAILABLE` 或 `CONFIRMATION_DISMISSED`。
- `abort(runtimeId)` 取消模型流、工具执行、确认等待和 bridge 请求。
- Bridge request 必须包含 `runtimeId`、`sessionId`、`clientId`、`toolCallId`。

## Concurrency And Multi-Agent Readiness

第一期只实现单 agent、同一 session 单 active writing runtime。

类型和事件预留：

- `runtimeId`
- `sessionId`
- `clientId`
- `agentId`
- `parentRuntimeId`
- `message.agentId`
- `message.runtimeId`

并发规则：

- 同一 `sessionId` 默认只允许一个 writing runtime。
- 不同 session 可以并行运行。
- 同一 session 未来可开放 read-only/subagent runtime，但写入必须通过 orchestrator 串行合并。
- `abort(runtimeId)` 只取消指定 runtime。
- Confirmation、user choice、renderer bridge request 都绑定 `runtimeId + clientId`。
- Context usage snapshot 按 runtime/session 发布。

未来多 agent 可在 `ChatRuntimeService` 上方增加调度层，使用 `parentRuntimeId` 关联 child runtime。

## Migration

数据库迁移：

- 新增 `summary`、`meta_json`、`agent_id`、`runtime_id`、`parent_runtime_id`。
- 保留旧 `compression_json` 字段但停止写入。
- 保留 `chat_session_compression_records` 表但停止新增。

旧数据读取：

- 旧 `role = 'compression'` 消息首次加载时按 legacy summary 处理。
- 若 `compression.recordText` 存在，映射成 `summary = true` 的 assistant summary 参与后续上下文。
- 旧消息仍可展示为历史压缩摘要。
- 不做启动时全量迁移，避免大批量改库。

代码迁移：

- `useChatStream`、`useCompactContext`、`useContextUsage` 由 `useChatRuntime` 替代。
- `ContextUsage.vue` 只消费 main process snapshot。
- 旧 `chatCompression*` IPC 标记 deprecated，第一期保留读取兼容，新增路径不再使用。

## Error Handling

- Compaction model overflow：写入 assistant error summary，提示会话过大，停止自动恢复。
- Replay 附件过大：媒体降级为占位文本。
- Bridge timeout：工具结果写 failure，runtime 继续或由模型解释失败。
- Renderer 断开：runtime abort，或降级为无 UI context。
- 确认取消：工具结果为 cancelled。
- User choice 取消：工具结果为 cancelled 或 awaiting flow 终止。
- Prune 失败：记录日志，不阻断当前 turn。
- Usage 缺失：不做 provider usage 后置触发，只保留发送前估算和手动压缩。

## Testing

Unit tests:

- `ContextBudgetService`：usable input、reserved、threshold、provider usage 优先级。
- `ContextEstimator`：基于 `convert.toModelMessages` 的序列化估算，覆盖图片和附件。
- `CompactionService`：head/tail、split turn、completed compactions、manual/auto/overflow。
- `ToolRuntimeService`：纯 main 工具、renderer bridge 工具、确认、取消。
- `RendererContextBridge`：timeout、client mismatch、confirmation roundtrip。

Integration tests:

- `ChatRuntimeService`：send loop、tool loop、usage 更新、abort、overflow replay。
- 数据库 migration：旧 compression 消息按需转换，新字段持久化。
- Runtime event routing：多个 session 并行时事件不串流。

UI smoke tests:

- `ContextUsage` 展示 runtime snapshot。
- `/compact` 触发 main process compaction events。
- ConfirmationSheet 通过 runtime bridge 完成确认。

## Implementation Phases

1. 类型、SQLite migration、repository mapper 和 legacy compression 读取兼容。
2. Main process `ContextBudgetService`、`ContextEstimator`、runtime event contract。
3. Main process `ChatRuntimeService` 基础 send loop，renderer 接入 `useChatRuntime`。
4. `ToolRuntimeService` 和 `RendererContextBridge`，搬迁工具执行。
5. `CompactionService` 接管 `/compact`、自动压缩和 summary message。
6. Provider overflow replay 和 media downgrade。
7. Tool output prune。
8. 删除 renderer 旧编排路径，旧 `chatCompression*` IPC 标记 deprecated。

## Acceptance Criteria

- `/compact`、自动压缩、overflow replay 使用同一套 compaction marker + summary 流程。
- `ContextUsage` 的用量来自 main process runtime snapshot。
- 工具执行不再由 `useChatStream` 在 renderer 本地编排。
- 同一 session 同时只能有一个 writing runtime，不同 session 可并行。
- 旧 compression 消息可读，且不阻断新 runtime 的上下文组装。
- 主进程 runtime 的核心路径有单元和集成测试覆盖。
