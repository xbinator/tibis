/**
 * @file stream/chunks.mts
 * @description AI SDK chunk 到 runtime chunk 的规范化。
 */
import type {
  RuntimeErrorChunk,
  RuntimeFinishChunk,
  RuntimeReasoningDeltaChunk,
  RuntimeStreamChunk,
  RuntimeTextDeltaChunk,
  RuntimeToolCallChunk,
  RuntimeToolInputAvailableChunk,
  RuntimeToolInputDeltaChunk,
  RuntimeToolInputEndChunk,
  RuntimeToolInputStartChunk,
  RuntimeToolResultChunk,
  RuntimeUnsupportedChunk
} from './types.mjs';
import type { AIStreamFinishReason, AIUsage, AIToolExecutionResult } from 'types/ai';

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
 * 读取工具调用 ID，兼容 AI SDK 6 的 toolCallId 与旧版 id 字段。
 * @param chunk - AI SDK 原始工具 chunk
 * @returns 工具调用 ID
 */
function readToolCallId(chunk: Record<string, unknown>): string | undefined {
  if (typeof chunk.toolCallId === 'string') return chunk.toolCallId;
  if (typeof chunk.id === 'string') return chunk.id;
  return undefined;
}

/**
 * 读取工具输入文本增量，兼容 AI SDK 6 的 inputTextDelta 与旧版 delta 字段。
 * @param chunk - AI SDK 原始工具输入增量 chunk
 * @returns 输入文本增量
 */
function readToolInputTextDelta(chunk: Record<string, unknown>): string | undefined {
  if (typeof chunk.inputTextDelta === 'string') return chunk.inputTextDelta;
  if (typeof chunk.delta === 'string') return chunk.delta;
  return undefined;
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

  if (chunk.type === 'tool-input-available' && typeof chunk.toolCallId === 'string' && typeof chunk.toolName === 'string') {
    return {
      type: 'tool-input-available',
      toolCallId: chunk.toolCallId,
      toolName: chunk.toolName,
      input: chunk.input
    } as RuntimeToolInputAvailableChunk;
  }

  if (chunk.type === 'tool-input-start' && typeof chunk.toolName === 'string') {
    const toolCallId = readToolCallId(chunk);
    if (toolCallId !== undefined) {
      return { type: 'tool-input-start', toolCallId, toolName: chunk.toolName } as RuntimeToolInputStartChunk;
    }
  }

  if (chunk.type === 'tool-input-delta') {
    const toolCallId = readToolCallId(chunk);
    const inputTextDelta = readToolInputTextDelta(chunk);
    if (toolCallId !== undefined && inputTextDelta !== undefined) {
      return { type: 'tool-input-delta', toolCallId, inputTextDelta } as RuntimeToolInputDeltaChunk;
    }
  }

  if (chunk.type === 'tool-input-end') {
    const toolCallId = readToolCallId(chunk);
    if (toolCallId !== undefined) {
      return { type: 'tool-input-end', toolCallId } as RuntimeToolInputEndChunk;
    }
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
