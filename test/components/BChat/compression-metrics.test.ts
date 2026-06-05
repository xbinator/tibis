/**
 * @file compression-metrics.test.ts
 * @description BChatSidebar 压缩质量指标测试。
 */
import { describe, expect, it } from 'vitest';
import { createCompressionMetrics, formatCompressionMetricsLog } from '@/components/BChatSidebar/utils/compression/compressionMetrics';
import type { CompressionRecord } from '@/components/BChatSidebar/utils/compression/types';
import type { Message } from '@/components/BChatSidebar/utils/types';

/**
 * 创建消息测试数据。
 * @param id - 消息 ID
 * @param role - 消息角色
 * @param content - 消息内容
 * @returns 聊天消息
 */
function createMessage(id: string, role: 'user' | 'assistant', content: string): Message {
  return {
    id,
    role,
    content,
    parts: [{ type: 'text', text: content }],
    createdAt: '2026-06-05T00:00:00.000Z',
    finished: true
  };
}

/**
 * 创建压缩记录测试数据。
 * @returns 压缩记录
 */
function createRecord(): CompressionRecord {
  return {
    id: 'record-1',
    sessionId: 'session-1',
    buildMode: 'full_rebuild',
    coveredStartMessageId: 'u1',
    coveredEndMessageId: 'a1',
    coveredUntilMessageId: 'a1',
    sourceMessageIds: ['u1', 'a1'],
    preservedMessageIds: [],
    recordText: '目标：继续长聊天',
    structuredSummary: {
      goal: '继续长聊天',
      recentTopic: '阅读计划',
      userPreferences: [],
      constraints: [],
      decisions: [],
      importantFacts: ['用户原始需求：保留书单《悉达多》', '用户周末晚上阅读'],
      fileContext: [],
      openQuestions: ['下一本书未确定'],
      pendingActions: ['继续给阅读安排建议']
    },
    generalSummary: {
      conversationContinuity: ['继续长聊天'],
      goal: '继续长聊天',
      recentTopic: '阅读计划',
      userPreferences: [],
      constraints: [],
      decisions: [],
      criticalFacts: ['用户周末晚上阅读'],
      rawUserRequirements: ['保留书单《悉达多》'],
      openLoops: ['下一本书未确定', '继续给阅读安排建议'],
      recentDirection: ['阅读计划'],
      fileContext: []
    },
    triggerReason: 'manual',
    messageCountSnapshot: 2,
    charCountSnapshot: 200,
    schemaVersion: 3,
    status: 'valid',
    createdAt: '2026-06-05T00:00:00.000Z',
    updatedAt: '2026-06-05T00:00:00.000Z'
  };
}

describe('compressionMetrics', () => {
  it('computes source, boundary, ratio, raw requirement, and open loop metrics', (): void => {
    const metrics = createCompressionMetrics({
      record: createRecord(),
      boundaryText: 'COMPRESSED_CONTEXT\n短摘要',
      sourceMessages: [createMessage('u1', 'user', '用户原始长消息'.repeat(30)), createMessage('a1', 'assistant', '助手长回复'.repeat(30))]
    });

    expect(metrics.recordId).toBe('record-1');
    expect(metrics.schemaVersion).toBe(3);
    expect(metrics.sourceMessageCount).toBe(2);
    expect(metrics.sourceCharCount).toBeGreaterThan(metrics.boundaryCharCount);
    expect(metrics.compressionRatio).toBeLessThan(1);
    expect(metrics.rawUserRequirementCount).toBe(1);
    expect(metrics.openLoopCount).toBe(2);
  });

  it('formats a stable single-line compression metrics log', (): void => {
    const line = formatCompressionMetricsLog({
      recordId: 'record-1',
      schemaVersion: 3,
      sourceMessageCount: 2,
      sourceCharCount: 1000,
      boundaryCharCount: 250,
      compressionRatio: 0.25,
      rawUserRequirementCount: 1,
      openLoopCount: 2
    });

    expect(line).toBe(
      '[BChatCompression] record=record-1 schema=3 source_messages=2 source_chars=1000 boundary_chars=250 ratio=0.25 raw_requirements=1 open_loops=2'
    );
  });
});
