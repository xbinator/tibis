/**
 * @file use-rollback.test.ts
 * @description BChat 用户消息回退 hook 测试。
 */
import type { Message } from '@/components/BChat/utils/types';
import type { UseRollbackOptions } from '@/components/BChat/hooks/useRollback';
import { describe, expect, it, vi } from 'vitest';
import { ref, type Ref } from 'vue';
import { useRollback } from '@/components/BChat/hooks/useRollback';

/**
 * 创建测试消息。
 * @param id - 消息 ID
 * @param role - 消息角色
 * @returns 测试消息
 */
function createMessage(id: string, role: Message['role']): Message {
  return {
    id,
    role,
    content: id,
    parts: role === 'interrupt' ? [] : [{ type: 'text', text: id }],
    createdAt: '2026-06-22T00:00:00.000Z',
    loading: false,
    finished: true
  };
}

/**
 * 创建回退控制器测试夹具。
 * @param messages - 初始消息列表
 * @returns 回退控制器与响应式消息列表
 */
function createRollbackFixture(messages: Message[]): { canRollback: (message: Message) => boolean; messages: Ref<Message[]> } {
  const sourceMessages = ref<Message[]>(messages);
  const options: UseRollbackOptions = {
    messages: sourceMessages,
    getSessionId: () => 'session-1',
    fetchAllPriorHistory: async () => [],
    persistMessages: async () => undefined,
    invalidateCompressionRecords: async () => undefined,
    restoreInput: vi.fn(),
    expireConfirmation: vi.fn(),
    focusInput: vi.fn()
  };
  const rollback = useRollback(options);

  return { canRollback: rollback.canRollback, messages: sourceMessages };
}

describe('useRollback', (): void => {
  it('allows rollback when a user message is followed only by an interrupt status message', (): void => {
    const userMessage = createMessage('user-1', 'user');
    const interruptMessage = createMessage('interrupt-1', 'interrupt');
    const { canRollback } = createRollbackFixture([userMessage, interruptMessage]);

    expect(canRollback(userMessage)).toBe(true);
  });
});
