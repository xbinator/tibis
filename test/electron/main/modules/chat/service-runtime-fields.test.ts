import { beforeEach, describe, expect, it, vi } from 'vitest';
import { chatSessionManager } from '../../../../../electron/main/modules/chat/service.mts';

const databaseMock = vi.hoisted(() => ({
  dbExecute: vi.fn(),
  dbSelect: vi.fn(),
  transaction: vi.fn((fn: () => unknown): unknown => fn())
}));

vi.mock('../../../../../electron/main/modules/database/service.mjs', () => databaseMock);

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
      parts: [{ type: 'text', text: 'answer' }],
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
      parts: [{ type: 'text', text: 'answer' }],
      usage: { inputTokens: 4, outputTokens: 6, totalTokens: 10 },
      createdAt: '2026-06-19T00:00:00.000Z',
      loading: false,
      finished: true
    });

    expect(databaseMock.dbExecute).not.toHaveBeenCalledWith('UPDATE chat_sessions SET usage_json = ? WHERE id = ?', expect.any(Array));
  });
});
