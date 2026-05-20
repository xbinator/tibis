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
- 第一版不支持多个窗口共享同一个流式任务状态；任务事件只面向创建任务的窗口。
- 第一版不处理主进程内存耗尽导致的任务丢失恢复。

## Existing Behavior

`electron/main/modules/ai/ipc.mts` 中的 `ai:stream` IPC handler 直接遍历 `aiService.streamText()` 返回的流，并向窗口发送 `ai:stream:text`、`ai:stream:thinking`、`ai:stream:tool-call` 等全局事件。

`src/hooks/useChat.ts` 在每次请求内生成 `requestId`，并用本地 `currentRequestId` 过滤事件。这个过滤只能区分同一个 hook 实例内的旧请求，不能表达会话维度，也不能让另一个会话恢复已发生的事件。

`src/components/BChatSidebar/hooks/useChatStream.ts` 持有当前会话的工具续轮、待执行工具结果、用户选择题和完成回调状态。切换会话时，这些状态没有主进程任务快照可查询。

## Proposed Architecture

新增主进程 `AIStreamTaskService`，负责创建、运行、查询和中止流式任务。它不替代 `AIService.streamText()` 的模型调用能力，而是在它之上提供任务层。

```ts
interface AIStreamTask {
  taskId: string;
  /** 同一次用户发送动作及其工具续轮共享同一个 turnId，便于日志追踪。 */
  turnId: string;
  /** 工具续轮产生的新任务指向上一轮任务；首轮任务为空。 */
  parentTaskId?: string;
  sessionId: string;
  /** requestId 同时写入 task 与 event，便于日志和 IPC 排查时不必反查 task。 */
  requestId: string;
  status: 'running' | 'completed' | 'failed' | 'aborted';
  events: AIStreamTaskEvent[];
  /** ISO 8601 UTC 时间字符串。 */
  startedAt: string;
  /** ISO 8601 UTC 时间字符串。 */
  updatedAt: string;
  /** ISO 8601 UTC 时间字符串。 */
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

任务状态机只允许从 `running` 进入终态：

```text
running -> completed
running -> failed
running -> aborted
```

`completed`、`failed`、`aborted` 都是终态，不能再互相转换。主进程实现应在状态转换函数中做防御性断言；重复 complete、重复 abort、error 之后 abort 等事件只记录 warning，不改变终态。

单个 task 默认最多保留 `2000` 条事件。超过上限时，主进程保留最早 `50` 条元事件和最近 `1950` 条事件，并记录 warning。若渲染进程请求的 `afterSequence` 已早于被裁剪区间，`get-events` 返回稳定错误 `STREAM_TASK_EVENT_LOG_TRUNCATED`，渲染进程回退为重新加载会话消息并显示任务状态提示。这个上限第一版作为常量实现，后续再按配置开放。

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
  /** ISO 8601 UTC 时间字符串。 */
  createdAt: string;
}
```

`sequence` 在单个 task 内从 1 递增。渲染进程重放事件时按 `sequence` 排序，并记录最后消费的 sequence，避免重复追加。`requestId` 虽然可通过 `taskId` 反查，但事件里保留一份，方便日志检索和诊断跨 IPC 事件。

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
  /** 同一次用户发送动作及其工具续轮共享；未传时主进程生成。 */
  turnId?: string;
  /** 工具续轮产生的新任务指向上一轮任务。 */
  parentTaskId?: string;
  createOptions: AICreateOptions;
  request: AIRequestOptions;
}
```

返回：

```ts
interface AIStreamTaskStartResult {
  taskId: string;
  turnId: string;
  requestId: string;
  status: AIStreamTask['status'];
}
```

`ai:stream-task:start` 在任务创建成功并写入主进程 registry 后立即返回，不等待第一条模型事件。渲染进程拿到 `taskId` 后即可渲染 assistant 占位气泡并建立订阅。

如果同一个 `sessionId` 已有 `running` task，返回稳定错误码，例如 `SESSION_STREAM_TASK_RUNNING`。正常路径下渲染进程应已知道该会话正在运行；该错误也用于竞态和渲染层状态丢失后的自恢复，渲染进程据此刷新该会话 task 状态并保持发送按钮禁用。

`ai:stream-task:list-by-session` 输入：

```ts
interface AIStreamTaskListBySessionQuery {
  sessionId: string;
  /** 默认只返回 running。 */
  status?: Array<AIStreamTask['status']>;
}
```

返回 task 概要列表，不返回完整事件数组：

```ts
interface AIStreamTaskSummary {
  taskId: string;
  turnId: string;
  parentTaskId?: string;
  sessionId: string;
  requestId: string;
  status: AIStreamTask['status'];
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  latestSequence: number;
}
```

`ai:stream-task:get-events` 支持从指定 sequence 之后读取：

```ts
interface AIStreamTaskEventsQuery {
  taskId: string;
  /** 返回 sequence > afterSequence 的事件；不包含 afterSequence 本身。 */
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

`runningTaskBySession`、AbortController 和窗口订阅关联必须在 `finally` 中释放。即使 stream 迭代抛出未预期异常，也要保证会话运行索引不会永久卡住。

事件推送只发送给创建任务的窗口。第一版不广播到其他窗口，也不保证其他窗口能恢复这个任务。

主进程事件保留在内存中，并受单 task `2000` 条事件上限约束。已完成任务在当前应用生命周期内保留，后续可增加 TTL 或数据库持久化。

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
2. 先确保全局 `onAiStreamTaskEvent` 订阅已经建立，再调用 `get-events` 拉取历史事件。
3. 如果内存里已有该会话消息，优先展示内存消息；如果渲染进程曾刷新或该会话没有内存态，则从 `chatStore.getSessionMessages(sessionId)` 加载数据库消息作为基线。
4. 调用 `aiStreamTaskListBySession(sessionId)` 查询运行中任务。
5. 对运行中 task 调用 `get-events`，重放 `sequence > lastConsumedSequence` 的事件。
6. 实时订阅与历史重放都按 `taskId + sequence` 去重，解决"拉历史"与"实时事件"之间的竞态。

同一会话内发送新消息时，如果该会话已有 running task，发送按钮禁用并提示正在生成。

任务事件订阅生命周期跟随 `BChatSidebar` 组件实例：组件挂载时建立一次全局订阅，卸载时取消订阅。会话切换只更新当前展示的 session runtime，不反复创建 IPC 监听器。

## Tool Calls And Continuation

第一版保留现有前端工具执行逻辑。模型发出 `tool-call` 后：

1. 主进程记录并转发 `tool-call` 事件。
2. 渲染进程对应 session runtime 执行本地工具。
3. 工具结果写回 assistant 消息。
4. 如果需要续轮，渲染进程基于更新后的消息列表启动新的主进程 stream task。

这意味着一个用户问题可能由多个连续 task 组成，但同一会话仍保持串行。每次续轮 task 都归属相同 `sessionId`，共享同一个 `turnId`，并通过 `parentTaskId` 指向上一轮 task。渲染进程用消息状态和工具循环保护来控制是否继续。

本地工具执行失败时，模型侧 task 通常已经进入 `completed`。渲染进程应把失败结果写入对应 assistant 消息的 `tool-result` 或 `error` part，并停止启动续轮 task；用户看到的是当前 assistant 消息中的工具失败状态，而不是后台 task 继续 running。若用户重试，需要从该会话当前消息状态重新发起生成。

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
- 事件日志被裁剪：主进程返回 `STREAM_TASK_EVENT_LOG_TRUNCATED`，渲染进程回退到数据库消息并提示当前流式细节无法完整恢复。

## Testing

单元测试：

- `AIStreamTaskService` 能为不同 session 并发创建任务。
- 同一 session 已有 running task 时拒绝第二个 start。
- 事件 sequence 单调递增。
- abort 只影响指定 task。
- 状态机只允许 `running` 进入终态，终态不能再转换。
- 错误流会生成 `error` 和 `complete` 事件并清理运行索引。
- 未捕获异常路径也会在 `finally` 中清理 `runningTaskBySession`。
- 超过事件上限时触发裁剪，并在过早 `afterSequence` 查询时返回 `STREAM_TASK_EVENT_LOG_TRUNCATED`。

渲染层测试：

- `useChatStream` 能按 task event 恢复文本、思考、工具输入、工具调用、工具结果和完成状态。
- 切换到另一个会话不 abort 原会话 task。
- 切回运行中会话会重放历史事件并继续接收新事件。
- 恢复流程先订阅实时事件再拉取历史事件，重复事件按 `taskId + sequence` 去重。
- 同会话 running 时发送按钮禁用，不影响其他会话发送。
- 本地工具执行失败时停止续轮，并把失败展示在当前 assistant 消息中。

集成测试：

- A 会话生成中切到 B，B 可发送并生成。
- 用两个 mock stream 同时交错推送 text/thinking/tool-call 事件，验证 A、B 消息不会串到对方会话。
- A 后台完成后切回，最终 assistant 消息已完成并可持久化。
- A 会话流式中途网络断开，切回 A 后能看到 error 状态而非永久 loading。
- B 会话在 A 生成中被删除，不影响 A 的生成。

## Rollout Plan

1. 添加任务事件类型和 Electron API 类型。
2. 新增主进程 `AIStreamTaskService`，保留旧 `ai:stream` IPC 以兼容编辑器选区 AI 等调用方，并确认旧调用方测试仍通过。
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
