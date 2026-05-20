# 2026-05-20 Chat Stream Task Design

## Summary

聊天侧边栏当前的流式生成绑定在单个渲染进程 hook 实例上，事件通过全局 IPC channel 推送，不携带会话维度。用户从会话历史切换到其他会话时，正在生成的会话无法作为后台任务稳定恢复。

本设计采用 `Turn -> Task -> Event` 三层模型：

- `Turn`：一次用户发送动作及其本地工具、确认卡片、模型续轮和停止行为，由渲染进程负责。
- `Task`：一次模型 stream，由主进程负责运行、事件记录、查询和中止。
- `Event`：task 产生的结构化流事件，带 `taskId`、`turnId`、`sessionId`、`assistantMessageId` 和 `sequence`。

主进程解决多路模型流与事件恢复；渲染进程用 session runtime map 解决后台会话消息归属、turn 串行、工具续轮、停止和持久化。

## Goals

- 允许多个会话同时后台生成。
- 保证同一个会话同一时间只运行一个完整 turn，而不只是一个模型 task。
- 用户从会话历史切走后，原会话继续生成并继续更新对应 runtime。
- 用户切回生成中的会话后，恢复实时流式输出状态。
- 避免不同会话的文本、思考、工具调用和完成事件串流。
- 后台会话不可见时，也能累积 assistant message、tool parts、terminal 状态并按策略持久化。
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

`src/components/BChatSidebar/hooks/useChatStream.ts` 持有当前会话的工具续轮、待执行工具结果、用户选择题和完成回调状态。切换会话时，这些状态没有主进程任务快照可查询，也没有全局 session runtime 能在后台持续接收事件。

## Core Model

### Turn

`Turn` 是同一会话内的串行边界。一次用户发送动作从用户消息写入开始，到模型流、前端本地工具、确认卡片、用户选择题、续轮 task 和最终完成全部结束，才算 turn 结束。

```ts
type SessionGenerationState =
  | 'idle'
  | 'streaming'
  | 'waiting_local_tool'
  | 'waiting_user_confirmation'
  | 'continuing'
  | 'aborting';

interface ChatTurnRuntime {
  turnId: string;
  sessionId: string;
  userMessageId: string;
  assistantMessageId: string;
  state: Exclude<SessionGenerationState, 'idle'>;
  activeTaskId?: string;
  lastTaskId?: string;
  cancelled: boolean;
}
```

只要 `state !== 'idle'`，同一会话不能发送新的用户消息。这个锁覆盖模型 task 间隙、本地工具执行、确认等待和续轮准备，避免“旧 turn 工具续轮尚未开始时插入新用户消息”。

### Task

主进程新增 `AIStreamTaskService`，负责创建、运行、查询和中止流式 task。它不替代 `AIService.streamText()` 的模型调用能力，而是在它之上提供任务层。

```ts
interface AIStreamTask {
  taskId: string;
  turnId: string;
  parentTaskId?: string;
  sessionId: string;
  userMessageId: string;
  assistantMessageId: string;
  requestId: string;
  clientRequestId: string;
  ownerWebContentsId: number;
  status: 'running' | 'completed' | 'failed' | 'aborted';
  latestSequence: number;
  minAvailableSequence: number;
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

`requestId` 同时写入 task 与 event，便于日志和 IPC 排查时不必反查 task。`clientRequestId` 是渲染进程生成的幂等键；同一个 key 重试时返回已有 task，不新建第二个 task。

主进程维护索引：

```ts
const tasks = new Map<string, AIStreamTask>();
const runningTaskBySession = new Map<string, string>();
const taskByClientRequestId = new Map<string, string>();
```

`runningTaskBySession` 只表达“当前有模型 task running”，不表达完整 turn 锁。完整 turn 锁由渲染进程 session runtime 管理。清理 `runningTaskBySession` 时必须检查 taskId 匹配：

```ts
if (runningTaskBySession.get(sessionId) === taskId) {
  runningTaskBySession.delete(sessionId);
}
```

### State Machine

Task 状态机只允许从 `running` 进入终态：

```text
running -> completed
running -> failed
running -> aborted
```

`completed`、`failed`、`aborted` 都是终态，不能再互相转换。主进程实现应在状态转换函数中做防御性断言；重复 terminal、重复 abort、error 之后 abort 等事件只记录 warning，不改变终态。

## Event Contract

任务事件统一通过 `ai:stream-task:event` 发送。事件是 discriminated union，不长期使用 `unknown` payload。

```ts
type AIStreamTaskEvent =
  | AIStreamTextEvent
  | AIStreamThinkingEvent
  | AIStreamFinishEvent
  | AIStreamToolInputStartEvent
  | AIStreamToolInputDeltaEvent
  | AIStreamToolInputEndEvent
  | AIStreamToolCallEvent
  | AIStreamToolResultEvent
  | AIStreamTerminalEvent;

interface AIStreamTaskEventBase {
  taskId: string;
  turnId: string;
  sessionId: string;
  userMessageId: string;
  assistantMessageId: string;
  requestId: string;
  sequence: number;
  /** ISO 8601 UTC 时间字符串。 */
  createdAt: string;
}

interface AIStreamTextEvent extends AIStreamTaskEventBase {
  type: 'text';
  payload: { text: string };
}

interface AIStreamThinkingEvent extends AIStreamTaskEventBase {
  type: 'thinking';
  payload: { thinking: string };
}

interface AIStreamFinishEvent extends AIStreamTaskEventBase {
  type: 'finish';
  payload: AIStreamFinishChunk;
}

interface AIStreamToolInputStartEvent extends AIStreamTaskEventBase {
  type: 'tool-input-start';
  payload: AIStreamToolInputStartChunk;
}

interface AIStreamToolInputDeltaEvent extends AIStreamTaskEventBase {
  type: 'tool-input-delta';
  payload: AIStreamToolInputDeltaChunk;
}

interface AIStreamToolInputEndEvent extends AIStreamTaskEventBase {
  type: 'tool-input-end';
  payload: AIStreamToolInputEndChunk;
}

interface AIStreamToolCallEvent extends AIStreamTaskEventBase {
  type: 'tool-call';
  payload: AIStreamToolCallChunk;
}

interface AIStreamToolResultEvent extends AIStreamTaskEventBase {
  type: 'tool-result';
  payload: AIStreamToolResultChunk;
}

interface AIStreamTerminalEvent extends AIStreamTaskEventBase {
  type: 'terminal';
  payload: {
    status: 'completed' | 'failed' | 'aborted';
    finish?: AIStreamFinishChunk;
    error?: AIServiceError;
  };
}
```

`sequence` 在单个 task 内从 1 递增。渲染进程重放事件时按 `sequence` 排序，并记录最后消费的 sequence，避免重复追加。`terminal` 是唯一表示 task 结束的事件，渲染层不得把 failed/aborted 误判成成功完成。

主进程对 `text`、`thinking` 和 `tool-input-delta` 做短窗口合并，默认 `30-80ms` flush 一次；`finish`、`terminal`、`tool-call`、`tool-result` 等结构化事件不合并。这样减少 IPC 压力和事件日志裁剪概率。

## Event Retention

第一版使用简单连续区间策略：单个 task 默认最多保留最近 `2000` 条事件，不保留“最早 + 最近”的断档数组。task 保存 `minAvailableSequence` 和 `latestSequence`。

`get-events` 返回：

```ts
interface AIStreamTaskEventsResult {
  events: AIStreamTaskEvent[];
  latestSequence: number;
  minAvailableSequence: number;
  contiguousFromSequence: number;
  truncated: boolean;
}
```

如果 `afterSequence < minAvailableSequence - 1`，主进程返回稳定错误 `STREAM_TASK_EVENT_LOG_TRUNCATED`，不返回半截事件。渲染进程回退为重新加载数据库消息并提示当前流式细节无法完整恢复，避免把中间断档误当完整事件流重放。

已完成 task 第一版也要做最小 GC：

- terminal 后保留 30 分钟；
- 每个 session 最多保留最近 20 个 terminal tasks；
- 全局最多保留 500 个 terminal tasks；
- 超出限制时优先清理最旧 terminal task，running task 不参与 GC。

## IPC API

新增 IPC：

```ts
ai:stream-task:start
ai:stream-task:abort
ai:stream-task:abort-turn
ai:stream-task:get
ai:stream-task:list-by-session
ai:stream-task:get-events
```

所有 `get`、`get-events`、`list-by-session` 和 `abort` 请求必须校验 `ownerWebContentsId`。非 owner 窗口不能按 taskId/sessionId 读取或中止不属于自己的任务。

`AICreateOptions` 和 `AIRequestOptions` 必须作为可结构化克隆的 DTO 穿过 IPC；不能包含函数、AbortSignal、class instance 或不可序列化对象。工具定义只能传 schema 和元数据，本地工具执行器仍留在渲染进程。

### Start

```ts
interface AIStreamTaskStartRequest {
  clientRequestId: string;
  sessionId: string;
  turnId: string;
  parentTaskId?: string;
  userMessageId: string;
  assistantMessageId: string;
  createOptions: AICreateOptions;
  request: AIRequestOptions;
}

interface AIStreamTaskStartResult {
  taskId: string;
  turnId: string;
  parentTaskId?: string;
  requestId: string;
  status: AIStreamTask['status'];
}
```

`ai:stream-task:start` 在任务创建成功并写入主进程 registry 后立即返回，不等待第一条模型事件。渲染进程拿到 `taskId` 后即可渲染 assistant 占位气泡并建立订阅。

如果同一个 `clientRequestId` 已创建 task，主进程返回已有 task。若同一个 `sessionId` 已有其他 running task，返回稳定错误码 `SESSION_STREAM_TASK_RUNNING`。正常路径下渲染进程应已知道该会话正在运行；该错误也用于竞态和渲染层状态丢失后的自恢复。

### List By Session

```ts
interface AIStreamTaskListBySessionQuery {
  sessionId: string;
  /** 默认只返回 running。 */
  status?: Array<AIStreamTask['status']>;
}

interface AIStreamTaskSummary {
  taskId: string;
  turnId: string;
  parentTaskId?: string;
  sessionId: string;
  userMessageId: string;
  assistantMessageId: string;
  requestId: string;
  status: AIStreamTask['status'];
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  latestSequence: number;
  minAvailableSequence: number;
}
```

返回 task 概要列表，不返回完整事件数组。

### Get Events

```ts
interface AIStreamTaskEventsQuery {
  taskId: string;
  /** 返回 sequence > afterSequence 的事件；不包含 afterSequence 本身。 */
  afterSequence?: number;
}
```

## Main Process Flow

1. `AIStreamTaskService.start()` 校验 `ownerWebContentsId`、`clientRequestId` 和 `sessionId` running task。
2. 创建 `taskId` 和 `requestId`，注册 task。
3. 调用 `aiService.streamText(createOptions, requestWithRequestId)`。
4. 遍历 `result.stream`，将 SDK chunk 规范化为 `AIStreamTaskEvent`。
5. 合并短文本 delta 后追加到 task 的 `events`，更新 `latestSequence`、`updatedAt`，并发送给 owner window。
6. `finish` 事件记录 usage 和 finishReason。
7. 流正常结束后追加 `terminal: completed`，状态变为 `completed`。
8. 发生错误时追加 `terminal: failed`，状态变为 `failed`。
9. 用户中止时追加 `terminal: aborted`，状态变为 `aborted`。

`runningTaskBySession`、AbortController 和窗口订阅关联必须在 `finally` 中释放。即使 stream 迭代抛出未预期异常，也要保证会话运行索引不会永久卡住。

窗口销毁时，主进程 abort 该窗口创建的所有 running task，并清理 registry 关联。第一版不允许“无人接收事件但继续后台跑”，因为本地工具续轮和消息持久化都依赖渲染进程 runtime。

## Renderer Runtime

渲染进程维护全局 session runtime map：

```ts
const sessionRuntimeMap = new Map<string, ChatSessionRuntime>();

interface ChatSessionRuntime {
  sessionId: string;
  messages: Message[];
  generationState: SessionGenerationState;
  activeTurn?: ChatTurnRuntime;
  consumedSequences: Map<string, number>;
  dirty: boolean;
}
```

`onAiStreamTaskEvent` 不只服务当前 UI。事件入口先按 `sessionId + taskId` 路由到对应 runtime，再由 runtime reducer 更新消息、tool parts、terminal 状态和持久化脏标记。UI 只是订阅当前 `chatSidebarActiveSessionId` 对应 runtime 的投影。

后台会话不可见时，也必须继续：

- 追加 text/thinking/tool input/tool call/tool result 到 `assistantMessageId` 指向的消息；
- 更新 `generationState`；
- 记录 `consumedSequences`；
- 在 terminal 或节流周期内持久化消息。

持久化策略：

- 用户消息发送前先创建 `userMessageId` 和 `assistantMessageId`。
- 用户消息立即持久化。
- assistant 消息先在 runtime 中创建 pending 占位。
- 流式过程中按节流周期持久化 assistant 消息，默认不高于每 1000ms 一次。
- terminal、工具结果、确认结果和错误状态必须立即持久化。
- 切换会话不触发 abort，也不丢弃未持久化 runtime；切回时优先使用 runtime，runtime 不存在时从数据库加载 baseline。

## Renderer Flow

渲染进程启动消息：

1. 如果当前 session `generationState !== 'idle'`，拒绝发送。
2. 创建 `turnId`、`userMessageId`、`assistantMessageId` 和 `clientRequestId`。
3. 写入用户消息和 assistant pending 占位到 session runtime，并持久化用户消息。
4. 将 session `generationState` 置为 `streaming`。
5. 调用 `electronAPI.aiStreamTaskStart({ clientRequestId, sessionId, turnId, userMessageId, assistantMessageId, createOptions, request })`。
6. 将返回的 `taskId` 写入 `activeTurn.activeTaskId`。

切换会话：

1. `useSession.switchSession(sessionId)` 不再因其他会话 loading 而拒绝切换。
2. 全局 `onAiStreamTaskEvent` 订阅在 `BChatSidebar` 挂载时建立一次；会话切换不重新创建 IPC 监听器。
3. 如果 runtime 已存在，直接展示 runtime。
4. 如果 runtime 不存在，从 `chatStore.getSessionMessages(sessionId)` 加载数据库消息作为 baseline。
5. 调用 `aiStreamTaskListBySession(sessionId)` 查询 running task。
6. 对 running task 调用 `get-events`，重放 `sequence > lastConsumedSequence` 的事件。
7. 实时订阅与历史重放都按 `taskId + sequence` 去重。

恢复流程必须先确保实时订阅已经建立，再拉历史事件，避免 `get-events` 与订阅建立之间的事件丢失。

## Tool Calls And Continuation

第一版保留现有前端工具执行逻辑。模型发出 `tool-call` 后：

1. 主进程记录并转发 `tool-call` 事件。
2. 渲染进程对应 session runtime 将 `generationState` 置为 `waiting_local_tool` 或 `waiting_user_confirmation`。
3. 渲染进程执行本地工具或等待确认卡片。
4. 工具结果写回同一 `assistantMessageId` 指向的 assistant 消息。
5. 如果 turn 未取消且需要续轮，渲染进程将 `generationState` 置为 `continuing`，使用同一 `turnId`、同一 `assistantMessageId`、新的 `clientRequestId` 和 `parentTaskId` 启动下一轮 task。

一个用户 turn 可以包含多个连续 task，但所有 task 共享 `turnId`，并通过 `parentTaskId` 串起来。默认续轮归并到同一 assistant message，除非后续产品明确改为多条 assistant 消息。

本地工具执行失败时，模型侧 task 通常已经进入 `completed`。渲染进程应把失败结果写入对应 assistant 消息的 `tool-result` 或 `error` part，立即持久化，并把 session `generationState` 置为 `idle`。用户看到的是当前 assistant 消息中的工具失败状态，而不是后台 task 继续 running。

SDK 管理的 Tavily/MCP 工具仍在主进程内部执行，主进程会记录并转发 `tool-result` 事件，渲染进程只负责展示。

## Abort And Delete

停止按钮按 turn 取消，而不只是按 task：

```ts
interface AbortTurnRequest {
  sessionId: string;
  turnId: string;
}
```

`abortTurn(sessionId, turnId)` 应该：

- abort 当前 running task；
- 标记 active turn cancelled；
- 阻止后续本地工具结果触发续轮；
- 尽可能取消正在执行的本地工具；
- 取消等待中的确认卡片或用户选择题；
- 将 UI 统一收敛到 aborted 状态并持久化；
- 最终把 session `generationState` 置为 `idle`。

如果用户点击停止时处于 `waiting_local_tool`、`waiting_user_confirmation` 或 `continuing`，也必须通过 turn cancelled 标记阻止后续续轮。避免“点了停止，但工具完成后又自动续写”。

删除运行中会话第一版采用明确禁止策略：Session History 对 `generationState !== 'idle'` 的会话禁用删除并提示“请先停止生成”。后续如需支持删除，可改为先 `abortTurn`，等 runtime idle 后再删除消息和 task runtime。

## Session History UI

`SessionHistory.vue` 不再因为当前会话生成中整体禁用切换。禁用范围改为：

- 运行中会话禁止删除。
- 当前会话运行中时，当前会话内发送按钮显示停止。
- 历史列表中运行中的会话显示轻量状态，例如 loading 图标。

历史列表点击其他会话应立即切换。切回运行中会话后，消息列表显示正在生成的 assistant 气泡。

## Error Handling

- 主进程启动任务失败：返回稳定错误，渲染进程展示 toast，不创建 assistant 占位；若占位已创建则标记失败并持久化。
- `SESSION_STREAM_TASK_RUNNING`：用于竞态和渲染层状态丢失后的自恢复，渲染进程刷新该会话 task 状态并保持 turn lock。
- 流中错误：主进程发送 `terminal: failed`；渲染进程将错误合并到 `assistantMessageId` 指向的 assistant 消息。
- 渲染进程错过事件：切回时通过 `get-events` 补齐。
- 重复事件：渲染进程按 `taskId + sequence` 去重。
- 同会话 turn 运行中发送新消息：渲染进程直接拒绝，不依赖主进程 running task。
- 同会话并发 task 启动：主进程拒绝第二个 running task。
- Abort：按 turn 取消，底层 task abort 只作为其中一步。
- 事件日志被裁剪：主进程返回 `STREAM_TASK_EVENT_LOG_TRUNCATED`，渲染进程回退到数据库消息并提示当前流式细节无法完整恢复。
- 窗口关闭：主进程 abort owner window 的 running tasks，渲染进程 unmount 前尽力 flush dirty runtime。

## Testing

单元测试：

- `AIStreamTaskService` 能为不同 session 并发创建 task。
- 同一 session 已有 running task 时拒绝第二个 task。
- 相同 `clientRequestId` 重试不会创建重复 task。
- 事件 sequence 单调递增。
- abort 只影响指定 task。
- 状态机只允许 `running` 进入终态，终态不能再转换。
- terminal failed/aborted 不会被渲染层当作成功完成。
- 错误流会生成 `terminal: failed` 并清理运行索引。
- 未捕获异常路径也会在 `finally` 中按 taskId 匹配清理 `runningTaskBySession`。
- 超过事件上限时触发连续区间裁剪，并在过早 `afterSequence` 查询时返回 `STREAM_TASK_EVENT_LOG_TRUNCATED`。
- ownerWebContentsId 校验阻止其他窗口读取或中止 task。
- 窗口关闭时 running task 被 abort 并清理 owner 关联。

渲染层测试：

- 全局 `sessionRuntimeMap` 能把后台会话事件路由到正确 runtime，即使该会话不是当前 UI。
- 后台会话收到事件时能更新 assistant 消息并最终持久化。
- `useChatStream` 能按 task event 恢复文本、思考、工具输入、工具调用、工具结果和 terminal 状态。
- 切换到另一个会话不 abort 原会话 turn。
- 切回运行中会话会重放历史事件并继续接收新事件。
- 恢复流程先订阅实时事件再拉取历史事件，重复事件按 `taskId + sequence` 去重。
- task 完成后、本地工具执行中，用户尝试同会话发送新消息会被 turn lock 禁止。
- 用户在本地工具执行中点击停止，不应再启动续轮 task。
- 本地工具执行失败时停止续轮，并把失败展示在当前 assistant 消息中。
- `complete` after `error` 不存在；`terminal: failed` 不会把消息标记成成功完成。
- 事件裁剪后，中间断档不会被当作完整事件流重放。
- 两个连续 tool continuation task 共享同一个 `turnId`，并按 `parentTaskId` 正确串起来。

集成测试：

- A 会话生成中切到 B，B 可发送并生成。
- 用两个 mock stream 同时交错推送 text/thinking/tool-call 事件，验证 A、B 消息不会串到对方会话。
- A 后台完成后切回，最终 assistant 消息已完成并已持久化。
- A 会话流式中途网络断开，切回 A 后能看到 error 状态而非永久 loading。
- B 会话在 A 生成中被删除按钮禁用，不影响 A 的生成。

## Rollout Plan

1. 添加 Turn、Task、Event 类型和 Electron API 类型。
2. 新增主进程 `AIStreamTaskService`，保留旧 `ai:stream` IPC 以兼容编辑器选区 AI 等调用方，并确认旧调用方测试仍通过。
3. 新增 preload 暴露的 task API、turn abort API 和事件订阅 API。
4. 新增渲染进程 `sessionRuntimeMap` 和 task event reducer。
5. 改造 `BChatSidebar` 的发送、会话切换、停止和流式 hook，使其使用 turn lock 与 task API。
6. 改造工具续轮逻辑，使本地工具、确认卡片和用户选择题都受 turn lock 与 `abortTurn` 控制。
7. 为 SessionHistory 增加运行中状态展示，并放开跨会话切换、禁止删除运行中会话。
8. 补充测试。
9. 验证旧 `ai:stream` 调用方仍可工作。

## Open Decisions Resolved

- 跨会话允许并发生成。
- 同一会话只允许一个完整 turn 运行。
- 第一版使用主进程内存 task，不做跨应用重启恢复。
- 第一版保留前端本地工具执行，不把所有工具迁移到主进程。
- 第一版窗口销毁时 abort 该窗口创建的 running tasks。
- 第一版删除运行中会话采用禁止策略。
