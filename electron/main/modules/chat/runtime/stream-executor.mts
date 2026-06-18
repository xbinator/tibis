/**
 * @file stream-executor.mts
 * @description ChatRuntime 主进程模型流式执行器。
 */
import type { ChatModelResolver } from './chat-model-resolver.mjs';
import type { ActiveChatRuntime, ChatRuntimeRendererToolExecutor, ChatRuntimeStreamExecutor, ChatRuntimeStreamExecutorResult } from './types.mjs';
import type { AIRequestOptions, AIServiceError, AIStreamFinishReason, AIStreamResult, AIUsage, AIToolExecutionResult } from 'types/ai';
import type { ChatMessageRecord, ChatMessageToolPart } from 'types/chat';
import { AI_ERROR_CODE, createAIServiceError, isAIServiceError } from '../../ai/errors/codes.mjs';
import { toRuntimeModelMessages } from './model-message-context.mjs';

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
}

/** AI SDK 文本增量 chunk。 */
interface RuntimeTextDeltaChunk {
  /** chunk 类型。 */
  type: 'text-delta';
  /** 文本增量。 */
  text: string;
}

/** AI SDK reasoning 增量 chunk。 */
interface RuntimeReasoningDeltaChunk {
  /** chunk 类型。 */
  type: 'reasoning-delta';
  /** 思考增量。 */
  text: string;
}

/** AI SDK 错误 chunk。 */
interface RuntimeErrorChunk {
  /** chunk 类型。 */
  type: 'error';
  /** 错误对象。 */
  error: unknown;
}

/** AI SDK 完成 chunk。 */
interface RuntimeFinishChunk {
  /** chunk 类型。 */
  type: 'finish';
  /** 完成原因。 */
  finishReason: AIStreamFinishReason;
  /** 总 usage。 */
  totalUsage?: Partial<AIUsage>;
}

/** AI SDK 工具调用 chunk。 */
interface RuntimeToolCallChunk {
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
interface RuntimeToolInputStartChunk {
  /** chunk 类型。 */
  type: 'tool-input-start';
  /** 工具调用 ID。 */
  toolCallId: string;
  /** 工具名称。 */
  toolName: string;
}

/** AI SDK 工具输入增量 chunk。 */
interface RuntimeToolInputDeltaChunk {
  /** chunk 类型。 */
  type: 'tool-input-delta';
  /** 工具调用 ID。 */
  toolCallId: string;
  /** 输入 JSON 文本增量。 */
  inputTextDelta: string;
}

/** AI SDK 工具输入结束 chunk。 */
interface RuntimeToolInputEndChunk {
  /** chunk 类型。 */
  type: 'tool-input-end';
  /** 工具调用 ID。 */
  toolCallId: string;
}

/** AI SDK 工具结果 chunk。 */
interface RuntimeToolResultChunk {
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
interface RuntimeUnsupportedChunk {
  /** chunk 类型。 */
  type: 'unsupported';
}

/** Runtime 当前支持消费的 AI stream chunk。 */
type RuntimeStreamChunk =
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
function normalizeUsage(usage: Partial<AIUsage>): AIUsage {
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
function normalizeToolResult(toolName: string, result: unknown, output: unknown): AIToolExecutionResult {
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
function toRuntimeStreamChunk(chunk: unknown): RuntimeStreamChunk | undefined {
  if (!isRecord(chunk) || typeof chunk.type !== 'string') return undefined;

  if (chunk.type === 'text-delta' && typeof chunk.text === 'string') {
    return { type: 'text-delta', text: chunk.text };
  }

  if (chunk.type === 'reasoning-delta' && typeof chunk.text === 'string') {
    return { type: 'reasoning-delta', text: chunk.text };
  }

  if (chunk.type === 'error') {
    return { type: 'error', error: chunk.error };
  }

  if (chunk.type === 'finish') {
    return {
      type: 'finish',
      finishReason: typeof chunk.finishReason === 'string' ? (chunk.finishReason as AIStreamFinishReason) : 'other',
      totalUsage: isRecord(chunk.totalUsage) ? normalizeUsage(chunk.totalUsage) : undefined
    };
  }

  if (chunk.type === 'tool-call' && typeof chunk.toolCallId === 'string' && typeof chunk.toolName === 'string') {
    return { type: 'tool-call', toolCallId: chunk.toolCallId, toolName: chunk.toolName, input: chunk.input };
  }

  if (chunk.type === 'tool-input-start' && typeof chunk.id === 'string' && typeof chunk.toolName === 'string') {
    return { type: 'tool-input-start', toolCallId: chunk.id, toolName: chunk.toolName };
  }

  if (chunk.type === 'tool-input-delta' && typeof chunk.id === 'string' && typeof chunk.delta === 'string') {
    return { type: 'tool-input-delta', toolCallId: chunk.id, inputTextDelta: chunk.delta };
  }

  if (chunk.type === 'tool-input-end' && typeof chunk.id === 'string') {
    return { type: 'tool-input-end', toolCallId: chunk.id };
  }

  if (chunk.type === 'tool-result' && typeof chunk.toolCallId === 'string' && typeof chunk.toolName === 'string') {
    return {
      type: 'tool-result',
      toolCallId: chunk.toolCallId,
      toolName: chunk.toolName,
      result: normalizeToolResult(chunk.toolName, chunk.result, chunk.output)
    };
  }

  return { type: 'unsupported' };
}

/**
 * 将异常规范化为 AIServiceError。
 * @param error - 原始错误
 * @returns AI 服务错误
 */
function normalizeRuntimeError(error: unknown): AIServiceError {
  if (isAIServiceError(error)) return error;
  if (error instanceof Error) return createAIServiceError(AI_ERROR_CODE.REQUEST_FAILED, error.message);

  return createAIServiceError(AI_ERROR_CODE.REQUEST_FAILED, 'ChatRuntime stream failed');
}

/**
 * 将文本增量写入 assistant 消息。
 * @param message - assistant 消息
 * @param text - 文本增量
 */
function appendTextDelta(message: ChatMessageRecord, text: string): void {
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
function appendReasoningDelta(message: ChatMessageRecord, thinking: string): void {
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
function appendToolInputStart(message: ChatMessageRecord, chunk: RuntimeToolInputStartChunk): void {
  ensureToolPart(message, chunk.toolCallId, chunk.toolName);
  message.loading = false;
  message.finished = false;
}

/**
 * 写入工具输入增量片段。
 * @param message - assistant 消息
 * @param chunk - 工具输入增量 chunk
 */
function appendToolInputDelta(message: ChatMessageRecord, chunk: RuntimeToolInputDeltaChunk): void {
  const existingPart = message.parts.find((part): part is ChatMessageToolPart => part.type === 'tool' && part.toolCallId === chunk.toolCallId);
  if (!existingPart) return;

  existingPart.inputText = `${existingPart.inputText ?? ''}${chunk.inputTextDelta}`;
  try {
    existingPart.input = JSON.parse(existingPart.inputText) as unknown;
  } catch {
    existingPart.input = null;
  }
  message.loading = false;
  message.finished = false;
}

/**
 * 写入工具输入结束片段。
 * @param message - assistant 消息
 * @param chunk - 工具输入结束 chunk
 */
function appendToolInputEnd(message: ChatMessageRecord, chunk: RuntimeToolInputEndChunk): void {
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
function appendToolCall(message: ChatMessageRecord, chunk: RuntimeToolCallChunk): void {
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
function appendToolResult(message: ChatMessageRecord, chunk: RuntimeToolResultChunk): void {
  const toolPart = ensureToolPart(message, chunk.toolCallId, chunk.toolName);
  toolPart.status = 'done';
  toolPart.result = chunk.result;
  message.loading = false;
  message.finished = false;
}

/**
 * 判断工具是否由 renderer 本地执行。
 * @param runtime - runtime 状态
 * @param toolName - 工具名称
 * @returns 是否为 renderer 工具
 */
function isRendererManagedTool(runtime: ActiveChatRuntime, toolName: string): boolean {
  return Boolean(runtime.tools?.some((tool) => tool.name === toolName));
}

/**
 * 标记 assistant 消息完成。
 * @param message - assistant 消息
 * @param usage - usage
 */
function finishAssistantMessage(message: ChatMessageRecord, usage?: AIUsage): void {
  message.loading = false;
  message.finished = true;
  if (usage) {
    message.usage = usage;
  }
}

/**
 * 构建 runtime 流式请求。
 * @param modelId - 模型 ID
 * @param runtime - runtime 状态
 * @param userMessage - user 消息
 * @param sourceMessages - 源消息
 * @returns AI 请求参数
 */
function createRuntimeStreamRequest(
  modelId: string,
  runtime: ActiveChatRuntime,
  userMessage: ChatMessageRecord,
  sourceMessages?: ChatMessageRecord[]
): AIRequestOptions {
  return {
    requestId: runtime.runtimeId,
    modelId,
    messages: sourceMessages?.length ? toRuntimeModelMessages(sourceMessages) : [{ role: 'user', content: userMessage.content }],
    ...(runtime.system ? { system: runtime.system } : {}),
    ...(runtime.tools?.length ? { tools: runtime.tools } : {}),
    ...(runtime.tavily ? { tavily: runtime.tavily } : {}),
    ...(runtime.mcp ? { mcp: runtime.mcp } : {})
  };
}

/**
 * 创建 ChatRuntime 模型流式执行器。
 * @param dependencies - 执行器依赖
 * @returns runtime 流式执行器
 */
export function createRuntimeStreamExecutor(dependencies: RuntimeStreamExecutorDependencies): ChatRuntimeStreamExecutor {
  return async ({ runtime, sourceMessages, userMessage, assistantMessage }, updateAssistant): Promise<ChatRuntimeStreamExecutorResult> => {
    const resolution = await dependencies.resolver.resolve();
    if (!resolution) {
      throw createAIServiceError(AI_ERROR_CODE.MODEL_NOT_FOUND, 'No available chat model');
    }

    const [error, result] = await dependencies.streamText(
      resolution.createOptions,
      createRuntimeStreamRequest(resolution.modelId, runtime, userMessage, sourceMessages)
    );
    if (error) {
      throw error;
    }
    if (!result) {
      throw createAIServiceError(AI_ERROR_CODE.REQUEST_FAILED, 'ChatRuntime stream returned no result');
    }

    let usage: AIUsage | undefined;
    let finishReason: AIStreamFinishReason | undefined;
    let shouldContinueAfterRendererTool = false;
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
        if (dependencies.executeRendererTool && isRendererManagedTool(runtime, chunk.toolName)) {
          const toolResult = await dependencies.executeRendererTool({
            runtime,
            toolCallId: chunk.toolCallId,
            toolName: chunk.toolName,
            input: chunk.input
          });
          appendToolResult(assistantMessage, {
            type: 'tool-result',
            toolCallId: chunk.toolCallId,
            toolName: chunk.toolName,
            result: toolResult
          });
          shouldContinueAfterRendererTool = toolResult.status !== 'awaiting_user_input';
          await updateAssistant(assistantMessage);
        }
      } else if (chunk.type === 'tool-result') {
        appendToolResult(assistantMessage, chunk);
        await updateAssistant(assistantMessage);
      }
    }

    if (assistantMessage.finished !== true) {
      finishAssistantMessage(assistantMessage, usage);
      await updateAssistant(assistantMessage);
    }

    const shouldContinue = finishReason === 'tool-calls' && shouldContinueAfterRendererTool;
    return shouldContinue ? { usage, shouldContinue } : { usage };
  };
}
