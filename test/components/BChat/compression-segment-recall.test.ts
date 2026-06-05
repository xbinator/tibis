/**
 * @file compression-segment-recall.test.ts
 * @description BChatSidebar 多段摘要召回渲染测试。
 */
import { describe, expect, it } from 'vitest';
import { buildMultiSegmentSummarySystemMessage, selectRelevantSegments } from '@/components/BChatSidebar/utils/compression/segmentRecall';
import type { CompressionRecord } from '@/components/BChatSidebar/utils/compression/types';
import type { Message } from '@/components/BChatSidebar/utils/types';

/**
 * 创建多段压缩记录。
 * @param id - 记录 ID
 * @param segmentIndex - 段索引
 * @param fact - 关键事实
 * @returns 压缩记录
 */
function createSegment(id: string, segmentIndex: number, fact: string): CompressionRecord {
  return {
    id,
    sessionId: 'session-1',
    buildMode: 'full_rebuild',
    coveredStartMessageId: `${id}-start`,
    coveredEndMessageId: `${id}-end`,
    coveredUntilMessageId: `${id}-end`,
    sourceMessageIds: [`${id}-start`, `${id}-end`],
    preservedMessageIds: [],
    recordText: `旧格式摘要：${fact}`,
    structuredSummary: {
      goal: `段 ${segmentIndex} 的目标`,
      recentTopic: `段 ${segmentIndex} 的话题`,
      userPreferences: [],
      constraints: [],
      decisions: [],
      importantFacts: [fact],
      fileContext: [],
      openQuestions: [],
      pendingActions: []
    },
    triggerReason: 'manual',
    messageCountSnapshot: 20,
    charCountSnapshot: 4000,
    schemaVersion: 2,
    status: 'valid',
    createdAt: '2026-06-05T00:00:00.000Z',
    updatedAt: '2026-06-05T00:00:00.000Z',
    recordSetId: 'record-set-1',
    segmentIndex,
    segmentCount: 2
  };
}

/**
 * 创建旧 recordText 很短但结构化摘要很长的多段压缩记录。
 * @param id - 记录 ID
 * @param segmentIndex - 段索引
 * @param fact - 结构化摘要中的长事实
 * @returns 压缩记录
 */
function createShortTextLongHandoffSegment(id: string, segmentIndex: number, fact: string): CompressionRecord {
  return {
    ...createSegment(id, segmentIndex, '短事实'),
    recordText: '短摘要',
    structuredSummary: {
      ...createSegment(id, segmentIndex, '短事实').structuredSummary,
      importantFacts: [fact]
    }
  };
}

/**
 * 创建当前用户消息。
 * @param content - 用户消息内容
 * @returns 聊天消息
 */
function createUserMessage(content: string): Message {
  return {
    id: 'current-user',
    role: 'user',
    content,
    parts: [{ type: 'text', text: content }],
    createdAt: '2026-06-05T00:00:00.000Z',
    finished: true
  };
}

describe('buildMultiSegmentSummarySystemMessage', () => {
  it('keeps the XML wrapper while rendering each segment as Markdown handoff content', (): void => {
    const text = buildMultiSegmentSummarySystemMessage([
      createSegment('segment-0', 0, '用户喜欢轻松但直接的聊天方式'),
      createSegment('segment-1', 1, '用户正在讨论周末阅读计划')
    ]);

    expect(text).toContain('<conversation_history_summary>');
    expect(text).toContain('<conversation_summary segment="0">');
    expect(text).toContain('<conversation_summary segment="1">');
    expect(text).toContain('## Conversation Continuity');
    expect(text).toContain('## Critical Facts');
    expect(text).toContain('用户喜欢轻松但直接的聊天方式');
    expect(text).toContain('用户正在讨论周末阅读计划');
  });

  it('uses rendered Markdown handoff size when applying segment recall budget', (): void => {
    const longFact = '这是一段很长的压缩事实，用于模拟 Markdown handoff 远大于旧 recordText 的情况。'.repeat(40);
    const selected = selectRelevantSegments(
      createUserMessage('继续聊最近的阅读计划'),
      [
        createShortTextLongHandoffSegment('segment-0', 0, longFact),
        createShortTextLongHandoffSegment('segment-1', 1, longFact),
        createShortTextLongHandoffSegment('segment-2', 2, longFact)
      ],
      {
        maxSegments: 3,
        maxRecordTokens: 320,
        alwaysIncludeRecentSegment: true
      }
    );

    expect(selected.map((segment) => segment.id)).toEqual(['segment-2']);
  });
});
