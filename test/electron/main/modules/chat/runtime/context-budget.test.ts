/**
 * @file context-budget.test.ts
 * @description ChatRuntime 上下文预算计算测试。
 */
import { describe, expect, it } from 'vitest';
import { createContextBudgetService } from '../../../../../../electron/main/modules/chat/runtime/context-budget.mjs';

describe('createContextBudgetService', (): void => {
  it('computes usable input budget with output and compaction reserves', (): void => {
    const service = createContextBudgetService();

    const snapshot = service.calculate({
      runtimeId: 'runtime-1',
      sessionId: 'session-1',
      agentId: 'agent-1',
      contextWindow: 200_000,
      estimatedInputTokens: 100_000
    });

    expect(snapshot.contextWindow).toBe(200_000);
    expect(snapshot.reservedOutputTokens).toBe(8_192);
    expect(snapshot.compactionBufferTokens).toBe(4_000);
    expect(snapshot.usableInputTokens).toBe(187_808);
    expect(snapshot.remainingInputTokens).toBe(87_808);
    expect(snapshot.usagePercent).toBe(53);
    expect(snapshot.status).toBe('safe');
    expect(snapshot.shouldCompactBeforeSend).toBe(false);
  });

  it('uses provider usage when it is larger than the serialized estimate', (): void => {
    const service = createContextBudgetService();

    const snapshot = service.calculate({
      runtimeId: 'runtime-2',
      sessionId: 'session-2',
      agentId: 'agent-1',
      contextWindow: 100_000,
      estimatedInputTokens: 20_000,
      providerUsageTokens: 75_000
    });

    expect(snapshot.estimatedInputTokens).toBe(75_000);
    expect(snapshot.providerUsageTokens).toBe(75_000);
    expect(snapshot.usagePercent).toBe(85);
    expect(snapshot.status).toBe('warning');
    expect(snapshot.shouldCompactBeforeSend).toBe(false);
  });

  it('marks danger and send-before compaction at the danger threshold', (): void => {
    const service = createContextBudgetService();

    const snapshot = service.calculate({
      runtimeId: 'runtime-3',
      sessionId: 'session-3',
      agentId: 'agent-1',
      contextWindow: 100_000,
      estimatedInputTokens: 80_000
    });

    expect(snapshot.usagePercent).toBe(91);
    expect(snapshot.remainingInputTokens).toBe(7_808);
    expect(snapshot.status).toBe('danger');
    expect(snapshot.shouldCompactBeforeSend).toBe(true);
  });

  it('returns a zeroed safe snapshot when model context window is unavailable', (): void => {
    const service = createContextBudgetService();

    const snapshot = service.calculate({
      runtimeId: 'runtime-4',
      sessionId: 'session-4',
      agentId: 'agent-1',
      contextWindow: 0,
      estimatedInputTokens: 80_000
    });

    expect(snapshot.contextWindow).toBe(0);
    expect(snapshot.usableInputTokens).toBe(0);
    expect(snapshot.usagePercent).toBe(0);
    expect(snapshot.remainingInputTokens).toBe(0);
    expect(snapshot.status).toBe('safe');
    expect(snapshot.shouldCompactBeforeSend).toBe(false);
  });
});
