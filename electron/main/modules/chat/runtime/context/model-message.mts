/**
 * @file model-message-context.mts
 * @description ChatRuntime 主进程模型上下文转换。
 */
import type { JSONValue, ModelMessage } from 'ai';
import type { ChatMessageFilePart, ChatMessagePart, ChatMessageRecord, ChatMessageToolPart, ChatMessageWidgetResultPart } from 'types/chat';
import type { ChatMessageCompactionPart } from 'types/chat-runtime';
import { isPlainObject } from 'lodash-es';
import { nanoid } from 'nanoid';

/** 可发送给模型的聊天消息。 */
type RuntimeModelMessageRecord = Extract<ChatMessageRecord, { role: 'user' | 'assistant' }> | (ChatMessageRecord & { role: 'user' | 'assistant' });

/** Runtime user 消息。 */
type RuntimeUserMessageRecord = ChatMessageRecord & { role: 'user' };

/** Runtime assistant 消息。 */
type RuntimeAssistantMessageRecord = ChatMessageRecord & { role: 'assistant' };

/** 成功压缩边界位置。 */
type RuntimeCompressionBoundary =
  | {
      /** 独立 compression 消息边界。 */
      kind: 'message';
      /** 边界消息索引。 */
      index: number;
    }
  | {
      /** assistant 消息内 compaction part 边界。 */
      kind: 'part';
      /** 持有 compaction part 的消息索引。 */
      index: number;
      /** 持有 compaction part 的消息。 */
      message: ChatMessageRecord;
      /** 成功的 compaction part。 */
      part: ChatMessageCompactionPart;
      /** compaction part 在 host message 中的索引。 */
      partIndex: number;
    };

/** Assistant 模型消息内容片段。 */
type AssistantModelMessageContent = Array<{ type: 'text'; text: string } | { type: 'tool-call'; toolCallId: string; toolName: string; input: unknown }>;

/** Tool 模型消息内容片段。 */
type ToolModelMessageContent = Array<{
  type: 'tool-result';
  toolCallId: string;
  toolName: string;
  output: { type: 'json'; value: JSONValue };
}>;

/** User 模型消息内容片段。 */
type UserModelMessageContent = Array<{ type: 'text'; text: string } | { type: 'image'; image: string; mediaType?: string }>;

/** Runtime 工具结果类型。 */
type RuntimeToolResult = NonNullable<ChatMessageToolPart['result']>;

/** 自动压缩后继续当前任务的用户态指令。 */
const COMPACTION_CONTINUATION_PROMPT = '继续完成当前用户任务。以上 COMPRESSED_CONTEXT 是当前任务的压缩上下文，请基于它继续执行，不要复述压缩内容。';
/** 后续已有真实消息时，压缩后进展使用的中性上下文说明。 */
const COMPACTION_PROGRESS_CONTEXT_PROMPT = '以下是本次压缩之后、后续用户消息之前已经发生的当前轮进展。请把它们视为已完成的历史事实，不要复述。';
/** 压缩后续跑上下文中单个结构化值的最大字符数。 */
const MAX_POST_COMPACTION_VALUE_LENGTH = 12000;
/** 打开小组件工具名称。 */
const OPEN_WIDGET_TOOL_NAME = 'open_widget';

/** 压缩后进展写入模型上下文的模式。 */
type CompactionProgressMode = 'continue' | 'context';

/**
 * 判断值是否为普通对象。
 * @param value - 待判断值
 * @returns 是否为普通对象
 */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return isPlainObject(value);
}

/**
 * 判断工具结果数据是否为小组件展示载荷。
 * @param value - 工具结果数据
 * @returns 是否为小组件展示载荷
 */
function isOpenWidgetDisplayPayload(value: unknown): value is { sessionId: string; widgetId: string; execution: unknown } {
  return isPlainRecord(value) && typeof value.sessionId === 'string' && typeof value.widgetId === 'string' && isPlainRecord(value.execution);
}

/**
 * 创建模型可见工具结果，去掉只供 UI 渲染使用的小组件快照。
 * @param part - 工具消息片段
 * @returns 模型可见工具结果
 */
function createModelVisibleToolResult(part: ChatMessageToolPart & { result: RuntimeToolResult }): RuntimeToolResult {
  if (part.toolName !== OPEN_WIDGET_TOOL_NAME || part.result.status !== 'success' || !isOpenWidgetDisplayPayload(part.result.data)) {
    return part.result;
  }

  return {
    ...part.result,
    data: {
      sessionId: part.result.data.sessionId,
      widgetId: part.result.data.widgetId,
      execution: part.result.data.execution
    }
  };
}

/**
 * 判断消息是否为成功压缩边界。
 * @param message - 聊天消息
 * @returns 是否为成功压缩边界
 */
function isSuccessfulCompressionBoundary(message: ChatMessageRecord): boolean {
  return message.role === 'compression' && message.compression?.status === 'success' && Boolean(message.compression.coveredUntilMessageId);
}

/**
 * 判断消息片段是否为成功压缩 part 边界。
 * @param part - 聊天消息片段
 * @returns 是否为成功压缩 part 边界
 */
function isSuccessfulCompactionBoundaryPart(part: ChatMessagePart): part is ChatMessageCompactionPart {
  return part.type === 'compaction' && part.status === 'success' && Boolean(part.recordText) && Boolean(part.coveredUntilMessageId);
}

/**
 * 找到消息中最后一个成功压缩 part。
 * @param message - 聊天消息
 * @returns 成功压缩 part，不存在时返回 undefined
 */
function findLastSuccessfulCompactionPart(message: ChatMessageRecord): { part: ChatMessageCompactionPart; partIndex: number } | undefined {
  for (let index = message.parts.length - 1; index >= 0; index -= 1) {
    const part = message.parts[index];
    if (isSuccessfulCompactionBoundaryPart(part)) {
      return { part, partIndex: index };
    }
  }

  return undefined;
}

/**
 * 找到最近成功压缩边界。
 * @param messages - 消息列表
 * @returns 边界信息
 */
function findLatestCompressionBoundary(messages: ChatMessageRecord[]): RuntimeCompressionBoundary | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (isSuccessfulCompressionBoundary(message)) {
      return { kind: 'message', index };
    }

    const compactionPart = findLastSuccessfulCompactionPart(message);
    if (compactionPart) {
      return { kind: 'part', index, message, part: compactionPart.part, partIndex: compactionPart.partIndex };
    }
  }

  return undefined;
}

/**
 * 将 assistant compaction part 转为临时 compression 边界消息。
 * @param part - compaction part
 * @param hostMessage - 持有 part 的 assistant 消息
 * @returns 可复用既有 compression 转换逻辑的临时消息
 */
function createCompactionBoundaryMessage(part: ChatMessageCompactionPart, hostMessage: ChatMessageRecord): ChatMessageRecord {
  const recordText = part.recordText ?? '';

  return {
    id: `${hostMessage.id}:compaction-boundary`,
    sessionId: hostMessage.sessionId,
    role: 'compression',
    content: recordText,
    parts: recordText ? [{ id: nanoid(), type: 'text', text: recordText }] : [],
    createdAt: hostMessage.createdAt,
    finished: true,
    summary: true,
    runtimeId: hostMessage.runtimeId,
    agentId: hostMessage.agentId,
    parentRuntimeId: hostMessage.parentRuntimeId,
    compression: {
      status: 'success',
      recordText,
      recordId: part.recordId,
      coveredUntilMessageId: part.coveredUntilMessageId,
      sourceMessageIds: part.sourceMessageIds
    }
  };
}

/**
 * 截断写入续跑提示的长文本，避免一次工具结果重新撑爆上下文。
 * @param text - 原始文本
 * @returns 适合写入提示的文本
 */
function truncatePostCompactionText(text: string): string {
  if (text.length <= MAX_POST_COMPACTION_VALUE_LENGTH) {
    return text;
  }

  return `${text.slice(0, MAX_POST_COMPACTION_VALUE_LENGTH)}\n...[已截断 ${text.length - MAX_POST_COMPACTION_VALUE_LENGTH} 字符]`;
}

/**
 * 将结构化值转为可读提示文本。
 * @param value - 原始值
 * @returns 提示文本
 */
function stringifyPostCompactionValue(value: unknown): string {
  if (value === undefined) {
    return 'undefined';
  }

  if (typeof value === 'string') {
    return truncatePostCompactionText(value);
  }

  try {
    const serialized = JSON.stringify(value, null, 2);

    return truncatePostCompactionText(serialized ?? String(value));
  } catch {
    return truncatePostCompactionText(String(value));
  }
}

/**
 * 将 compaction 后产生的片段转为文本进展。
 * @param part - compaction 后的消息片段
 * @param index - 片段序号
 * @returns 文本进展行
 */
function createPostCompactionPartLines(part: ChatMessagePart, index: number): string[] {
  const prefix = `${index + 1}.`;

  switch (part.type) {
    case 'text':
      return part.text ? [`${prefix} assistant_text: ${truncatePostCompactionText(part.text)}`] : [];
    case 'thinking':
      return part.thinking ? [`${prefix} assistant_thinking: ${truncatePostCompactionText(part.thinking)}`] : [];
    case 'error':
      return part.text ? [`${prefix} assistant_error: ${truncatePostCompactionText(part.text)}`] : [];
    case 'tool': {
      const lines = [
        `${prefix} tool: ${part.toolName}`,
        `   status: ${part.status}`,
        `   tool_call_id: ${part.toolCallId}`,
        `   input: ${stringifyPostCompactionValue(part.input)}`
      ];
      if (part.inputText) {
        lines.push(`   input_text: ${truncatePostCompactionText(part.inputText)}`);
      }
      if (part.result) {
        lines.push(`   result: ${stringifyPostCompactionValue(createModelVisibleToolResult({ ...part, result: part.result }))}`);
      }
      return lines;
    }
    case 'confirmation':
      return [
        `${prefix} confirmation: ${part.toolName}`,
        `   status: ${part.confirmationStatus}`,
        `   execution_status: ${part.executionStatus}`,
        `   title: ${part.title}`,
        `   description: ${part.description}`
      ];
    case 'file':
      return [`${prefix} file: ${part.path}`];
    case 'compaction':
      return [];
    default:
      return [];
  }
}

/**
 * 创建压缩后进展的用户态内容。
 * @param parts - compaction 后已经产生的消息片段
 * @param mode - 写入上下文的模式
 * @returns 用户态续跑内容
 */
function createCompactionProgressContent(parts: ChatMessagePart[], mode: CompactionProgressMode): string {
  const progressLines = parts.flatMap(createPostCompactionPartLines);
  if (!progressLines.length) {
    return mode === 'continue' ? COMPACTION_CONTINUATION_PROMPT : '';
  }

  if (mode === 'context') {
    return [COMPACTION_PROGRESS_CONTEXT_PROMPT, ...progressLines].join('\n');
  }

  return [COMPACTION_CONTINUATION_PROMPT, '', '以下是本次压缩之后已经发生的当前轮进展，请把它们视为已完成事实继续执行：', ...progressLines].join('\n');
}

/**
 * 创建自动压缩后的进展上下文消息。
 * @param hostMessage - 持有 compaction part 的 assistant 消息
 * @param postCompactionParts - compaction 后已经产生的消息片段
 * @param mode - 写入上下文的模式
 * @returns synthetic user 消息
 */
function createCompactionProgressMessage(
  hostMessage: ChatMessageRecord,
  postCompactionParts: ChatMessagePart[] = [],
  mode: CompactionProgressMode = 'continue'
): ChatMessageRecord | undefined {
  const content = createCompactionProgressContent(postCompactionParts, mode);
  if (!content) return undefined;

  return {
    id: `${hostMessage.id}:compaction-${mode}`,
    sessionId: hostMessage.sessionId,
    role: 'user',
    content,
    parts: [{ id: nanoid(), type: 'text', text: content }],
    createdAt: hostMessage.createdAt,
    finished: true,
    runtimeId: hostMessage.runtimeId,
    agentId: hostMessage.agentId,
    parentRuntimeId: hostMessage.parentRuntimeId
  };
}

/**
 * 从最近压缩边界裁剪模型上下文。
 * @param messages - 原始消息
 * @returns 裁剪后的消息
 */
function sliceMessagesFromCompressionBoundary(messages: ChatMessageRecord[]): ChatMessageRecord[] {
  const boundary = findLatestCompressionBoundary(messages);
  if (!boundary) return messages;

  if (boundary.kind === 'message') {
    return messages.slice(boundary.index);
  }

  const { coveredUntilMessageId } = boundary.part;
  const coveredUntilIndex = coveredUntilMessageId ? messages.findIndex((message) => message.id === coveredUntilMessageId) : -1;
  const preservedTailMessages = coveredUntilIndex >= 0 ? messages.slice(coveredUntilIndex + 1, boundary.index) : [];
  const postCompactionParts = boundary.message.parts.slice(boundary.partIndex + 1);
  const afterBoundaryMessages = messages.slice(boundary.index + 1);
  const postCompactionMode: CompactionProgressMode = afterBoundaryMessages.length ? 'context' : 'continue';
  const postCompactionProgressMessage = postCompactionParts.length
    ? createCompactionProgressMessage(boundary.message, postCompactionParts, postCompactionMode)
    : undefined;
  const postCompactionProgressMessages = postCompactionProgressMessage ? [postCompactionProgressMessage] : [];
  const shouldAddContinuationPrompt = !preservedTailMessages.length && !postCompactionProgressMessages.length && !afterBoundaryMessages.length;
  const continuationMessage = shouldAddContinuationPrompt ? createCompactionProgressMessage(boundary.message, [], 'continue') : undefined;
  const continuationMessages = continuationMessage ? [continuationMessage] : [];

  return [
    createCompactionBoundaryMessage(boundary.part, boundary.message),
    ...preservedTailMessages,
    ...postCompactionProgressMessages,
    ...afterBoundaryMessages,
    ...continuationMessages
  ];
}

/**
 * 判断消息是否可发送给模型。
 * @param message - 聊天消息
 * @returns 是否为模型消息
 */
function isRuntimeModelMessage(message: ChatMessageRecord): message is RuntimeModelMessageRecord {
  return message.role === 'user' || message.role === 'assistant';
}

/**
 * 将任意值转换为 JSON 可序列化值。
 * @param value - 原始值
 * @returns JSON 可序列化值
 */
function toJsonValue(value: unknown): JSONValue {
  try {
    return JSON.parse(JSON.stringify(value)) as JSONValue;
  } catch {
    return null;
  }
}

/**
 * 收集已完成工具调用 ID。
 * @param parts - 消息片段
 * @returns 已完成工具调用 ID 集合
 */
function collectCompletedToolCallIds(parts: ChatMessagePart[]): Set<string> {
  const completed = new Set<string>();

  for (const part of parts) {
    if (part.type === 'tool' && part.result) {
      completed.add(part.toolCallId);
    }
  }

  return completed;
}

/**
 * 判断消息片段是否为 file part。
 * @param part - 消息片段
 * @returns 是否为 file part
 */
function isFilePart(part: ChatMessagePart): part is ChatMessageFilePart {
  return part.type === 'file';
}

/**
 * 判断消息片段是否为 Widget 提交结果。
 * @param part - 消息片段
 * @returns 是否为 Widget 提交结果
 */
function isWidgetResultPart(part: ChatMessagePart): part is ChatMessageWidgetResultPart {
  return part.type === 'widget_result';
}

/**
 * 判断用户消息是否包含需要以 content part 传递的结构化文本片段。
 * @param message - 用户消息
 * @returns 是否包含结构化文本片段
 */
function hasStructuredUserTextPart(message: RuntimeUserMessageRecord): boolean {
  return message.parts.some(isWidgetResultPart);
}

/**
 * 将结构化用户片段转为模型可读文本。
 * @param value - 结构化片段
 * @returns JSON 文本
 */
function stringifyUserModelTextValue(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}

/**
 * 转义 XML 属性值。
 * @param value - 原始属性值
 * @returns 转义后的属性值
 */
function escapeXmlAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * 将 file part 转为模型兼容的 XML 文本。
 * @param part - 文件片段
 * @returns XML 文本片段
 */
function toUserFileXmlText(part: ChatMessageFilePart): string {
  const lines = `${part.snapshot.startLine}-${part.snapshot.endLine}`;
  return `<file path="${escapeXmlAttribute(part.path)}" lines="${lines}">\n${part.snapshot.content}\n</file>`;
}

/**
 * 将用户消息片段合并为单个模型文本。
 * @param message - 用户消息
 * @returns 模型文本
 */
function createUserModelText(message: RuntimeUserMessageRecord): string {
  if (message.parts.length) {
    let text = '';
    for (const part of message.parts) {
      if (part.type === 'text' && part.text) {
        text += part.text;
      } else if (isFilePart(part)) {
        text += toUserFileXmlText(part);
      } else if (isWidgetResultPart(part)) {
        text += `${text ? '\n' : ''}${stringifyUserModelTextValue(part)}`;
      }
    }
    return text;
  }

  return message.content;
}

/**
 * 转换 user 消息。
 * @param message - user 消息
 * @returns 模型消息
 */
function toUserModelMessage(message: RuntimeUserMessageRecord): ModelMessage | undefined {
  const userText = createUserModelText(message);
  const imageFiles = message.files?.filter((file) => file.type === 'image' && file.url) ?? [];
  if (!imageFiles.length && !hasStructuredUserTextPart(message)) return userText ? { role: 'user', content: userText } : undefined;

  const contentParts: UserModelMessageContent = [];
  if (userText) contentParts.push({ type: 'text', text: userText });
  for (const file of imageFiles) {
    contentParts.push({ type: 'image', image: file.url as string, mediaType: file.mimeType });
  }

  return { role: 'user', content: contentParts };
}

/**
 * 转换 assistant 消息。
 * @param message - assistant 消息
 * @returns 模型消息列表
 */
function toAssistantModelMessages(message: RuntimeAssistantMessageRecord): ModelMessage[] {
  const modelMessages: ModelMessage[] = [];
  const completedToolCallIds = collectCompletedToolCallIds(message.parts);
  let assistantParts: AssistantModelMessageContent = [];
  let toolResultParts: ToolModelMessageContent = [];

  if (!message.parts.length && message.content.trim()) {
    return [{ role: 'assistant', content: [{ type: 'text', text: message.content }] }];
  }

  /**
   * 写入当前 assistant 片段缓冲。
   */
  const flushAssistant = (): void => {
    if (!assistantParts.length) return;

    modelMessages.push({ role: 'assistant', content: assistantParts });
    assistantParts = [];
  };

  /**
   * 写入当前工具结果片段缓冲。
   */
  const flushToolResults = (): void => {
    if (!toolResultParts.length) return;

    modelMessages.push({ role: 'tool', content: toolResultParts });
    toolResultParts = [];
  };

  for (const part of message.parts) {
    if (part.type === 'text') {
      flushToolResults();
      if (part.text.length > 0) {
        assistantParts.push({ type: 'text', text: part.text });
      }
      continue;
    }

    if (part.type !== 'tool' || part.status === 'inputting') {
      continue;
    }

    if (part.status === 'done' && part.result && completedToolCallIds.has(part.toolCallId)) {
      flushToolResults();
      assistantParts.push({
        type: 'tool-call',
        toolCallId: part.toolCallId,
        toolName: part.toolName,
        input: part.input
      });
      flushAssistant();
      toolResultParts.push({
        type: 'tool-result',
        toolCallId: part.toolCallId,
        toolName: part.toolName,
        output: { type: 'json', value: toJsonValue(createModelVisibleToolResult({ ...part, result: part.result })) }
      });
      continue;
    }

    if (completedToolCallIds.has(part.toolCallId)) {
      flushToolResults();
      assistantParts.push({
        type: 'tool-call',
        toolCallId: part.toolCallId,
        toolName: part.toolName,
        input: part.input
      });
    }
  }

  flushAssistant();
  flushToolResults();
  return modelMessages;
}

/**
 * 转换单条聊天消息。
 * @param message - 聊天消息
 * @returns 模型消息列表
 */
function toModelMessages(message: ChatMessageRecord): ModelMessage[] {
  if (message.role === 'compression') {
    if (message.compression?.status !== 'success' || !message.compression.recordText) return [];

    return [{ role: 'system', content: message.compression.recordText }];
  }

  if (!isRuntimeModelMessage(message)) return [];
  if (message.role === 'user') {
    const modelMessage = toUserModelMessage(message as RuntimeUserMessageRecord);

    return modelMessage ? [modelMessage] : [];
  }

  return toAssistantModelMessages(message as RuntimeAssistantMessageRecord);
}

/**
 * 将 ChatRuntime 消息列表转换为 AI SDK ModelMessage 列表。
 * @param messages - 聊天消息列表
 * @returns 模型消息列表
 */
export function toRuntimeModelMessages(messages: ChatMessageRecord[]): ModelMessage[] {
  return sliceMessagesFromCompressionBoundary(messages).flatMap(toModelMessages);
}
