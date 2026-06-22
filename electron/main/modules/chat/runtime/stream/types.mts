/**
 * @file stream/types.mts
 * @description ChatRuntime 流式执行器内部类型。
 */
import type { ChatModelResolver } from '../model/resolver.mjs';
import type { ChatRuntimeMainToolExecutor, ChatRuntimeRendererToolExecutor } from '../types.mjs';
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

/** AI SDK 工具输入已可执行 chunk。 */
export interface RuntimeToolInputAvailableChunk {
  /** chunk 类型。 */
  type: 'tool-input-available';
  /** 工具调用 ID。 */
  toolCallId: string;
  /** 工具名称。 */
  toolName: string;
  /** 工具输入。 */
  input: unknown;
}

/** Runtime 可执行工具调用 chunk。 */
export type RuntimeExecutableToolCallChunk = RuntimeToolCallChunk | RuntimeToolInputAvailableChunk;

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
  | RuntimeToolInputAvailableChunk
  | RuntimeToolInputStartChunk
  | RuntimeToolInputDeltaChunk
  | RuntimeToolInputEndChunk
  | RuntimeToolResultChunk
  | RuntimeUnsupportedChunk;
