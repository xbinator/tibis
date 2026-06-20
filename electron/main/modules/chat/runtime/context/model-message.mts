/**
 * @file model-message-context.mts
 * @description ChatRuntime 主进程模型上下文转换。
 */
import type { JSONValue, ModelMessage } from 'ai';
import type { ChatMessageFilePart, ChatMessagePart, ChatMessageRecord } from 'types/chat';

/** 可发送给模型的聊天消息。 */
type RuntimeModelMessageRecord = Extract<ChatMessageRecord, { role: 'user' | 'assistant' }> | (ChatMessageRecord & { role: 'user' | 'assistant' });

/** Runtime user 消息。 */
type RuntimeUserMessageRecord = ChatMessageRecord & { role: 'user' };

/** Runtime assistant 消息。 */
type RuntimeAssistantMessageRecord = ChatMessageRecord & { role: 'assistant' };

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

/**
 * 判断消息是否为成功压缩边界。
 * @param message - 聊天消息
 * @returns 是否为成功压缩边界
 */
function isSuccessfulCompressionBoundary(message: ChatMessageRecord): boolean {
  return message.role === 'compression' && message.compression?.status === 'success' && Boolean(message.compression.coveredUntilMessageId);
}

/**
 * 找到最近成功压缩边界索引。
 * @param messages - 消息列表
 * @returns 边界索引
 */
function findLatestCompressionBoundaryIndex(messages: ChatMessageRecord[]): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (isSuccessfulCompressionBoundary(messages[index])) {
      return index;
    }
  }

  return -1;
}

/**
 * 从最近压缩边界裁剪模型上下文。
 * @param messages - 原始消息
 * @returns 裁剪后的消息
 */
function sliceMessagesFromCompressionBoundary(messages: ChatMessageRecord[]): ChatMessageRecord[] {
  const boundaryIndex = findLatestCompressionBoundaryIndex(messages);
  if (boundaryIndex === -1) return messages;

  return messages.slice(boundaryIndex);
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
  if (!imageFiles.length) return userText ? { role: 'user', content: userText } : undefined;

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
        output: { type: 'json', value: toJsonValue(part.result) }
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

    return [{ role: 'assistant', content: message.compression.recordText }];
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
