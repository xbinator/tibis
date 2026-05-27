/**
 * @file useRollback.test.ts
 * @description useRollback hook 单元测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref, type Ref } from 'vue';
import type { Message } from '@/components/BChatSidebar/utils/types';
import { useRollback } from '@/components/BChatSidebar/hooks/useRollback';

/** 创建测试用的 Message 对象 */
function createMessage(id: string, role: Message['role'], overrides: Partial<Message> = {}): Message {
  return {
    id,
    role,
    content: overrides.content ?? '',
    parts: overrides.parts ?? [],
    createdAt: overrides.createdAt ?? new Date().toISOString(),
    finished: overrides.finished ?? true,
    ...overrides
  } as Message;
}

describe('useRollback', () => {
  let messages: Ref<Message[]>;
  let options: Parameters<typeof useRollback>[0];

  beforeEach(() => {
    messages = ref<Message[]>([
      createMessage('msg-1', 'user', { content: '第一条消息' }),
      createMessage('msg-2', 'assistant', { content: '回复第一条' }),
      createMessage('msg-3', 'user', { content: '第二条消息' }),
      createMessage('msg-4', 'assistant', { content: '回复第二条' })
    ]);

    options = {
      messages,
      getSessionId: vi.fn(() => 'session-1'),
      fetchAllPriorHistory: vi.fn().mockResolvedValue([]),
      persistMessages: vi.fn().mockResolvedValue(undefined),
      invalidateCompressionRecords: vi.fn().mockResolvedValue(undefined),
      restoreInput: vi.fn(),
      expireConfirmation: vi.fn(),
      focusInput: vi.fn()
    };
  });

  describe('canRollback', () => {
    it('非 user 消息不可回退', () => {
      const { canRollback } = useRollback(options);
      expect(canRollback(messages.value[1])).toBe(false);
    });

    it('最后一条消息不可回退', () => {
      const { canRollback } = useRollback(options);
      expect(canRollback(messages.value[3])).toBe(false);
    });

    it('后面还有消息的 user 消息可回退', () => {
      const { canRollback } = useRollback(options);
      expect(canRollback(messages.value[0])).toBe(true);
      expect(canRollback(messages.value[2])).toBe(true);
    });

    it('消息不在列表中时不可回退', () => {
      const { canRollback } = useRollback(options);
      const ghostMessage = createMessage('ghost', 'user');
      expect(canRollback(ghostMessage)).toBe(false);
    });
  });

  describe('rollback', () => {
    it('截断目标消息及其后所有消息', async () => {
      const { rollback } = useRollback(options);
      await rollback(messages.value[2]);

      expect(messages.value).toHaveLength(2);
      expect(messages.value[0].id).toBe('msg-1');
      expect(messages.value[1].id).toBe('msg-2');
    });

    it('从第一条消息回退会清空所有消息', async () => {
      const { rollback } = useRollback(options);
      await rollback(messages.value[0]);

      expect(messages.value).toHaveLength(0);
    });

    it('回退时调用 invalidateCompressionRecords 清理压缩记录', async () => {
      const compressionMessage = createMessage('comp-1', 'compression', {
        compression: { recordId: 'record-1', recordText: '压缩摘要', status: 'success', coveredUntilMessageId: 'msg-1' }
      });
      // 将压缩消息插入到 msg-2 和 msg-3 之间
      messages.value.splice(2, 0, compressionMessage);

      const { rollback } = useRollback(options);
      await rollback(messages.value[1]); // 回退到 msg-2，会覆盖 comp-1 和 msg-3 等

      expect(options.invalidateCompressionRecords).toHaveBeenCalledWith(['record-1']);
    });

    it('回退时无压缩消息则不调用 invalidateCompressionRecords', async () => {
      const { rollback } = useRollback(options);
      await rollback(messages.value[2]);

      expect(options.invalidateCompressionRecords).not.toHaveBeenCalled();
    });

    it('回退后调用 persistMessages 持久化', async () => {
      const { rollback } = useRollback(options);
      await rollback(messages.value[2]);

      expect(options.persistMessages).toHaveBeenCalledWith('session-1', messages.value);
    });

    it('回退后调用 restoreInput 恢复输入框', async () => {
      const { rollback } = useRollback(options);
      const target = messages.value[2];
      await rollback(target);

      expect(options.restoreInput).toHaveBeenCalledWith(target);
    });

    it('回退后调用 expireConfirmation', async () => {
      const { rollback } = useRollback(options);
      await rollback(messages.value[2]);

      expect(options.expireConfirmation).toHaveBeenCalled();
    });

    it('回退后调用 focusInput', async () => {
      const { rollback } = useRollback(options);
      await rollback(messages.value[2]);

      expect(options.focusInput).toHaveBeenCalled();
    });

    it('回退时拼接 fetchAllPriorHistory 获取的历史消息', async () => {
      const historyMessages = [
        createMessage('old-1', 'user', { content: '历史消息', createdAt: '2024-01-01T00:00:00.000Z' }),
        createMessage('old-2', 'assistant', { content: '历史回复', createdAt: '2024-01-01T00:00:01.000Z' })
      ];
      options.fetchAllPriorHistory = vi.fn().mockResolvedValue(historyMessages);

      const { rollback } = useRollback(options);
      await rollback(messages.value[2]);

      expect(messages.value).toHaveLength(4);
      expect(messages.value[0].id).toBe('old-1');
      expect(messages.value[1].id).toBe('old-2');
      expect(messages.value[2].id).toBe('msg-1');
      expect(messages.value[3].id).toBe('msg-2');
    });

    it('不在列表中的消息不执行任何操作', async () => {
      const { rollback } = useRollback(options);
      const ghostMessage = createMessage('ghost', 'user');
      await rollback(ghostMessage);

      expect(messages.value).toHaveLength(4);
      expect(options.persistMessages).not.toHaveBeenCalled();
      expect(options.restoreInput).not.toHaveBeenCalled();
      expect(options.invalidateCompressionRecords).not.toHaveBeenCalled();
    });
  });
});
