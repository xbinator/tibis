/**
 * @file budget.test.ts
 * @description 上下文压缩预算公式与阈值测试。
 */
import { describe, expect, it } from 'vitest';
import {
  canGenerateSummary,
  createCompactionBudget,
  exceedsHardLimit,
  hasSummaryCapacity,
  shouldAutoCompact
} from '../../../../../../../electron/main/modules/chat/runtime/compaction/budget.mjs';

describe('compaction budget', (): void => {
  it('按 80% 触发并以 55% 为压缩目标', (): void => {
    const budget = createCompactionBudget({ contextWindow: 128_000, noncompressibleTokens: 20_000 });

    expect(budget.outputReserve).toBe(8_192);
    expect(budget.safetyReserve).toBe(6_400);
    expect(budget.usableInputTokens).toBe(113_408);
    expect(budget.triggerTokens).toBe(Math.floor(113_408 * 0.8));
    expect(budget.targetTokens).toBe(Math.floor(113_408 * 0.55));
    expect(budget.summaryMaxTokens).toBe(16_384);
    expect(budget.rawTailMaxTokens).toBe(25_990);
  });

  it('把输出预留限制在窗口的 25% 内且安全预留至少为 1024', (): void => {
    const highOutput = createCompactionBudget({ contextWindow: 16_000, maxOutputTokens: 10_000, noncompressibleTokens: 0 });
    const lowOutput = createCompactionBudget({ contextWindow: 16_000, maxOutputTokens: 100, noncompressibleTokens: 0 });

    expect(highOutput.outputReserve).toBe(4_000);
    expect(lowOutput.outputReserve).toBe(1_024);
    expect(lowOutput.safetyReserve).toBe(1_024);
  });

  it('在阈值处触发并在可用输入上执行硬限制', (): void => {
    const budget = createCompactionBudget({ contextWindow: 32_000, noncompressibleTokens: 0 });

    expect(shouldAutoCompact(budget.triggerTokens - 1, budget)).toBe(false);
    expect(shouldAutoCompact(budget.triggerTokens, budget)).toBe(true);
    expect(exceedsHardLimit(budget.usableInputTokens - 1, budget)).toBe(false);
    expect(exceedsHardLimit(budget.usableInputTokens, budget)).toBe(true);
  });

  it('不可压缩内容占满目标后不再提供摘要容量', (): void => {
    const initial = createCompactionBudget({ contextWindow: 8_000, noncompressibleTokens: 0 });
    const budget = createCompactionBudget({ contextWindow: 8_000, noncompressibleTokens: initial.targetTokens });

    expect(budget.summaryMaxTokens).toBe(0);
    expect(budget.rawTailMaxTokens).toBe(0);
    expect(hasSummaryCapacity(budget)).toBe(false);
  });

  it('摘要源、提示词和输出必须落在安全窗口内', (): void => {
    const budget = createCompactionBudget({ contextWindow: 32_000, noncompressibleTokens: 2_000 });

    expect(canGenerateSummary({ contextWindow: 32_000, sourceTokens: 1_000, promptTokens: 500, budget })).toBe(true);
    expect(
      canGenerateSummary({
        contextWindow: 32_000,
        sourceTokens: 32_000,
        promptTokens: 500,
        budget
      })
    ).toBe(false);
  });
});
