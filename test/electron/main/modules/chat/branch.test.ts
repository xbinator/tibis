/**
 * @file branch.test.ts
 * @description 聊天会话分支数据重建测试。
 */
import type { ChatMessageRecord, ChatSession } from 'types/chat';
import type { ChatMessageCompactionPart } from 'types/chat-runtime';
import type { CompressionRecord } from 'types/compression';
import { describe, expect, it } from 'vitest';
import { createSessionBranchData } from '../../../../../electron/main/modules/chat/runtime/branch.mts';

/**
 * 创建顺序可预测的测试 ID 工厂。
 * @returns 每次调用生成递增 ID 的函数
 */
function createIdFactory(): () => string {
  let index = 0;

  return (): string => {
    index += 1;
    return `branch-id-${index}`;
  };
}

/**
 * 创建测试源会话。
 * @returns 标题固定的助手会话
 */
function createSourceSession(): ChatSession {
  return {
    id: 'session-source',
    type: 'assistant',
    title: '原始标题',
    createdAt: '2026-07-14T08:00:00.000Z',
    updatedAt: '2026-07-14T08:00:00.000Z',
    lastMessageAt: '2026-07-14T08:04:00.000Z'
  };
}

/**
 * 创建一条测试消息。
 * @param id - 消息 ID
 * @param role - 消息角色
 * @param content - 消息内容
 * @param createdAt - 创建时间
 * @returns 完整聊天消息记录
 */
function createMessage(id: string, role: 'user' | 'assistant', content: string, createdAt: string): ChatMessageRecord {
  return {
    id,
    sessionId: 'session-source',
    role,
    content,
    parts: [{ id: `part-${id}`, type: 'text', text: content }],
    createdAt,
    loading: false,
    finished: true,
    agentId: 'primary',
    runtimeId: `runtime-${id}`,
    parentRuntimeId: 'runtime-parent'
  };
}

/**
 * 创建一条引用首轮消息的压缩记录。
 * @returns 测试压缩记录
 */
function createCompressionRecord(): CompressionRecord {
  return {
    id: 'compression-record-source',
    sessionId: 'session-source',
    buildMode: 'full_rebuild',
    coveredStartMessageId: 'user-1',
    coveredEndMessageId: 'assistant-1',
    coveredUntilMessageId: 'assistant-1',
    sourceMessageIds: ['user-1', 'assistant-1'],
    preservedMessageIds: ['assistant-1'],
    recordText: '首轮摘要',
    structuredSummary: {
      goal: '继续测试',
      recentTopic: '会话分支',
      userPreferences: [],
      constraints: [],
      decisions: [],
      importantFacts: [],
      fileContext: [],
      openQuestions: [],
      pendingActions: []
    },
    triggerReason: 'manual',
    messageCountSnapshot: 2,
    charCountSnapshot: 8,
    schemaVersion: 3,
    status: 'valid',
    recordSetId: 'compression-set-source',
    createdAt: '2026-07-14T08:02:00.000Z',
    updatedAt: '2026-07-14T08:02:00.000Z'
  };
}

describe('createSessionBranchData', (): void => {
  it('rejects generated IDs that collide with source branch data', (): void => {
    const sourceMessages = [
      createMessage('user-1', 'user', '问题一', '2026-07-14T08:01:00.000Z'),
      createMessage('assistant-1', 'assistant', '回答一', '2026-07-14T08:02:00.000Z')
    ];

    expect((): void => {
      createSessionBranchData({
        sourceSession: createSourceSession(),
        sourceMessages,
        compressionRecords: [],
        targetMessageId: 'assistant-1',
        now: '2026-07-14T12:00:00.000Z',
        createId: (): string => 'session-source'
      });
    }).toThrow('会话分支 ID 冲突');
  });

  it('rejects targets that are not completed assistant messages with a user-facing error', (): void => {
    expect((): void => {
      createSessionBranchData({
        sourceSession: createSourceSession(),
        sourceMessages: [createMessage('user-1', 'user', '问题一', '2026-07-14T08:01:00.000Z')],
        compressionRecords: [],
        targetMessageId: 'user-1',
        now: '2026-07-14T12:00:00.000Z',
        createId: createIdFactory()
      });
    }).toThrow('无法从该助手消息创建会话分支');
  });

  it('copies through the target assistant message into an independent session with the same title', (): void => {
    const sourceSession = createSourceSession();
    const sourceMessages = [
      createMessage('user-1', 'user', '问题一', '2026-07-14T08:01:00.000Z'),
      createMessage('assistant-1', 'assistant', '回答一', '2026-07-14T08:02:00.000Z'),
      createMessage('user-2', 'user', '问题二', '2026-07-14T08:03:00.000Z'),
      createMessage('assistant-2', 'assistant', '回答二', '2026-07-14T08:04:00.000Z')
    ];
    sourceMessages[0].files = [{ id: 'file-1', name: '说明.md', type: 'document', path: '/workspace/说明.md' }];
    sourceMessages[0].usage = { inputTokens: 2, outputTokens: 0, totalTokens: 2 };
    sourceMessages[1].usage = { inputTokens: 3, outputTokens: 5, totalTokens: 8 };
    const sourceSnapshot = structuredClone(sourceMessages);

    const result = createSessionBranchData({
      sourceSession,
      sourceMessages,
      compressionRecords: [],
      targetMessageId: 'assistant-1',
      now: '2026-07-14T12:00:00.000Z',
      createId: createIdFactory()
    });

    expect(result.session).toMatchObject({
      id: 'branch-id-1',
      type: 'assistant',
      title: '原始标题',
      createdAt: '2026-07-14T12:00:00.000Z',
      updatedAt: '2026-07-14T12:00:00.000Z',
      lastMessageAt: '2026-07-14T12:00:00.000Z',
      usage: { inputTokens: 5, outputTokens: 5, totalTokens: 10 }
    });
    expect(result.messages.map((message: ChatMessageRecord): string => message.content)).toEqual(['问题一', '回答一']);
    expect(result.messages.every((message: ChatMessageRecord): boolean => message.sessionId === result.session.id)).toBe(true);
    expect(result.messages.map((message: ChatMessageRecord): string => message.id)).not.toContain('user-1');
    expect(result.messages.map((message: ChatMessageRecord): string => message.id)).not.toContain('assistant-1');
    expect(result.messages.flatMap((message: ChatMessageRecord): string[] => message.parts.map((part): string => part.id ?? ''))).not.toContain('part-user-1');
    expect(result.messages.every((message: ChatMessageRecord): boolean => message.runtimeId === undefined && message.parentRuntimeId === undefined)).toBe(true);
    expect(result.messages[0].files).toEqual(sourceMessages[0].files);
    expect(result.compressionRecords).toEqual([]);
    expect(sourceMessages).toEqual(sourceSnapshot);
  });

  it('clones referenced compression records and remaps their message references', (): void => {
    const userMessage = createMessage('user-1', 'user', '问题一', '2026-07-14T08:01:00.000Z');
    const assistantMessage = createMessage('assistant-1', 'assistant', '回答一', '2026-07-14T08:02:00.000Z');
    assistantMessage.parts.push({
      id: 'compaction-part-source',
      type: 'compaction',
      auto: false,
      reason: 'manual',
      status: 'success',
      tailStartMessageId: 'assistant-1',
      recordId: 'compression-record-source',
      recordText: '首轮摘要',
      coveredUntilMessageId: 'assistant-1',
      sourceMessageIds: ['user-1', 'assistant-1']
    });
    assistantMessage.compression = {
      status: 'success',
      recordId: 'compression-record-source',
      recordText: '首轮摘要',
      coveredUntilMessageId: 'assistant-1',
      sourceMessageIds: ['user-1', 'assistant-1']
    };
    assistantMessage.meta = {
      compaction: {
        previousSummaryMessageId: 'user-1',
        hiddenMessageIds: ['user-1']
      }
    };

    const result = createSessionBranchData({
      sourceSession: createSourceSession(),
      sourceMessages: [userMessage, assistantMessage],
      compressionRecords: [createCompressionRecord()],
      targetMessageId: 'assistant-1',
      now: '2026-07-14T12:00:00.000Z',
      createId: createIdFactory()
    });
    const copiedUserMessage = result.messages[0];
    const copiedAssistantMessage = result.messages[1];
    const copiedPart = copiedAssistantMessage.parts.find((part): part is ChatMessageCompactionPart => part.type === 'compaction');
    const [copiedRecord] = result.compressionRecords;

    expect(copiedRecord).toBeDefined();
    expect(copiedRecord.id).not.toBe('compression-record-source');
    expect(copiedRecord.sessionId).toBe(result.session.id);
    expect(copiedRecord.recordSetId).not.toBe('compression-set-source');
    expect(copiedRecord.coveredStartMessageId).toBe(copiedUserMessage.id);
    expect(copiedRecord.coveredEndMessageId).toBe(copiedAssistantMessage.id);
    expect(copiedRecord.coveredUntilMessageId).toBe(copiedAssistantMessage.id);
    expect(copiedRecord.sourceMessageIds).toEqual([copiedUserMessage.id, copiedAssistantMessage.id]);
    expect(copiedRecord.preservedMessageIds).toEqual([copiedAssistantMessage.id]);
    expect(copiedPart).toMatchObject({
      recordId: copiedRecord.id,
      tailStartMessageId: copiedAssistantMessage.id,
      coveredUntilMessageId: copiedAssistantMessage.id,
      sourceMessageIds: [copiedUserMessage.id, copiedAssistantMessage.id]
    });
    expect(copiedAssistantMessage.compression).toMatchObject({
      recordId: copiedRecord.id,
      coveredUntilMessageId: copiedAssistantMessage.id,
      sourceMessageIds: [copiedUserMessage.id, copiedAssistantMessage.id]
    });
    expect(copiedAssistantMessage.meta?.compaction).toMatchObject({
      previousSummaryMessageId: copiedUserMessage.id,
      hiddenMessageIds: [copiedUserMessage.id]
    });
  });

  it('copies derived compression ancestors and remaps their record links', (): void => {
    const userMessage = createMessage('user-1', 'user', '问题一', '2026-07-14T08:01:00.000Z');
    const assistantMessage = createMessage('assistant-1', 'assistant', '回答一', '2026-07-14T08:02:00.000Z');
    const ancestorRecord = createCompressionRecord();
    const childRecord: CompressionRecord = {
      ...createCompressionRecord(),
      id: 'compression-record-child',
      derivedFromRecordId: ancestorRecord.id,
      createdAt: '2026-07-14T08:03:00.000Z',
      updatedAt: '2026-07-14T08:03:00.000Z'
    };
    assistantMessage.parts.push({
      id: 'compaction-part-child',
      type: 'compaction',
      auto: false,
      reason: 'manual',
      status: 'success',
      recordId: childRecord.id,
      recordText: '增量摘要',
      coveredUntilMessageId: 'assistant-1',
      sourceMessageIds: ['user-1', 'assistant-1']
    });

    const result = createSessionBranchData({
      sourceSession: createSourceSession(),
      sourceMessages: [userMessage, assistantMessage],
      compressionRecords: [ancestorRecord, childRecord],
      targetMessageId: 'assistant-1',
      now: '2026-07-14T12:00:00.000Z',
      createId: createIdFactory()
    });
    const copiedAncestor = result.compressionRecords.find((record: CompressionRecord): boolean => !record.derivedFromRecordId);
    const copiedChild = result.compressionRecords.find((record: CompressionRecord): boolean => Boolean(record.derivedFromRecordId));

    expect(result.compressionRecords).toHaveLength(2);
    expect(copiedChild?.derivedFromRecordId).toBe(copiedAncestor?.id);
  });

  it('rejects runtime message references outside the copied range', (): void => {
    const assistantMessage = createMessage('assistant-1', 'assistant', '回答一', '2026-07-14T08:02:00.000Z');
    assistantMessage.meta = {
      compaction: {
        hiddenMessageIds: ['message-outside-range']
      }
    };

    expect((): void => {
      createSessionBranchData({
        sourceSession: createSourceSession(),
        sourceMessages: [createMessage('user-1', 'user', '问题一', '2026-07-14T08:01:00.000Z'), assistantMessage],
        compressionRecords: [],
        targetMessageId: 'assistant-1',
        now: '2026-07-14T12:00:00.000Z',
        createId: createIdFactory()
      });
    }).toThrow('无法重建消息引用 meta.compaction.hiddenMessageIds');
  });
});
