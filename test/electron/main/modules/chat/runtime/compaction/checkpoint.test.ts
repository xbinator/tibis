/**
 * @file checkpoint.test.ts
 * @description 上下文压缩 checkpoint 运行时校验测试。
 */
import type { CompactionBudgetSnapshot, StructuredContextSummary } from 'types/chat';
import { describe, expect, it } from 'vitest';
import { validateCheckpoint } from '../../../../../../../electron/main/modules/chat/runtime/compaction/checkpoint.mjs';

/**
 * 创建合法预算快照。
 * @returns 预算测试数据
 */
function createBudget(): CompactionBudgetSnapshot {
  return {
    outputReserve: 8_192,
    safetyReserve: 6_400,
    usableInputTokens: 113_408,
    triggerTokens: 90_726,
    targetTokens: 62_374,
    summaryMaxTokens: 16_384,
    rawTailMaxTokens: 25_990
  };
}

/**
 * 创建合法结构化摘要。
 * @returns 摘要测试数据
 */
function createSummary(): StructuredContextSummary {
  return {
    schemaVersion: 1,
    activeObjectiveId: 'objective-1',
    objectives: [
      {
        id: 'objective-1',
        description: '实现长会话上下文压缩',
        status: 'active',
        successCriteria: ['达到阈值后可继续会话'],
        sourcePartIds: ['part-1']
      }
    ],
    facts: [],
    artifacts: [],
    completedActions: [],
    pendingActions: [],
    openQuestions: [],
    failures: []
  };
}

/**
 * 创建合法成功 checkpoint。
 * @returns checkpoint 测试数据
 */
function createSuccessCheckpoint(): Record<string, unknown> {
  return {
    id: 'checkpoint-1',
    type: 'compaction',
    status: 'success',
    trigger: 'automatic',
    boundaryPartId: 'part-9',
    sourceFingerprint: 'sha256:abc',
    modelSnapshot: {
      providerType: 'openai',
      providerId: 'provider-1',
      modelId: 'gpt-test',
      contextWindow: 128_000
    },
    budgetSnapshot: createBudget(),
    summary: createSummary(),
    createdAt: 1,
    completedAt: 2
  };
}

describe('compaction checkpoint validation', (): void => {
  it('接受字段完整且脱敏的 success checkpoint', (): void => {
    expect(validateCheckpoint(createSuccessCheckpoint())).toEqual({ ok: true });
  });

  it('拒绝缺少成功载荷的 success checkpoint', (): void => {
    const checkpoint = createSuccessCheckpoint();
    delete checkpoint.summary;

    expect(validateCheckpoint(checkpoint)).toEqual({ ok: false, errorCode: 'INVALID_SUCCESS_PAYLOAD' });
  });

  it('拒绝非 success checkpoint 携带摘要', (): void => {
    const checkpoint = { ...createSuccessCheckpoint(), status: 'failed' };

    expect(validateCheckpoint(checkpoint)).toEqual({ ok: false, errorCode: 'SUMMARY_NOT_ALLOWED' });
  });

  it('允许 pending checkpoint 暂无 boundary', (): void => {
    expect(
      validateCheckpoint({
        id: 'checkpoint-pending',
        type: 'compaction',
        status: 'pending',
        trigger: 'manual',
        createdAt: 1
      })
    ).toEqual({ ok: true });
  });

  it('拒绝模型快照携带 secret 字段', (): void => {
    const checkpoint = createSuccessCheckpoint();
    checkpoint.modelSnapshot = {
      providerType: 'openai',
      providerId: 'provider-1',
      modelId: 'gpt-test',
      apiKey: 'secret'
    };

    expect(validateCheckpoint(checkpoint)).toEqual({ ok: false, errorCode: 'MODEL_SNAPSHOT_NOT_SANITIZED' });
  });
});
