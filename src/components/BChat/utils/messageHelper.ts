/**
 * @file message.ts
 * @description BChat 消息创建、转换与持久化过滤工具。
 */
import type { Message } from './types';
import type { FileReference } from '../types';
import type { JSONValue, ModelMessage } from 'ai';
import type { AIAwaitingUserChoiceQuestion, AIToolExecutionAwaitingUserInputResult, AIToolExecutionCancelledResult } from 'types/ai';
import type { AIUserChoiceAnswerData, ChatMessagePart, ChatMessageRole, ChatMessageShellOutputChunk, ChatMessageToolPart } from 'types/chat';
import dayjs from 'dayjs';
import { nanoid } from 'nanoid';
import { asyncTo } from '@/utils/asyncTo';
import { extractFileReferenceLines, MESSAGE_REF_PATTERN } from './fileReferenceContext';

// ─── 公开类型 ────────────────────────────────────────────────────────────────

/** 可传给模型的消息 */
export type ModelCompatibleMessage = Message & { role: Extract<ChatMessageRole, 'user' | 'assistant'> };

/** 可持久化的消息 */
export type PersistableMessage = Message & { role: ChatMessageRole };

/** 单条消息的模型转换缓存条目 */
export interface CachedModelMessageEntry {
  /** 缓存生成时对应的原始消息引用 */
  sourceMessage: Message;
  /** 参与模型转换的消息签名 */
  signature: string;
  /** 转换后的模型消息列表；不可传给模型的消息为空数组 */
  modelMessages: ModelMessage[];
}

/** 模型消息转换缓存结果 */
export interface CachedModelMessagesResult {
  /** 每条原始消息对应的缓存条目 */
  entries: CachedModelMessageEntry[];
  /** 过滤后的模型消息列表 */
  modelMessages: ModelMessage[];
}

/** Assistant 模型消息内容片段 */
export type AssistantModelMessageContent = Array<{ type: 'text'; text: string } | { type: 'tool-call'; toolCallId: string; toolName: string; input: unknown }>;

/** Tool 模型消息内容片段 */
export type ToolModelMessageContent = Array<{
  type: 'tool-result';
  toolCallId: string;
  toolName: string;
  output: { type: 'json'; value: JSONValue };
}>;

/** 工具结果类型 */
export type ToolResult = NonNullable<ChatMessageToolPart['result']>;

/** 兼容历史消息与新工具实现的用户提问工具名称。 */
const ASK_USER_QUESTION_TOOL_NAMES = new Set(['ask_user_choice', 'ask_user_question', 'question']);
/** 旧压缩记忆召回的最大数量。 */
const MAX_RECALLED_COMPRESSION_MEMORY_COUNT = 2;
/** Shell 命令实时输出最多保留片段数量。 */
const MAX_SHELL_OUTPUT_CHUNK_COUNT = 80;

// ─── 内部工具函数 ────────────────────────────────────────────────────────────

/**
 * 将任意值转换为 JSON 可序列化值。
 */
function toJsonValue(value: unknown): JSONValue {
  return JSON.parse(JSON.stringify(value)) as JSONValue;
}

/**
 * 构建消息中的文件引用列表
 * @param content - 消息内容
 * @returns 文件引用数组，无引用时返回 undefined
 */
export async function buildMessageReferences(content: string) {
  const matches = [...content.matchAll(MESSAGE_REF_PATTERN)];
  if (!matches.length) return undefined;

  // 去重：相同 token 只处理一次，避免重复读取文件
  const uniqueMatches = [...new Map(matches.map((m) => [m[0], m])).values()];

  const values = uniqueMatches.map(([token, ...match]) => extractFileReferenceLines(token, match));

  const [, result] = await asyncTo(Promise.all(values));

  return result;
}

// ─── finalize —— 消息终态处理 ──────────────────────────────────────────────

/**
 * 将消息中所有未完成的 tool part 标记为已取消。
 * 用于中止流式传输等非正常完成场景，避免 tool part 永远停留在 inputting/executing 状态。
 * @param message - 待处理的助手消息
 */
export function finalizeToolPartsAsCancelled(message: Message): void {
  for (const part of message.parts) {
    if (part.type === 'tool' && part.status !== 'done') {
      part.status = 'done';
      part.result = {
        toolName: part.toolName,
        status: 'cancelled',
        error: { code: 'USER_CANCELLED', message: '用户中止了操作' }
      } satisfies AIToolExecutionCancelledResult;
      delete part.inputText;
    }
  }
}

// ─── is —— 消息类型判断 ──────────────────────────────────────────────────────

export const is = {
  /**
   * 判断消息是否可传给模型。
   */
  modelMessage(message: Message): message is ModelCompatibleMessage {
    return message.role === 'user' || message.role === 'assistant';
  },

  /**
   * 判断消息是否可持久化。
   */
  persistableMessage(message: Message): message is PersistableMessage {
    return ['user', 'assistant', 'error', 'compression', 'interrupt'].includes(message.role);
  },

  /**
   * 判断消息是否为可作为后续模型上下文边界的成功压缩消息。
   */
  modelBoundaryCompressionMessage(message: Message | undefined): boolean {
    return message?.role === 'compression' && message.compression?.status === 'success' && Boolean(message.compression.coveredUntilMessageId);
  },

  /**
   * 判断 assistant 消息是否仍可视为空占位。
   */
  removableAssistantPlaceholder(message: Message | undefined): boolean {
    if (!message || message.role !== 'assistant') return false;
    return !message.content && !message.usage && !message.parts.length;
  }
} as const;

// ─── append —— 消息片段追加 ──────────────────────────────────────────────────

export const append = {
  /**
   * 将文本增量追加到消息片段。
   */
  textPart(message: Message, text: string): void {
    const lastPart = message.parts[message.parts.length - 1];
    if (lastPart?.type === 'text') {
      lastPart.text += text;
    } else {
      message.parts.push({ type: 'text', text });
    }
    message.content = `${message.content ?? ''}${text}`;
  },

  /**
   * 将思考增量追加到消息片段。
   */
  thinkingPart(message: Message, thinking: string): void {
    const lastPart = message.parts[message.parts.length - 1];
    if (lastPart?.type === 'thinking') {
      lastPart.thinking += thinking;
    } else {
      message.parts.push({ type: 'thinking', thinking });
    }
    message.thinking = (message.thinking ?? '') + thinking;
  },

  /**
   * 将工具调用追加到消息片段。
   * 若未找到已有 tool-input 片段则新建，否则将同一 toolCallId 的片段状态从 inputting 切换为 executing。
   */
  toolCallPart(message: Message, toolCallId: string, toolName: string, input: unknown): void {
    const existingPart = message.parts.find((part): part is ChatMessageToolPart => part.type === 'tool' && part.toolCallId === toolCallId);
    if (existingPart) {
      existingPart.status = 'executing';
      existingPart.toolName = toolName;
      existingPart.input = input;
      delete existingPart.inputText;
      return;
    }

    message.parts.push({ type: 'tool', toolCallId, toolName, status: 'executing', input });
  },

  /**
   * 追加 Shell 命令实时输出片段。
   */
  shellOutputPart(message: Message, commandId: string, chunk: ChatMessageShellOutputChunk): void {
    const existingPart = message.parts.find((part): part is ChatMessageToolPart => part.type === 'tool' && part.toolCallId === commandId);
    if (!existingPart) {
      return;
    }

    const output = [...(existingPart.shellOutput ?? []), chunk];
    existingPart.shellOutput = output.slice(Math.max(0, output.length - MAX_SHELL_OUTPUT_CHUNK_COUNT));
  },

  /**
   * 追加工具输入预览片段。
   * 流式开始时新建 type: 'tool'，status: 'inputting' 的片段。
   */
  toolInputStartPart(message: Message, toolCallId: string, toolName: string): void {
    const existingPart = message.parts.find((part): part is ChatMessageToolPart => part.type === 'tool' && part.toolCallId === toolCallId);
    if (existingPart) {
      existingPart.toolName = toolName;
      return;
    }

    message.parts.push({ type: 'tool', toolCallId, toolName, status: 'inputting', input: null, inputText: '' });
  },

  /**
   * 更新工具输入预览片段。
   */
  toolInputDeltaPart(message: Message, toolCallId: string, inputTextDelta: string, input: unknown): void {
    const existingPart = message.parts.find((part): part is ChatMessageToolPart => part.type === 'tool' && part.toolCallId === toolCallId);
    if (!existingPart) {
      return;
    }

    existingPart.inputText = (existingPart.inputText ?? '') + inputTextDelta;
    if (input !== undefined) {
      existingPart.input = input;
    }
  },

  /**
   * 将工具结果更新到对应 tool 片段。
   * 将同一 toolCallId 的片段状态从 executing 切换为 done，并写入执行结果。
   */
  toolResultPart(message: Message, toolCallId: string, toolName: string, result: ToolResult): void {
    const existingPart = message.parts.find((part): part is ChatMessageToolPart => part.type === 'tool' && part.toolCallId === toolCallId);
    if (existingPart) {
      existingPart.status = 'done';
      existingPart.toolName = toolName;
      existingPart.result = result;
      delete existingPart.inputText;
      return;
    }

    message.parts.push({ type: 'tool', toolCallId, toolName, status: 'done', input: null, result });
  }
} as const;

// ── 对外 ─────────────────────────────────────────────
export function createBase(overrides: Partial<Message>): Message {
  return { id: nanoid(), parts: [], loading: false, createdAt: dayjs().toISOString(), ...overrides } as Message;
}

export const create = {
  // 创建 assistant 消息占位符
  assistantPlaceholder(): Message {
    return createBase({ role: 'assistant', content: '', thinking: '', loading: true, finished: false });
  },
  // 创建错误消息
  errorMessage(content: string): Message {
    return createBase({ role: 'assistant', content, parts: [{ type: 'error', text: content }], finished: true });
  },
  // 创建用户消息
  userMessage(content: string, references?: FileReference[]): Message {
    const parts: ChatMessagePart[] = content ? [{ type: 'text', text: content }] : [];

    return createBase({ role: 'user', content, parts, references, finished: true });
  }
} as const;

// ─── find / submit —— 用户选择题流程 ─────────────────────────────────────────

export function isAwaitingUserChoiceResult(part: ChatMessagePart): part is ChatMessageToolPart & { result: AIToolExecutionAwaitingUserInputResult } {
  return part.type === 'tool' && ASK_USER_QUESTION_TOOL_NAMES.has(part.toolName) && part.result?.status === 'awaiting_user_input';
}

export const userChoice = {
  /**
   * 查找消息历史中尚未回答的用户选择问题。
   */
  findPending(sourceMessages: Message[]): AIAwaitingUserChoiceQuestion | null {
    for (let i = sourceMessages.length - 1; i >= 0; i -= 1) {
      const pendingPart = sourceMessages[i].parts.find(isAwaitingUserChoiceResult);
      if (pendingPart?.result.status === 'awaiting_user_input') {
        return pendingPart.result.data;
      }
    }
    return null;
  },

  /**
   * 将等待用户选择的工具结果替换为用户答案。
   * @returns 是否成功提交
   */
  submitAnswer(sourceMessages: Message[], answer: AIUserChoiceAnswerData): boolean {
    for (let i = sourceMessages.length - 1; i >= 0; i -= 1) {
      const resultPart = sourceMessages[i].parts.find(
        (part) => isAwaitingUserChoiceResult(part) && part.toolCallId === answer.toolCallId && part.result.data.questionId === answer.questionId
      );

      if (resultPart?.type !== 'tool') continue;

      const isUserCancelled = answer.answers.length === 0 && answer.otherText === '' && (answer.questionAnswers ?? []).every((qa) => qa.answers.length === 0);

      if (isUserCancelled) {
        resultPart.result = { toolName: resultPart.toolName, status: 'cancelled', error: { code: 'USER_CANCELLED', message: '用户取消了选择' } };
      } else {
        resultPart.result = { toolName: resultPart.toolName, status: 'success', data: answer };
      }

      return true;
    }
    return false;
  }
} as const;

/**
 * 查找最后一条成功压缩消息的索引。
 * @param sourceMessages - 原始消息列表
 * @returns 成功压缩消息索引，不存在时返回 -1
 */
export function findLatestCompressionBoundaryIndex(sourceMessages: Message[]): number {
  for (let index = sourceMessages.length - 1; index >= 0; index -= 1) {
    if (is.modelBoundaryCompressionMessage(sourceMessages[index])) {
      return index;
    }
  }

  return -1;
}

/**
 * 从最近用户消息中提取召回关键词。
 * @param sourceMessages - 原始消息列表
 * @returns 去重后的关键词列表
 */
function extractRecallKeywords(sourceMessages: Message[]): string[] {
  const latestUserMessage = [...sourceMessages].reverse().find((message) => message.role === 'user');
  if (!latestUserMessage) {
    return [];
  }

  const referenceKeywords = latestUserMessage.references?.map((reference) => reference.path.split('/').pop() ?? reference.path) ?? [];
  const contentKeywords = latestUserMessage.content
    .toLowerCase()
    .replace(/[^\w\s./@_\-\u4e00-\u9fff]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length >= 2);

  return [...new Set([...contentKeywords, ...referenceKeywords.map((keyword) => keyword.toLowerCase())])];
}

/**
 * 计算旧压缩消息与当前用户消息的匹配分。
 * @param message - 旧压缩消息
 * @param keywords - 当前用户消息关键词
 * @returns 匹配分
 */
function scoreCompressionRecallMessage(message: Message, keywords: string[]): number {
  const text = `${message.content}\n${message.compression?.recordText ?? ''}`.toLowerCase();
  return keywords.reduce((score, keyword) => {
    if (!keyword) {
      return score;
    }
    return text.includes(keyword) ? score + 1 : score;
  }, 0);
}

/**
 * 选择与当前用户消息相关的旧压缩记忆。
 * @param sourceMessages - 原始消息列表
 * @param latestBoundaryIndex - 最新压缩边界索引
 * @returns 按时间顺序排列的旧压缩消息
 */
function selectRelevantPreviousCompressionMessages(sourceMessages: Message[], latestBoundaryIndex: number): Message[] {
  const keywords = extractRecallKeywords(sourceMessages);
  if (!keywords.length) {
    return [];
  }

  const scoredMessages = sourceMessages
    .slice(0, latestBoundaryIndex)
    .filter((message) => is.modelBoundaryCompressionMessage(message))
    .map((message, index) => ({
      message,
      index,
      score: scoreCompressionRecallMessage(message, keywords)
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || b.index - a.index)
    .slice(0, MAX_RECALLED_COMPRESSION_MEMORY_COUNT)
    .sort((a, b) => a.index - b.index);

  return scoredMessages.map((item) => item.message);
}

/**
 * 从最后一条成功压缩消息开始裁剪消息列表，作为后续模型上下文起点。
 * @param sourceMessages - 原始消息列表
 * @returns 裁剪后的消息列表
 */
export function sliceMessagesFromCompressionBoundary(sourceMessages: Message[]): Message[] {
  const boundaryIndex = findLatestCompressionBoundaryIndex(sourceMessages);

  if (boundaryIndex === -1) {
    return sourceMessages;
  }

  const boundaryMessage = sourceMessages[boundaryIndex];
  const recalledCompressionMessages = selectRelevantPreviousCompressionMessages(sourceMessages, boundaryIndex);
  const coveredUntilMessageId = boundaryMessage.compression?.coveredUntilMessageId;
  const coveredUntilIndex = coveredUntilMessageId ? sourceMessages.findIndex((message) => message.id === coveredUntilMessageId) : -1;
  const preservedTailMessages = coveredUntilIndex >= 0 ? sourceMessages.slice(coveredUntilIndex + 1, boundaryIndex) : [];

  return [recalledCompressionMessages, boundaryMessage, ...preservedTailMessages, ...sourceMessages.slice(boundaryIndex + 1)].flat();
}

// ─── convert —— 消息格式转换 ─────────────────────────────────────────────────

/** 收集当前 assistant 片段中已完成配对的 tool-call ID */
function collectCompletedToolCallIds(parts: ChatMessagePart[]): Set<string> {
  const completed = new Set<string>();

  for (const part of parts) {
    if (part.type === 'tool' && part.result) {
      completed.add(part.toolCallId);
    }
  }
  return completed;
}

/** 将 assistant 消息片段转换为 AI SDK 所需的多条模型消息 */
function toAssistantModelMessages(parts: ChatMessagePart[]): ModelMessage[] {
  const modelMessages: ModelMessage[] = [];
  const completedToolCallIds = collectCompletedToolCallIds(parts);

  let assistantParts: AssistantModelMessageContent = [];
  let toolResultParts: ToolModelMessageContent = [];

  const flushAssistant = (): void => {
    if (assistantParts.length) {
      modelMessages.push({ role: 'assistant', content: assistantParts });
      assistantParts = [];
    }
  };

  const flushToolResults = (): void => {
    if (toolResultParts.length) {
      modelMessages.push({ role: 'tool', content: toolResultParts });
      toolResultParts = [];
    }
  };

  for (const part of parts) {
    if (part.type === 'text') {
      flushToolResults();
      assistantParts.push({ type: 'text', text: part.text });
      continue;
    }

    if (part.type === 'tool') {
      // inputting 阶段（流式输入中）暂不生成任何模型消息
      if (part.status === 'inputting') {
        continue;
      }

      // 已完成且有结果的 tool 片段需同时生成 tool-call 和 tool-result
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

      // executing 阶段（等待结果），若有结果则生成 tool-call
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
  }

  flushAssistant();
  flushToolResults();
  return modelMessages;
}

/** 生成参与模型转换的消息签名，用于判断缓存是否还能复用 */
function createModelMessageSignature(message: Message): string {
  return JSON.stringify({
    role: message.role,
    content: message.content,
    parts: message.parts,
    compression: message.compression,
    files: message.files?.map((file) => ({
      id: file.id,
      type: file.type,
      mimeType: file.mimeType,
      size: file.size,
      contentHash: file.contentHash
    }))
  });
}

/** 判断单条消息是否可以直接复用已有缓存条目 */
function canReuseCachedEntry(entry: CachedModelMessageEntry, message: Message): boolean {
  return entry.sourceMessage.id === message.id && entry.sourceMessage.role === message.role && entry.signature === createModelMessageSignature(message);
}

/** 将单条组件消息转换为 AI SDK 的 ModelMessage 列表 */
function toModelMessagesForMessage(message: Message): ModelMessage[] {
  if (message.role === 'compression') {
    if (message.compression?.status !== 'success') {
      return [];
    }

    const boundaryText = message.compression.recordText;
    return [{ role: 'assistant', content: boundaryText }];
  }

  if (!is.modelMessage(message)) return [];
  if (message.role === 'user') {
    const imageFiles = message.files?.filter((file) => file.type === 'image' && file.url) ?? [];
    if (!imageFiles.length) return [{ role: 'user', content: message.content }];

    return [
      {
        role: 'user',
        content: [
          { type: 'text', text: message.content },
          ...imageFiles.map((file) => ({
            type: 'image' as const,
            image: file.url!,
            mediaType: file.mimeType
          }))
        ]
      }
    ];
  }
  return toAssistantModelMessages(message.parts);
}

export const convert = {
  /**
   * 将组件消息转换为带缓存的模型消息结果，尽量复用前缀历史。
   */
  toCachedModelMessages(sourceMessages: Message[], previousCache?: CachedModelMessagesResult): CachedModelMessagesResult {
    const boundaryMessages = sliceMessagesFromCompressionBoundary(sourceMessages);
    const entries: CachedModelMessageEntry[] = [];
    const modelMessages: ModelMessage[] = [];
    let reuseCount = 0;

    if (previousCache) {
      const maxReuse = Math.min(boundaryMessages.length, previousCache.entries.length);
      while (reuseCount < maxReuse) {
        const prev = previousCache.entries[reuseCount];
        const msg = boundaryMessages[reuseCount];
        if (!canReuseCachedEntry(prev, msg)) break;

        entries.push(prev);
        modelMessages.push(...prev.modelMessages);
        reuseCount += 1;
      }
    }

    for (let i = reuseCount; i < boundaryMessages.length; i += 1) {
      const sourceMessage = boundaryMessages[i];
      const nextModelMessages = toModelMessagesForMessage(sourceMessage);
      entries.push({
        sourceMessage,
        signature: createModelMessageSignature(sourceMessage),
        modelMessages: nextModelMessages
      });
      modelMessages.push(...nextModelMessages);
    }

    return { entries, modelMessages };
  },

  /**
   * 将组件消息转换为 AI SDK 的 ModelMessage 列表（无缓存版）。
   */
  toModelMessages(sourceMessages: Message[]): ModelMessage[] {
    return convert.toCachedModelMessages(sourceMessages).modelMessages;
  }
} as const;

/**
 * 提取消息中最后一个文本片段的内容
 * @param message - 聊天消息
 * @returns 最后一个文本片段的内容，不存在时返回空字符串
 */
export function extractLastTextPart(message: Message): string {
  for (let i = message.parts.length - 1; i >= 0; i -= 1) {
    const part = message.parts[i];
    if (part.type === 'text') {
      return part.text;
    }
  }
  return '';
}
