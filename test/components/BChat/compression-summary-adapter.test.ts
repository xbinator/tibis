/**
 * @file compression-summary-adapter.test.ts
 * @description BChatSidebar 压缩摘要 v2/v3 兼容视图测试。
 */
import { describe, expect, it } from 'vitest';
import { fromStructuredConversationSummary, toGeneralConversationSummary } from '@/components/BChatSidebar/utils/compression/summaryAdapter';
import type { CompressionRecord, GeneralConversationSummary, StructuredConversationSummary } from '@/components/BChatSidebar/utils/compression/types';

/**
 * 创建 v2 摘要测试数据。
 * @returns v2 结构化摘要
 */
function createStructuredSummary(): StructuredConversationSummary {
  return {
    goal: '继续长聊天',
    recentTopic: '阅读和生活节奏',
    userPreferences: ['喜欢轻松但直接的语气'],
    constraints: ['不要反复说教'],
    decisions: ['先聊阅读节奏'],
    importantFacts: ['用户原始需求：保留书单《悉达多》《置身事内》', '用户周末晚上有完整时间'],
    fileContext: [],
    openQuestions: ['下一本书未确定'],
    pendingActions: ['继续给阅读安排建议']
  };
}

/**
 * 创建 v2 压缩记录测试数据。
 * @param overrides - 覆盖字段
 * @returns 压缩记录
 */
function createRecord(overrides: Partial<CompressionRecord> = {}): CompressionRecord {
  return {
    id: 'record-v2',
    sessionId: 'session-1',
    buildMode: 'full_rebuild',
    coveredStartMessageId: 'm1',
    coveredEndMessageId: 'm2',
    coveredUntilMessageId: 'm2',
    sourceMessageIds: ['m1', 'm2'],
    preservedMessageIds: [],
    recordText: '目标：继续长聊天\n重要事实：用户喜欢轻松但直接的语气',
    structuredSummary: createStructuredSummary(),
    triggerReason: 'manual',
    messageCountSnapshot: 12,
    charCountSnapshot: 2400,
    schemaVersion: 2,
    status: 'valid',
    createdAt: '2026-06-05T00:00:00.000Z',
    updatedAt: '2026-06-05T00:00:00.000Z',
    ...overrides
  };
}

describe('summaryAdapter', () => {
  it('maps v2 structured summary into the v3 general summary view', (): void => {
    const summary = fromStructuredConversationSummary(createStructuredSummary());

    expect(summary.conversationContinuity).toEqual(['继续长聊天', '阅读和生活节奏']);
    expect(summary.criticalFacts).toEqual(['用户周末晚上有完整时间']);
    expect(summary.rawUserRequirements).toEqual(['保留书单《悉达多》《置身事内》']);
    expect(summary.openLoops).toEqual(['下一本书未确定', '继续给阅读安排建议']);
    expect(summary.recentDirection).toEqual(['阅读和生活节奏']);
  });

  it('prefers native v3 generalSummary when present', (): void => {
    const nativeSummary: GeneralConversationSummary = {
      conversationContinuity: ['用户希望自然连续地聊天'],
      goal: '继续长期闲聊',
      recentTopic: '情绪和生活节奏',
      userPreferences: ['语气温和'],
      constraints: ['不要催促'],
      decisions: ['先倾听'],
      criticalFacts: ['用户最近睡眠不好'],
      rawUserRequirements: ['不要直接给鸡汤'],
      openLoops: ['继续聊睡眠安排'],
      recentDirection: ['用户从工作压力转向睡眠问题'],
      fileContext: []
    };

    expect(toGeneralConversationSummary(createRecord({ schemaVersion: 3, generalSummary: nativeSummary }))).toEqual(nativeSummary);
  });
});
