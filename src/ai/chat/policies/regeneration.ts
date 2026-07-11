/**
 * @file regeneration.ts
 * @description ChatRuntime 重新生成消息边界纯策略。
 */
import type { ChatPolicyMessage } from '../types';

/**
 * 重新生成需要保留和移除的消息切片。
 */
export interface RegenerationSlice<T extends ChatPolicyMessage> {
  /** 保留至目标 assistant 前一条 user 的消息 */
  sourceMessages: T[];
  /** 本次重新生成需要临时移除的消息 */
  removedMessages: T[];
}

/**
 * 查找重新生成时最后保留的 user 消息索引。
 * @param messages - 当前消息列表
 * @param targetMessageId - 目标 assistant 消息 ID
 * @returns user 消息索引，不存在时返回 -1
 */
export function findRegenerationStartIndex<T extends ChatPolicyMessage>(messages: readonly T[], targetMessageId: string): number {
  const targetIndex = messages.findIndex((message: T): boolean => message.id === targetMessageId);
  if (targetIndex === -1 || messages[targetIndex].role !== 'assistant') {
    return -1;
  }

  for (let index = targetIndex - 1; index >= 0; index -= 1) {
    if (messages[index].role === 'user') {
      return index;
    }
  }

  return -1;
}

/**
 * 创建重新生成的消息切片。
 * @param messages - 当前消息列表
 * @param targetMessageId - 目标 assistant 消息 ID
 * @returns 保留和移除切片，目标无效时返回 null
 */
export function createRegenerationSlice<T extends ChatPolicyMessage>(messages: readonly T[], targetMessageId: string): RegenerationSlice<T> | null {
  const startIndex = findRegenerationStartIndex(messages, targetMessageId);
  if (startIndex === -1) {
    return null;
  }

  return {
    sourceMessages: messages.slice(0, startIndex + 1),
    removedMessages: messages.slice(startIndex + 1)
  };
}
