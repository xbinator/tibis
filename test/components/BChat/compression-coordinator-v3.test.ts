/**
 * @file compression-coordinator-v3.test.ts
 * @description BChatSidebar 压缩协调器 v3 记录写入测试。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCompressionCoordinator } from '@/components/BChatSidebar/utils/compression/coordinator';
import type { CompressionRecord, CompressionRecordStorage, StructuredConversationSummary } from '@/components/BChatSidebar/utils/compression/types';
import type { Message } from '@/components/BChatSidebar/utils/types';

/** 摘要生成器测试替身。 */
const mockSummaryGenerator = vi.hoisted(() => ({
  generateStructuredSummary: vi.fn<() => Promise<StructuredConversationSummary>>(),
  generateSummaryText: vi.fn<(summary: StructuredConversationSummary) => string>()
}));

vi.mock('@/components/BChatSidebar/utils/compression/structuredSummaryGenerator', () => ({
  generateStructuredSummary: mockSummaryGenerator.generateStructuredSummary,
  generateSummaryText: mockSummaryGenerator.generateSummaryText
}));

/**
 * 创建聊天消息测试数据。
 * @param id - 消息 ID
 * @param role - 消息角色
 * @param content - 消息文本
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
 * 创建结构化摘要测试数据。
 * @returns 结构化摘要
 */
function createStructuredSummary(): StructuredConversationSummary {
  return {
    goal: '继续长聊天',
    recentTopic: '阅读和生活节奏',
    userPreferences: ['喜欢轻松但直接'],
    constraints: ['不要反复说教'],
    decisions: ['先整理阅读节奏'],
    importantFacts: ['用户原始需求：保留书单《悉达多》', '用户周末晚上有完整时间'],
    fileContext: [],
    openQuestions: ['下一本书未确定'],
    pendingActions: ['继续给阅读安排建议']
  };
}

/**
 * 创建压缩记录存储测试替身。
 * @returns 存储替身和已写入记录列表
 */
function createStorage(): {
  storage: CompressionRecordStorage;
  createdRecords: Array<Omit<CompressionRecord, 'id' | 'createdAt' | 'updatedAt'>>;
} {
  const createdRecords: Array<Omit<CompressionRecord, 'id' | 'createdAt' | 'updatedAt'>> = [];
  const storage: CompressionRecordStorage = {
    getLatestValidRecord: vi.fn(async (): Promise<CompressionRecord | undefined> => undefined),
    createRecord: vi.fn(async (record: Omit<CompressionRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<CompressionRecord> => {
      createdRecords.push(record);
      return {
        ...record,
        id: `record-${createdRecords.length}`,
        createdAt: '2026-06-05T00:00:00.000Z',
        updatedAt: '2026-06-05T00:00:00.000Z'
      };
    }),
    updateRecordStatus: vi.fn(async (): Promise<void> => undefined),
    getAllRecords: vi.fn(async (): Promise<CompressionRecord[]> => [])
  };

  return { storage, createdRecords };
}

describe('createCompressionCoordinator v3 records', () => {
  beforeEach((): void => {
    mockSummaryGenerator.generateStructuredSummary.mockResolvedValue(createStructuredSummary());
    mockSummaryGenerator.generateSummaryText.mockImplementation((summary: StructuredConversationSummary): string => {
      return `目标：${summary.goal}\n话题：${summary.recentTopic}`;
    });
  });

  it('writes schemaVersion 3 with generalSummary while keeping structuredSummary', async (): Promise<void> => {
    const { storage, createdRecords } = createStorage();
    const coordinator = createCompressionCoordinator(storage);

    await coordinator.compressSessionManually({
      sessionId: 'session-1',
      messages: [createMessage('m1', 'user', '请继续记住我的阅读计划。'), createMessage('m2', 'assistant', '好的，我会保留这些上下文。')]
    });

    expect(createdRecords).toHaveLength(1);
    const record = createdRecords[0];
    expect(record.schemaVersion).toBe(3);
    expect(record.structuredSummary.importantFacts).toContain('用户原始需求：保留书单《悉达多》');
    expect(record.generalSummary?.criticalFacts).toContain('用户周末晚上有完整时间');
    expect(record.generalSummary?.rawUserRequirements).toContain('保留书单《悉达多》');
    expect(record.generalSummary?.openLoops).toEqual(['下一本书未确定', '继续给阅读安排建议']);
  });
});
