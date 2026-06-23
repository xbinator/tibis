/**
 * @file token-estimator.test.ts
 * @description 共享 AI 上下文 Token 估算工具测试。
 */
import type { ModelMessage } from 'ai';
import { describe, expect, it } from 'vitest';
import { estimateModelMessagesTokens, estimateTextTokens } from '../../../../shared/ai/context/tokenEstimator.js';

describe('shared AI context token estimator', (): void => {
  it('estimates ASCII text at 0.3 token per character', (): void => {
    expect(estimateTextTokens('abcdefghij')).toBe(3);
  });

  it('estimates CJK text at 0.6 token per character', (): void => {
    expect(estimateTextTokens('你好世界')).toBe(3);
  });

  it('estimates mixed language text by summing character weights', (): void => {
    expect(estimateTextTokens('hello你好')).toBe(3);
  });

  it('estimates model messages with the same text weighting rules', (): void => {
    const messages: ModelMessage[] = [{ role: 'user', content: 'hello你好' }];

    expect(estimateModelMessagesTokens(messages)).toBe(3);
  });
});
