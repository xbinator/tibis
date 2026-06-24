/**
 * @file usage-budget.test.ts
 * @description 共享 AI 上下文预算计算工具测试。
 */
import { describe, expect, it } from 'vitest';
import {
  computeReservedOutputTokens,
  computeSafetyMarginTokens,
  computeUsableInputTokens,
  createContextUsageBudgetSnapshot
} from '../../../../shared/ai/context/usageBudget.js';

describe('shared AI context usage budget', (): void => {
  it('uses the unified default reserves for renderer and main process snapshots', (): void => {
    expect(computeReservedOutputTokens(200_000)).toBe(8_192);
    expect(computeSafetyMarginTokens(200_000)).toBe(4_000);
    expect(computeUsableInputTokens(200_000)).toBe(187_808);
  });

  it('classifies warning and danger with shared default thresholds', (): void => {
    expect(createContextUsageBudgetSnapshot(75_000, 100_000).status).toBe('warning');
    expect(createContextUsageBudgetSnapshot(80_000, 100_000).status).toBe('danger');
  });

  it('keeps invalid context windows safe and non-negative', (): void => {
    const snapshot = createContextUsageBudgetSnapshot(Number.NaN, 0);

    expect(snapshot.contextWindow).toBe(0);
    expect(snapshot.usedTokens).toBe(0);
    expect(snapshot.usableInputTokens).toBe(0);
    expect(snapshot.remainingInputTokens).toBe(0);
    expect(snapshot.status).toBe('safe');
  });

  it('preserves usage and marks danger when fixed reserves exceed a small context window', (): void => {
    const snapshot = createContextUsageBudgetSnapshot(1_000, 8_000);

    expect(snapshot.contextWindow).toBe(8_000);
    expect(snapshot.usedTokens).toBe(1_000);
    expect(snapshot.usableInputTokens).toBe(0);
    expect(snapshot.usagePercent).toBe(100);
    expect(snapshot.remainingInputTokens).toBe(0);
    expect(snapshot.status).toBe('danger');
  });
});
