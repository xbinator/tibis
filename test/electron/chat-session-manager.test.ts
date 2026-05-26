/**
 * @file chat-session-manager.test.ts
 * @description 验证主进程 ChatSessionManager 的压缩记录 CRUD 操作。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbSelectMock = vi.fn();
const dbExecuteMock = vi.fn();
const transactionMock = vi.fn(<T>(fn: () => T) => fn());

vi.mock('../../electron/main/modules/database/service.mjs', () => ({
  dbSelect: dbSelectMock,
  dbExecute: dbExecuteMock,
  transaction: transactionMock
}));

vi.mock('dayjs', () => {
  const dayjs = (input?: unknown) => {
    if (input) return { toISOString: () => input, valueOf: () => Date.now() };
    return { toISOString: () => '2026-05-26T00:00:00.000Z', valueOf: () => 1748217600000 };
  };
  dayjs.prototype = { toISOString: () => '2026-05-26T00:00:00.000Z', valueOf: () => 1748217600000 };
  return { default: dayjs };
});

const baseRecord = {
  sessionId: 'session-1',
  buildMode: 'incremental' as const,
  coveredStartMessageId: 'm1',
  coveredEndMessageId: 'm10',
  coveredUntilMessageId: 'm10',
  sourceMessageIds: ['m1'],
  preservedMessageIds: [],
  recordText: 'test summary',
  structuredSummary: {
    goal: 'goal',
    recentTopic: 'topic',
    userPreferences: [],
    constraints: [],
    decisions: [],
    importantFacts: [],
    fileContext: [],
    openQuestions: [],
    pendingActions: []
  },
  triggerReason: 'message_count' as const,
  messageCountSnapshot: 10,
  charCountSnapshot: 1000,
  schemaVersion: 2,
  status: 'valid' as const,
  invalidReason: undefined
};

function makeRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'compression-record-test',
    session_id: 'session-1',
    build_mode: 'incremental',
    derived_from_record_id: null,
    covered_start_message_id: 'm1',
    covered_end_message_id: 'm10',
    covered_until_message_id: 'm10',
    source_message_ids_json: '["m1"]',
    preserved_message_ids_json: '[]',
    record_text: 'test summary',
    structured_summary_json: JSON.stringify(baseRecord.structuredSummary),
    trigger_reason: 'message_count',
    message_count_snapshot: 10,
    char_count_snapshot: 1000,
    token_count_snapshot: null,
    schema_version: 2,
    status: 'valid',
    invalid_reason: null,
    degrade_reason: null,
    created_at: '2026-05-26T00:00:00.000Z',
    updated_at: '2026-05-26T00:00:00.000Z',
    record_set_id: null,
    segment_index: null,
    segment_count: null,
    topic_tags_json: null,
    ...overrides
  };
}

describe('ChatSessionManager compression records', () => {
  beforeEach(() => {
    vi.resetModules();
    dbSelectMock.mockReset();
    dbExecuteMock.mockReset();
    transactionMock.mockImplementation(<T>(fn: () => T) => fn());
  });

  it('creates a record with generated ID and timestamps', async () => {
    const { chatSessionManager } = await import('../../electron/main/modules/chat/service.mts');

    const record = chatSessionManager.createRecord(baseRecord);

    expect(record.id).toMatch(/^compression-record-/);
    expect(record.createdAt).toBeDefined();
    expect(record.updatedAt).toBeDefined();
    expect(record.sessionId).toBe('session-1');
    expect(record.recordText).toBe('test summary');
    expect(dbExecuteMock).toHaveBeenCalledTimes(1);
  });

  it('gets the latest valid record', async () => {
    dbSelectMock.mockReturnValue([makeRow()]);

    const { chatSessionManager } = await import('../../electron/main/modules/chat/service.mts');
    const record = chatSessionManager.getLatestValidRecord('session-1');

    expect(record).toBeDefined();
    expect(record?.recordText).toBe('test summary');
  });

  it('returns undefined when no valid records exist', async () => {
    dbSelectMock.mockReturnValue([]);

    const { chatSessionManager } = await import('../../electron/main/modules/chat/service.mts');
    const record = chatSessionManager.getLatestValidRecord('session-1');

    expect(record).toBeUndefined();
  });

  it('marks malformed structured summaries as invalid', async () => {
    dbSelectMock.mockReturnValue([makeRow({ structured_summary_json: '{bad json}' })]);

    const { chatSessionManager } = await import('../../electron/main/modules/chat/service.mts');
    const record = chatSessionManager.getLatestValidRecord('session-1');

    expect(record).toBeUndefined();
    // updateRecordStatus should have been called to mark it invalid
    expect(dbExecuteMock).toHaveBeenCalled();
  });

  it('updates record status', async () => {
    const { chatSessionManager } = await import('../../electron/main/modules/chat/service.mts');

    chatSessionManager.updateRecordStatus('record-1', 'invalid', 'test_reason');

    expect(dbExecuteMock).toHaveBeenCalledTimes(1);
    const call = dbExecuteMock.mock.calls[0];
    expect(call[0]).toContain('UPDATE chat_session_compression_records');
    expect(call[1]).toContain('invalid');
    expect(call[1]).toContain('test_reason');
  });

  it('returns all records for a session', async () => {
    dbSelectMock.mockReturnValue([makeRow({ id: 'r1' }), makeRow({ id: 'r2' })]);

    const { chatSessionManager } = await import('../../electron/main/modules/chat/service.mts');
    const records = chatSessionManager.getAllRecords('session-1');

    expect(records).toHaveLength(2);
  });
});
