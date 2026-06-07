/**
 * @file context-usage-budget.test.ts
 * @description BChatSidebar 上下文可用输入预算计算测试。
 */
import { describe, expect, it } from 'vitest';
import {
  computeReservedOutputTokens,
  computeSafetyMarginTokens,
  computeUsableInputTokens,
  createContextUsageBudgetSnapshot
} from '@/components/BChatSidebar/utils/contextUsageBudget';

describe('contextUsageBudget', () => {
  it('computes usable input budget after output reservation and safety margin', (): void => {
    expect(computeReservedOutputTokens(200_000)).toBe(4_096);
    expect(computeSafetyMarginTokens(200_000)).toBe(1_024);
    expect(computeUsableInputTokens(200_000)).toBe(194_880);
  });

  it('caps output reservation to half of small context windows', (): void => {
    expect(computeReservedOutputTokens(4_096)).toBe(2_048);
    expect(computeSafetyMarginTokens(4_096)).toBe(614);
    expect(computeUsableInputTokens(4_096)).toBe(1_434);
  });

  it('clamps invalid usage inputs and avoids division by zero', (): void => {
    const snapshot = createContextUsageBudgetSnapshot(Number.NaN, 0);

    expect(snapshot.usedTokens).toBe(0);
    expect(snapshot.contextWindow).toBe(0);
    expect(snapshot.usableInputTokens).toBe(1);
    expect(snapshot.usagePercent).toBe(0);
    expect(snapshot.remainingInputTokens).toBe(1);
    expect(snapshot.status).toBe('safe');
  });

  it('classifies usage status by usable input budget percentage', (): void => {
    expect(createContextUsageBudgetSnapshot(120_000, 200_000).status).toBe('safe');
    expect(createContextUsageBudgetSnapshot(130_000, 200_000).status).toBe('warning');
    expect(createContextUsageBudgetSnapshot(180_000, 200_000).status).toBe('danger');
  });

  it('caps percentage and remaining input when usage exceeds usable input budget', (): void => {
    const snapshot = createContextUsageBudgetSnapshot(250_000, 200_000);

    expect(snapshot.usagePercent).toBe(100);
    expect(snapshot.remainingInputTokens).toBe(0);
    expect(snapshot.status).toBe('danger');
  });
});
