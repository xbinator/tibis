/**
 * @file interruptedDraftRecovery.ts
 * @description 聊天硬中断后未完成 assistant 草稿的恢复工具。
 */
import type { Message } from './types';
import { cloneDeep } from 'lodash-es';
import { finalizeToolPartsAsCancelled } from './messageHelper';

/** 硬中断恢复时展示给用户的提示。 */
export const HARD_INTERRUPTED_ASSISTANT_MESSAGE = '上次生成意外中断，已保留已生成内容。';

/**
 * 未完成 assistant 草稿恢复结果。
 */
export interface InterruptedDraftRecoveryResult {
  /** 恢复后的消息列表。 */
  messages: Message[];
  /** 是否有消息被恢复。 */
  recovered: boolean;
  /** 被恢复的消息列表。 */
  recoveredMessages: Message[];
  /** 恢复过程中新增的辅助消息列表。 */
  createdMessages: Message[];
}

/**
 * 判断消息是否正在等待用户输入。
 * @param message - 待检查消息。
 * @returns 是否为等待用户选择的暂停态消息。
 */
function isAwaitingUserChoiceMessage(message: Message): boolean {
  return message.parts.some((part) => part.type === 'tool' && part.result?.status === 'awaiting_user_input');
}

/**
 * 判断消息是否为上次硬中断遗留的 assistant 草稿。
 * @param message - 待检查消息。
 * @returns 是否需要恢复。
 */
function isInterruptedAssistantDraft(message: Message): boolean {
  return message.role === 'assistant' && !isAwaitingUserChoiceMessage(message) && (message.loading === true || message.finished === false);
}

/**
 * 创建硬中断提示消息。
 * @param sourceMessage - 被恢复的 assistant 草稿。
 * @returns interrupt 消息。
 */
function createRecoveredInterruptMessage(sourceMessage: Message): Message {
  return {
    id: `${sourceMessage.id}-interrupt`,
    role: 'interrupt',
    content: HARD_INTERRUPTED_ASSISTANT_MESSAGE,
    parts: [],
    createdAt: sourceMessage.createdAt,
    loading: false,
    finished: true,
    agentId: sourceMessage.agentId,
    runtimeId: sourceMessage.runtimeId,
    parentRuntimeId: sourceMessage.parentRuntimeId
  };
}

/**
 * 将未完成 assistant 草稿恢复为稳定终态消息。
 * @param sourceMessage - 未完成 assistant 草稿。
 * @returns 恢复后的 assistant 消息。
 */
function recoverInterruptedAssistantDraft(sourceMessage: Message): Message {
  const nextMessage = cloneDeep(sourceMessage);

  finalizeToolPartsAsCancelled(nextMessage);
  nextMessage.loading = false;
  nextMessage.finished = true;

  return nextMessage;
}

/**
 * 恢复消息列表中的硬中断 assistant 草稿。
 * @param sourceMessages - 从持久化存储加载的消息列表。
 * @returns 恢复后的消息列表和恢复标记。
 */
export function recoverInterruptedAssistantDrafts(sourceMessages: Message[]): InterruptedDraftRecoveryResult {
  let recovered = false;
  const recoveredMessages: Message[] = [];
  const createdMessages: Message[] = [];
  const sourceMessageIds = new Set(sourceMessages.map((message) => message.id));

  const messages = sourceMessages.flatMap((message) => {
    if (!isInterruptedAssistantDraft(message)) {
      return [message];
    }

    const nextMessage = recoverInterruptedAssistantDraft(message);
    recovered = true;
    recoveredMessages.push(nextMessage);

    const interruptMessageId = `${nextMessage.id}-interrupt`;
    if (sourceMessageIds.has(interruptMessageId)) {
      return [nextMessage];
    }

    const interruptMessage = createRecoveredInterruptMessage(nextMessage);
    createdMessages.push(interruptMessage);
    return [nextMessage, interruptMessage];
  });

  return { messages, recovered, recoveredMessages, createdMessages };
}
