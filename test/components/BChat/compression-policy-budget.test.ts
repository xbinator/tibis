/**
 * @file compression-policy-budget.test.ts
 * @description BChat 压缩策略与可用输入预算对齐测试。
 */
import { describe, expect, it } from 'vitest';
import { computeCompressionTokenThreshold, shouldAutoCompactByContextUsage } from '@/components/BChat/utils/compression/policy';

describe('compression policy budget alignment', () => {
  it('uses 65 percent of usable input budget as the automatic compression threshold', (): void => {
    expect(computeCompressionTokenThreshold(200_000)).toBe(126_672);
  });

  it('triggers automatic compression when usage reaches the shared budget threshold', (): void => {
    expect(shouldAutoCompactByContextUsage(126_671, 200_000)).toBe(false);
    expect(shouldAutoCompactByContextUsage(126_672, 200_000)).toBe(true);
  });
});
