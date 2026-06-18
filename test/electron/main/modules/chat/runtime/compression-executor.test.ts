/**
 * @file compression-executor.test.ts
 * @description ChatRuntime 主进程压缩记录执行器测试。
 */
import type { ChatMessageRecord } from 'types/chat';
import type { CompressionRecord, CompressionRecordStorage } from 'types/compression';
import { describe, expect, it, vi } from 'vitest';
import { createRuntimeCompressionExecutor } from '../../../../../../electron/main/modules/chat/runtime/compression-executor.mjs';

/**
 * 创建测试消息。
 * @param id - 消息 ID
 * @param role - 消息角色
 * @param content - 消息内容
 * @returns 聊天消息
 */
function createMessage(id: string, role: ChatMessageRecord['role'], content: string): ChatMessageRecord {
  return {
    id,
    sessionId: 'session-1',
    role,
    content,
    parts: [{ type: 'text', text: content }],
    createdAt: '2026-06-18T00:00:00.000Z',
    finished: true
  };
}

describe('createRuntimeCompressionExecutor', (): void => {
  it('creates a valid fallback compression record from user and assistant messages', async (): Promise<void> => {
    const createdRecords: Array<Omit<CompressionRecord, 'id' | 'createdAt' | 'updatedAt'>> = [];
    const storage: CompressionRecordStorage = {
      getLatestValidRecord: vi.fn().mockResolvedValue(undefined),
      createRecord: vi.fn(async (record) => {
        createdRecords.push(record);
        return {
          ...record,
          id: 'record-runtime-1',
          createdAt: '2026-06-18T00:00:00.000Z',
          updatedAt: '2026-06-18T00:00:00.000Z'
        };
      }),
      updateRecordStatus: vi.fn(),
      getAllRecords: vi.fn().mockResolvedValue([])
    };
    const executor = createRuntimeCompressionExecutor(storage);

    const record = await executor.compressSessionManually({
      sessionId: 'session-1',
      messages: [
        createMessage('u1', 'user', '请替换 /compact 和自动压缩流程'),
        createMessage('a1', 'assistant', '可以，先迁移主进程 runtime'),
        createMessage('c1', 'compression', '旧压缩边界')
      ]
    });

    expect(record?.id).toBe('record-runtime-1');
    expect(createdRecords[0]).toMatchObject({
      sessionId: 'session-1',
      buildMode: 'full_rebuild',
      coveredStartMessageId: 'u1',
      coveredEndMessageId: 'a1',
      coveredUntilMessageId: 'a1',
      sourceMessageIds: ['u1', 'a1'],
      triggerReason: 'manual',
      status: 'valid'
    });
    expect(createdRecords[0].recordText).toContain('请替换 /compact 和自动压缩流程');
    expect(createdRecords[0].structuredSummary.importantFacts).toContain('用户原始需求：请替换 /compact 和自动压缩流程');
  });

  it('uses the injected structured summary generator before creating records', async (): Promise<void> => {
    const storage: CompressionRecordStorage = {
      getLatestValidRecord: vi.fn().mockResolvedValue(undefined),
      createRecord: vi.fn(async (record) => ({
        ...record,
        id: 'record-runtime-ai-1',
        createdAt: '2026-06-18T00:00:00.000Z',
        updatedAt: '2026-06-18T00:00:00.000Z'
      })),
      updateRecordStatus: vi.fn(),
      getAllRecords: vi.fn().mockResolvedValue([])
    };
    const summaryGenerator = {
      generate: vi.fn().mockResolvedValue({
        goal: 'AI 摘要目标',
        recentTopic: 'AI 摘要话题',
        userPreferences: [],
        constraints: [],
        decisions: [],
        importantFacts: ['AI 生成的重要事实'],
        fileContext: [],
        openQuestions: [],
        pendingActions: ['AI 生成的后续动作']
      })
    };
    const executor = createRuntimeCompressionExecutor(storage, { summaryGenerator });

    const record = await executor.compressSessionManually({
      sessionId: 'session-1',
      messages: [createMessage('u1', 'user', '继续迁移摘要生成器'), createMessage('a1', 'assistant', '收到')]
    });

    expect(summaryGenerator.generate).toHaveBeenCalledWith({
      items: [
        { messageId: 'u1', role: 'user', trimmedText: '继续迁移摘要生成器' },
        { messageId: 'a1', role: 'assistant', trimmedText: '收到' }
      ],
      previousRecord: undefined
    });
    expect(record?.recordText).toContain('AI 摘要目标');
    expect(record?.structuredSummary.importantFacts).toEqual(['AI 生成的重要事实']);
  });

  it('returns undefined when there are no model messages to summarize', async (): Promise<void> => {
    const storage: CompressionRecordStorage = {
      getLatestValidRecord: vi.fn().mockResolvedValue(undefined),
      createRecord: vi.fn(),
      updateRecordStatus: vi.fn(),
      getAllRecords: vi.fn().mockResolvedValue([])
    };
    const executor = createRuntimeCompressionExecutor(storage);

    const record = await executor.compressSessionManually({
      sessionId: 'session-1',
      messages: [createMessage('c1', 'compression', 'COMPRESSED_CONTEXT')]
    });

    expect(record).toBeUndefined();
    expect(storage.createRecord).not.toHaveBeenCalled();
  });
});
