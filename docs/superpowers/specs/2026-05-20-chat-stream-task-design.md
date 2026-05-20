# 2026-05-20 Chat Stream Task Design

## Summary

聊天侧边栏当前的流式生成绑定在单个渲染进程 hook 实例上，事件通过全局 IPC channel 推送，不携带会话维度。用户从会话历史切换到其他会话时，正在生成的会话无法作为后台任务稳定恢复。

本设计将 AI 流式请求提升为主进程任务。主进程按任务记录流事件并通过带 `taskId`、`sessionId`、`sequence` 的结构化事件推送给渲染进程。渲染进程切换会话时可以查询该会话的运行中任务与历史事件，重放事件恢复消息 UI，并继续订阅后续事件。

## Goals

- 允许多个会话同时后台生成。
- 保证同一个会话同一时间只运行一个聊天生成任务。
- 用户从会话历史切走后，原会话继续生成。
- 用户切回生成中的会话后，恢复实时流式输出状态。
- 避免不同会话的文本、思考、工具调用和完成事件串流。
- 第一版保持本地工具执行、确认卡片、编辑器上下文仍在渲染进程，降低迁移风险。

## Non-Goals

- 第一版不保证应用退出后流式任务继续运行。
- 第一版不把本地内置工具执行整体迁移到主进程。
- 第一版不改造聊天会话存储表结构。
- 第一版不实现并排多聊天 UI。

## Existing Behavior

`electron/main/modules/ai/ipc.mts` 中的 `ai:stream` IPC handler 直接遍历 `aiService.streamText()` 返回的流，并向窗口发送 `ai:stream:text`、`ai:stream:thinking`、`ai:stream:tool-call` 等全局事件。

`src/hooks/useChat.ts` 在每次请求内生成 `requestId`，并用本地 `currentRequestId` 过滤事件。这个过滤只能区分同一个 hook 实例内的旧请求，不能表达会话维度，也不能让另一个会话恢复已发生的事件。

`src/components/BChatSidebar/hooks/useChatStream.ts` 持有当前会话的工具续轮、待执行工具结果、用户选择题和完成回调状态。切换会话时，这些状态没有主进程任务快照可查询。

## Proposed Architecture

新增主进程 `AIStreamTaskService`，负责创建、运行、查询和中止流式任务。它不替代 `AIService.streamText()` 的模型调用能力，而是在它之上提供任务层。

```ts
interface AIStreamTask {
  taskId: string;
  sessionId: string;
  requestId: string;
  status: 'running' | 'completed' | 'failed' | 'aborted';
  events: AIStreamTaskEvent[];
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  finish?: AIStreamFinishChunk;
  error?: AIServiceError;
}
```

主进程维护两个索引：

```ts
const tasks = new Map<string, AIStreamTask>();
const runningTaskBySession = new Map<string, string>();
```

`runningTaskBySession` 用于强制同一个会话内只能有一个 `running` 任务。不同 `sessionId` 可以同时存在多个 `running` 任务。

## Event Contract

所有任务事件统一通过 `ai:stream-task:event` 发送：

```ts
interface AIStreamTaskEvent<TPayload = unknown> {
  taskId: string;
  sessionId: string;
  requestId: string;
  sequence: number;
  type:
    | 'text'
    | 'thinking'
    | 'finish'
    | 'tool-input-start'
    | 'tool-input-delta'
    | 'tool-input-end'
    | 'tool-call'
    | 'tool-result'
    | 'error'
    | 'complete'
    | 'aborted';
  payload: TPayload;
  createdAt: string;
}
```

`sequence` 在单个 task 内从 1 递增。渲染进程重放事件时按 `sequence` 排序，并记录最后消费的 sequence，避免重复追加。

## IPC API

新增 IPC：

```ts
ai:stream-task:start
ai:stream-task:abort
ai:stream-task:get
ai:stream-task:list-by-session
ai:stream-task:get-events
```

`ai:stream-task:start` 输入：

```ts
interface AIStreamTaskStartRequest {
  sessionId: string;
  createOptions: AICreateOptions;
  request: AIRequestOptions;
}
```

返回：

```ts
interface AIStreamTaskStartResult {
  taskId: string;
  requestId: string;
  status: AIStreamTask['status'];
}
```

如果同一个 `sessionId` 已有 `running` task，返回稳定错误码，例如 `SESSION_STREAM_TASK_RUNNING`。渲染进程据此保持当前会话发送按钮禁用。

`ai:stream-task:get-events` 支持从指定 sequence 之后读取：

```ts
interface AIStreamTaskEventsQuery {
  taskId: string;
  afterSequence?: number;
}
```

## Main Process Flow

1. `AIStreamTaskService.start()` 校验 `sessionId` 是否已有运行中任务。
2. 创建 `taskId` 和 `requestId`，注册 task。
3. 调用 `aiService.streamText(createOptions, requestWithRequestId)`。
4. 遍历 `result.stream`，将 SDK chunk 规范化为 `AIStreamTaskEvent`。
5. 每条事件追加到 task 的 `events`，更新 `updatedAt`，并发送给请求来源窗口。
6. `finish` 事件记录 usage 和 finishReason。
7. 流结束后追加 `complete` 事件，状态变为 `completed`，清理 `runningTaskBySession`。
8. 发生错误时追加 `error` 和 `complete`，状态变为 `failed`，清理运行索引。
9. 用户中止时追加 `aborted` 和 `complete`，状态变为 `aborted`。

主进程事件保留在内存中。为避免无限增长，已完成任务可在一段时间后清理，或保留最近固定数量。第一版可以保留当前应用生命周期内的最近任务，后续再引入持久化。

## Renderer Flow

新增或替换 `src/hooks/useChat.ts` 中的流式 transport，形成任务版能力：

```ts
interface UseChatTaskStreamOptions {
  onEvent: (event: AIStreamTaskEvent) => void;
  onError: (error: AIServiceError) => void;
}
```

渲染进程启动消息：

1. `useChatStream` 解析 provider、model、tools、MCP 配置。
2. 调用 `electronAPI.aiStreamTaskStart({ sessionId, createOptions, request })`。
3. 将 `taskId` 写入当前会话运行态。
4. 订阅 `onAiStreamTaskEvent`，按 `taskId` 和 `sessionId` 过滤事件。
5. 将事件转成现有 `appendText`、`appendThinking`、`handleAppendToolCall` 等调用。

切换会话：

1. `useSession.switchSession(sessionId)` 不再因其他会话 loading 而拒绝切换。
2. 如果内存里已有该会话消息，优先展示内存消息；否则从 `chatStore.getSessionMessages(sessionId)` 加载。
3. 调用 `aiStreamTaskListBySession(sessionId)` 查询运行中任务。
4. 对运行中 task 调用 `get-events`，重放未消费事件。
5. UI 继续通过全局任务事件订阅接收后续事件。

同一会话内发送新消息时，如果该会话已有 running task，发送按钮禁用并提示正在生成。

## Tool Calls And Continuation

第一版保留现有前端工具执行逻辑。模型发出 `tool-call` 后：

1. 主进程记录并转发 `tool-call` 事件。
2. 渲染进程对应 session runtime 执行本地工具。
3. 工具结果写回 assistant 消息。
4. 如果需要续轮，渲染进程基于更新后的消息列表启动新的主进程 stream task。

这意味着一个用户问题可能由多个连续 task 组成，但同一会话仍保持串行。每次续轮 task 都归属相同 `sessionId`，渲染进程用消息状态和工具循环保护来控制是否继续。

SDK 管理的 Tavily/MCP 工具仍在主进程内部执行，主进程会记录并转发 `tool-result` 事件，渲染进程只负责展示。

## Session History UI

`SessionHistory.vue` 不再因为当前会话生成中整体禁用切换。禁用范围改为：

- 删除运行中会话时需要确认或禁止删除。
- 当前会话运行中时，当前会话内发送按钮显示停止。
- 历史列表中运行中的会话显示轻量状态，例如 loading 图标。

历史列表点击其他会话应立即切换。切回运行中会话后，消息列表显示正在生成的 assistant 气泡。

## Error Handling

- 主进程启动任务失败：返回稳定错误，渲染进程展示 toast，不创建 assistant 占位。
- 流中错误：主进程发送 `error` 事件并标记 task `failed`；渲染进程将错误合并到当前 assistant 消息。
- 渲染进程错过事件：切回时通过 `get-events` 补齐。
- 重复事件：渲染进程按 `taskId + sequence` 去重。
- 同会话并发启动：主进程拒绝第二个任务，渲染进程保持会话串行。
- Abort：按 `taskId` 中止，避免误杀其他会话任务。

## Testing

单元测试：

- `AIStreamTaskService` 能为不同 session 并发创建任务。
- 同一 session 已有 running task 时拒绝第二个 start。
- 事件 sequence 单调递增。
- abort 只影响指定 task。
- 错误流会生成 `error` 和 `complete` 事件并清理运行索引。

渲染层测试：

- `useChatStream` 能按 task event 恢复文本、思考、工具输入、工具调用、工具结果和完成状态。
- 切换到另一个会话不 abort 原会话 task。
- 切回运行中会话会重放历史事件并继续接收新事件。
- 同会话 running 时发送按钮禁用，不影响其他会话发送。

集成测试：

- A 会话生成中切到 B，B 可发送并生成。
- A、B 同时流式输出时，消息不会串到对方会话。
- A 后台完成后切回，最终 assistant 消息已完成并可持久化。

## Rollout Plan

1. 添加任务事件类型和 Electron API 类型。
2. 新增主进程 `AIStreamTaskService`，保留旧 `ai:stream` IPC 以兼容编辑器选区 AI 等调用方。
3. 新增 preload 暴露的 task API 和事件订阅 API。
4. 新增渲染进程 task stream transport。
5. 改造 `BChatSidebar` 的会话切换和流式 hook，使其使用 task API。
6. 为 SessionHistory 增加运行中状态展示，并放开跨会话切换。
7. 补充测试。
8. 验证旧 `ai:stream` 调用方仍可工作。

## Open Decisions Resolved

- 跨会话允许并发生成。
- 同一会话只允许一个运行中聊天任务。
- 第一版使用主进程内存任务，不做跨应用重启恢复。
- 第一版保留前端本地工具执行，不把所有工具迁移到主进程。
