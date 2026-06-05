/**
 * @file compression-tail-policy.test.ts
 * @description BChatSidebar 压缩 tail 预算策略测试。
 */
import { describe, expect, it } from 'vitest';
import { computeTailTokenBudget, selectTailPreservedMessageIds } from '@/components/BChatSidebar/utils/compression/tailPolicy';
import type { Message } from '@/components/BChatSidebar/utils/types';

/**
 * 创建 user/assistant 测试消息。
 * @param id - 消息 ID
 * @param role - 消息角色
 * @param content - 消息内容
 * @returns 聊天消息
 */
function createMessage(id: string, role: 'user' | 'assistant', content: string): Message {
  return {
    id,
    role,
    content,
    parts: [{ type: 'text', text: content }],
    createdAt: '2026-06-05T00:00:00.000Z',
    finished: true
  };
}

/**
 * 创建多轮测试消息。
 * @param roundCount - 轮数
 * @param content - 每条消息内容
 * @returns 消息列表
 */
function createRounds(roundCount: number, content: string): Message[] {
  return Array.from({ length: roundCount }).flatMap((_, index) => {
    const round = index + 1;
    return [createMessage(`u${round}`, 'user', content), createMessage(`a${round}`, 'assistant', content)];
  });
}

describe('tailPolicy', () => {
  it('computes tail budget as 25 percent of context window clamped to 2000..8000 tokens', (): void => {
    expect(computeTailTokenBudget(4_096)).toBe(2_000);
    expect(computeTailTokenBudget(16_000)).toBe(4_000);
    expect(computeTailTokenBudget(128_000)).toBe(8_000);
    expect(computeTailTokenBudget(0)).toBe(2_000);
  });

  it('always preserves the latest two user turns even when they exceed the budget', (): void => {
    const hugeContent = '很长的最近上下文'.repeat(1_200);
    const olderContent = '旧上下文'.repeat(500);
    const messages = [
      ...createRounds(3, olderContent),
      createMessage('u4', 'user', hugeContent),
      createMessage('a4', 'assistant', hugeContent),
      createMessage('u5', 'user', hugeContent),
      createMessage('a5', 'assistant', hugeContent)
    ];

    const ids = selectTailPreservedMessageIds(messages, { contextWindow: 4_096 });

    expect([...ids]).toEqual(['u4', 'a4', 'u5', 'a5']);
  });

  it('expands backward while the tail budget allows older messages', (): void => {
    const content = '预算内上下文'.repeat(100);
    const messages = createRounds(5, content);

    const ids = selectTailPreservedMessageIds(messages, { contextWindow: 4_096 });

    expect([...ids]).toEqual(['u3', 'a3', 'u4', 'a4', 'u5', 'a5']);
  });

  it('keeps at least the earliest user turn compressible when the full history fits tail budget', (): void => {
    const messages = createRounds(3, '很短的上下文');

    const ids = selectTailPreservedMessageIds(messages, { contextWindow: 128_000 });

    expect([...ids]).toEqual(['u2', 'a2', 'u3', 'a3']);
  });
});
