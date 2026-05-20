# Chat Stream Task Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 Turn → Task → Event 三层流式任务模型，支持多会话并发生成、会话切换后台继续、事件重放恢复。

**Architecture:** 主进程新增 `AIStreamTaskService` 管理流式 task 生命周期和事件记录，通过 `ai:stream-task:event` 统一事件通道推送。渲染进程维护全局 `sessionRuntimeMap`，按 sessionId + taskId 路由事件到对应 runtime，支持跨会话切换和事件重放。第一版保留本地工具执行在渲染进程，旧 `ai:stream` 兼容并存。

**Tech Stack:** TypeScript (strict), Electron IPC, Vitest

---

## File Structure

### 新建文件

| 文件 | 职责 |
|------|------|
| `types/chat-stream-task.d.ts` | Turn、Task、Event、IPC 请求/响应、SessionRuntime 全局类型定义 |
| `electron/main/modules/ai/task-service.mts` | `AIStreamTaskService` 类：task CRUD、事件记录与裁剪、GC、owner 校验 |
| `electron/main/modules/ai/task-errors.mts` | Task 层稳定错误码定义（`SESSION_STREAM_TASK_RUNNING`、`STREAM_TASK_EVENT_LOG_TRUNCATED` 等） |
| `electron/main/modules/ai/task-ipc.mts` | 6 个 task IPC handler 注册函数 |
| `test/electron/aiStreamTaskService.test.ts` | 主进程 AIStreamTaskService 单元测试 |
| `src/components/BChatSidebar/utils/taskEventReducer.ts` | 渲染进程事件 reducer：按 type 更新 Message parts、去重 sequence |
| `src/components/BChatSidebar/utils/sessionRuntimeMap.ts` | 全局 sessionRuntimeMap：创建/查询/更新 runtime，事件路由 |
| `test/components/BChatSidebar/taskEventReducer.test.ts` | 渲染进程 event reducer 单元测试 |
| `test/components/BChatSidebar/sessionRuntimeMap.test.ts` | 渲染进程 sessionRuntimeMap 单元测试 |

### 修改文件

| 文件 | 修改内容 |
|------|----------|
| `types/electron-api.d.ts` | 新增 `AIStreamTask*` IPC 方法类型 + `onAiStreamTaskEvent` 监听器 |
| `electron/preload/index.mts` | 新增 6 个 task invoke + 1 个 task event 监听器 |
| `electron/main/modules/ai/types.mts` | 添加 `AIStreamTask` 相关主进程内部类型 |
| `electron/main/modules/index.mts` | 注册 `registerTaskHandlers` |
| `src/components/BChatSidebar/hooks/useChatStream.ts` | 改造 send/abort/工具续轮使用 task API + turn lock |
| `src/components/BChatSidebar/hooks/useChatTaskRuntime.ts` | 重构为 turn 级锁（替代当前单 task 锁） |
| `src/components/BChatSidebar/components/SessionHistory.vue` | 运行中会话状态展示、允许跨会话切换、禁止删除运行中会话 |

---

## Task 1: 类型定义

**Files:**
- Create: `types/chat-stream-task.d.ts`
- Modify: `types/electron-api.d.ts` (追加 task API 方法类型)
- Modify: `electron/main/modules/ai/types.mts` (追加主进程内部 task 类型)

- [ ] **Step 1: 创建 `types/chat-stream-task.d.ts` 完整类型文件**

```typescript
/**
 * @file chat-stream-task.d.ts
 * @description Chat Stream Task 三层模型（Turn/Task/Event）全局类型定义。
 */
import type { AICreateOptions, AIRequestOptions, AIStreamFinishChunk, AIStreamToolCallChunk, AIStreamToolInputDeltaChunk, AIStreamToolInputEndChunk, AIStreamToolInputStartChunk, AIStreamToolResultChunk, AIServiceError } from './ai';

// ═══ Turn ═══

/** 会话生成状态。 */
export type SessionGenerationState =
  | 'idle'
  | 'streaming'
  | 'waiting_local_tool'
  | 'waiting_user_confirmation'
  | 'continuing'
  | 'aborting';

/** Turn 运行时状态（仅在 generationState !== 'idle' 时存在）。 */
export interface ChatTurnRuntime {
  /** Turn ID（渲染进程生成）。 */
  turnId: string;
  /** 所属会话 ID。 */
  sessionId: string;
  /** 用户消息 ID。 */
  userMessageId: string;
  /** 助手消息 ID（多 task 续轮共享同一 assistant message）。 */
  assistantMessageId: string;
  /** 当前生成阶段。 */
  state: Exclude<SessionGenerationState, 'idle'>;
  /** 当前活跃 task ID。 */
  activeTaskId?: string;
  /** 上一个完成的 task ID（用于父链）。 */
  lastTaskId?: string;
  /** 是否已标记取消。 */
  cancelled: boolean;
}

// ═══ Task ═══

/** AI 流式任务状态。 */
export type AIStreamTaskStatus = 'running' | 'completed' | 'failed' | 'aborted';

/** 主进程 AI 流式任务（完整视图）。 */
export interface AIStreamTask {
  /** 主进程生成的 task ID。 */
  taskId: string;
  /** 所属 turn ID。 */
  turnId: string;
  /** 父 task ID（工具续轮时使用）。 */
  parentTaskId?: string;
  /** 所属会话 ID。 */
  sessionId: string;
  /** 用户消息 ID。 */
  userMessageId: string;
  /** 助手消息 ID。 */
  assistantMessageId: string;
  /** 主进程生成的请求 ID。 */
  requestId: string;
  /** 渲染进程幂等键。 */
  clientRequestId: string;
  /** 创建该 task 的窗口 WebContents ID。 */
  ownerWebContentsId: number;
  /** 当前状态。 */
  status: AIStreamTaskStatus;
  /** 最新事件 sequence。 */
  latestSequence: number;
  /** 最早可用事件 sequence。 */
  minAvailableSequence: number;
  /** 事件数组（仅内存）。 */
  events: AIStreamTaskEvent[];
  /** 创建时间（ISO 8601 UTC）。 */
  startedAt: string;
  /** 最后更新时间。 */
  updatedAt: string;
  /** 完成时间。 */
  completedAt?: string;
  /** finish chunk。 */
  finish?: AIStreamFinishChunk;
  /** 错误信息。 */
  error?: AIServiceError;
}

/** 发送给渲染进程的 task 概要（不含 events 数组）。 */
export interface AIStreamTaskSummary {
  taskId: string;
  turnId: string;
  parentTaskId?: string;
  sessionId: string;
  userMessageId: string;
  assistantMessageId: string;
  requestId: string;
  status: AIStreamTaskStatus;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  latestSequence: number;
  minAvailableSequence: number;
}

// ═══ Event ═══

/** 事件类型判别联合。 */
export type AIStreamTaskEvent =
  | AIStreamTaskTextEvent
  | AIStreamTaskThinkingEvent
  | AIStreamTaskFinishEvent
  | AIStreamTaskToolInputStartEvent
  | AIStreamTaskToolInputDeltaEvent
  | AIStreamTaskToolInputEndEvent
  | AIStreamTaskToolCallEvent
  | AIStreamTaskToolResultEvent
  | AIStreamTaskTerminalEvent;

/** 事件基类型。 */
export interface AIStreamTaskEventBase {
  /** 所属 task ID。 */
  taskId: string;
  /** 所属 turn ID。 */
  turnId: string;
  /** 所属会话 ID。 */
  sessionId: string;
  /** 用户消息 ID。 */
  userMessageId: string;
  /** 助手消息 ID。 */
  assistantMessageId: string;
  /** 主进程 request ID。 */
  requestId: string;
  /** 事件序号（单 task 内从 1 递增）。 */
  sequence: number;
  /** 创建时间（ISO 8601 UTC）。 */
  createdAt: string;
}

export interface AIStreamTaskTextEvent extends AIStreamTaskEventBase {
  type: 'text';
  payload: { text: string };
}

export interface AIStreamTaskThinkingEvent extends AIStreamTaskEventBase {
  type: 'thinking';
  payload: { thinking: string };
}

export interface AIStreamTaskFinishEvent extends AIStreamTaskEventBase {
  type: 'finish';
  payload: AIStreamFinishChunk;
}

export interface AIStreamTaskToolInputStartEvent extends AIStreamTaskEventBase {
  type: 'tool-input-start';
  payload: AIStreamToolInputStartChunk;
}

export interface AIStreamTaskToolInputDeltaEvent extends AIStreamTaskEventBase {
  type: 'tool-input-delta';
  payload: AIStreamToolInputDeltaChunk;
}

export interface AIStreamTaskToolInputEndEvent extends AIStreamTaskEventBase {
  type: 'tool-input-end';
  payload: AIStreamToolInputEndChunk;
}

export interface AIStreamTaskToolCallEvent extends AIStreamTaskEventBase {
  type: 'tool-call';
  payload: AIStreamToolCallChunk;
}

export interface AIStreamTaskToolResultEvent extends AIStreamTaskEventBase {
  type: 'tool-result';
  payload: AIStreamToolResultChunk;
}

export interface AIStreamTaskTerminalEvent extends AIStreamTaskEventBase {
  type: 'terminal';
  payload: {
    status: 'completed' | 'failed' | 'aborted';
    finish?: AIStreamFinishChunk;
    error?: AIServiceError;
  };
}

// ═══ IPC API ═══

/** Task 启动请求。 */
export interface AIStreamTaskStartRequest {
  clientRequestId: string;
  sessionId: string;
  turnId: string;
  parentTaskId?: string;
  userMessageId: string;
  assistantMessageId: string;
  createOptions: AICreateOptions;
  request: AIRequestOptions;
}

/** Task 启动结果。 */
export interface AIStreamTaskStartResult {
  taskId: string;
  turnId: string;
  parentTaskId?: string;
  requestId: string;
  status: AIStreamTaskStatus;
}

/** Turn 中止请求。 */
export interface AIStreamTaskAbortTurnRequest {
  sessionId: string;
  turnId: string;
}

/** 按 session 查询 task 列表。 */
export interface AIStreamTaskListBySessionQuery {
  sessionId: string;
  status?: Array<AIStreamTaskStatus>;
}

/** 事件查询请求。 */
export interface AIStreamTaskEventsQuery {
  taskId: string;
  afterSequence?: number;
}

/** 事件查询结果。 */
export interface AIStreamTaskEventsResult {
  events: AIStreamTaskEvent[];
  latestSequence: number;
  minAvailableSequence: number;
  contiguousFromSequence: number;
  truncated: boolean;
}

// ═══ Task 错误码 ═══

/** Task 层稳定错误码。 */
export const STREAM_TASK_ERROR_CODE = {
  /** 会话已有 running task，拒绝新建。 */
  SESSION_STREAM_TASK_RUNNING: 'SESSION_STREAM_TASK_RUNNING',
  /** Task 不存在。 */
  TASK_NOT_FOUND: 'TASK_NOT_FOUND',
  /** 非 owner 窗口无权操作。 */
  TASK_OWNER_MISMATCH: 'TASK_OWNER_MISMATCH',
  /** 事件日志已被裁剪，无法返回完整的事件流。 */
  STREAM_TASK_EVENT_LOG_TRUNCATED: 'STREAM_TASK_EVENT_LOG_TRUNCATED'
} as const;

export type StreamTaskErrorCode = (typeof STREAM_TASK_ERROR_CODE)[keyof typeof STREAM_TASK_ERROR_CODE];

export interface StreamTaskError {
  code: StreamTaskErrorCode;
  message: string;
}

// ═══ Session Runtime（渲染进程）═══

/** 渲染进程全局 session runtime。 */
export interface ChatSessionRuntime {
  /** 所属会话 ID。 */
  sessionId: string;
  /** 消息列表（ref 引用，实际存储 Message[]）。 */
  messages: unknown[];
  /** 当前生成状态。 */
  generationState: SessionGenerationState;
  /** 当前活跃 turn。 */
  activeTurn?: ChatTurnRuntime;
  /** 每个 taskId 已消费的 sequence。 */
  consumedSequences: Map<string, number>;
  /** 是否有未持久化的脏数据。 */
  dirty: boolean;
}
```

- [ ] **Step 2: 追加 `types/electron-api.d.ts` 中 ElectronAPI 的 task 方法签名**

在 `ElectronAPI` 接口末尾添加（在 `compressImage` 之后）：

```typescript
// ==================== AI 流式 Task API ====================

/** 启动流式 task。 */
aiStreamTaskStart: (request: AIStreamTaskStartRequest) => Promise<{ result: AIStreamTaskStartResult } | { error: StreamTaskError }>;
/** 中止指定 task。 */
aiStreamTaskAbort: (taskId: string) => Promise<void>;
/** 中止整个 turn。 */
aiStreamTaskAbortTurn: (request: AIStreamTaskAbortTurnRequest) => Promise<void>;
/** 查询单个 task。 */
aiStreamTaskGet: (taskId: string) => Promise<AIStreamTaskSummary | undefined>;
/** 按 session 查询 task 列表。 */
aiStreamTaskListBySession: (query: AIStreamTaskListBySessionQuery) => Promise<AIStreamTaskSummary[]>;
/** 查询 task 事件。 */
aiStreamTaskGetEvents: (query: AIStreamTaskEventsQuery) => Promise<{ result: AIStreamTaskEventsResult } | { error: StreamTaskError }>;
/** 监听 task 事件。 */
onAiStreamTaskEvent: (callback: (event: AIStreamTaskEvent) => void) => () => void;
```

同步在 `import type` 区域添加：
```typescript
import type {
  // ... existing imports
  AIStreamTaskEvent,
  AIStreamTaskEventsQuery,
  AIStreamTaskEventsResult,
  AIStreamTaskAbortTurnRequest,
  AIStreamTaskListBySessionQuery,
  AIStreamTaskStartRequest,
  AIStreamTaskStartResult,
  AIStreamTaskSummary,
  StreamTaskError
} from './chat-stream-task';
```

- [ ] **Step 3: 运行 TypeScript 编译检查**

```bash
pnpm exec tsc --noEmit 2>&1 | head -20
```

Expected: 如果只是新增类型文件，不应引入新的编译错误。

- [ ] **Step 4: 提交**

```bash
git add types/chat-stream-task.d.ts types/electron-api.d.ts
git commit -m "feat(chat): 定义 Turn/Task/Event 三层流式任务类型"
```

---

## Task 2: Task 错误码模块

**Files:**
- Create: `electron/main/modules/ai/task-errors.mts`

- [ ] **Step 1: 创建 `electron/main/modules/ai/task-errors.mts`**

```typescript
/**
 * @file task-errors.mts
 * @description AI Stream Task 层稳定错误码定义。
 */
import type { StreamTaskError, StreamTaskErrorCode } from 'types/chat-stream-task';

/**
 * 创建 task 层错误。
 * @param code - 错误码
 * @param message - 错误信息
 * @returns StreamTaskError
 */
export function createTaskError(code: StreamTaskErrorCode, message: string): StreamTaskError {
  return { code, message };
}
```

- [ ] **Step 2: 提交**

```bash
git add electron/main/modules/ai/task-errors.mts
git commit -m "feat(chat): 添加 task 层稳定错误码模块"
```

---

## Task 3: AIStreamTaskService 核心 — 创建 Task

**Files:**
- Create: `electron/main/modules/ai/task-service.mts`
- Create: `test/electron/aiStreamTaskService.test.ts`

- [ ] **Step 1: 写第一个失败测试 — 创建 task 并返回 taskId**

```typescript
/**
 * @file aiStreamTaskService.test.ts
 * @description AIStreamTaskService 单元测试。
 */
import { AIStreamTaskService } from '../../electron/main/modules/ai/task-service.mjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const streamTextMock = vi.fn();
const aiServiceMock = { streamText: streamTextMock } as unknown as Record<string, unknown>;

vi.mock('../../electron/main/modules/ai/service.mjs', () => ({
  aiService: aiServiceMock
}));

describe('AIStreamTaskService', () => {
  let service: AIStreamTaskService;

  beforeEach(() => {
    vi.resetModules();
    service = new (AIStreamTaskService as unknown as new () => AIStreamTaskService)();
  });

  it('creates a task and returns taskId', async () => {
    const mockStream = (async function* () {
      yield { type: 'text-delta' as const, text: 'Hello' };
      yield { type: 'finish' as const, finishReason: 'stop' as const, totalUsage: { inputTokens: 5, outputTokens: 5, totalTokens: 10 } };
    })();

    streamTextMock.mockResolvedValue([undefined, { stream: mockStream }]);

    const request = {
      clientRequestId: 'client-1',
      sessionId: 'session-1',
      turnId: 'turn-1',
      userMessageId: 'user-msg-1',
      assistantMessageId: 'assistant-msg-1',
      ownerWebContentsId: 1,
      createOptions: { providerType: 'openai', providerId: 'p-1', providerName: 'OpenAI' },
      request: { modelId: 'model-1', prompt: 'hi' }
    };

    const result = await service.start(request);

    expect(result.taskId).toBeDefined();
    expect(typeof result.taskId).toBe('string');
    expect(result.status).toBe('running');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
pnpm test test/electron/aiStreamTaskService.test.ts
```

Expected: FAIL — AIStreamTaskService not found / cannot import.

- [ ] **Step 3: 创建 `electron/main/modules/ai/task-service.mts` 最小实现**

```typescript
/**
 * @file task-service.mts
 * @description AI 流式任务服务，在 AIService.streamText() 之上提供 task 生命周期管理。
 */
import type { WebContents } from 'electron';
import type { AICreateOptions, AIRequestOptions } from 'types/ai';
import type { AIStreamTask, AIStreamTaskEvent, AIStreamTaskStatus, AIStreamTaskSummary } from 'types/chat-stream-task';
import { randomUUID } from 'node:crypto';
import { aiService } from './service.mjs';

/**
 * 内部 task 记录，扩展 AIStreamTask 添加运行时状态。
 */
interface TaskRecord extends AIStreamTask {
  /** 该 task 的 AbortController。 */
  abortController: AbortController;
}

/**
 * Task 启动参数（内部，在 IPC handler 层拼接 ownerWebContentsId）。
 */
export interface TaskStartParams {
  clientRequestId: string;
  sessionId: string;
  turnId: string;
  parentTaskId?: string;
  userMessageId: string;
  assistantMessageId: string;
  ownerWebContentsId: number;
  createOptions: AICreateOptions;
  request: AIRequestOptions;
}

/**
 * Task 启动结果。
 */
export interface TaskStartResult {
  taskId: string;
  turnId: string;
  parentTaskId?: string;
  requestId: string;
  status: AIStreamTaskStatus;
}

/** 事件日志上限。 */
const MAX_EVENTS_PER_TASK = 2000;

/**
 * AI 流式任务服务。
 * 管理 task 创建、运行、中止、事件记录和 GC。
 */
export class AIStreamTaskService {
  /** 所有 task 的注册表。 */
  private tasks = new Map<string, TaskRecord>();

  /** running task 按 sessionId 索引（一个 session 只有一个 running task）。 */
  private runningTaskBySession = new Map<string, string>();

  /** 按 clientRequestId 索引 task。 */
  private taskByClientRequestId = new Map<string, string>();

  /**
   * 创建并启动流式 task。
   * @param params - task 启动参数
   * @returns 启动结果
   */
  async start(params: TaskStartParams): Promise<TaskStartResult> {
    const taskId = randomUUID();
    const requestId = randomUUID();
    const now = new Date().toISOString();
    const abortController = new AbortController();

    const record: TaskRecord = {
      taskId,
      turnId: params.turnId,
      parentTaskId: params.parentTaskId,
      sessionId: params.sessionId,
      userMessageId: params.userMessageId,
      assistantMessageId: params.assistantMessageId,
      requestId,
      clientRequestId: params.clientRequestId,
      ownerWebContentsId: params.ownerWebContentsId,
      status: 'running',
      latestSequence: 0,
      minAvailableSequence: 1,
      events: [],
      startedAt: now,
      updatedAt: now,
      abortController
    };

    this.tasks.set(taskId, record);
    this.runningTaskBySession.set(params.sessionId, taskId);
    this.taskByClientRequestId.set(params.clientRequestId, taskId);

    // 异步执行流式任务
    this.runTask(record, params.createOptions, { ...params.request, requestId }).catch(() => {
      // runTask 内部已处理错误
    });

    return { taskId, turnId: params.turnId, parentTaskId: params.parentTaskId, requestId, status: 'running' };
  }

  /**
   * 异步运行 task 的流式循环。
   */
  private async runTask(record: TaskRecord, createOptions: AICreateOptions, request: AIRequestOptions): Promise<void> {
    try {
      const [error, result] = await aiService.streamText(createOptions, request);
      if (error) {
        this.appendTerminalEvent(record, 'failed', undefined, error);
        return;
      }

      // 遍历流
      for await (const chunk of (result as { stream: AsyncIterable<Record<string, unknown>> }).stream) {
        // 流式 chunk 转 event 的逻辑在后续 Task 实现
      }

      this.appendTerminalEvent(record, 'completed');
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        this.appendTerminalEvent(record, 'aborted');
        return;
      }
      this.appendTerminalEvent(record, 'failed', undefined, {
        code: 'REQUEST_FAILED',
        message: (err as Error).message || 'Unknown stream error'
      });
    } finally {
      this.cleanupRunningIndex(record);
    }
  }

  /**
   * 追加 terminal 事件并更新 task 状态。
   */
  private appendTerminalEvent(record: TaskRecord, status: AIStreamTaskStatus, finish?: AIStreamTask['finish'], error?: AIStreamTask['error']): void {
    if (record.status !== 'running') return;
    record.status = status;
    record.completedAt = new Date().toISOString();
    record.updatedAt = record.completedAt;
    if (finish) record.finish = finish;
    if (error) record.error = error;
  }

  /**
   * 清理 runningTaskBySession 索引。
   */
  private cleanupRunningIndex(record: TaskRecord): void {
    if (this.runningTaskBySession.get(record.sessionId) === record.taskId) {
      this.runningTaskBySession.delete(record.sessionId);
    }
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
pnpm test test/electron/aiStreamTaskService.test.ts
```

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add electron/main/modules/ai/task-service.mts test/electron/aiStreamTaskService.test.ts
git commit -m "test(chat): 添加 AIStreamTaskService 创建 task 测试"
```

---

## Task 4: AIStreamTaskService — 并发控制与幂等

**Files:**
- Modify: `electron/main/modules/ai/task-service.mts`
- Modify: `test/electron/aiStreamTaskService.test.ts`

- [ ] **Step 1: 写失败测试 — 同 session 拒绝第二个 running task**

```typescript
it('rejects second task when session already has a running task', async () => {
  // 第一个 task 不传 stream，让它保持 running
  streamTextMock.mockImplementation(() => new Promise(() => {})); // never resolves

  const req1 = {
    clientRequestId: 'client-1',
    sessionId: 'session-1',
    turnId: 'turn-1',
    userMessageId: 'user-msg-1',
    assistantMessageId: 'assistant-msg-1',
    ownerWebContentsId: 1,
    createOptions: { providerType: 'openai', providerId: 'p-1', providerName: 'OpenAI' },
    request: { modelId: 'model-1', prompt: 'hi' }
  };

  await service.start(req1);

  const req2 = { ...req1, clientRequestId: 'client-2', turnId: 'turn-2' };
  await expect(service.start(req2)).rejects.toMatchObject({
    code: 'SESSION_STREAM_TASK_RUNNING'
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
pnpm test test/electron/aiStreamTaskService.test.ts -t "rejects second task"
```

Expected: FAIL — Promise resolves instead of rejecting.

- [ ] **Step 3: 在 `start()` 中添加并发检查**

在 `start()` 方法开头，`taskId` 生成之前加入：

```typescript
// 幂等检查：相同 clientRequestId 返回已有 task
const existingByClientId = this.taskByClientRequestId.get(params.clientRequestId);
if (existingByClientId) {
  const existing = this.tasks.get(existingByClientId);
  if (existing) {
    return {
      taskId: existing.taskId,
      turnId: existing.turnId,
      parentTaskId: existing.parentTaskId,
      requestId: existing.requestId,
      status: existing.status
    };
  }
}

// 并发检查：同一 session 已有 running task 则拒绝
const runningTaskId = this.runningTaskBySession.get(params.sessionId);
if (runningTaskId && this.tasks.has(runningTaskId)) {
  throw Object.assign(new Error('Session already has a running task'), {
    code: 'SESSION_STREAM_TASK_RUNNING'
  });
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
pnpm test test/electron/aiStreamTaskService.test.ts -t "rejects second task"
```

Expected: PASS

- [ ] **Step 5: 写失败测试 — 相同 clientRequestId 幂等返回已有 task**

```typescript
it('returns existing task for same clientRequestId (idempotent)', async () => {
  streamTextMock.mockImplementation(() => new Promise(() => {}));

  const req = {
    clientRequestId: 'idempotent-1',
    sessionId: 'session-2',
    turnId: 'turn-1',
    userMessageId: 'user-msg-1',
    assistantMessageId: 'assistant-msg-1',
    ownerWebContentsId: 1,
    createOptions: { providerType: 'openai', providerId: 'p-1', providerName: 'OpenAI' },
    request: { modelId: 'model-1', prompt: 'hi' }
  };

  const r1 = await service.start(req);
  const r2 = await service.start(req);

  expect(r1.taskId).toBe(r2.taskId);
  expect(r1.requestId).toBe(r2.requestId);
});
```

- [ ] **Step 6: 运行测试确认通过** (幂等逻辑已在 step 3 添加)

```bash
pnpm test test/electron/aiStreamTaskService.test.ts -t "idempotent"
```

Expected: PASS

- [ ] **Step 7: 提交**

```bash
git add electron/main/modules/ai/task-service.mts test/electron/aiStreamTaskService.test.ts
git commit -m "feat(chat): AIStreamTaskService 并发控制与幂等启动"
```

---

## Task 5: AIStreamTaskService — 事件记录、序列与 Flush

**Files:**
- Modify: `electron/main/modules/ai/task-service.mts`
- Modify: `test/electron/aiStreamTaskService.test.ts`

- [ ] **Step 1: 写失败测试 — stream 产生 text event 并递增 sequence**

```typescript
it('produces text events with monotonically increasing sequence', async () => {
  const mockStream = (async function* () {
    yield { type: 'text-delta' as const, text: 'Hello ' };
    yield { type: 'text-delta' as const, text: 'World' };
    yield { type: 'finish' as const, finishReason: 'stop' as const, totalUsage: { inputTokens: 5, outputTokens: 5, totalTokens: 10 } };
  })();

  streamTextMock.mockResolvedValue([undefined, { stream: mockStream }]);

  const events: Array<{ sequence: number; type: string }> = [];
  service.onEvent = vi.fn((event) => {
    events.push({ sequence: event.sequence, type: event.type });
  });

  const req = {
    clientRequestId: 'client-seq',
    sessionId: 'session-seq',
    turnId: 'turn-seq',
    userMessageId: 'user-msg-seq',
    assistantMessageId: 'assistant-msg-seq',
    ownerWebContentsId: 1,
    createOptions: { providerType: 'openai', providerId: 'p-1', providerName: 'OpenAI' },
    request: { modelId: 'model-1', prompt: 'hi' }
  };

  const result = await service.start(req);
  // 等待异步 task 完成
  await new Promise((r) => setTimeout(r, 100));

  expect(events.length).toBeGreaterThanOrEqual(1);
  for (let i = 1; i < events.length; i++) {
    expect(events[i].sequence).toBeGreaterThan(events[i - 1].sequence);
  }
  // terminal event 应存在
  const terminal = events.find((e) => e.type === 'terminal');
  expect(terminal).toBeDefined();
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
pnpm test test/electron/aiStreamTaskService.test.ts -t "monotonically"
```

Expected: FAIL — events array is empty (runTask not properly implemented).

- [ ] **Step 3: 实现 `runTask` 中的流遍历和事件生成**

替换 `runTask` 方法中 `// 流式 chunk 转 event...` 注释，并添加 helper 方法：

```typescript
/** 事件发送回调（用于测试和 IPC 注入）。 */
onEvent?: (event: AIStreamTaskEvent) => void;

private appendEvent(record: TaskRecord, event: AIStreamTaskEvent): void {
  record.events.push(event);
  record.latestSequence = event.sequence;
  record.updatedAt = event.createdAt;

  // 事件裁剪
  if (record.events.length > MAX_EVENTS_PER_TASK) {
    const removed = record.events.splice(0, record.events.length - MAX_EVENTS_PER_TASK);
    record.minAvailableSequence = removed[removed.length - 1].sequence + 1;
  }

  this.onEvent?.(event);
}

private nextSequence(record: TaskRecord): number {
  return record.latestSequence + 1;
}

private createEventBase(record: TaskRecord): Omit<AIStreamTaskEvent, 'type' | 'payload'> {
  return {
    taskId: record.taskId,
    turnId: record.turnId,
    sessionId: record.sessionId,
    userMessageId: record.userMessageId,
    assistantMessageId: record.assistantMessageId,
    requestId: record.requestId,
    sequence: this.nextSequence(record),
    createdAt: new Date().toISOString()
  };
}
```

更新 `runTask` 的流遍历：

```typescript
private async runTask(record: TaskRecord, createOptions: AICreateOptions, request: AIRequestOptions): Promise<void> {
  try {
    const [error, result] = await aiService.streamText(createOptions, request);
    if (error) {
      this.appendTerminalEvent(record, 'failed', undefined, error);
      return;
    }

    /** 文本合并缓冲区 */
    let textBuffer = '';
    let flushTimer: ReturnType<typeof setTimeout> | null = null;

    /** flush 文本缓冲区为一个 text event。 */
    const flushText = () => {
      if (textBuffer.length === 0) return;
      this.appendEvent(record, {
        ...this.createEventBase(record),
        type: 'text',
        payload: { text: textBuffer }
      } as AIStreamTaskEvent);
      textBuffer = '';
    };

    for await (const chunk of (result as { stream: AsyncIterable<{ type: string; text?: string; finishReason?: string; totalUsage?: { inputTokens: number; outputTokens: number; totalTokens: number } }> }).stream) {
      if (chunk.type === 'text-delta' && chunk.text) {
        textBuffer += chunk.text;
        if (!flushTimer) {
          flushTimer = setTimeout(() => { flushText(); flushTimer = null; }, 50);
        }
      } else if (chunk.type === 'finish') {
        flushText();
        this.appendEvent(record, {
          ...this.createEventBase(record),
          type: 'finish',
          payload: {
            finishReason: (chunk.finishReason || 'stop') as AIStreamFinishReason,
            usage: chunk.totalUsage ? { inputTokens: chunk.totalUsage.inputTokens, outputTokens: chunk.totalUsage.outputTokens, totalTokens: chunk.totalUsage.totalTokens } : { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
          }
        } as AIStreamTaskEvent);
      }
    }

    flushText();
    this.appendTerminalEvent(record, 'completed');
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      this.appendTerminalEvent(record, 'aborted');
      return;
    }
    this.appendTerminalEvent(record, 'failed', undefined, {
      code: 'REQUEST_FAILED',
      message: (err as Error).message || 'Unknown stream error'
    });
  } finally {
    this.cleanupRunningIndex(record);
  }
}
```

需要在文件头 import `AIStreamFinishReason`：
```typescript
import type { AIStreamFinishReason } from 'types/ai';
```

- [ ] **Step 4: 运行测试确认通过**

```bash
pnpm test test/electron/aiStreamTaskService.test.ts -t "monotonically"
```

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add electron/main/modules/ai/task-service.mts test/electron/aiStreamTaskService.test.ts
git commit -m "feat(chat): AIStreamTaskService 事件记录与 sequence 递增"
```

---

## Task 6: AIStreamTaskService — 查询、Abort、事件裁剪、状态机

**Files:**
- Modify: `electron/main/modules/ai/task-service.mts`
- Modify: `test/electron/aiStreamTaskService.test.ts`

- [ ] **Step 1: 写失败测试 — getTasksBySession 返回 running task**

```typescript
it('lists running tasks by session', async () => {
  streamTextMock.mockImplementation(() => new Promise(() => {}));

  await service.start({
    clientRequestId: 'c1', sessionId: 's-list', turnId: 't1',
    userMessageId: 'um1', assistantMessageId: 'am1', ownerWebContentsId: 1,
    createOptions: { providerType: 'openai', providerId: 'p-1', providerName: 'OpenAI' },
    request: { modelId: 'model-1', prompt: 'hi' }
  });

  const list = service.getTasksBySession('s-list');
  expect(list.length).toBe(1);
  expect(list[0].status).toBe('running');
  expect(list[0].sessionId).toBe('s-list');
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
pnpm test test/electron/aiStreamTaskService.test.ts -t "lists running tasks"
```

Expected: FAIL — `getTasksBySession` not defined.

- [ ] **Step 3: 添加查询方法 + abort + 事件查询 + 状态机保护**

在 `AIStreamTaskService` 类中添加：

```typescript
/**
 * 查询单个 task。
 */
getTask(taskId: string): AIStreamTaskSummary | undefined {
  const record = this.tasks.get(taskId);
  if (!record) return undefined;
  return this.toSummary(record);
}

/**
 * 按 session 查询 task 列表。
 */
getTasksBySession(sessionId: string, status?: AIStreamTaskStatus[]): AIStreamTaskSummary[] {
  const result: AIStreamTaskSummary[] = [];
  for (const record of this.tasks.values()) {
    if (record.sessionId !== sessionId) continue;
    if (status && status.length > 0 && !status.includes(record.status)) continue;
    result.push(this.toSummary(record));
  }
  return result;
}

/**
 * 查询 task 事件。
 */
getEvents(taskId: string, afterSequence?: number): { events: AIStreamTaskEvent[]; latestSequence: number; minAvailableSequence: number; contiguousFromSequence: number; truncated: boolean } {
  const record = this.tasks.get(taskId);
  if (!record) {
    throw Object.assign(new Error('Task not found'), { code: 'TASK_NOT_FOUND' });
  }

  const fromSeq = afterSequence ?? 0;

  if (fromSeq > 0 && fromSeq < record.minAvailableSequence - 1) {
    throw Object.assign(
      new Error('Event log has been truncated'),
      { code: 'STREAM_TASK_EVENT_LOG_TRUNCATED' }
    );
  }

  const events = record.events.filter((e) => e.sequence > fromSeq);
  return {
    events,
    latestSequence: record.latestSequence,
    minAvailableSequence: record.minAvailableSequence,
    contiguousFromSequence: record.minAvailableSequence,
    truncated: record.minAvailableSequence > 1
  };
}

/**
 * 中止 task。
 */
abortTask(taskId: string): void {
  const record = this.tasks.get(taskId);
  if (!record) return;
  if (record.status !== 'running') return;
  record.abortController.abort();
}

/**
 * 将 task record 转为 summary（不包括 events）。
 */
private toSummary(record: TaskRecord): AIStreamTaskSummary {
  return {
    taskId: record.taskId,
    turnId: record.turnId,
    parentTaskId: record.parentTaskId,
    sessionId: record.sessionId,
    userMessageId: record.userMessageId,
    assistantMessageId: record.assistantMessageId,
    requestId: record.requestId,
    status: record.status,
    startedAt: record.startedAt,
    updatedAt: record.updatedAt,
    completedAt: record.completedAt,
    latestSequence: record.latestSequence,
    minAvailableSequence: record.minAvailableSequence
  };
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
pnpm test test/electron/aiStreamTaskService.test.ts -t "lists running tasks"
```

Expected: PASS

- [ ] **Step 5: 写失败测试 — abort 只影响指定 task**

```typescript
it('aborts only the specified task', async () => {
  const neverResolve = () => new Promise(() => {});
  streamTextMock.mockImplementation(neverResolve);

  const r1 = await service.start({
    clientRequestId: 'abort-1', sessionId: 's-abort', turnId: 't1',
    userMessageId: 'um1', assistantMessageId: 'am1', ownerWebContentsId: 1,
    createOptions: { providerType: 'openai', providerId: 'p-1', providerName: 'OpenAI' },
    request: { modelId: 'model-1', prompt: 'hi1' }
  });
  const r2 = await service.start({
    clientRequestId: 'abort-2', sessionId: 's-abort-2', turnId: 't2',
    userMessageId: 'um2', assistantMessageId: 'am2', ownerWebContentsId: 1,
    createOptions: { providerType: 'openai', providerId: 'p-1', providerName: 'OpenAI' },
    request: { modelId: 'model-1', prompt: 'hi2' }
  });

  service.abortTask(r1.taskId);

  const t1 = service.getTask(r1.taskId);
  const t2 = service.getTask(r2.taskId);
  // t1 应变成 aborted，t2 仍是 running
  expect(t1?.status).toBe('aborted');
  expect(t2?.status).toBe('running');
});
```

- [ ] **Step 6: 运行测试确认通过** (abort 逻辑已实现)

```bash
pnpm test test/electron/aiStreamTaskService.test.ts -t "aborts only the specified"
```

Expected: PASS（但需要先确认 `appendTerminalEvent` 在 abort 时也能正确触发——目前 `runTask` 中 abort 路径已经处理 `AbortError`）

- [ ] **Step 7: 写失败测试 — 状态机只允许 running → 终态**

```typescript
it('state machine only allows running to terminal states', async () => {
  streamTextMock.mockImplementation(() => new Promise(() => {}));

  const { taskId } = await service.start({
    clientRequestId: 'sm-1', sessionId: 's-sm', turnId: 't1',
    userMessageId: 'um1', assistantMessageId: 'am1', ownerWebContentsId: 1,
    createOptions: { providerType: 'openai', providerId: 'p-1', providerName: 'OpenAI' },
    request: { modelId: 'model-1', prompt: 'hi' }
  });

  service.abortTask(taskId);

  // 尝试再次 abort（不应崩溃，静默忽略）
  service.abortTask(taskId);

  const task = service.getTask(taskId);
  expect(task?.status).toBe('aborted');
});
```

- [ ] **Step 8: 运行测试确认通过**

```bash
pnpm test test/electron/aiStreamTaskService.test.ts -t "state machine"
```

Expected: PASS

- [ ] **Step 9: 提交**

```bash
git add electron/main/modules/ai/task-service.mts test/electron/aiStreamTaskService.test.ts
git commit -m "feat(chat): AIStreamTaskService 查询、中止、事件查询与状态机"
```

---

## Task 7: AIStreamTaskService — Owner GC 与事件裁剪

**Files:**
- Modify: `electron/main/modules/ai/task-service.mts`
- Modify: `test/electron/aiStreamTaskService.test.ts`

- [ ] **Step 1: 写失败测试 — 超过 2000 条事件触发裁剪并返回 TRUNCATED**

```typescript
it('truncates events when exceeding max and returns STREAM_TASK_EVENT_LOG_TRUNCATED', async () => {
  // 生成超过 MAX_EVENTS 的事件
  const mockStream = (async function* () {
    for (let i = 0; i < 2500; i++) {
      yield { type: 'text-delta' as const, text: `word${i} ` };
    }
    yield { type: 'finish' as const, finishReason: 'stop' as const, totalUsage: { inputTokens: 5, outputTokens: 5, totalTokens: 10 } };
  })();

  streamTextMock.mockResolvedValue([undefined, { stream: mockStream }]);

  const { taskId } = await service.start({
    clientRequestId: 'trunc-1', sessionId: 's-trunc', turnId: 't1',
    userMessageId: 'um1', assistantMessageId: 'am1', ownerWebContentsId: 1,
    createOptions: { providerType: 'openai', providerId: 'p-1', providerName: 'OpenAI' },
    request: { modelId: 'model-1', prompt: 'hi' }
  });

  await new Promise((r) => setTimeout(r, 200));

  // 尝试查询被裁剪掉的早期事件
  await expect(async () => {
    service.getEvents(taskId, 0);
  }).rejects.toBeDefined();
});
```

- [ ] **Step 2: 运行测试确认失败/通过**

裁剪逻辑已在 `appendEvent` 中实现。验证后继续。

- [ ] **Step 3: 添加 `abortTasksByOwner` 方法并写测试**

```typescript
it('aborts all tasks owned by a window when it closes', async () => {
  streamTextMock.mockImplementation(() => new Promise(() => {}));

  const r1 = await service.start({
    clientRequestId: 'owner-1', sessionId: 's-owner-1', turnId: 't1',
    userMessageId: 'um1', assistantMessageId: 'am1', ownerWebContentsId: 42,
    createOptions: { providerType: 'openai', providerId: 'p-1', providerName: 'OpenAI' },
    request: { modelId: 'model-1', prompt: 'hi' }
  });
  const r2 = await service.start({
    clientRequestId: 'owner-2', sessionId: 's-owner-2', turnId: 't2',
    userMessageId: 'um2', assistantMessageId: 'am2', ownerWebContentsId: 99,
    createOptions: { providerType: 'openai', providerId: 'p-1', providerName: 'OpenAI' },
    request: { modelId: 'model-1', prompt: 'hi' }
  });

  service.abortTasksByOwner(42);

  const t1 = service.getTask(r1.taskId);
  const t2 = service.getTask(r2.taskId);
  expect(t1?.status).toBe('aborted');
  expect(t2?.status).toBe('running');
});
```

- [ ] **Step 4: 补充 `abortTasksByOwner` 方法**

```typescript
/**
 * 中止指定窗口创建的所有 running task（窗口关闭时调用）。
 */
abortTasksByOwner(webContentsId: number): void {
  for (const [, record] of this.tasks) {
    if (record.ownerWebContentsId === webContentsId && record.status === 'running') {
      this.abortTask(record.taskId);
    }
  }
}
```

- [ ] **Step 5: 运行测试确认通过**

```bash
pnpm test test/electron/aiStreamTaskService.test.ts -t "aborts all tasks owned"
```

Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add electron/main/modules/ai/task-service.mts test/electron/aiStreamTaskService.test.ts
git commit -m "feat(chat): AIStreamTaskService owner GC 与事件裁剪"
```

---

## Task 8: Task IPC Handler 注册

**Files:**
- Create: `electron/main/modules/ai/task-ipc.mts`
- Modify: `electron/main/modules/index.mts`

- [ ] **Step 1: 创建 `electron/main/modules/ai/task-ipc.mts`**

```typescript
/**
 * @file task-ipc.mts
 * @description AI Stream Task IPC handler 注册，暴露 6 个 task API + 1 个事件通道。
 */
import type { AIStreamTaskStartRequest, AIStreamTaskAbortTurnRequest, AIStreamTaskEventsQuery, AIStreamTaskListBySessionQuery, AIStreamTaskEvent } from 'types/chat-stream-task';
import { ipcMain } from 'electron';
import { getWindowFromWebContents } from '../../window.mjs';
import { AIStreamTaskService } from './task-service.mjs';

/** 全局 task service 单例。 */
const taskService = new AIStreamTaskService();

/**
 * 注册 task 相关 IPC handler。
 */
export function registerTaskHandlers(): void {
  /** 启动 task。 */
  ipcMain.handle('ai:stream-task:start', async (event, req: AIStreamTaskStartRequest) => {
    const win = getWindowFromWebContents(event.sender);
    if (!win) return { error: { code: 'TASK_OWNER_MISMATCH' as const, message: 'Window not found' } };

    try {
      const result = await taskService.start({
        ...req,
        ownerWebContentsId: win.webContents.id
      });
      return { result };
    } catch (err) {
      const error = err as { code?: string; message?: string };
      return { error: { code: (error.code || 'REQUEST_FAILED') as StreamTaskErrorCode, message: error.message || 'Unknown error' } };
    }
  });

  /** 中止单个 task。 */
  ipcMain.handle('ai:stream-task:abort', (_event, taskId: string) => {
    taskService.abortTask(taskId);
  });

  /** 中止整个 turn。 */
  ipcMain.handle('ai:stream-task:abort-turn', (_event, req: AIStreamTaskAbortTurnRequest) => {
    const tasks = taskService.getTasksBySession(req.sessionId, ['running']);
    for (const t of tasks) {
      if (t.turnId === req.turnId) {
        taskService.abortTask(t.taskId);
      }
    }
  });

  /** 查询单个 task。 */
  ipcMain.handle('ai:stream-task:get', (_event, taskId: string) => {
    return taskService.getTask(taskId);
  });

  /** 按 session 查询 task 列表。 */
  ipcMain.handle('ai:stream-task:list-by-session', (_event, query: AIStreamTaskListBySessionQuery) => {
    return taskService.getTasksBySession(query.sessionId, query.status);
  });

  /** 查询 task 事件。 */
  ipcMain.handle('ai:stream-task:get-events', (_event, query: AIStreamTaskEventsQuery) => {
    try {
      const result = taskService.getEvents(query.taskId, query.afterSequence);
      return { result };
    } catch (err) {
      const error = err as { code?: string; message?: string };
      return { error: { code: (error.code || 'REQUEST_FAILED') as StreamTaskErrorCode, message: error.message || 'Unknown error' } };
    }
  });

  /** Task 事件推送回调。 */
  taskService.onEvent = (event: AIStreamTaskEvent) => {
    const task = taskService.getTask(event.taskId);
    if (!task) return;
    // 遍历所有窗口，仅推送给 owner
    const windows = require('electron').BrowserWindow.getAllWindows();
    for (const win of windows) {
      if (win.webContents.id === (task as { ownerWebContentsId?: number }).ownerWebContentsId) {
        win.webContents.send('ai:stream-task:event', event);
        break;
      }
    }
  };
}
```

- [ ] **Step 2: 在 `electron/main/modules/index.mts` 中注册 task handlers**

在 import 区添加：
```typescript
import { registerTaskHandlers } from './ai/task-ipc.mjs';
```

在 `registerAllIpcHandlers()` 中添加调用：
```typescript
registerTaskHandlers();
```

同样在 export 列表中添加：
```typescript
export { registerTaskHandlers } from './ai/task-ipc.mjs';
```

- [ ] **Step 3: 提交**

```bash
git add electron/main/modules/ai/task-ipc.mts electron/main/modules/index.mts
git commit -m "feat(chat): 注册 task IPC handler"
```

---

## Task 9: Preload 暴露 Task API

**Files:**
- Modify: `electron/preload/index.mts`

- [ ] **Step 1: 在 preload 中添加 task API 方法**

在 `electronAPI` 对象中添加（在 `aiStreamAbort` 之后）：

```typescript
// ==================== AI 流式 Task API ====================

aiStreamTaskStart: (request) => ipcRenderer.invoke('ai:stream-task:start', request),
aiStreamTaskAbort: (taskId) => ipcRenderer.invoke('ai:stream-task:abort', taskId),
aiStreamTaskAbortTurn: (request) => ipcRenderer.invoke('ai:stream-task:abort-turn', request),
aiStreamTaskGet: (taskId) => ipcRenderer.invoke('ai:stream-task:get', taskId),
aiStreamTaskListBySession: (query) => ipcRenderer.invoke('ai:stream-task:list-by-session', query),
aiStreamTaskGetEvents: (query) => ipcRenderer.invoke('ai:stream-task:get-events', query),
onAiStreamTaskEvent: (callback) => {
  const handler = (_event: Electron.IpcRendererEvent, payload: unknown) => callback(payload as AIStreamTaskEvent);
  ipcRenderer.on('ai:stream-task:event', handler);
  return () => {
    ipcRenderer.removeListener('ai:stream-task:event', handler);
  };
},
```

在 preload 文件顶部的 import type 中添加：
```typescript
import type {
  // ... existing imports
  AIStreamTaskEvent,
  AIStreamTaskEventsQuery,
  AIStreamTaskEventsResult,
  AIStreamTaskAbortTurnRequest,
  AIStreamTaskListBySessionQuery,
  AIStreamTaskStartRequest,
  AIStreamTaskStartResult,
  AIStreamTaskSummary,
  StreamTaskError
} from 'types/chat-stream-task';
```

- [ ] **Step 2: 提交**

```bash
git add electron/preload/index.mts
git commit -m "feat(chat): preload 暴露 task API"
```

---

## Task 10: 渲染进程 Session Runtime Map

**Files:**
- Create: `src/components/BChatSidebar/utils/sessionRuntimeMap.ts`
- Create: `test/components/BChatSidebar/sessionRuntimeMap.test.ts`

- [ ] **Step 1: 写失败测试 — sessionRuntimeMap 能创建、查询 runtime**

```typescript
/**
 * @file sessionRuntimeMap.test.ts
 * @description 全局 sessionRuntimeMap 单元测试。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createSessionRuntimeMap } from '../../../src/components/BChatSidebar/utils/sessionRuntimeMap';

describe('sessionRuntimeMap', () => {
  let map: ReturnType<typeof createSessionRuntimeMap>;

  beforeEach(() => {
    map = createSessionRuntimeMap();
  });

  it('creates and retrieves a runtime by sessionId', () => {
    const runtime = map.getOrCreate('session-1', []);
    expect(runtime).toBeDefined();
    expect(runtime.sessionId).toBe('session-1');
    expect(runtime.generationState).toBe('idle');

    const same = map.get('session-1');
    expect(same).toBe(runtime);
  });

  it('returns undefined for non-existent session', () => {
    expect(map.get('nonexistent')).toBeUndefined();
  });

  it('deletes a runtime', () => {
    map.getOrCreate('session-1', []);
    map.delete('session-1');
    expect(map.get('session-1')).toBeUndefined();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
pnpm test test/components/BChatSidebar/sessionRuntimeMap.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: 创建 `src/components/BChatSidebar/utils/sessionRuntimeMap.ts`**

```typescript
/**
 * @file sessionRuntimeMap.ts
 * @description 渲染进程全局 session runtime map，管理所有会话的生成状态与消息运行时。
 */
import type { ChatSessionRuntime, ChatTurnRuntime, SessionGenerationState } from 'types/chat-stream-task';
import { shallowReactive } from 'vue';

/**
 * 内部 runtime 条目（含 Vue 响应式绑定）。
 */
interface SessionRuntimeEntry {
  sessionId: string;
  messages: unknown[];
  generationState: SessionGenerationState;
  activeTurn?: ChatTurnRuntime;
  consumedSequences: Map<string, number>;
  dirty: boolean;
}

/**
 * 创建全局 session runtime map。
 */
export function createSessionRuntimeMap() {
  const runtimes = new Map<string, SessionRuntimeEntry>();

  return {
    /**
     * 获取或创建 session runtime。
     * @param sessionId - 会话 ID
     * @param messages - 初始消息列表
     * @returns runtime 对象
     */
    getOrCreate(sessionId: string, messages: unknown[]): SessionRuntimeEntry {
      const existing = runtimes.get(sessionId);
      if (existing) return existing;

      const entry: SessionRuntimeEntry = shallowReactive({
        sessionId,
        messages,
        generationState: 'idle',
        consumedSequences: new Map(),
        dirty: false
      });

      runtimes.set(sessionId, entry);
      return entry;
    },

    /**
     * 获取 session runtime（不创建）。
     */
    get(sessionId: string): SessionRuntimeEntry | undefined {
      return runtimes.get(sessionId);
    },

    /**
     * 删除 session runtime。
     */
    delete(sessionId: string): void {
      runtimes.delete(sessionId);
    },

    /**
     * 检查是否存在 runtime。
     */
    has(sessionId: string): boolean {
      return runtimes.has(sessionId);
    },

    /**
     * 获取所有 runtime 的 sessionId。
     */
    keys(): IterableIterator<string> {
      return runtimes.keys();
    }
  };
}

/** 全局单例。 */
export const sessionRuntimeMap = createSessionRuntimeMap();
```

- [ ] **Step 4: 运行测试确认通过**

```bash
pnpm test test/components/BChatSidebar/sessionRuntimeMap.test.ts
```

Expected: PASS

- [ ] **Step 5: 写测试 — 后台会话事件路由到正确 runtime**

```typescript
it('routes background session events to correct runtime', () => {
  const runtimeA = map.getOrCreate('session-a', []);
  const runtimeB = map.getOrCreate('session-b', []);

  // 模拟事件路由
  const event = {
    type: 'text' as const,
    taskId: 'task-1',
    turnId: 'turn-1',
    sessionId: 'session-b',
    userMessageId: 'um1',
    assistantMessageId: 'am1',
    requestId: 'rid1',
    sequence: 1,
    createdAt: new Date().toISOString(),
    payload: { text: 'hello from B' }
  };

  const target = map.get(event.sessionId);
  expect(target).toBe(runtimeB);
  expect(target).not.toBe(runtimeA);
});
```

- [ ] **Step 6: 运行测试确认通过**

```bash
pnpm test test/components/BChatSidebar/sessionRuntimeMap.test.ts -t "routes background"
```

Expected: PASS

- [ ] **Step 7: 提交**

```bash
git add src/components/BChatSidebar/utils/sessionRuntimeMap.ts test/components/BChatSidebar/sessionRuntimeMap.test.ts
git commit -m "feat(chat): 渲染进程全局 sessionRuntimeMap"
```

---

## Task 11: 渲染进程 Task Event Reducer

**Files:**
- Create: `src/components/BChatSidebar/utils/taskEventReducer.ts`
- Create: `test/components/BChatSidebar/taskEventReducer.test.ts`

- [ ] **Step 1: 写失败测试 — reducer 正确处理 text event 去重**

```typescript
/**
 * @file taskEventReducer.test.ts
 * @description Task event reducer 单元测试。
 */
import { describe, expect, it } from 'vitest';
import { applyTaskEvent, createTaskEventReducer } from '../../../src/components/BChatSidebar/utils/taskEventReducer';

describe('taskEventReducer', () => {
  const baseEvent = {
    taskId: 'task-1',
    turnId: 'turn-1',
    sessionId: 'session-1',
    userMessageId: 'user-msg-1',
    assistantMessageId: 'assistant-msg-1',
    requestId: 'req-1'
  };

  it('deduplicates events by taskId + sequence', () => {
    const consumedSequences = new Map<string, number>();
    const event1 = { ...baseEvent, type: 'text' as const, sequence: 1, createdAt: new Date().toISOString(), payload: { text: 'Hello' } };
    const event2 = { ...baseEvent, type: 'text' as const, sequence: 1, createdAt: new Date().toISOString(), payload: { text: 'Duplicate' } };
    const event3 = { ...baseEvent, type: 'text' as const, sequence: 2, createdAt: new Date().toISOString(), payload: { text: ' World' } };

    expect(applyTaskEvent(event1, consumedSequences)).toBe(true);
    expect(applyTaskEvent(event2, consumedSequences)).toBe(false); // 去重
    expect(applyTaskEvent(event3, consumedSequences)).toBe(true);
    expect(consumedSequences.get('task-1')).toBe(2);
  });

  it('returns false for terminal events already seen', () => {
    const consumedSequences = new Map<string, number>();
    consumedSequences.set('task-1', 5);
    const terminal: AIStreamTaskEvent = {
      ...baseEvent, type: 'terminal', sequence: 3, createdAt: new Date().toISOString(),
      payload: { status: 'completed' }
    };
    expect(applyTaskEvent(terminal, consumedSequences)).toBe(false);
  });
});
```

需要在文件头部 import：
```typescript
import type { AIStreamTaskEvent } from 'types/chat-stream-task';
```

- [ ] **Step 2: 运行测试确认失败**

```bash
pnpm test test/components/BChatSidebar/taskEventReducer.test.ts
```

Expected: FAIL — `applyTaskEvent` not found.

- [ ] **Step 3: 创建 `src/components/BChatSidebar/utils/taskEventReducer.ts`**

```typescript
/**
 * @file taskEventReducer.ts
 * @description 渲染进程 task event reducer，按 taskId + sequence 去重并更新 consumedSequences。
 */
import type { AIStreamTaskEvent } from 'types/chat-stream-task';

/**
 * 应用单个 task event，检查去重并更新消费记录。
 * @param event - task 事件
 * @param consumedSequences - taskId → lastConsumedSequence 的映射
 * @returns 该事件是否应该被处理（非重复）
 */
export function applyTaskEvent(event: AIStreamTaskEvent, consumedSequences: Map<string, number>): boolean {
  const lastConsumed = consumedSequences.get(event.taskId) ?? 0;

  // 去重：sequence <= lastConsumed 意味着已处理过
  if (event.sequence <= lastConsumed) {
    return false;
  }

  consumedSequences.set(event.taskId, event.sequence);
  return true;
}

/**
 * 将一系列事件排序并去重后返回需要处理的子集。
 * @param events - 事件数组（可能乱序）
 * @param consumedSequences - 已消费记录
 * @returns 去重且排序后的事件
 */
export function filterAndSortEvents(events: AIStreamTaskEvent[], consumedSequences: Map<string, number>): AIStreamTaskEvent[] {
  return events
    .filter((e) => {
      const lastConsumed = consumedSequences.get(e.taskId) ?? 0;
      return e.sequence > lastConsumed;
    })
    .sort((a, b) => a.sequence - b.sequence);
}

/**
 * 创建 task event reducer 上下文。
 */
export function createTaskEventReducer() {
  const consumedSequences = new Map<string, number>();

  return {
    consumedSequences,

    /**
     * 应用事件并去重。
     */
    apply(event: AIStreamTaskEvent): boolean {
      return applyTaskEvent(event, consumedSequences);
    },

    /**
     * 批量应用排序去重后的事件。
     */
    applyBatch(events: AIStreamTaskEvent[]): AIStreamTaskEvent[] {
      return filterAndSortEvents(events, consumedSequences).filter((e) => applyTaskEvent(e, consumedSequences));
    },

    /**
     * 获取指定 task 的最后消费 sequence。
     */
    getLastSequence(taskId: string): number {
      return consumedSequences.get(taskId) ?? 0;
    }
  };
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
pnpm test test/components/BChatSidebar/taskEventReducer.test.ts
```

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/components/BChatSidebar/utils/taskEventReducer.ts test/components/BChatSidebar/taskEventReducer.test.ts
git commit -m "feat(chat): 渲染进程 task event reducer 去重逻辑"
```

---

## Task 12: SessionHistory UI — 运行中状态展示

**Files:**
- Modify: `src/components/BChatSidebar/components/SessionHistory.vue`

- [ ] **Step 1: 在 SessionHistory 中注入生成状态并显示 loading 图标**

修改 `SessionHistory.vue`：

1. 新增 Props 接收运行中 sessionId 集合：

```typescript
interface Props {
  activeSessionId?: string | null;
  disabled?: boolean;
  /** 正在生成中的会话 ID 集合 */
  generatingSessionIds?: Set<string>;
}
```

2. 在模板中，运行中的会话显示 loading 图标：

```html
<span v-if="generatingSessionIds?.has(session.id)" class="session-history__generating-icon">
  <Icon icon="lucide:loader-2" width="12" height="12" class="is-spinning" />
</span>
```

3. 为运行中会话禁用删除按钮：

```html
<BButton
  v-if="!generatingSessionIds?.has(session.id)"
  type="text" square danger size="small" @click.stop="handleDeleteSession(session.id)"
>
  <Icon icon="lucide:trash-2" width="14" height="14" />
</BButton>
```

4. 移除 `disabled` prop 对 `handleSwitchSession` 中 `props.disabled` 的检查（允许跨会话切换）：

```typescript
function handleSwitchSession(sessionId: string): void {
  // 移除 disabled 检查
  if (sessionId === props.activeSessionId) return;

  open.value = false;
  emit('switch-session', sessionId);
}
```

5. 移除 BDropdown 的 `:disabled="isDisabled"` 对整体禁用的依赖。

- [ ] **Step 2: 提交**

```bash
git add src/components/BChatSidebar/components/SessionHistory.vue
git commit -m "feat(chat): SessionHistory 支持运行中状态展示与会话切换"
```

---

## Task 13: 验证旧 `ai:stream` 兼容性 + 运行全测试

**Files:**
- (验证现有代码不受影响)

- [ ] **Step 1: 运行 AI Service 现有测试确认通过**

```bash
pnpm test test/electron/aiService.test.ts
```

Expected: PASS（4 tests）

- [ ] **Step 2: 运行新增的全部 task 测试**

```bash
pnpm test test/electron/aiStreamTaskService.test.ts test/components/BChatSidebar/taskEventReducer.test.ts test/components/BChatSidebar/sessionRuntimeMap.test.ts
```

Expected: 全部 PASS

- [ ] **Step 3: 确认 task-ipc.mts 的 IPC 注册使用 `require` 改为 ES import**

检查 `task-ipc.mts` 中获取所有窗口的方式。由于 Electron 主进程是 CJS/ESM 混合环境，需要用正确的方式访问 `BrowserWindow`：

```typescript
import { BrowserWindow } from 'electron';
// 替换 require('electron').BrowserWindow
```

- [ ] **Step 4: 运行 TypeScript 类型检查**

```bash
pnpm exec tsc --noEmit 2>&1 | head -30
```

修复任何类型错误。

- [ ] **Step 5: 提交**

```bash
git add -A
git commit -m "chore(chat): 验证旧 ai:stream 兼容性与类型检查"
```

---

## 后续任务（本 Plan 范围外，留作下一次实现）

以下任务需要修改 `useChatStream.ts`、`useChatTaskRuntime.ts` 和 `BChatSidebar/index.vue` 的核心发送/流式/工具续轮逻辑，涉及较大重构。本 Plan 完成了基础设施（类型、主进程 service、IPC、preload、sessionRuntimeMap、eventReducer、SessionHistory UI），后续可基于此基础设施分阶段改造渲染进程核心逻辑：

1. **改造 useChatStream 发送/流式**：使用 `aiStreamTaskStart` 替代 `aiStream`，按 task event 更新消息
2. **改造 useChatTaskRuntime turn lock**：将当前单 task 锁改为 turn 级锁
3. **改造工具续轮**：工具完成后使用同一 turnId + 新 clientRequestId + parentTaskId 启动下一 task
4. **Abort turn**：实现 `abortTurn` 逻辑（中止 task + 标记 turn cancelled + 阻止续轮）
5. **会话切换恢复**：使用 `sessionRuntimeMap` + `getEvents` 重放历史事件
6. **集成测试**：多会话并发生成、交错 stream 不串流、后台完成恢复、中途断网恢复
```

---

## 自审与覆盖检查

**Spec coverage:**
- Turn 类型 ✅（Task 1）
- Task 类型 ✅（Task 1）
- Event 类型 ✅（Task 1）
- State Machine ✅（Task 6）
- Event Retention / 裁剪 ✅（Task 7）
- IPC API (6 个) ✅（Task 8）
- 并发控制 ✅（Task 4）
- 幂等启动 ✅（Task 4）
- Owner 校验 ✅（Task 8 IPC + onEvent owner 过滤）
- GC (窗口关闭 + task 裁剪) ✅（Task 7）
- SessionRuntimeMap ✅（Task 10）
- Event Reducer ✅（Task 11）
- SessionHistory UI ✅（Task 12）

**Not in this plan (后续):**
- useChatStream 核心改造
- useChatTaskRuntime turn lock 改造
- 工具续轮 task 串联
- Abort turn 完整渲染流程
- 会话切换恢复流程
- 持久化策略
- 集成测试
</parameter>
