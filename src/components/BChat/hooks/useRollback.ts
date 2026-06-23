/**
 * @file useRollback.ts
 * @description 用户消息回退 hook，支持截断消息列表、持久化、清理压缩记录及恢复输入框。
 */
import type { Message } from '../utils/types';
import type { Ref } from 'vue';
import { nextTick } from 'vue';

/**
 * useRollback hook 依赖项
 */
export interface UseRollbackOptions {
  /** 响应式消息列表 */
  messages: Ref<Message[]>;
  /** 获取当前会话 ID */
  getSessionId: () => string | undefined;
  /** 获取已加载的所有历史消息 */
  fetchAllPriorHistory: (sessionId: string) => Promise<Message[]>;
  /** 持久化完整消息列表 */
  persistMessages: (sessionId: string, messages: Message[]) => Promise<void>;
  /** 无效化被回退消息中的压缩记录，防止悬空引用 */
  invalidateCompressionRecords: (messageIds: string[]) => Promise<void>;
  /** 恢复输入框内容 */
  restoreInput: (message: Message) => void;
  /** 使确认控制器过期 */
  expireConfirmation: () => void;
  /** 聚焦输入框 */
  focusInput: (options?: { moveToEnd?: boolean }) => void;
}

/**
 * useRollback hook 返回值
 */
export interface UseRollbackReturns {
  /** 回退到指定用户消息 */
  rollback: (message: Message) => Promise<void>;
  /** 判断指定消息是否可回退 */
  canRollback: (message: Message) => boolean;
}

/**
 * 从消息列表中提取压缩边界对应的 recordId。
 * @param messages - 待检查的消息列表
 * @returns 需要清理的压缩记录 ID 列表
 */
function collectCompressionRecordIds(messages: Message[]): string[] {
  const recordIds: string[] = [];

  for (const message of messages) {
    if (message.role === 'compression' && message.compression?.recordId) {
      recordIds.push(message.compression.recordId);
    }

    for (const part of message.parts) {
      if (part.type === 'compaction' && part.recordId) {
        recordIds.push(part.recordId);
      }
    }
  }

  return [...new Set(recordIds)];
}

/**
 * 用户消息回退 hook
 * @param options - 依赖项配置
 * @returns 回退操作和判断方法
 */
export function useRollback(options: UseRollbackOptions): UseRollbackReturns {
  const { messages, getSessionId, fetchAllPriorHistory, persistMessages, invalidateCompressionRecords, restoreInput, expireConfirmation, focusInput } = options;

  /**
   * 判断指定消息是否可回退。
   * 条件：role === 'user'，且该消息后面还有可删除消息（user/assistant/error/interrupt），
   * 用户主动中止后仅存在 interrupt 消息时仍应允许回退并恢复输入。
   * @param message - 待判断的消息
   * @returns 是否可回退
   */
  function canRollback(message: Message): boolean {
    if (message.role !== 'user') return false;

    const index = messages.value.findIndex((m) => m.id === message.id);
    if (index === -1) return false;

    return messages.value.slice(index + 1).some((m) => m.role === 'user' || m.role === 'assistant' || m.role === 'error' || m.role === 'interrupt');
  }

  /**
   * 回退到指定用户消息。
   * 删除该消息及其后所有消息，恢复输入框内容。
   * @param message - 目标用户消息
   */
  async function rollback(message: Message): Promise<void> {
    const index = messages.value.findIndex((m) => m.id === message.id);
    if (index === -1) return;

    // 1. 获取将被删除的消息区间，清理其中的压缩记录
    const truncatedMessages = messages.value.slice(index);
    const recordIds = collectCompressionRecordIds(truncatedMessages);
    if (recordIds.length) {
      await invalidateCompressionRecords(recordIds);
    }

    // 2. 获取已加载但不在当前 messages 中的历史消息
    const sessionId = getSessionId();
    const historyMessages = sessionId ? await fetchAllPriorHistory(sessionId) : [];

    // 3. 截断：保留 index 之前的消息，拼接历史消息
    const retainedMessages = messages.value.slice(0, index);
    const fullMessages = [...historyMessages, ...retainedMessages];
    messages.value.splice(0, messages.value.length, ...fullMessages);

    // 4. 持久化截断后的消息列表（DELETE+INSERT 全量替换）
    if (sessionId) {
      await persistMessages(sessionId, fullMessages);
    }

    // 5. 过期确认控制器
    expireConfirmation();

    // 6. 恢复输入框内容
    restoreInput(message);

    // 7. 等待编辑器内容更新后，聚焦输入框并将光标移到末尾
    await nextTick();
    focusInput({ moveToEnd: true });
  }

  return { rollback, canRollback };
}
