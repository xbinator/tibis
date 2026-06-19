/**
 * @file usage.test.ts
 * @description ChatRuntime usage 辅助函数测试。
 */
import type { AIUsage } from 'types/ai';
import { describe, expect, it } from 'vitest';
import { addRuntimeUsage, isSameRuntimeUsage } from '../../../../../../electron/main/modules/chat/runtime/context/usage.mjs';

describe('chat runtime usage helpers', () => {
  it('accumulates provider usage across stream rounds', (): void => {
    const current: AIUsage = { inputTokens: 3, outputTokens: 4, totalTokens: 7 };
    const next: AIUsage = { inputTokens: 5, outputTokens: 6, totalTokens: 11 };

    expect(addRuntimeUsage(current, next)).toEqual({
      inputTokens: 8,
      outputTokens: 10,
      totalTokens: 18
    });
  });

  it('compares optional usage values by token fields', (): void => {
    expect(isSameRuntimeUsage({ inputTokens: 1, outputTokens: 2, totalTokens: 3 }, { inputTokens: 1, outputTokens: 2, totalTokens: 3 })).toBe(true);
    expect(isSameRuntimeUsage(undefined, { inputTokens: 1, outputTokens: 2, totalTokens: 3 })).toBe(false);
  });
});
