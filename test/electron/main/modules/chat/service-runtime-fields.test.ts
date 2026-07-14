/**
 * @file service-runtime-fields.test.ts
 * @description 主进程聊天服务的 Runtime 字段、用量与会话分支持久化测试。
 */
import type { ChatMessageRecord } from 'types/chat';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { chatSessionManager } from '../../../../../electron/main/modules/chat/service.mts';

const databaseMock = vi.hoisted(() => ({
  dbExecute: vi.fn(),
  dbSelect: vi.fn(),
  transaction: vi.fn((fn: () => unknown): unknown => fn())
}));

vi.mock('../../../../../electron/main/modules/database/service.mjs', () => databaseMock);

/**
 * 创建压缩记录数据库行测试数据。
 * @param overrides - 需要覆盖的字段
 * @returns 可供聊天服务映射的压缩记录行
 */
function createCompressionRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'record-1',
    session_id: 'session-source',
    build_mode: 'full_rebuild',
    derived_from_record_id: null,
    covered_start_message_id: 'user-1',
    covered_end_message_id: 'assistant-1',
    covered_until_message_id: 'assistant-1',
    source_message_ids_json: JSON.stringify(['user-1', 'assistant-1']),
    preserved_message_ids_json: JSON.stringify(['assistant-1']),
    record_text: '摘要',
    structured_summary_json: JSON.stringify({
      goal: '继续测试',
      recentTopic: '会话分支',
      userPreferences: [],
      constraints: [],
      decisions: [],
      importantFacts: [],
      fileContext: [],
      openQuestions: [],
      pendingActions: []
    }),
    trigger_reason: 'manual',
    message_count_snapshot: 2,
    char_count_snapshot: 8,
    token_count_snapshot: null,
    schema_version: 3,
    status: 'valid',
    invalid_reason: null,
    degrade_reason: null,
    created_at: '2026-07-14T08:02:00.000Z',
    updated_at: '2026-07-14T08:02:00.000Z',
    record_set_id: 'record-set-1',
    segment_index: 0,
    segment_count: 1,
    topic_tags_json: null,
    ...overrides
  };
}

describe('chat main service runtime fields', (): void => {
  beforeEach((): void => {
    databaseMock.dbExecute.mockReset();
    databaseMock.dbSelect.mockReset();
    databaseMock.transaction.mockImplementation((fn: () => unknown): unknown => fn());
  });

  it('maps runtime ownership fields from persisted message rows', (): void => {
    databaseMock.dbSelect.mockReturnValue([
      {
        id: 'message-1',
        session_id: 'session-1',
        role: 'assistant',
        content: 'summary',
        parts_json: JSON.stringify([{ type: 'text', text: 'summary' }]),
        thinking: null,
        files_json: null,
        usage_json: null,
        compression_json: null,
        created_at: '2026-06-18T00:00:00.000Z',
        loading: null,
        finished: 1,
        summary: 1,
        meta_json: JSON.stringify({
          compaction: {
            anchorSummary: 'summary text'
          }
        }),
        agent_id: 'agent-1',
        runtime_id: 'runtime-1',
        parent_runtime_id: 'runtime-parent'
      }
    ]);

    const [message] = chatSessionManager.getMessages('session-1');

    expect(message).toMatchObject({
      id: 'message-1',
      summary: true,
      agentId: 'agent-1',
      runtimeId: 'runtime-1',
      parentRuntimeId: 'runtime-parent',
      meta: {
        compaction: {
          anchorSummary: 'summary text'
        }
      }
    });
  });

  it('orders user messages before assistant messages when runtime records share createdAt', (): void => {
    databaseMock.dbSelect.mockReturnValue([
      {
        id: 'assistant-runtime-1',
        session_id: 'session-1',
        role: 'assistant',
        content: 'answer',
        parts_json: JSON.stringify([{ type: 'text', text: 'answer' }]),
        thinking: null,
        files_json: null,
        usage_json: null,
        compression_json: null,
        created_at: '2026-06-19T00:00:00.000Z',
        loading: 0,
        finished: 1,
        summary: null,
        meta_json: null,
        agent_id: null,
        runtime_id: 'runtime-1',
        parent_runtime_id: null
      },
      {
        id: 'user-runtime-1',
        session_id: 'session-1',
        role: 'user',
        content: 'question',
        parts_json: JSON.stringify([{ type: 'text', text: 'question' }]),
        thinking: null,
        files_json: null,
        usage_json: null,
        compression_json: null,
        created_at: '2026-06-19T00:00:00.000Z',
        loading: 0,
        finished: 1,
        summary: null,
        meta_json: null,
        agent_id: null,
        runtime_id: 'runtime-1',
        parent_runtime_id: null
      }
    ]);

    const messages = chatSessionManager.getMessages('session-1');

    expect(messages.map((message) => message.role)).toEqual(['user', 'assistant']);
  });

  it('uses role order as part of the history cursor boundary for shared createdAt records', (): void => {
    const cursor = {
      beforeCreatedAt: '2026-06-19T00:00:00.000Z',
      beforeId: 'user-runtime-1',
      beforeRole: 'user'
    } as Parameters<typeof chatSessionManager.getMessages>[1] & { beforeRole: 'user' };

    databaseMock.dbSelect.mockReturnValue([]);

    chatSessionManager.getMessages('session-1', cursor);

    expect(databaseMock.dbSelect).toHaveBeenCalledWith(expect.stringContaining('CASE role'), [
      'session-1',
      cursor.beforeCreatedAt,
      cursor.beforeCreatedAt,
      2,
      2,
      cursor.beforeId,
      expect.any(Number)
    ]);
  });

  it('adds only the new usage delta when updating a runtime assistant message', (): void => {
    databaseMock.dbSelect
      .mockReturnValueOnce([{ usage_json: JSON.stringify({ inputTokens: 1, outputTokens: 2, totalTokens: 3 }) }])
      .mockReturnValueOnce([{ usage_json: JSON.stringify({ inputTokens: 10, outputTokens: 20, totalTokens: 30 }) }]);

    chatSessionManager.updateMessage({
      id: 'assistant-runtime-1',
      sessionId: 'session-1',
      role: 'assistant',
      content: 'answer',
      parts: [{ id: 'part0129', type: 'text', text: 'answer' }],
      usage: { inputTokens: 4, outputTokens: 6, totalTokens: 10 },
      createdAt: '2026-06-19T00:00:00.000Z',
      loading: false,
      finished: true
    });

    expect(databaseMock.dbExecute).toHaveBeenCalledWith('UPDATE chat_sessions SET usage_json = ? WHERE id = ?', [
      JSON.stringify({ inputTokens: 13, outputTokens: 24, totalTokens: 37 }),
      'session-1'
    ]);
  });

  it('does not double-count usage when updating a message with unchanged usage', (): void => {
    databaseMock.dbSelect.mockReturnValueOnce([{ usage_json: JSON.stringify({ inputTokens: 4, outputTokens: 6, totalTokens: 10 }) }]);

    chatSessionManager.updateMessage({
      id: 'assistant-runtime-1',
      sessionId: 'session-1',
      role: 'assistant',
      content: 'answer',
      parts: [{ id: 'part0130', type: 'text', text: 'answer' }],
      usage: { inputTokens: 4, outputTokens: 6, totalTokens: 10 },
      createdAt: '2026-06-19T00:00:00.000Z',
      loading: false,
      finished: true
    });

    expect(databaseMock.dbExecute).not.toHaveBeenCalledWith('UPDATE chat_sessions SET usage_json = ? WHERE id = ?', expect.any(Array));
  });

  it('creates a session branch from the complete history in one transaction', (): void => {
    databaseMock.dbSelect
      .mockReturnValueOnce([
        {
          id: 'session-source',
          type: 'assistant',
          title: '原标题',
          created_at: '2026-07-14T08:00:00.000Z',
          updated_at: '2026-07-14T08:00:00.000Z',
          last_message_at: '2026-07-14T08:02:00.000Z',
          usage_json: null
        }
      ])
      .mockReturnValueOnce([
        {
          id: 'user-1',
          session_id: 'session-source',
          role: 'user',
          content: '问题一',
          parts_json: JSON.stringify([{ id: 'part-user-1', type: 'text', text: '问题一' }]),
          thinking: null,
          files_json: null,
          usage_json: null,
          compression_json: null,
          created_at: '2026-07-14T08:01:00.000Z',
          loading: 0,
          finished: 1,
          summary: null,
          meta_json: null,
          agent_id: 'primary',
          runtime_id: 'runtime-1',
          parent_runtime_id: null
        },
        {
          id: 'assistant-1',
          session_id: 'session-source',
          role: 'assistant',
          content: '回答一',
          parts_json: JSON.stringify([{ id: 'part-assistant-1', type: 'text', text: '回答一' }]),
          thinking: null,
          files_json: null,
          usage_json: null,
          compression_json: null,
          created_at: '2026-07-14T08:02:00.000Z',
          loading: 0,
          finished: 1,
          summary: null,
          meta_json: null,
          agent_id: 'primary',
          runtime_id: 'runtime-1',
          parent_runtime_id: null
        }
      ])
      .mockReturnValueOnce([]);

    const transactionCallCount = databaseMock.transaction.mock.calls.length;
    const session = chatSessionManager.branchSession('session-source', 'assistant-1');

    expect(databaseMock.transaction).toHaveBeenCalledTimes(transactionCallCount + 1);
    expect(databaseMock.dbSelect.mock.calls[1]?.[0]).not.toContain('LIMIT');
    expect(session).toMatchObject({ type: 'assistant', title: '原标题' });
    expect(session.id).not.toBe('session-source');
    expect(databaseMock.dbExecute).toHaveBeenCalledWith(expect.stringMatching(/INSERT INTO chat_sessions/), expect.any(Array));
    expect(databaseMock.dbExecute.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO chat_messages'))).toHaveLength(2);
    expect(databaseMock.dbExecute.mock.calls.every(([sql]) => !String(sql).includes('OR REPLACE'))).toBe(true);
  });

  it('rejects corrupted branch message JSON before writing any data', (): void => {
    databaseMock.dbSelect
      .mockReturnValueOnce([
        {
          id: 'session-source',
          type: 'assistant',
          title: '原标题',
          created_at: '2026-07-14T08:00:00.000Z',
          updated_at: '2026-07-14T08:00:00.000Z',
          last_message_at: '2026-07-14T08:02:00.000Z',
          usage_json: null
        }
      ])
      .mockReturnValueOnce([
        {
          id: 'user-1',
          session_id: 'session-source',
          role: 'user',
          content: '问题一',
          parts_json: '{invalid-json',
          thinking: null,
          files_json: null,
          usage_json: null,
          compression_json: null,
          created_at: '2026-07-14T08:01:00.000Z',
          loading: 0,
          finished: 1,
          summary: null,
          meta_json: null,
          agent_id: 'primary',
          runtime_id: null,
          parent_runtime_id: null
        },
        {
          id: 'assistant-1',
          session_id: 'session-source',
          role: 'assistant',
          content: '回答一',
          parts_json: JSON.stringify([{ id: 'part-assistant-1', type: 'text', text: '回答一' }]),
          thinking: null,
          files_json: null,
          usage_json: null,
          compression_json: null,
          created_at: '2026-07-14T08:02:00.000Z',
          loading: 0,
          finished: 1,
          summary: null,
          meta_json: null,
          agent_id: 'primary',
          runtime_id: null,
          parent_runtime_id: null
        }
      ])
      .mockReturnValueOnce([]);

    expect((): void => {
      chatSessionManager.branchSession('session-source', 'assistant-1');
    }).toThrow('无法解析消息 user-1 的 parts_json');
    expect(databaseMock.dbExecute).not.toHaveBeenCalled();
  });

  it('rejects corrupted compression references before writing a branch', (): void => {
    databaseMock.dbSelect
      .mockReturnValueOnce([
        {
          id: 'session-source',
          type: 'assistant',
          title: '原标题',
          created_at: '2026-07-14T08:00:00.000Z',
          updated_at: '2026-07-14T08:00:00.000Z',
          last_message_at: '2026-07-14T08:02:00.000Z',
          usage_json: null
        }
      ])
      .mockReturnValueOnce([
        {
          id: 'user-1',
          session_id: 'session-source',
          role: 'user',
          content: '问题一',
          parts_json: JSON.stringify([{ id: 'part-user-1', type: 'text', text: '问题一' }]),
          thinking: null,
          files_json: null,
          usage_json: null,
          compression_json: null,
          created_at: '2026-07-14T08:01:00.000Z',
          loading: 0,
          finished: 1,
          summary: null,
          meta_json: null,
          agent_id: 'primary',
          runtime_id: null,
          parent_runtime_id: null
        },
        {
          id: 'assistant-1',
          session_id: 'session-source',
          role: 'assistant',
          content: '回答一',
          parts_json: JSON.stringify([
            { id: 'part-assistant-1', type: 'text', text: '回答一' },
            {
              id: 'part-compaction-1',
              type: 'compaction',
              auto: false,
              reason: 'manual',
              status: 'success',
              recordId: 'record-1',
              recordText: '摘要',
              coveredUntilMessageId: 'assistant-1',
              sourceMessageIds: ['user-1', 'assistant-1']
            }
          ]),
          thinking: null,
          files_json: null,
          usage_json: null,
          compression_json: null,
          created_at: '2026-07-14T08:02:00.000Z',
          loading: 0,
          finished: 1,
          summary: null,
          meta_json: null,
          agent_id: 'primary',
          runtime_id: null,
          parent_runtime_id: null
        }
      ])
      .mockReturnValueOnce([
        {
          id: 'record-1',
          session_id: 'session-source',
          build_mode: 'full_rebuild',
          derived_from_record_id: null,
          covered_start_message_id: 'user-1',
          covered_end_message_id: 'assistant-1',
          covered_until_message_id: 'assistant-1',
          source_message_ids_json: '{invalid-json',
          preserved_message_ids_json: JSON.stringify(['assistant-1']),
          record_text: '摘要',
          structured_summary_json: JSON.stringify({
            goal: '继续测试',
            recentTopic: '会话分支',
            userPreferences: [],
            constraints: [],
            decisions: [],
            importantFacts: [],
            fileContext: [],
            openQuestions: [],
            pendingActions: []
          }),
          trigger_reason: 'manual',
          message_count_snapshot: 2,
          char_count_snapshot: 8,
          token_count_snapshot: null,
          schema_version: 3,
          status: 'valid',
          invalid_reason: null,
          degrade_reason: null,
          created_at: '2026-07-14T08:02:00.000Z',
          updated_at: '2026-07-14T08:02:00.000Z',
          record_set_id: 'record-set-1',
          segment_index: 0,
          segment_count: 1,
          topic_tags_json: null
        }
      ]);

    expect((): void => {
      chatSessionManager.branchSession('session-source', 'assistant-1');
    }).toThrow('无法解析压缩记录 record-1 的 source_message_ids_json');
    expect(databaseMock.dbExecute).not.toHaveBeenCalled();
  });

  it('strictly maps current schema v3 records referenced by the copied range', (): void => {
    const sourceMessages: ChatMessageRecord[] = [
      {
        id: 'user-1',
        sessionId: 'session-source',
        role: 'user',
        content: '问题一',
        parts: [{ id: 'part-user-1', type: 'text', text: '问题一' }],
        createdAt: '2026-07-14T08:01:00.000Z',
        finished: true
      },
      {
        id: 'assistant-1',
        sessionId: 'session-source',
        role: 'assistant',
        content: '回答一',
        parts: [
          {
            id: 'part-compaction-1',
            type: 'compaction',
            auto: false,
            reason: 'manual',
            status: 'success',
            recordId: 'record-1',
            recordText: '摘要',
            coveredUntilMessageId: 'assistant-1',
            sourceMessageIds: ['user-1', 'assistant-1']
          }
        ],
        createdAt: '2026-07-14T08:02:00.000Z',
        finished: true
      }
    ];
    databaseMock.dbSelect.mockReturnValue([createCompressionRow()]);

    const [record] = chatSessionManager.getBranchRecords('session-source', sourceMessages, 'assistant-1');

    expect(record).toMatchObject({ id: 'record-1', schemaVersion: 3, sourceMessageIds: ['user-1', 'assistant-1'] });
  });

  it('rejects removed historical compression schemas referenced by the copied range', (): void => {
    const sourceMessages: ChatMessageRecord[] = [
      {
        id: 'assistant-1',
        sessionId: 'session-source',
        role: 'assistant',
        content: '回答一',
        parts: [
          {
            id: 'part-compaction-1',
            type: 'compaction',
            auto: false,
            reason: 'manual',
            status: 'success',
            recordId: 'record-1',
            recordText: '摘要',
            coveredUntilMessageId: 'assistant-1',
            sourceMessageIds: ['assistant-1']
          }
        ],
        createdAt: '2026-07-14T08:02:00.000Z',
        finished: true
      }
    ];
    databaseMock.dbSelect.mockReturnValue([createCompressionRow({ schema_version: 2 })]);

    expect((): void => {
      chatSessionManager.getBranchRecords('session-source', sourceMessages, 'assistant-1');
    }).toThrow('压缩记录 record-1 格式无效');
  });

  it('ignores corrupted compression records not referenced by the copied range', (): void => {
    const sourceMessages: ChatMessageRecord[] = [
      {
        id: 'assistant-1',
        sessionId: 'session-source',
        role: 'assistant',
        content: '回答一',
        parts: [{ id: 'part-assistant-1', type: 'text', text: '回答一' }],
        createdAt: '2026-07-14T08:02:00.000Z',
        finished: true
      }
    ];
    databaseMock.dbSelect.mockReturnValue([createCompressionRow({ id: 'record-unrelated', structured_summary_json: '{invalid-json' })]);

    expect(chatSessionManager.getBranchRecords('session-source', sourceMessages, 'assistant-1')).toEqual([]);
  });
});
