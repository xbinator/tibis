/**
 * @file regeneration.test.ts
 * @description 聊天重新生成消息边界纯策略测试。
 */
import { describe, expect, it } from 'vitest';
import { createRegenerationSlice, findRegenerationStartIndex } from '@/ai/chat/policies/regeneration';
import type { Message } from '@/components/BChat/utils/types';

/**
 * 创建最小聊天消息。
 * @param id - 消息 ID
 * @param role - 消息角色
 * @returns 聊天消息
 */
function createMessage(id: string, role: Message['role']): Message {
  return {
    id,
    role,
    content: id,
    parts: [],
    createdAt: `2026-07-11T00:00:0${id.length}.000Z`
  };
}

describe('chat regeneration policy', (): void => {
  it('keeps messages through the user message preceding the target assistant', (): void => {
    const messages = [
      createMessage('user-1', 'user'),
      createMessage('assistant-1', 'assistant'),
      createMessage('user-2', 'user'),
      createMessage('assistant-2', 'assistant')
    ];

    expect(findRegenerationStartIndex(messages, 'assistant-2')).toBe(2);
    expect(createRegenerationSlice(messages, 'assistant-2')).toEqual({
      sourceMessages: messages.slice(0, 3),
      removedMessages: messages.slice(3)
    });
  });

  it('rejects missing targets and non-assistant targets', (): void => {
    const messages = [createMessage('user-1', 'user'), createMessage('assistant-1', 'assistant')];

    expect(findRegenerationStartIndex(messages, 'missing')).toBe(-1);
    expect(findRegenerationStartIndex(messages, 'user-1')).toBe(-1);
    expect(createRegenerationSlice(messages, 'missing')).toBeNull();
  });

  it('retains complete messages without slicing checkpoint parts', (): void => {
    const userOne = createMessage('user-1', 'user');
    const assistantOne = createMessage('assistant-1', 'assistant');
    assistantOne.parts = [
      { id: 'source-1', type: 'text', text: '第一轮回答' },
      { id: 'checkpoint-1', type: 'compaction', status: 'skipped', trigger: 'manual', errorCode: 'NO_NEW_CONTENT', createdAt: 1, completedAt: 2 }
    ];
    const userTwo = createMessage('user-2', 'user');
    const assistantTwo = createMessage('assistant-2', 'assistant');
    const messages = [userOne, assistantOne, userTwo, assistantTwo];

    const slice = createRegenerationSlice(messages, 'assistant-2');

    expect(slice?.sourceMessages).toEqual([userOne, assistantOne, userTwo]);
    expect(slice?.sourceMessages[1].parts).toEqual(assistantOne.parts);
    expect(slice?.removedMessages).toEqual([assistantTwo]);
  });
});
