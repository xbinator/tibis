/**
 * @file pendingInteraction.ts
 * @description 从持久化聊天消息识别可恢复的待处理用户交互。
 */
import type { AIToolExecutionAwaitingUserInputResult } from 'types/ai';
import type { ChatMessagePart, ChatMessageToolPart, ChatPendingInteraction } from 'types/chat';

/** 支持恢复为用户选择交互的工具名称。 */
const USER_CHOICE_TOOL_NAMES = new Set<string>(['ask_user_choice', 'ask_user_question', 'question']);

/** 当前支持的持久化交互。 */
export type PendingInteraction = ChatPendingInteraction;

/** PendingInteraction 策略所需的最小消息形状。 */
export interface PendingInteractionMessage {
  /** 消息 ID。 */
  id: string;
  /** 消息片段。 */
  parts: ChatMessagePart[];
  /** 可选 Runtime ID。 */
  runtimeId?: string;
  /** 可选 Agent ID。 */
  agentId?: string;
}

/**
 * 判断消息片段是否为待回答用户选择。
 * @param part - 消息片段
 * @returns 是否为待回答用户选择工具片段
 */
export function isPendingUserChoicePart(part: ChatMessagePart): part is ChatMessageToolPart & { result: AIToolExecutionAwaitingUserInputResult } {
  return part.type === 'tool' && USER_CHOICE_TOOL_NAMES.has(part.toolName) && part.result?.status === 'awaiting_user_input';
}

/**
 * 从持久化消息中恢复最后一个待处理交互。
 * @param messages - 会话消息
 * @param sessionId - 会话 ID
 * @returns 待处理交互，不存在时返回 null
 */
export function findPendingInteraction(messages: PendingInteractionMessage[], sessionId: string): PendingInteraction | null {
  for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const message = messages[messageIndex];
    const part = message.parts.find(isPendingUserChoicePart);
    if (!part) continue;

    return {
      type: 'userChoice',
      status: 'pending',
      sessionId,
      messageId: message.id,
      runtimeId: message.runtimeId ?? `persisted-interaction:${message.id}:${part.toolCallId}`,
      agentId: message.agentId ?? 'primary',
      toolCallId: part.toolCallId,
      questionId: part.result.data.questionId
    };
  }

  return null;
}
