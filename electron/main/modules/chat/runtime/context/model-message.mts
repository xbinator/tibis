/**
 * @file model-message-context.mts
 * @description ChatRuntime 主进程模型上下文转换。
 */
import type { JSONValue, ModelMessage } from 'ai';
import type {
  ChatMessageFilePart,
  ChatMessagePart,
  ChatMessageRecord,
  ChatMessageSkillReferencePart,
  ChatMessageToolPart,
  ChatMessageWidgetResultPart
} from 'types/chat';
import { isPlainObject } from 'lodash-es';

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
type UserModelMessageContent = Array<{ type: 'text'; text: string } | { type: 'file'; data: URL; mediaType: string; filename?: string }>;

/** Runtime 工具结果类型。 */
type RuntimeToolResult = NonNullable<ChatMessageToolPart['result']>;
/** Runtime 成功工具结果类型。 */
type RuntimeToolSuccessResult = Extract<RuntimeToolResult, { status: 'success' }>;

/** 打开小组件工具名称。 */
const OPEN_WIDGET_TOOL_NAME = 'open_widget';
/** Skill 工具名称。 */
const SKILL_TOOL_NAME = 'skill';
/** Skill 工具结果中的内容版本标签。 */
const SKILL_CONTENT_HASH_PATTERN = /<content_hash>([^<]*)<\/content_hash>/u;

/**
 * Runtime 模型消息转换选项。
 */
export interface RuntimeModelMessageOptions {
  /** 当前启用 Skill 名称到内容版本的映射。 */
  skillContentHashes?: Record<string, string>;
}

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
 * 读取 Skill 工具调用名称。
 * @param part - Skill 工具消息片段
 * @returns Skill 名称，不可读取时返回空字符串
 */
function readSkillName(part: ChatMessageToolPart): string {
  return isPlainRecord(part.input) && typeof part.input.name === 'string' ? part.input.name : '';
}

/**
 * 读取 Skill 工具结果中的内容版本。
 * @param data - Skill 工具结果数据
 * @returns 内容版本，不可读取时返回空字符串
 */
function readSkillContentHash(data: unknown): string {
  if (typeof data !== 'string') return '';

  return data.match(SKILL_CONTENT_HASH_PATTERN)?.[1] ?? '';
}

/**
 * 转义 Skill 失效标记属性。
 * @param value - 原始属性值
 * @returns XML 安全文本
 */
function escapeSkillMarkerAttribute(value: string): string {
  return value.replace(/&/gu, '&amp;').replace(/"/gu, '&quot;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;');
}

/**
 * 判断 Skill 工具结果是否仍匹配当前内容版本。
 * @param part - Skill 工具消息片段
 * @param skillContentHashes - 当前 Skill 内容版本
 * @returns 是否仍为当前版本
 */
function isCurrentSkillToolResult(part: ChatMessageToolPart & { result: RuntimeToolSuccessResult }, skillContentHashes: Record<string, string>): boolean {
  const name = readSkillName(part);
  const currentHash = skillContentHashes[name];
  const resultHash = readSkillContentHash(part.result.data);

  return Boolean(name && currentHash && resultHash && currentHash === resultHash);
}

/**
 * 将过期 Skill 工具结果替换为重新加载提示，仅生成 runtime 投影。
 * @param messages - 原始持久化消息
 * @param skillContentHashes - 当前 Skill 内容版本
 * @returns 供本轮 runtime 使用的消息投影
 */
export function invalidateStaleSkillToolResults(messages: ChatMessageRecord[], skillContentHashes?: Record<string, string>): ChatMessageRecord[] {
  if (!skillContentHashes) return messages;

  return messages.map((message: ChatMessageRecord): ChatMessageRecord => {
    let changed = false;
    const parts = message.parts.map((part: ChatMessagePart): ChatMessagePart => {
      if (part.type !== 'tool' || part.toolName !== SKILL_TOOL_NAME || part.result?.status !== 'success') {
        return part;
      }

      const successfulPart = part as ChatMessageToolPart & { result: RuntimeToolSuccessResult };
      if (isCurrentSkillToolResult(successfulPart, skillContentHashes)) {
        return part;
      }

      changed = true;
      const name = readSkillName(successfulPart);

      return {
        ...successfulPart,
        result: {
          ...successfulPart.result,
          data: [
            `<skill_invalidated name="${escapeSkillMarkerAttribute(name)}">`,
            'Skill content changed or is unavailable. Call the skill tool again before using its instructions.',
            '</skill_invalidated>'
          ].join('')
        }
      };
    });

    return changed ? { ...message, parts } : message;
  });
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
 * 判断消息片段是否为 SkillReference。
 * @param part - 消息片段
 * @returns 是否为 SkillReference
 */
function isSkillReferencePart(part: ChatMessagePart): part is ChatMessageSkillReferencePart {
  return part.type === 'skill_reference';
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
      } else if (isSkillReferencePart(part)) {
        text += `$${part.name}`;
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
    contentParts.push({
      type: 'file',
      data: new URL(file.url as string),
      mediaType: file.mimeType || 'image',
      filename: file.name
    });
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
export function toRuntimeModelMessages(messages: ChatMessageRecord[], options: RuntimeModelMessageOptions = {}): ModelMessage[] {
  const projectedMessages = invalidateStaleSkillToolResults(messages, options.skillContentHashes);

  return projectedMessages.flatMap(toModelMessages);
}
