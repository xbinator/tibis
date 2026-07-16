/**
 * @file summary-schema.test.ts
 * @description 结构化上下文摘要 schema 与跨字段约束测试。
 */
import type { StructuredContextSummary } from 'types/chat';
import { describe, expect, it } from 'vitest';
import { structuredSummarySchema, validateStructuredSummary } from '../../../../../../../electron/main/modules/chat/runtime/compaction/summary-schema.mjs';

/**
 * 创建合法结构化摘要。
 * @returns 摘要测试数据
 */
function createSummary(): StructuredContextSummary {
  return {
    schemaVersion: 1,
    activeObjectiveId: 'objective-new',
    objectives: [
      {
        id: 'objective-old',
        description: '旧目标',
        status: 'superseded',
        successCriteria: ['旧目标完成'],
        supersededById: 'objective-new',
        sourcePartIds: ['part-1']
      },
      {
        id: 'objective-new',
        description: '实现上下文压缩',
        status: 'active',
        successCriteria: ['压缩后继续会话'],
        sourcePartIds: ['part-2']
      }
    ],
    facts: [{ id: 'fact-1', type: 'decision', content: '使用 checkpoint', sourcePartIds: ['part-1'] }],
    artifacts: [
      {
        id: 'artifact-1',
        path: 'src/a.ts',
        purpose: '入口文件',
        status: 'modified',
        keyChanges: ['接入压缩'],
        shouldReload: false,
        sourcePartIds: ['part-2']
      }
    ],
    completedActions: [],
    pendingActions: [
      {
        id: 'action-1',
        description: '继续实现投影',
        owner: { type: 'assistant' },
        sourcePartIds: ['part-2']
      }
    ],
    openQuestions: [
      {
        id: 'question-1',
        question: '是否显示 Token？',
        owner: { type: 'user' },
        sourcePartIds: ['part-1']
      }
    ],
    failures: []
  };
}

describe('structured context summary schema', (): void => {
  it('接受目标漂移、owner 和稳定 artifact 身份完整的摘要', (): void => {
    const summary = createSummary();

    expect(validateStructuredSummary(summary, new Set(['part-1', 'part-2']))).toEqual({ ok: true, summary });
    expect(structuredSummarySchema).toMatchObject({ type: 'object', additionalProperties: false });
  });

  it('拒绝 activeObjectiveId 指向非 active 目标', (): void => {
    const summary = { ...createSummary(), activeObjectiveId: 'objective-old' };

    expect(validateStructuredSummary(summary, new Set(['part-1', 'part-2']))).toEqual({
      ok: false,
      errorCode: 'INVALID_OBJECTIVE_RELATION'
    });
  });

  it('拒绝重复 objective ID', (): void => {
    const summary = createSummary();
    summary.objectives[1].id = 'objective-old';

    expect(validateStructuredSummary(summary, new Set(['part-1', 'part-2']))).toEqual({
      ok: false,
      errorCode: 'INVALID_OBJECTIVE_RELATION'
    });
  });

  it('拒绝 pending action 缺少 owner', (): void => {
    const summary = createSummary() as unknown as Record<string, unknown>;
    const pendingActions = summary.pendingActions as Array<Record<string, unknown>>;
    delete pendingActions[0].owner;

    expect(validateStructuredSummary(summary, new Set(['part-1', 'part-2']))).toEqual({ ok: false, errorCode: 'INVALID_SHAPE' });
  });

  it('拒绝旧 kind 字段替代 ContextFact.type', (): void => {
    const summary = createSummary() as unknown as Record<string, unknown>;
    summary.facts = [{ id: 'fact-1', kind: 'decision', content: '旧字段', sourcePartIds: ['part-1'] }];

    expect(validateStructuredSummary(summary, new Set(['part-1', 'part-2']))).toEqual({ ok: false, errorCode: 'INVALID_SHAPE' });
  });

  it('拒绝无法解析的 sourcePartIds', (): void => {
    const summary = createSummary();
    summary.artifacts[0].sourcePartIds = ['missing-part'];

    expect(validateStructuredSummary(summary, new Set(['part-1', 'part-2']))).toEqual({
      ok: false,
      errorCode: 'INVALID_REFERENCE'
    });
  });
});
