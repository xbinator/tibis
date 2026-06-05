/**
 * @file compression-summary-renderer.test.ts
 * @description BChatSidebar 压缩摘要 Markdown 交接稿渲染测试。
 */
import { describe, expect, it } from 'vitest';
import { renderCompressionHandoff } from '@/components/BChatSidebar/utils/compression/summaryRenderer';
import type { CompressionRecord } from '@/components/BChatSidebar/utils/compression/types';

/**
 * 创建压缩记录测试数据。
 * @param overrides - 覆盖字段
 * @returns 压缩记录
 */
function createRecord(overrides: Partial<CompressionRecord> = {}): CompressionRecord {
  return {
    id: 'record-1',
    sessionId: 'session-1',
    buildMode: 'full_rebuild',
    coveredStartMessageId: 'm1',
    coveredEndMessageId: 'm2',
    coveredUntilMessageId: 'm2',
    sourceMessageIds: ['m1', 'm2'],
    preservedMessageIds: [],
    recordText: '目标：继续长聊天',
    structuredSummary: {
      goal: '继续一段关于生活规划和阅读偏好的长聊天',
      recentTopic: '用户从年度计划聊到最近阅读状态',
      userPreferences: ['喜欢轻松但直接的语气', '不希望被反复说教'],
      constraints: ['回答要保留用户给出的书单和时间条件'],
      decisions: ['先整理阅读状态，再讨论下一步计划'],
      importantFacts: ['用户原始需求：书单包括《置身事内》《长安的荔枝》《悉达多》', '用户只有周末晚上有完整阅读时间'],
      fileContext: [],
      openQuestions: ['如何安排下一本书还没有确定'],
      pendingActions: ['下一轮继续给出阅读安排建议']
    },
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

/**
 * 粗略估算测试文本 token 数。
 * @param text - 文本
 * @returns 估算 token 数
 */
function estimateTestTokens(text: string): number {
  return Math.ceil(text.length / 2);
}

/**
 * 计算测试用压缩率。
 * @param originalText - 原始上下文文本
 * @param compressedText - 压缩上下文文本
 * @returns 压缩率
 */
function calculateCompressionRatio(originalText: string, compressedText: string): number {
  return estimateTestTokens(compressedText) / estimateTestTokens(originalText);
}

describe('renderCompressionHandoff', () => {
  it('renders a Markdown handoff with continuity, critical facts, raw requirements, and open loops', (): void => {
    const text = renderCompressionHandoff({ record: createRecord() });

    expect(text).toContain('COMPRESSED_CONTEXT');
    expect(text).toContain('## Conversation Continuity');
    expect(text).toContain('继续一段关于生活规划和阅读偏好的长聊天');
    expect(text).toContain('## Critical Facts');
    expect(text).toContain('《置身事内》');
    expect(text).toContain('周末晚上');
    expect(text).toContain('## Raw User Requirements');
    expect(text).toContain('书单包括');
    expect(text).toContain('## Open Loops');
    expect(text).toContain('下一轮继续给出阅读安排建议');
  });

  it('renders explicit list requirements without collapsing them into a topic label', (): void => {
    const text = renderCompressionHandoff({
      record: createRecord({
        structuredSummary: {
          goal: '整理基金数据请求',
          recentTopic: '金融搜索服务',
          userPreferences: [],
          constraints: ['按今日涨跌幅从高到低排序', '输出表格'],
          decisions: [],
          importantFacts: [
            '用户原始需求：查询基金 024479、022365、006476、008586、015945、002611、018345、008888、002190、013943、011036、161725，统计今天涨跌幅、昨天涨跌幅，并给出操作建议'
          ],
          fileContext: [],
          openQuestions: [],
          pendingActions: ['继续查询并整理基金行情表格']
        }
      })
    });

    expect(text).toContain('024479');
    expect(text).toContain('161725');
    expect(text).toContain('今天涨跌幅');
    expect(text).toContain('昨天涨跌幅');
    expect(text).toContain('操作建议');
    expect(text).not.toEqual(expect.stringMatching(/^话题：金融搜索服务\s*$/));
  });

  it('renders none markers for empty sections so the prompt shape stays stable', (): void => {
    const text = renderCompressionHandoff({
      record: createRecord({
        structuredSummary: {
          goal: '',
          recentTopic: '',
          userPreferences: [],
          constraints: [],
          decisions: [],
          importantFacts: [],
          fileContext: [],
          openQuestions: [],
          pendingActions: []
        }
      })
    });

    expect(text).toContain('## User Preferences\n- (none)');
    expect(text).toContain('## Constraints\n- (none)');
    expect(text).toContain('## Critical Facts\n- (none)');
    expect(text).toContain('## Open Loops\n- (none)');
  });

  it('preserves record text as a summary snapshot for old or sparse records', (): void => {
    const text = renderCompressionHandoff({
      record: createRecord({
        recordText: '目标：用户正在长期聊阅读、生活节奏和偏好变化\n重要事实：用户不喜欢被反复说教',
        structuredSummary: {
          goal: '',
          recentTopic: '',
          userPreferences: [],
          constraints: [],
          decisions: [],
          importantFacts: [],
          fileContext: [],
          openQuestions: [],
          pendingActions: []
        }
      })
    });

    expect(text).toContain('## Summary Snapshot');
    expect(text).toContain('用户正在长期聊阅读、生活节奏和偏好变化');
    expect(text).toContain('用户不喜欢被反复说教');
  });

  it('does not duplicate record text when structured summary already has content', (): void => {
    const text = renderCompressionHandoff({ record: createRecord() });

    expect(text).not.toContain('## Summary Snapshot');
  });

  it('keeps golden case compression ratio below the documented threshold', (): void => {
    const originalText = Array.from({ length: 40 })
      .map((_, index) => `第 ${index + 1} 轮：用户继续聊阅读计划、生活节奏、偏好、限制和下一步安排。这里有较长的上下文内容用于模拟长聊天。`)
      .join('\n');
    const compressedText = renderCompressionHandoff({ record: createRecord() });

    expect(calculateCompressionRatio(originalText, compressedText)).toBeLessThanOrEqual(0.6);
  });

  it('renders native v3 general summary fields', (): void => {
    const text = renderCompressionHandoff({
      record: createRecord({
        schemaVersion: 3,
        generalSummary: {
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
        }
      })
    });

    expect(text).toContain('用户希望自然连续地聊天');
    expect(text).toContain('用户最近睡眠不好');
    expect(text).toContain('不要直接给鸡汤');
    expect(text).toContain('用户从工作压力转向睡眠问题');
  });
});
