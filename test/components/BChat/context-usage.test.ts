/**
 * @file context-usage.test.ts
 * @description BChat 上下文窗口用量计算测试。
 */
import type { ModelMessage } from 'ai';
import { computed, ref } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useContextUsage } from '@/components/BChat/hooks/useContextUsage';
import type { Message } from '@/components/BChat/utils/types';

/** token 估算器测试替身。 */
const mockEstimate = vi.hoisted(() => vi.fn<(messages: ModelMessage[]) => number>());

vi.mock('@/components/BChat/utils/compression/tokenEstimator', () => ({
  createTokenEstimator: vi.fn(async () => ({
    estimate: mockEstimate,
    estimateText: vi.fn<(text: string) => number>((text) => text.length)
  })),
  createCharLevelEstimator: vi.fn(() => ({
    estimate: mockEstimate,
    estimateText: vi.fn<(text: string) => number>((text) => text.length)
  }))
}));

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

describe('useContextUsage', () => {
  beforeEach((): void => {
    mockEstimate.mockReset();
  });

  it('uses the current model-message estimate instead of stale assistant usage tokens', (): void => {
    mockEstimate.mockReturnValue(42);
    const assistant = createMessage('a1', 'assistant', '短回复');
    assistant.usage = {
      inputTokens: 300_000,
      outputTokens: 1_000,
      totalTokens: 301_000
    };

    const messages = ref<Message[]>([createMessage('u1', 'user', '短问题'), assistant]);
    const usage = useContextUsage({
      messages,
      contextWindow: computed(() => 200_000),
      selectedModel: computed(() => ({ providerId: 'provider-1', modelId: 'model-1' })),
      streaming: computed(() => false)
    });

    expect(usage.usedTokens.value).toBe(42);
    expect(usage.snapshot.value.reservedOutputTokens).toBe(8_192);
    expect(usage.snapshot.value.safetyMarginTokens).toBe(4_000);
    expect(usage.snapshot.value.usableInputTokens).toBe(187_808);
    expect(usage.remainingTokens.value).toBe(187_766);
  });
});
