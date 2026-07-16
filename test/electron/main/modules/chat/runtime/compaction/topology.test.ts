/**
 * @file topology.test.ts
 * @description 上下文压缩 Part 依赖闭包校验测试。
 */
import type { ChatMessageCompactionPart, ChatMessagePart, ChatMessageRecord, CompactionBudgetSnapshot, StructuredContextSummary } from 'types/chat';
import { describe, expect, it } from 'vitest';
import { removeInvalidCheckpoints, validatePartTopology } from '../../../../../../../electron/main/modules/chat/runtime/compaction/topology.mjs';

/**
 * 创建拓扑测试预算。
 * @returns 预算快照
 */
function createBudget(): CompactionBudgetSnapshot {
  return {
    outputReserve: 2_000,
    safetyReserve: 1_000,
    usableInputTokens: 17_000,
    triggerTokens: 13_600,
    targetTokens: 9_350,
    summaryMaxTokens: 2_000,
    rawTailMaxTokens: 4_000
  };
}

/**
 * 创建引用指定证据的摘要。
 * @param sourcePartIds - 证据 Part 标识
 * @returns 结构化摘要
 */
function createSummary(sourcePartIds: string[]): StructuredContextSummary {
  return {
    schemaVersion: 1,
    objectives: [],
    facts: [
      {
        id: 'fact-1',
        type: 'decision',
        content: '保留结构化 checkpoint',
        sourcePartIds
      }
    ],
    artifacts: [],
    completedActions: [],
    pendingActions: [],
    openQuestions: [],
    failures: []
  };
}

/**
 * 创建成功 checkpoint。
 * @param id - checkpoint 标识
 * @param boundaryPartId - boundary 标识
 * @param sourcePartIds - 证据 Part 标识
 * @param parentCheckpointId - parent checkpoint 标识
 * @returns 成功 checkpoint
 */
function createCheckpoint(id: string, boundaryPartId: string, sourcePartIds: string[], parentCheckpointId?: string): ChatMessageCompactionPart {
  return {
    id,
    type: 'compaction',
    status: 'success',
    trigger: 'automatic',
    boundaryPartId,
    parentCheckpointId,
    sourceFingerprint: `sha256:${id}`,
    modelSnapshot: {
      providerType: 'openai',
      providerId: 'provider-1',
      modelId: 'model-1',
      contextWindow: 20_000
    },
    budgetSnapshot: createBudget(),
    summary: createSummary(sourcePartIds),
    createdAt: 1,
    completedAt: 2
  };
}

/**
 * 创建已完成 assistant 消息。
 * @param id - 消息标识
 * @param parts - 消息 Part
 * @returns assistant 消息
 */
function createMessage(id: string, parts: ChatMessagePart[]): ChatMessageRecord {
  return {
    id,
    sessionId: 'session-1',
    role: 'assistant',
    content: '',
    parts,
    createdAt: `2026-07-16T00:00:0${id.length}.000Z`,
    loading: false,
    finished: true
  };
}

describe('compaction part topology', (): void => {
  it('接受 boundary、parent 和 evidence 完整的 checkpoint 链', (): void => {
    const messages = [
      createMessage('message-1', [{ id: 'source-1', type: 'text', text: '第一段事实' }]),
      createMessage('message-2', [createCheckpoint('checkpoint-1', 'source-1', ['source-1'])]),
      createMessage('message-3', [
        { id: 'source-2', type: 'text', text: '第二段事实' },
        createCheckpoint('checkpoint-2', 'source-2', ['source-1', 'source-2'], 'checkpoint-1')
      ])
    ];

    const result = validatePartTopology(messages);

    expect([...result.validCheckpointIds]).toEqual(['checkpoint-1', 'checkpoint-2']);
    expect([...result.invalidCheckpointIds]).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it('拒绝指向 checkpoint 自身之后的 boundary', (): void => {
    const messages = [
      createMessage('message-1', [
        createCheckpoint('checkpoint-1', 'source-later', ['source-later']),
        { id: 'source-later', type: 'text', text: '晚于 checkpoint' }
      ])
    ];

    const result = validatePartTopology(messages);

    expect([...result.invalidCheckpointIds]).toEqual(['checkpoint-1']);
    expect(result.errors.map((error) => error.code)).toContain('INVALID_BOUNDARY');
  });

  it('parent 缺失时同时使所有后代 checkpoint 失效', (): void => {
    const messages = [
      createMessage('message-1', [{ id: 'source-1', type: 'text', text: '事实' }]),
      createMessage('message-2', [createCheckpoint('checkpoint-1', 'source-1', ['source-1'], 'missing-parent')]),
      createMessage('message-3', [createCheckpoint('checkpoint-2', 'checkpoint-1', ['source-1'], 'checkpoint-1')])
    ];

    const result = validatePartTopology(messages);

    expect([...result.invalidCheckpointIds]).toEqual(['checkpoint-1', 'checkpoint-2']);
    expect(result.errors.map((error) => error.code)).toContain('INVALID_PARENT');
  });

  it('证据 Part 缺失时移除无效 checkpoint 且不修改原消息', (): void => {
    const messages = [
      createMessage('message-1', [{ id: 'source-1', type: 'text', text: '事实' }]),
      createMessage('message-2', [createCheckpoint('checkpoint-1', 'source-1', ['missing-evidence'])])
    ];
    const original = structuredClone(messages);

    const normalized = removeInvalidCheckpoints(messages);

    expect(messages).toEqual(original);
    expect(normalized[1].parts).toEqual([]);
    expect(validatePartTopology(normalized).invalidCheckpointIds.size).toBe(0);
  });
});
