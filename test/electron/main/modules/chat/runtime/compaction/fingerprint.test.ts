/**
 * @file fingerprint.test.ts
 * @description 上下文压缩版本化 source fingerprint 测试。
 */
import type { ChatMessagePart, CompactionBudgetSnapshot, CompactionModelSnapshot } from 'types/chat';
import { describe, expect, it } from 'vitest';
import {
  buildSourceFingerprint,
  createFingerprintInput,
  type CompactionFingerprintInput
} from '../../../../../../../electron/main/modules/chat/runtime/compaction/fingerprint.mjs';

/**
 * 创建 fingerprint 测试模型快照。
 * @returns 模型快照
 */
function createModel(): CompactionModelSnapshot {
  return {
    providerType: 'openai',
    providerId: 'provider-1',
    modelId: 'model-1',
    contextWindow: 128_000,
    maxOutputTokens: 8_192
  };
}

/**
 * 创建 fingerprint 测试预算。
 * @returns 预算快照
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
 * 创建完整 fingerprint 输入。
 * @returns fingerprint 输入
 */
function createInput(): CompactionFingerprintInput {
  return {
    fingerprintVersion: 1,
    summarySchemaVersion: 1,
    projectorVersion: 1,
    compactionPolicyVersion: 2,
    modelSnapshot: createModel(),
    budgetSnapshot: createBudget(),
    parentCheckpointId: 'checkpoint-parent',
    boundaryPartId: 'part-1',
    sources: [{ messageId: 'message-1', partId: 'part-1', type: 'text', contentHash: 'sha256:content' }]
  };
}

describe('compaction source fingerprint', (): void => {
  it('对相同值和不同对象键顺序生成相同结果', (): void => {
    const first = createInput();
    const second = {
      sources: first.sources,
      boundaryPartId: first.boundaryPartId,
      parentCheckpointId: first.parentCheckpointId,
      budgetSnapshot: first.budgetSnapshot,
      modelSnapshot: first.modelSnapshot,
      compactionPolicyVersion: first.compactionPolicyVersion,
      projectorVersion: first.projectorVersion,
      summarySchemaVersion: first.summarySchemaVersion,
      fingerprintVersion: first.fingerprintVersion
    } satisfies CompactionFingerprintInput;

    expect(buildSourceFingerprint(first)).toBe(buildSourceFingerprint(second));
    expect(buildSourceFingerprint(first)).toMatch(/^sha256:[a-f0-9]{64}$/u);
  });

  it.each([
    {
      label: 'schema',
      mutate: (value: CompactionFingerprintInput): CompactionFingerprintInput => ({ ...value, summarySchemaVersion: 2 })
    },
    {
      label: 'model',
      mutate: (value: CompactionFingerprintInput): CompactionFingerprintInput => ({
        ...value,
        modelSnapshot: { ...value.modelSnapshot, modelId: 'model-2' }
      })
    },
    {
      label: 'contextWindow',
      mutate: (value: CompactionFingerprintInput): CompactionFingerprintInput => ({
        ...value,
        modelSnapshot: { ...value.modelSnapshot, contextWindow: 64_000 }
      })
    },
    {
      label: 'budget',
      mutate: (value: CompactionFingerprintInput): CompactionFingerprintInput => ({
        ...value,
        budgetSnapshot: { ...value.budgetSnapshot, targetTokens: 42 }
      })
    },
    {
      label: 'boundary',
      mutate: (value: CompactionFingerprintInput): CompactionFingerprintInput => ({ ...value, boundaryPartId: 'part-2' })
    },
    {
      label: 'parent',
      mutate: (value: CompactionFingerprintInput): CompactionFingerprintInput => ({ ...value, parentCheckpointId: 'checkpoint-other' })
    },
    {
      label: 'source id',
      mutate: (value: CompactionFingerprintInput): CompactionFingerprintInput => ({
        ...value,
        sources: [{ ...value.sources[0], partId: 'part-2' }]
      })
    },
    {
      label: 'source content',
      mutate: (value: CompactionFingerprintInput): CompactionFingerprintInput => ({
        ...value,
        sources: [{ ...value.sources[0], contentHash: 'sha256:changed' }]
      })
    }
  ])('$label 变化会改变 fingerprint', ({ mutate }): void => {
    const input = createInput();

    expect(buildSourceFingerprint(mutate(input))).not.toBe(buildSourceFingerprint(input));
  });

  it('从实际 Part 内容重新计算 source contentHash', (): void => {
    const part: ChatMessagePart = { id: 'part-1', type: 'text', text: '初始内容' };
    const first = createFingerprintInput({
      modelSnapshot: createModel(),
      budgetSnapshot: createBudget(),
      boundaryPartId: part.id,
      sources: [{ messageId: 'message-1', part }]
    });
    const changed = createFingerprintInput({
      modelSnapshot: createModel(),
      budgetSnapshot: createBudget(),
      boundaryPartId: part.id,
      sources: [{ messageId: 'message-1', part: { ...part, text: '修改内容' } }]
    });

    expect(first).toMatchObject({ projectorVersion: 2, compactionPolicyVersion: 3 });
    expect(first.sources[0].contentHash).not.toBe(changed.sources[0].contentHash);
    expect(buildSourceFingerprint(first)).not.toBe(buildSourceFingerprint(changed));
  });
});
