# Chat Runtime Stream Executor Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `stream-executor.mts` 拆分为 `stream/` 目录，修复 4 个行为 bug 与 1 处类型安全问题，并保持公共 API 不变。

**Architecture:** 按职责把原 700+ 行文件拆成 7 个 focused 模块：`types`、`chunks`、`tools`、`message-parts`、`request`、`executor`、`index`。Bug 修复随职责自然落到对应文件，对外仍只导出 `createRuntimeStreamExecutor` 与 `RuntimeStreamText`。

**Tech Stack:** TypeScript (ESM `.mts`), Vercel AI SDK types, Vitest

---

## File Structure

```
electron/main/modules/chat/runtime/stream/
├── index.mts          # public API
├── types.mts          # all internal types
├── chunks.mts         # chunk normalization
├── tools.mts          # tool execution, classification, result factories
├── message-parts.mts  # assistant message mutation
├── request.mts        # AIRequestOptions builder
└── executor.mts       # main streaming loop
```

Files modified:
- `electron/main/modules/chat/runtime/service.mts` — update import path
- `test/electron/main/modules/chat/runtime/stream-executor.test.ts` — move and rename, add bug-fix tests

Files deleted:
- `electron/main/modules/chat/runtime/stream-executor.mts`

---

## Task 1: Create `stream/types.mts`

**Files:**
- Create: `electron/main/modules/chat/runtime/stream/types.mts`

Move all type definitions and interfaces from the top of `stream-executor.mts` into this file.

- [ ] **Step 1: Write the file**

```typescript
/**
 * @file stream/types.mts
 * @description ChatRuntime 流式执行器内部类型。
 */
import type { ChatModelResolver } from '../model/resolver.mjs';
import type {
  ChatRuntimeMainToolExecutor,
  ChatRuntimeRendererToolExecutor
} from '../types.mjs';
import type { AIRequestOptions, AIServiceError, AIStreamFinishReason, AIStreamResult, AIUsage, AIToolExecutionResult } from 'types/ai';

/** Runtime 模型流式调用函数。 */
export type RuntimeStreamText = (
  createOptions: NonNullable<Awaited<ReturnType<ChatModelResolver['resolve']>>>['createOptions'],
  request: AIRequestOptions
) => Promise<[AIServiceError] | [undefined, AIStreamResult]>;

/** Runtime 流式执行器依赖。 */
export interface RuntimeStreamExecutorDependencies {
  /** 聊天模型解析器。 */
  resolver: ChatModelResolver;
  /** 模型流式调用函数。 */
  streamText: RuntimeStreamText;
  /** Renderer 本地工具执行函数。 */
  executeRendererTool?: ChatRuntimeRendererToolExecutor;
  /** 主进程工具执行函数。 */
  executeMainTool?: ChatRuntimeMainToolExecutor;
  /** Renderer 本地工具超时时间。 */
  rendererToolTimeoutMs?: number;
}

/** AI SDK 文本增量 chunk。 */
export interface RuntimeTextDeltaChunk {
  /** chunk 类型。 */
  type: 'text-delta';
  /** 文本增量。 */
  text: string;
}

/** AI SDK reasoning 增量 chunk。 */
export interface RuntimeReasoningDeltaChunk {
  /** chunk 类型。 */
  type: 'reasoning-delta';
  /** 思考增量。 */
  text: string;
}

/** AI SDK 错误 chunk。 */
export interface RuntimeErrorChunk {
  /** chunk 类型。 */
  type: 'error';
  /** 错误对象。 */
  error: unknown;
}

/** AI SDK 完成 chunk。 */
export interface RuntimeFinishChunk {
  /** chunk 类型。 */
  type: 'finish';
  /** 完成原因。 */
  finishReason: AIStreamFinishReason;
  /** 总 usage。 */
  totalUsage?: Partial<AIUsage>;
}

/** AI SDK 工具调用 chunk。 */
export interface RuntimeToolCallChunk {
  /** chunk 类型。 */
  type: 'tool-call';
  /** 工具调用 ID。 */
  toolCallId: string;
  /** 工具名称。 */
  toolName: string;
  /** 工具输入。 */
  input: unknown;
}

/** AI SDK 工具输入开始 chunk。 */
export interface RuntimeToolInputStartChunk {
  /** chunk 类型。 */
  type: 'tool-input-start';
  /** 工具调用 ID。 */
  toolCallId: string;
  /** 工具名称。 */
  toolName: string;
}

/** AI SDK 工具输入增量 chunk。 */
export interface RuntimeToolInputDeltaChunk {
  /** chunk 类型。 */
  type: 'tool-input-delta';
  /** 工具调用 ID。 */
  toolCallId: string;
  /** 输入 JSON 文本增量。 */
  inputTextDelta: string;
}

/** AI SDK 工具输入结束 chunk。 */
export interface RuntimeToolInputEndChunk {
  /** chunk 类型。 */
  type: 'tool-input-end';
  /** 工具调用 ID。 */
  toolCallId: string;
}

/** AI SDK 工具结果 chunk。 */
export interface RuntimeToolResultChunk {
  /** chunk 类型。 */
  type: 'tool-result';
  /** 工具调用 ID。 */
  toolCallId: string;
  /** 工具名称。 */
  toolName: string;
  /** 规范化工具结果。 */
  result: AIToolExecutionResult;
}

/** Runtime 暂不处理的 AI stream chunk。 */
export interface RuntimeUnsupportedChunk {
  /** chunk 类型。 */
  type: 'unsupported';
}

/** Runtime 当前支持消费的 AI stream chunk。 */
export type RuntimeStreamChunk =
  | RuntimeTextDeltaChunk
  | RuntimeReasoningDeltaChunk
  | RuntimeErrorChunk
  | RuntimeFinishChunk
  | RuntimeToolCallChunk
  | RuntimeToolInputStartChunk
  | RuntimeToolInputDeltaChunk
  | RuntimeToolInputEndChunk
  | RuntimeToolResultChunk
  | RuntimeUnsupportedChunk;
```

- [ ] **Step 2: Verify TypeScript can parse the file**

Run: `pnpm exec tsc --noEmit`
Expected: No errors from the new file (other files still reference missing `stream-executor.mts`, which is fine at this stage).

---

## Task 2: Create `stream/chunks.mts`

**Files:**
- Create: `electron/main/modules/chat/runtime/stream/chunks.mts`

Move chunk normalization utilities: `isRecord`, `normalizeUsage`, `isToolExecutionResult`, `normalizeToolResult`, `toRuntimeStreamChunk`.

- [ ] **Step 1: Write the file**

```typescript
/**
 * @file stream/chunks.mts
 * @description AI SDK chunk 到 runtime chunk 的规范化。
 */
import type { AIStreamFinishReason, AIUsage, AIToolExecutionResult } from 'types/ai';
import type {
  RuntimeErrorChunk,
  RuntimeFinishChunk,
  RuntimeReasoningDeltaChunk,
  RuntimeStreamChunk,
  RuntimeTextDeltaChunk,
  RuntimeToolCallChunk,
  RuntimeToolInputDeltaChunk,
  RuntimeToolInputEndChunk,
  RuntimeToolInputStartChunk,
  RuntimeToolResultChunk,
  RuntimeUnsupportedChunk
} from './types.mjs';

/**
 * 判断值是否为对象记录。
 * @param value - 待判断值
 * @returns 是否为对象记录
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * 将 partial usage 补齐为稳定 usage。
 * @param usage - partial usage
 * @returns 稳定 usage
 */
export function normalizeUsage(usage: Partial<AIUsage>): AIUsage {
  return {
    inputTokens: typeof usage.inputTokens === 'number' ? usage.inputTokens : 0,
    outputTokens: typeof usage.outputTokens === 'number' ? usage.outputTokens : 0,
    totalTokens: typeof usage.totalTokens === 'number' ? usage.totalTokens : 0
  };
}

/**
 * 判断对象是否已经是规范化工具执行结果。
 * @param value - 待判断值
 * @returns 是否为工具执行结果
 */
function isToolExecutionResult(value: unknown): value is AIToolExecutionResult {
  return isRecord(value) && typeof value.toolName === 'string' && typeof value.status === 'string';
}

/**
 * 将 SDK 工具结果 chunk 规范化为应用工具结果。
 * @param toolName - 工具名称
 * @param result - SDK result 字段
 * @param output - SDK output 字段
 * @returns 工具执行结果
 */
export function normalizeToolResult(toolName: string, result: unknown, output: unknown): AIToolExecutionResult {
  const payload = result ?? output;
  if (isToolExecutionResult(payload)) return payload;

  return {
    toolName,
    status: 'success',
    data: payload
  };
}

/**
 * 将未知 chunk 规范化为 runtime 可消费 chunk。
 * @param chunk - AI SDK 原始 chunk
 * @returns runtime chunk
 */
export function toRuntimeStreamChunk(chunk: unknown): RuntimeStreamChunk | undefined {
  if (!isRecord(chunk) || typeof chunk.type !== 'string') return undefined;

  if (chunk.type === 'text-delta' && typeof chunk.text === 'string') {
    return { type: 'text-delta', text: chunk.text } as RuntimeTextDeltaChunk;
  }

  if (chunk.type === 'reasoning-delta' && typeof chunk.text === 'string') {
    return { type: 'reasoning-delta', text: chunk.text } as RuntimeReasoningDeltaChunk;
  }

  if (chunk.type === 'error') {
    return { type: 'error', error: chunk.error } as RuntimeErrorChunk;
  }

  if (chunk.type === 'finish') {
    return {
      type: 'finish',
      finishReason: typeof chunk.finishReason === 'string' ? (chunk.finishReason as AIStreamFinishReason) : 'other',
      totalUsage: isRecord(chunk.totalUsage) ? normalizeUsage(chunk.totalUsage) : undefined
    } as RuntimeFinishChunk;
  }

  if (chunk.type === 'tool-call' && typeof chunk.toolCallId === 'string' && typeof chunk.toolName === 'string') {
    return { type: 'tool-call', toolCallId: chunk.toolCallId, toolName: chunk.toolName, input: chunk.input } as RuntimeToolCallChunk;
  }

  if (chunk.type === 'tool-input-start' && typeof chunk.id === 'string' && typeof chunk.toolName === 'string') {
    return { type: 'tool-input-start', toolCallId: chunk.id, toolName: chunk.toolName } as RuntimeToolInputStartChunk;
  }

  if (chunk.type === 'tool-input-delta' && typeof chunk.id === 'string' && typeof chunk.delta === 'string') {
    return { type: 'tool-input-delta', toolCallId: chunk.id, inputTextDelta: chunk.delta } as RuntimeToolInputDeltaChunk;
  }

  if (chunk.type === 'tool-input-end' && typeof chunk.id === 'string') {
    return { type: 'tool-input-end', toolCallId: chunk.id } as RuntimeToolInputEndChunk;
  }

  if (chunk.type === 'tool-result' && typeof chunk.toolCallId === 'string' && typeof chunk.toolName === 'string') {
    return {
      type: 'tool-result',
      toolCallId: chunk.toolCallId,
      toolName: chunk.toolName,
      result: normalizeToolResult(chunk.toolName, chunk.result, chunk.output)
    } as RuntimeToolResultChunk;
  }

  return { type: 'unsupported' } as RuntimeUnsupportedChunk;
}
```

- [ ] **Step 2: Verify TypeScript**

Run: `pnpm exec tsc --noEmit`
Expected: No new errors.

---

## Task 3: Create `stream/tools.mts`

**Files:**
- Create: `electron/main/modules/chat/runtime/stream/tools.mts`

Move tool-related helpers, add `createUnknownToolFailureResult`, and type the error code set.

- [ ] **Step 1: Write the file**

```typescript
/**
 * @file stream/tools.mts
 * @description ChatRuntime 流式执行器工具执行与结果工厂。
 */
import type {
  ActiveChatRuntime,
  ChatRuntimeMainToolExecutor,
  ChatRuntimeRendererToolExecutor
} from '../types.mjs';
import type { AIToolExecutionError, AIToolExecutionResult } from 'types/ai';
import { AI_ERROR_CODE, createAIServiceError, isAIServiceError } from '../../ai/errors/codes.mjs';
import { MAIN_PROCESS_TOOL_NAMES } from '../tools/constants.mjs';

/** Renderer 本地工具默认超时时间。 */
export const DEFAULT_RENDERER_TOOL_TIMEOUT_MS = 60_000;

/** 可透传到工具失败结果的稳定错误码。 */
const TOOL_EXECUTION_ERROR_CODES: ReadonlySet<AIToolExecutionError['code']> = new Set([
  'INVALID_INPUT',
  'NO_ACTIVE_DOCUMENT',
  'NO_SELECTION',
  'NO_CURSOR',
  'PERMISSION_DENIED',
  'USER_CANCELLED',
  'EDITOR_UNAVAILABLE',
  'STALE_CONTEXT',
  'TOOL_TIMEOUT',
  'UNSUPPORTED_PROVIDER',
  'CONFIRMATION_DISMISSED',
  'EXECUTION_FAILED'
] satisfies AIToolExecutionError['code'][]);

/**
 * 将异常规范化为 AIServiceError。
 * @param error - 原始错误
 * @returns AI 服务错误
 */
export function normalizeRuntimeError(error: unknown): ReturnType<typeof createAIServiceError> {
  if (isAIServiceError(error)) return error;
  if (error instanceof Error) return createAIServiceError(AI_ERROR_CODE.REQUEST_FAILED, error.message);

  return createAIServiceError(AI_ERROR_CODE.REQUEST_FAILED, 'ChatRuntime 流式调用失败');
}

/**
 * 从未知错误中读取可用于工具结果的稳定错误码。
 * @param error - 原始异常
 * @returns 工具错误码
 */
export function getToolExecutionErrorCode(error: unknown): AIToolExecutionError['code'] {
  if (isRecord(error) && typeof error.code === 'string' && TOOL_EXECUTION_ERROR_CODES.has(error.code as AIToolExecutionError['code'])) {
    return error.code as AIToolExecutionError['code'];
  }

  return 'EXECUTION_FAILED';
}

/**
 * 将工具异常转为工具失败结果。
 * @param toolName - 工具名称
 * @param error - 原始异常
 * @returns 工具失败结果
 */
export function createToolFailureResultFromError(toolName: string, error: unknown): AIToolExecutionResult {
  const message = error instanceof Error ? error.message : String(error);
  return {
    toolName,
    status: 'failure',
    error: {
      code: getToolExecutionErrorCode(error),
      message
    }
  };
}

/**
 * 创建 renderer 工具超时结果。
 * @param toolName - 工具名称
 * @param timeoutMs - 超时时间
 * @returns 工具失败结果
 */
export function createRendererToolTimeoutResult(toolName: string, timeoutMs: number): AIToolExecutionResult {
  return {
    toolName,
    status: 'failure',
    error: {
      code: 'TOOL_TIMEOUT',
      message: `Renderer 工具 ${toolName} 执行超时，已等待 ${timeoutMs}ms`
    }
  };
}

/**
 * 创建未注册工具的失败结果。
 * @param toolName - 工具名称
 * @returns 工具失败结果
 */
export function createUnknownToolFailureResult(toolName: string): AIToolExecutionResult {
  return {
    toolName,
    status: 'failure',
    error: {
      code: 'TOOL_NOT_FOUND',
      message: `未找到工具 ${toolName} 的执行器，既不是主进程工具也未在 runtime.tools 中注册`
    }
  };
}

/**
 * 规整 renderer 工具超时时间。
 * @param timeoutMs - 原始超时时间
 * @returns 可使用的超时时间
 */
export function normalizeRendererToolTimeoutMs(timeoutMs: number | undefined): number {
  if (typeof timeoutMs !== 'number' || !Number.isFinite(timeoutMs) || timeoutMs <= 0) return DEFAULT_RENDERER_TOOL_TIMEOUT_MS;

  return Math.floor(timeoutMs);
}

/**
 * 判断工具结果是否允许 runtime 进入下一轮续跑。
 * @param result - 工具执行结果
 * @returns 是否继续工具续轮
 */
export function shouldContinueAfterToolResult(result: AIToolExecutionResult): boolean {
  return result.status !== 'awaiting_user_input' && result.status !== 'cancelled';
}

/**
 * 判断工具结果是否应停止继续消费当前模型流。
 * @param result - 工具执行结果
 * @returns 是否停止当前模型流
 */
export function shouldStopStreamAfterToolResult(result: AIToolExecutionResult): boolean {
  return result.status === 'awaiting_user_input' || result.status === 'cancelled';
}

/**
 * 执行 renderer 本地工具，并把异常或超时转换为工具失败结果。
 * @param executeRendererTool - renderer 工具执行器
 * @param input - renderer 工具输入
 * @param timeoutMs - 超时时间
 * @returns 工具执行结果
 */
export async function executeRendererToolSafely(
  executeRendererTool: ChatRuntimeRendererToolExecutor,
  input: Parameters<ChatRuntimeRendererToolExecutor>[0],
  timeoutMs: number
): Promise<AIToolExecutionResult> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      executeRendererTool(input),
      new Promise<AIToolExecutionResult>((resolve) => {
        timeoutId = setTimeout(() => {
          resolve(createRendererToolTimeoutResult(input.toolName, timeoutMs));
        }, timeoutMs);
      })
    ]);
  } catch (error: unknown) {
    return createToolFailureResultFromError(input.toolName, error);
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * 执行主进程工具，并把异常转换为工具失败结果。
 * @param executeMainTool - 主进程工具执行器
 * @param input - 主进程工具输入
 * @returns 工具执行结果
 */
export async function executeMainToolSafely(
  executeMainTool: ChatRuntimeMainToolExecutor,
  input: Parameters<ChatRuntimeMainToolExecutor>[0]
): Promise<AIToolExecutionResult> {
  try {
    return await executeMainTool(input);
  } catch (error: unknown) {
    return createToolFailureResultFromError(input.toolName, error);
  }
}

/**
 * 判断工具是否由主进程执行。
 * @param toolName - 工具名称
 * @returns 是否为主进程工具
 */
export function isMainProcessTool(toolName: string): boolean {
  return MAIN_PROCESS_TOOL_NAMES.has(toolName);
}

/**
 * 判断工具是否由 renderer 本地执行。
 * @param runtime - runtime 状态
 * @param toolName - 工具名称
 * @returns 是否为 renderer 工具
 */
export function isRendererManagedTool(runtime: ActiveChatRuntime, toolName: string): boolean {
  return !isMainProcessTool(toolName) && Boolean(runtime.tools?.some((tool) => tool.name === toolName));
}

/**
 * 判断值是否为对象记录。
 * @param value - 待判断值
 * @returns 是否为对象记录
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
```

- [ ] **Step 2: Verify TypeScript**

Run: `pnpm exec tsc --noEmit`
Expected: No new errors.

---

## Task 4: Create `stream/message-parts.mts`

**Files:**
- Create: `electron/main/modules/chat/runtime/stream/message-parts.mts`

Move assistant message mutation helpers. The `appendToolInputDelta` fix is applied here: on parse failure, do not reset `input` to `null`.

- [ ] **Step 1: Write the file**

```typescript
/**
 * @file stream/message-parts.mts
 * @description ChatRuntime assistant 消息片段写入。
 */
import type { AIUsage } from 'types/ai';
import type { ChatMessageRecord, ChatMessageToolPart } from 'types/chat';
import type {
  RuntimeReasoningDeltaChunk,
  RuntimeTextDeltaChunk,
  RuntimeToolCallChunk,
  RuntimeToolInputDeltaChunk,
  RuntimeToolInputEndChunk,
  RuntimeToolInputStartChunk,
  RuntimeToolResultChunk
} from './types.mjs';

/**
 * 将文本增量写入 assistant 消息。
 * @param message - assistant 消息
 * @param text - 文本增量
 */
export function appendTextDelta(message: ChatMessageRecord, text: string): void {
  const lastPart = message.parts[message.parts.length - 1];
  if (lastPart?.type === 'text') {
    lastPart.text += text;
  } else {
    message.parts.push({ type: 'text', text });
  }

  message.content = `${message.content}${text}`;
  message.loading = false;
  message.finished = false;
}

/**
 * 将 reasoning 增量写入 assistant 消息。
 * @param message - assistant 消息
 * @param thinking - reasoning 增量
 */
export function appendReasoningDelta(message: ChatMessageRecord, thinking: string): void {
  const lastPart = message.parts[message.parts.length - 1];
  if (lastPart?.type === 'thinking') {
    lastPart.thinking += thinking;
  } else {
    message.parts.push({ type: 'thinking', thinking });
  }

  message.thinking = `${message.thinking ?? ''}${thinking}`;
  message.loading = false;
  message.finished = false;
}

/**
 * 查找或创建 assistant 工具片段。
 * @param message - assistant 消息
 * @param toolCallId - 工具调用 ID
 * @param toolName - 工具名称
 * @returns 工具片段
 */
function ensureToolPart(message: ChatMessageRecord, toolCallId: string, toolName: string): ChatMessageToolPart {
  const existingPart = message.parts.find((part): part is ChatMessageToolPart => part.type === 'tool' && part.toolCallId === toolCallId);
  if (existingPart) {
    existingPart.toolName = toolName;
    return existingPart;
  }

  const toolPart: ChatMessageToolPart = {
    type: 'tool',
    toolCallId,
    toolName,
    status: 'inputting',
    input: null,
    inputText: ''
  };
  message.parts.push(toolPart);

  return toolPart;
}

/**
 * 写入工具输入开始片段。
 * @param message - assistant 消息
 * @param chunk - 工具输入开始 chunk
 */
export function appendToolInputStart(message: ChatMessageRecord, chunk: RuntimeToolInputStartChunk): void {
  ensureToolPart(message, chunk.toolCallId, chunk.toolName);
  message.loading = false;
  message.finished = false;
}

/**
 * 写入工具输入增量片段。
 * @param message - assistant 消息
 * @param chunk - 工具输入增量 chunk
 */
export function appendToolInputDelta(message: ChatMessageRecord, chunk: RuntimeToolInputDeltaChunk): void {
  const existingPart = message.parts.find((part): part is ChatMessageToolPart => part.type === 'tool' && part.toolCallId === chunk.toolCallId);
  if (!existingPart) return;

  existingPart.inputText = `${existingPart.inputText ?? ''}${chunk.inputTextDelta}`;
  try {
    existingPart.input = JSON.parse(existingPart.inputText) as unknown;
  } catch {
    // 流式 JSON 在未闭合前 parse 失败是正常状态，保留上一次成功解析的值，
    // 避免 UI 在增量之间出现“突然清空又恢复”的闪烁。
  }
  message.loading = false;
  message.finished = false;
}

/**
 * 写入工具输入结束片段。
 * @param message - assistant 消息
 * @param chunk - 工具输入结束 chunk
 */
export function appendToolInputEnd(message: ChatMessageRecord, chunk: RuntimeToolInputEndChunk): void {
  const existingPart = message.parts.find((part): part is ChatMessageToolPart => part.type === 'tool' && part.toolCallId === chunk.toolCallId);
  if (!existingPart) return;

  existingPart.status = 'executing';
  message.loading = false;
  message.finished = false;
}

/**
 * 写入工具调用片段。
 * @param message - assistant 消息
 * @param chunk - 工具调用 chunk
 */
export function appendToolCall(message: ChatMessageRecord, chunk: RuntimeToolCallChunk): void {
  const toolPart = ensureToolPart(message, chunk.toolCallId, chunk.toolName);
  toolPart.status = 'executing';
  toolPart.input = chunk.input;
  message.loading = false;
  message.finished = false;
}

/**
 * 写入工具结果片段。
 * @param message - assistant 消息
 * @param chunk - 工具结果 chunk
 */
export function appendToolResult(message: ChatMessageRecord, chunk: RuntimeToolResultChunk): void {
  const toolPart = ensureToolPart(message, chunk.toolCallId, chunk.toolName);
  toolPart.status = 'done';
  toolPart.result = chunk.result;
  message.loading = false;
  message.finished = false;
}

/**
 * 标记 assistant 消息完成。
 * @param message - assistant 消息
 * @param usage - usage
 */
export function finishAssistantMessage(message: ChatMessageRecord, usage?: AIUsage): void {
  message.loading = false;
  message.finished = true;
  if (usage) {
    message.usage = usage;
  }
}
```

- [ ] **Step 2: Verify TypeScript**

Run: `pnpm exec tsc --noEmit`
Expected: No new errors.

---

## Task 5: Create `stream/request.mts`

**Files:**
- Create: `electron/main/modules/chat/runtime/stream/request.mts`

Move `createRuntimeStreamRequest` and fix the multimodal fallback by routing `userMessage` through `toRuntimeModelMessages`.

- [ ] **Step 1: Write the file**

```typescript
/**
 * @file stream/request.mts
 * @description ChatRuntime 流式请求构建。
 */
import type { ActiveChatRuntime } from '../types.mjs';
import type { AIRequestOptions } from 'types/ai';
import type { ChatMessageRecord } from 'types/chat';
import { toRuntimeModelMessages } from '../context/model-message.mjs';

/**
 * 构建 runtime 流式请求。
 * @param modelId - 模型 ID
 * @param runtime - runtime 状态
 * @param userMessage - user 消息
 * @param sourceMessages - 源消息
 * @returns AI 请求参数
 */
export function createRuntimeStreamRequest(
  modelId: string,
  runtime: ActiveChatRuntime,
  userMessage: ChatMessageRecord,
  sourceMessages?: ChatMessageRecord[]
): AIRequestOptions {
  return {
    requestId: runtime.runtimeId,
    modelId,
    messages: toRuntimeModelMessages(sourceMessages?.length ? sourceMessages : [userMessage]),
    ...(runtime.system ? { system: runtime.system } : {}),
    ...(runtime.tools?.length ? { tools: runtime.tools } : {}),
    ...(runtime.tavily ? { tavily: runtime.tavily } : {}),
    ...(runtime.mcp ? { mcp: runtime.mcp } : {})
  };
}
```

- [ ] **Step 2: Verify TypeScript**

Run: `pnpm exec tsc --noEmit`
Expected: No new errors.

---

## Task 6: Create `stream/executor.mts`

**Files:**
- Create: `electron/main/modules/chat/runtime/stream/executor.mts`

Move the main `createRuntimeStreamExecutor` function and apply the multi-tool state accumulation fix.

- [ ] **Step 1: Write the file**

```typescript
/**
 * @file stream/executor.mts
 * @description ChatRuntime 主进程模型流式执行器主循环。
 */
import type { ChatRuntimeStreamExecutor, ChatRuntimeStreamExecutorResult } from '../types.mjs';
import type { AIStreamFinishReason, AIUsage, AIToolExecutionResult } from 'types/ai';
import { AI_ERROR_CODE, createAIServiceError } from '../../ai/errors/codes.mjs';
import { normalizeUsage, toRuntimeStreamChunk } from './chunks.mjs';
import {
  appendReasoningDelta,
  appendTextDelta,
  appendToolCall,
  appendToolInputDelta,
  appendToolInputEnd,
  appendToolInputStart,
  appendToolResult,
  finishAssistantMessage
} from './message-parts.mjs';
import { createRuntimeStreamRequest } from './request.mjs';
import type { RuntimeStreamChunk, RuntimeStreamExecutorDependencies } from './types.mjs';
import {
  createUnknownToolFailureResult,
  executeMainToolSafely,
  executeRendererToolSafely,
  isMainProcessTool,
  isRendererManagedTool,
  normalizeRendererToolTimeoutMs,
  normalizeRuntimeError,
  shouldContinueAfterToolResult,
  shouldStopStreamAfterToolResult
} from './tools.mjs';

/**
 * 创建 ChatRuntime 模型流式执行器。
 * @param dependencies - 执行器依赖
 * @returns runtime 流式执行器
 */
export function createRuntimeStreamExecutor(dependencies: RuntimeStreamExecutorDependencies): ChatRuntimeStreamExecutor {
  return async ({ runtime, sourceMessages, userMessage, assistantMessage }, updateAssistant): Promise<ChatRuntimeStreamExecutorResult> => {
    const resolution = await dependencies.resolver.resolve();
    if (!resolution) {
      throw createAIServiceError(AI_ERROR_CODE.MODEL_NOT_FOUND, '没有可用的聊天模型');
    }

    const [error, result] = await dependencies.streamText(
      resolution.createOptions,
      createRuntimeStreamRequest(resolution.modelId, runtime, userMessage, sourceMessages)
    );
    if (error) {
      throw error;
    }
    if (!result) {
      throw createAIServiceError(AI_ERROR_CODE.REQUEST_FAILED, 'ChatRuntime 流式调用未返回结果');
    }

    let usage: AIUsage | undefined;
    let finishReason: AIStreamFinishReason | undefined;
    let executedToolCount = 0;
    let allToolsContinueable = true;
    let anyToolStopped = false;
    const rendererToolTimeoutMs = normalizeRendererToolTimeoutMs(dependencies.rendererToolTimeoutMs);

    for await (const rawChunk of result.stream as AsyncIterable<unknown>) {
      const chunk = toRuntimeStreamChunk(rawChunk);
      if (!chunk) continue;

      if (chunk.type === 'text-delta') {
        appendTextDelta(assistantMessage, chunk.text);
        await updateAssistant(assistantMessage);
      } else if (chunk.type === 'reasoning-delta') {
        appendReasoningDelta(assistantMessage, chunk.text);
        await updateAssistant(assistantMessage);
      } else if (chunk.type === 'finish') {
        finishReason = chunk.finishReason;
        usage = chunk.totalUsage ? normalizeUsage(chunk.totalUsage) : undefined;
        finishAssistantMessage(assistantMessage, usage);
        await updateAssistant(assistantMessage);
      } else if (chunk.type === 'error') {
        throw normalizeRuntimeError(chunk.error);
      } else if (chunk.type === 'tool-input-start') {
        appendToolInputStart(assistantMessage, chunk);
        await updateAssistant(assistantMessage);
      } else if (chunk.type === 'tool-input-delta') {
        appendToolInputDelta(assistantMessage, chunk);
        await updateAssistant(assistantMessage);
      } else if (chunk.type === 'tool-input-end') {
        appendToolInputEnd(assistantMessage, chunk);
        await updateAssistant(assistantMessage);
      } else if (chunk.type === 'tool-call') {
        appendToolCall(assistantMessage, chunk);
        await updateAssistant(assistantMessage);

        const toolExecutionInput = {
          runtime,
          toolCallId: chunk.toolCallId,
          toolName: chunk.toolName,
          input: chunk.input
        };

        let toolResult: AIToolExecutionResult;
        if (dependencies.executeMainTool && isMainProcessTool(chunk.toolName)) {
          toolResult = await executeMainToolSafely(dependencies.executeMainTool, toolExecutionInput);
        } else if (dependencies.executeRendererTool && isRendererManagedTool(runtime, chunk.toolName)) {
          toolResult = await executeRendererToolSafely(dependencies.executeRendererTool, toolExecutionInput, rendererToolTimeoutMs);
        } else {
          toolResult = createUnknownToolFailureResult(chunk.toolName);
        }

        appendToolResult(assistantMessage, {
          type: 'tool-result',
          toolCallId: chunk.toolCallId,
          toolName: chunk.toolName,
          result: toolResult
        });

        executedToolCount += 1;
        allToolsContinueable = allToolsContinueable && shouldContinueAfterToolResult(toolResult);
        anyToolStopped = anyToolStopped || shouldStopStreamAfterToolResult(toolResult);

        await updateAssistant(assistantMessage);
        if (anyToolStopped) break;
      } else if (chunk.type === 'tool-result') {
        appendToolResult(assistantMessage, chunk);
        await updateAssistant(assistantMessage);
      }
    }

    if (assistantMessage.finished !== true) {
      finishAssistantMessage(assistantMessage, usage);
      await updateAssistant(assistantMessage);
    }

    const shouldContinue = finishReason === 'tool-calls' && executedToolCount > 0 && allToolsContinueable;
    if (shouldContinue) return { usage, shouldContinue };
    return usage ? { usage } : {};
  };
}
```

- [ ] **Step 2: Verify TypeScript**

Run: `pnpm exec tsc --noEmit`
Expected: No new errors.

---

## Task 7: Create `stream/index.mts`

**Files:**
- Create: `electron/main/modules/chat/runtime/stream/index.mts`

Public API entry point.

- [ ] **Step 1: Write the file**

```typescript
/**
 * @file stream/index.mts
 * @description ChatRuntime 流式执行器公共入口。
 */
export { createRuntimeStreamExecutor } from './executor.mjs';
export type { RuntimeStreamText, RuntimeStreamExecutorDependencies } from './types.mjs';
```

- [ ] **Step 2: Verify TypeScript**

Run: `pnpm exec tsc --noEmit`
Expected: No new errors.

---

## Task 8: Update `service.mts` import path

**Files:**
- Modify: `electron/main/modules/chat/runtime/service.mts:68`

- [ ] **Step 1: Change the import**

Search:
```typescript
import { createRuntimeStreamExecutor } from './stream-executor.mjs';
```

Replace:
```typescript
import { createRuntimeStreamExecutor } from './stream/index.mjs';
```

- [ ] **Step 2: Verify TypeScript**

Run: `pnpm exec tsc --noEmit`
Expected: `service.mts` resolves the import successfully.

---

## Task 9: Migrate and extend tests

**Files:**
- Create: `test/electron/main/modules/chat/runtime/stream/executor.test.ts`
- Delete: `test/electron/main/modules/chat/runtime/stream-executor.test.ts`

- [ ] **Step 1: Move the existing test file**

Run:
```bash
mkdir -p test/electron/main/modules/chat/runtime/stream
mv test/electron/main/modules/chat/runtime/stream-executor.test.ts test/electron/main/modules/chat/runtime/stream/executor.test.ts
```

- [ ] **Step 2: Update the import path in the moved test file**

Search:
```typescript
import { createRuntimeStreamExecutor } from '../../../../../../electron/main/modules/chat/runtime/stream-executor.mjs';
```

Replace:
```typescript
import { createRuntimeStreamExecutor } from '../../../../../../electron/main/modules/chat/runtime/stream/index.mjs';
```

- [ ] **Step 3: Add a test for unknown tool failure result**

Append to `executor.test.ts` inside the `describe` block:

```typescript
  it('returns TOOL_NOT_FOUND failure for unregistered tool calls', async (): Promise<void> => {
    const assistantMessage = createAssistantMessage();
    const updates: ChatMessageRecord[] = [];

    async function* createUnknownToolStream(): AsyncGenerator<unknown> {
      yield { type: 'tool-call', toolCallId: 'tool-call-1', toolName: 'unknown_tool', input: {} };
      yield { type: 'finish', finishReason: 'tool-calls', totalUsage: { inputTokens: 5, outputTokens: 3, totalTokens: 8 } };
    }

    const resolve = vi.fn().mockResolvedValue({
      createOptions: {
        providerId: 'openai',
        providerName: 'OpenAI',
        providerType: 'openai',
        apiKey: 'sk-test',
        baseUrl: 'https://api.openai.com/v1'
      },
      modelId: 'gpt-test'
    });
    const streamText = vi.fn().mockResolvedValue([undefined, { stream: createUnknownToolStream() }]);
    const executor = createRuntimeStreamExecutor({ resolver: { resolve }, streamText });

    const result = await executor({ runtime, userMessage, assistantMessage }, async (message) => {
      updates.push({ ...message, parts: [...message.parts] });
    });

    expect(result).toEqual({ usage: { inputTokens: 5, outputTokens: 3, totalTokens: 8 } });
    expect(updates.at(-1)?.parts[0]).toMatchObject({
      type: 'tool',
      toolCallId: 'tool-call-1',
      toolName: 'unknown_tool',
      status: 'done',
      result: {
        toolName: 'unknown_tool',
        status: 'failure',
        error: {
          code: 'TOOL_NOT_FOUND',
          message: expect.stringContaining('unknown_tool')
        }
      }
    });
  });
```

- [ ] **Step 4: Add a test for multiple tool calls with mixed results**

Append to `executor.test.ts` inside the `describe` block:

```typescript
  it('stops stream when any tool call is cancelled, even if others succeed', async (): Promise<void> => {
    const assistantMessage = createAssistantMessage();
    const updates: ChatMessageRecord[] = [];

    async function* createMixedToolStream(): AsyncGenerator<unknown> {
      yield { type: 'tool-call', toolCallId: 'tool-call-1', toolName: 'read_file', input: { path: 'a.md' } };
      yield { type: 'tool-call', toolCallId: 'tool-call-2', toolName: 'read_file', input: { path: 'b.md' } };
      yield { type: 'finish', finishReason: 'tool-calls', totalUsage: { inputTokens: 10, outputTokens: 4, totalTokens: 14 } };
    }

    const executeMainTool = vi.fn()
      .mockResolvedValueOnce({
        toolName: 'read_file',
        status: 'cancelled',
        error: { code: 'USER_CANCELLED', message: 'cancelled' }
      })
      .mockResolvedValueOnce({
        toolName: 'read_file',
        status: 'success',
        data: { content: 'b' }
      });

    const resolve = vi.fn().mockResolvedValue({
      createOptions: {
        providerId: 'openai',
        providerName: 'OpenAI',
        providerType: 'openai',
        apiKey: 'sk-test',
        baseUrl: 'https://api.openai.com/v1'
      },
      modelId: 'gpt-test'
    });
    const streamText = vi.fn().mockResolvedValue([undefined, { stream: createMixedToolStream() }]);
    const executor = createRuntimeStreamExecutor({ resolver: { resolve }, streamText, executeMainTool });

    const result = await executor(
      {
        runtime: {
          ...runtime,
          tools: [{ name: 'read_file', description: 'Read file', parameters: { type: 'object', properties: {} } }]
        },
        userMessage,
        assistantMessage
      },
      async (message) => {
        updates.push({ ...message, parts: [...message.parts] });
      }
    );

    expect(executeMainTool).toHaveBeenCalledTimes(1);
    expect(result).toEqual({});
    expect(updates.at(-1)?.parts).toHaveLength(1);
  });
```

- [ ] **Step 5: Run the migrated tests**

Run: `pnpm test test/electron/main/modules/chat/runtime/stream/executor.test.ts`
Expected: All tests pass.

---

## Task 10: Delete the old `stream-executor.mts`

**Files:**
- Delete: `electron/main/modules/chat/runtime/stream-executor.mts`

- [ ] **Step 1: Delete the file**

Run:
```bash
rm electron/main/modules/chat/runtime/stream-executor.mts
```

- [ ] **Step 2: Verify no references remain**

Run:
```bash
pnpm exec eslint electron/main/modules/chat/runtime/service.mts test/electron/main/modules/chat/runtime/stream/executor.test.ts
```
Expected: No unresolved import errors.

---

## Task 11: Final verification

- [ ] **Step 1: Run TypeScript type check**

Run: `pnpm exec tsc --noEmit`
Expected: No errors.

- [ ] **Step 2: Run ESLint**

Run: `pnpm lint`
Expected: No lint errors.

- [ ] **Step 3: Run the full stream test suite**

Run: `pnpm test test/electron/main/modules/chat/runtime/stream`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add electron/main/modules/chat/runtime/stream/
git add electron/main/modules/chat/runtime/service.mts
git add test/electron/main/modules/chat/runtime/stream/
git rm electron/main/modules/chat/runtime/stream-executor.mts
git rm test/electron/main/modules/chat/runtime/stream-executor.test.ts
git add docs/superpowers/plans/2026-06-20-chat-runtime-stream-refactor-plan.md
git commit -m "refactor(chat-runtime): split stream-executor into stream/ directory and fix tool-call bugs"
```

---

## Self-Review Checklist

- [ ] **Spec coverage**: Each spec goal has at least one implementing task.
- [ ] **Placeholder scan**: No TBD/TODO/fill-in-details in tasks.
- [ ] **Type consistency**: `createRuntimeStreamExecutor` signature unchanged; `RuntimeStreamText` exported from `types.mts` and re-exported from `index.mts`; `normalizeUsage` is exported from `chunks.mts` and used in `executor.mts`.
- [ ] **Import paths**: All internal imports use `.mjs`; external imports use bare specifiers.
