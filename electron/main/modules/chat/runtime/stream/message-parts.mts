/**
 * @file stream/message-parts.mts
 * @description ChatRuntime assistant 消息片段写入。
 */
import type {
  RuntimeExecutableToolCallChunk,
  RuntimeToolInputDeltaChunk,
  RuntimeToolInputEndChunk,
  RuntimeToolInputStartChunk,
  RuntimeToolResultChunk
} from './types.mjs';
import type { AIToolExecutionResult, AIUsage } from 'types/ai';
import type { ChatMessageRecord, ChatMessageToolPart, ChatMessageWidgetRuntime } from 'types/chat';
import type { WidgetDisplayPayload } from 'types/widget';
import { nanoid } from 'nanoid';

/** open_widget 工具名称。 */
const OPEN_WIDGET_TOOL_NAME = 'open_widget';

/**
 * 判断未知值是否为对象记录。
 * @param value - 待判断的值
 * @returns 是否为对象记录
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * 判断工具结果数据是否为小组件展示载荷。
 * @param value - 工具结果数据
 * @returns 是否为小组件展示载荷
 */
function isWidgetDisplayPayload(value: unknown): value is WidgetDisplayPayload {
  return (
    isRecord(value) &&
    value.kind === 'widget_display' &&
    typeof value.sessionId === 'string' &&
    typeof value.widgetId === 'string' &&
    isRecord(value.value) &&
    isRecord(value.renderContext)
  );
}

/**
 * 从工具结果创建小组件初始运行态。
 * @param toolName - 工具名称
 * @param result - 工具执行结果
 * @returns 小组件运行态；不匹配时返回 undefined
 */
function createInitialWidgetRuntime(toolName: string, result: AIToolExecutionResult): ChatMessageWidgetRuntime | undefined {
  if (toolName !== OPEN_WIDGET_TOOL_NAME || result.status !== 'success' || !isWidgetDisplayPayload(result.data)) return undefined;

  return {
    sessionId: result.data.sessionId,
    widgetId: result.data.widgetId,
    status: 'created',
    lifecycle: {},
    value: result.data.value,
    renderContext: result.data.renderContext
  };
}

/**
 * 写入工具结果的 UI 展示元信息。
 * @param toolPart - 待更新的工具片段
 * @param result - 工具执行结果
 */
function applyToolPresentation(toolPart: ChatMessageToolPart, result: AIToolExecutionResult): void {
  const widget = createInitialWidgetRuntime(toolPart.toolName, result);
  if (!widget) {
    delete toolPart.presentation;
    delete toolPart.widget;
    return;
  }

  toolPart.presentation = 'widget';
  toolPart.widget = widget;
}

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
    message.parts.push({ id: nanoid(), type: 'text', text });
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
    message.parts.push({ id: nanoid(), type: 'thinking', thinking });
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
    id: nanoid(),
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
 * 写入工具调用或可执行工具输入片段。
 * @param message - assistant 消息
 * @param chunk - 可执行工具调用 chunk
 */
export function appendToolCall(message: ChatMessageRecord, chunk: RuntimeExecutableToolCallChunk): void {
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
  applyToolPresentation(toolPart, chunk.result);
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
