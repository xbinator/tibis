/**
 * @file branch.mts
 * @description 聊天会话分支的数据验证、消息克隆与引用重建工具。
 */
import type { AIUsage } from 'types/ai';
import type { ChatMessagePart, ChatMessageRecord, ChatSession } from 'types/chat';

/**
 * 创建会话分支所需源数据。
 */
export interface CreateSessionBranchInput {
  /** 源会话。 */
  sourceSession: ChatSession;
  /** 已按展示顺序排列的全部源消息。 */
  sourceMessages: ChatMessageRecord[];
  /** 目标已完成助手消息 ID。 */
  targetMessageId: string;
  /** 新会话时间。 */
  now: string;
  /** 唯一 ID 工厂。 */
  createId: () => string;
}

/**
 * 可在单一事务中写入的会话分支数据。
 */
export interface SessionBranchData {
  /** 新会话。 */
  session: ChatSession;
  /** 重建后的消息。 */
  messages: ChatMessageRecord[];
}

/**
 * 创建带源数据和本次生成结果冲突检测的 ID 工厂。
 * @param input - 分支源数据与底层 ID 工厂
 * @returns 每次调用生成未被占用的新 ID
 */
function createUniqueId(input: CreateSessionBranchInput): () => string {
  const usedIds = new Set<string>([input.sourceSession.id]);
  for (const message of input.sourceMessages) {
    usedIds.add(message.id);
    for (const part of message.parts) {
      if (part.id) usedIds.add(part.id);
    }
  }

  return (): string => {
    const id = input.createId();
    if (usedIds.has(id)) throw new Error(`会话分支 ID 冲突: ${id}`);
    usedIds.add(id);
    return id;
  };
}

/**
 * 汇总复制消息的 Token 用量。
 * @param messages - 新分支消息
 * @returns 汇总用量，没有用量记录时返回 undefined
 */
function sumUsage(messages: ChatMessageRecord[]): AIUsage | undefined {
  let usage: AIUsage | undefined;

  for (const message of messages) {
    if (!message.usage) continue;
    usage = {
      inputTokens: (usage?.inputTokens ?? 0) + message.usage.inputTokens,
      outputTokens: (usage?.outputTokens ?? 0) + message.usage.outputTokens,
      totalTokens: (usage?.totalTokens ?? 0) + message.usage.totalTokens
    };
  }

  return usage;
}

/**
 * 克隆消息片段并重建片段 ID。
 * @param part - 源消息片段
 * @param createId - 唯一 ID 工厂
 * @returns 新分支消息片段
 */
function clonePart(part: ChatMessagePart, createId: () => string): ChatMessagePart {
  const cloned = structuredClone(part);
  return { ...cloned, id: createId() };
}

/**
 * 克隆单条消息并重建消息与片段引用。
 * @param message - 源消息
 * @param sessionId - 新会话 ID
 * @param messageId - 新消息 ID
 * @param createId - 唯一 ID 工厂
 * @returns 可写入新会话的消息
 */
function cloneMessage(message: ChatMessageRecord, sessionId: string, messageId: string, createId: () => string): ChatMessageRecord {
  const cloned = structuredClone(message);
  const parts = cloned.parts.map((part: ChatMessagePart): ChatMessagePart => clonePart(part, createId));

  return {
    ...cloned,
    id: messageId,
    sessionId,
    parts,
    runtimeId: undefined,
    parentRuntimeId: undefined
  };
}

/**
 * 创建独立会话分支所需的完整数据。
 * @param input - 源会话、源消息和 ID 工厂
 * @returns 新会话及其独立消息数据
 */
export function createSessionBranchData(input: CreateSessionBranchInput): SessionBranchData {
  const targetIndex = input.sourceMessages.findIndex((message: ChatMessageRecord): boolean => message.id === input.targetMessageId);
  const targetMessage = input.sourceMessages[targetIndex];
  if (!targetMessage || targetMessage.role !== 'assistant' || targetMessage.finished !== true) {
    throw new Error('无法从该助手消息创建会话分支');
  }

  const createId = createUniqueId(input);
  const sessionId = createId();
  const sourceMessages = input.sourceMessages.slice(0, targetIndex + 1);
  const messageIds = new Map(sourceMessages.map((message: ChatMessageRecord): [string, string] => [message.id, createId()]));
  const messages = sourceMessages.map(
    (message: ChatMessageRecord): ChatMessageRecord => cloneMessage(message, sessionId, messageIds.get(message.id) as string, createId)
  );
  const session: ChatSession = {
    id: sessionId,
    type: input.sourceSession.type,
    title: input.sourceSession.title,
    createdAt: input.now,
    updatedAt: input.now,
    lastMessageAt: input.now,
    usage: sumUsage(messages)
  };

  return { session, messages };
}
