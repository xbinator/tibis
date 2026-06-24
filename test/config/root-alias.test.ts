/**
 * @file root-alias.test.ts
 * @description 仓库根路径别名解析测试。
 */
import { describe, expect, it } from 'vitest';
import { createContextUsageBudgetSnapshot } from '@@/shared/ai/context/usageBudget.ts';

describe('root path alias', (): void => {
  it('resolves shared modules from @@ alias', (): void => {
    const snapshot = createContextUsageBudgetSnapshot(42, 200_000);

    expect(snapshot.usedTokens).toBe(42);
    expect(snapshot.usableInputTokens).toBe(187_808);
  });
});
