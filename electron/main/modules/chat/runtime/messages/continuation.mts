/**
 * @file continuation.mts
 * @description ChatRuntime 续轮消息快照辅助函数。
 */
import type { ChatMessageRecord } from 'types/chat';
import type { ChatRuntimeContinueInput } from 'types/chat-runtime';

/**
 * 从消息快照中查找最后一条 user 消息。
 * @param messages - 消息快照
 * @returns user 消息
 */
export function findLastRuntimeUserMessage(messages: ChatMessageRecord[]): ChatMessageRecord | undefined {
  return [...messages].reverse().find((message) => message.role === 'user');
}

/**
 * 查找最后一条 user 消息的索引。
 * @param messages - 消息快照
 * @returns user 消息索引，不存在时返回 -1
 */
function findLastRuntimeUserMessageIndex(messages: ChatMessageRecord[]): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === 'user') {
      return index;
    }
  }

  return -1;
}

/**
 * 从最后一条 user 之后查找可续跑的 assistant 消息。
 * 历史上下文中的上一轮 assistant 不能被当作当前 user 的续跑草稿。
 * @param messages - 消息快照
 * @returns assistant 消息
 */
export function findLastRuntimeAssistantMessage(messages: ChatMessageRecord[]): ChatMessageRecord | undefined {
  const userIndex = findLastRuntimeUserMessageIndex(messages);
  if (userIndex === -1) {
    return undefined;
  }

  return messages
    .slice(userIndex + 1)
    .reverse()
    .find((message) => message.role === 'assistant');
}

/**
 * 将 renderer 续轮消息快照补齐为主进程持久化消息。
 * @param input - 续轮输入
 * @returns 可写入主进程存储的消息列表
 */
export function normalizeContinuationMessages(input: ChatRuntimeContinueInput): ChatMessageRecord[] {
  return input.messages.map((message) => ({
    ...message,
    sessionId: message.sessionId ?? input.sessionId
  }));
}
