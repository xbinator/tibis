/**
 * @file boundary.mts
 * @description 上下文压缩 immutable Part 边界规划。
 */
import type { ChatMessagePart, ChatMessageRecord } from 'types/chat';
import { validateCheckpoint } from './checkpoint.mjs';

/**
 * boundary 查找输入。
 */
export interface BoundaryInput {
  /** 当前触发模型请求的用户消息，boundary 必须位于它之前。 */
  currentUserMessageId?: string;
}

/**
 * 可安全压缩的 Part 边界。
 */
export interface BoundaryResult {
  /** boundary 所属消息标识。 */
  messageId: string;
  /** boundary 所属消息索引。 */
  messageIndex: number;
  /** boundary Part 标识。 */
  partId: string;
  /** boundary 在所属消息中的索引。 */
  partIndex: number;
}

/**
 * 判断工具 Part 是否已经完整持久化且无需用户交互。
 * @param part - 工具 Part
 * @returns 是否为 immutable 工具 Part
 */
function isImmutableTool(part: Extract<ChatMessagePart, { type: 'tool' }>): boolean {
  return part.status === 'done' && part.result !== undefined && part.result.status !== 'awaiting_user_input';
}

/**
 * 判断消息 Part 是否已经进入不可变终态。
 * @param part - 消息 Part
 * @param message - Part 所属消息
 * @returns 是否为 immutable Part
 */
export function isImmutablePart(part: ChatMessagePart, message: ChatMessageRecord): boolean {
  if (part.type === 'tool') return isImmutableTool(part);
  if (part.type === 'compaction') return part.status === 'success' && validateCheckpoint(part).ok;
  if (part.type === 'confirmation') {
    return part.confirmationStatus !== 'pending' && part.executionStatus !== 'running';
  }

  return message.finished === true;
}

/**
 * 判断消息是否仍包含禁止压缩的活跃状态。
 * @param message - 聊天消息
 * @returns 是否存在活跃状态
 */
function hasActiveState(message: ChatMessageRecord): boolean {
  for (const part of message.parts) {
    if (part.type === 'tool') {
      if (part.status !== 'done' || part.result === undefined || part.result.status === 'awaiting_user_input') return true;
    }
    if (part.type === 'confirmation' && (part.confirmationStatus === 'pending' || part.executionStatus === 'running')) return true;
    if (part.type === 'compaction' && part.status === 'pending') return true;
  }

  const lastPart = message.parts.at(-1);
  return message.role === 'assistant' && message.finished !== true && (!lastPart || lastPart.type === 'text' || lastPart.type === 'thinking');
}

/**
 * 查找当前消息拓扑中的最新安全 boundary。
 * @param messages - 按展示顺序排列的原始消息
 * @param input - 当前请求边界约束
 * @returns 最新安全 boundary，不可压缩时返回 null
 */
export function findSafeBoundary(messages: readonly ChatMessageRecord[], input: BoundaryInput): BoundaryResult | null {
  if (messages.some(hasActiveState)) return null;

  let maximumMessageIndex = messages.length - 1;
  if (input.currentUserMessageId) {
    const currentUserIndex = messages.findIndex((message: ChatMessageRecord): boolean => message.id === input.currentUserMessageId);
    if (currentUserIndex < 0) return null;
    maximumMessageIndex = currentUserIndex - 1;
  }

  for (let messageIndex = maximumMessageIndex; messageIndex >= 0; messageIndex -= 1) {
    const message = messages[messageIndex];
    for (let partIndex = message.parts.length - 1; partIndex >= 0; partIndex -= 1) {
      const part = message.parts[partIndex];
      if (!isImmutablePart(part, message)) continue;

      return { messageId: message.id, messageIndex, partId: part.id, partIndex };
    }
  }

  return null;
}
