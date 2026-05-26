/* eslint-disable max-classes-per-file */
/**
 * @file chat-storage-sqlite.test.ts
 * @description 验证 ChatSessionManager 在真实 SQLite 链路中的写入与读取。
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { ChatMessageRecord, ChatSession } from 'types/chat';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let tempUserDataDir = '';

vi.mock('better-sqlite3', () => {
  class BetterSqliteStatementMock {
    private readonly statement;

    constructor(statement: ReturnType<DatabaseSync['prepare']>) {
      this.statement = statement;
    }

    run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint } {
      return this.statement.run(...params);
    }

    all(...params: unknown[]): unknown[] {
      return this.statement.all(...params);
    }
  }

  class BetterSqliteDatabaseMock {
    private readonly database;

    constructor(databasePath: string) {
      this.database = new DatabaseSync(databasePath);
    }

    pragma(sql: string): void {
      this.database.exec(`PRAGMA ${sql}`);
    }

    exec(sql: string): void {
      this.database.exec(sql);
    }

    prepare(sql: string): BetterSqliteStatementMock {
      return new BetterSqliteStatementMock(this.database.prepare(sql));
    }

    transaction<T>(fn: () => T): () => T {
      return () => {
        this.database.exec('BEGIN');
        try {
          const result = fn();
          this.database.exec('COMMIT');
          return result;
        } catch (error) {
          this.database.exec('ROLLBACK');
          throw error;
        }
      };
    }

    close(): void {
      this.database.close();
    }
  }

  return {
    default: BetterSqliteDatabaseMock
  };
});

vi.mock('electron', () => ({
  app: {
    getPath: (name: string): string => {
      if (name !== 'userData') {
        throw new Error(`Unexpected app path request: ${name}`);
      }
      return tempUserDataDir;
    }
  }
}));

function createSession(): ChatSession {
  return {
    id: 'session-1',
    type: 'assistant',
    title: 'SQLite references session',
    createdAt: '2026-04-25T00:00:00.000Z',
    updatedAt: '2026-04-25T00:00:00.000Z',
    lastMessageAt: '2026-04-25T00:00:00.000Z'
  };
}

function createMessage(overrides: Partial<ChatMessageRecord> = {}): ChatMessageRecord {
  return {
    id: 'message-1',
    sessionId: 'session-1',
    role: 'user',
    content: 'Test message',
    parts: [{ type: 'text', text: 'Test message' }],
    createdAt: '2026-04-25T00:00:01.000Z',
    ...overrides
  };
}

describe('ChatSessionManager SQLite integration', () => {
  beforeEach(() => {
    vi.resetModules();
    tempUserDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tibis-chat-storage-'));
  });

  afterEach(async () => {
    const { closeDatabase } = await import('../../electron/main/modules/database/service.mts');
    closeDatabase();
    fs.rmSync(tempUserDataDir, { recursive: true, force: true });
  });

  it('addMessage cascades lastMessageAt and usage in a single transaction', async () => {
    const { initDatabase, dbSelect } = await import('../../electron/main/modules/database/service.mts');
    await initDatabase();

    const { chatSessionManager } = await import('../../electron/main/modules/chat/service.mts');

    const session = createSession();
    const message = createMessage({
      role: 'assistant',
      usage: { inputTokens: 2, outputTokens: 3, totalTokens: 5 }
    });

    chatSessionManager.createSession(session);
    chatSessionManager.addMessage(message);
    chatSessionManager.updateSessionTitle(session.id, '自动命名标题');

    const rows = dbSelect<{
      title: string;
      updated_at: string;
      last_message_at: string;
      usage_json: string | null;
    }>('SELECT title, updated_at, last_message_at, usage_json FROM chat_sessions WHERE id = ?', [session.id]);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.title).toBe('自动命名标题');
    expect(rows[0]?.last_message_at).toBe(message.createdAt);
    expect(rows[0]?.usage_json).toBe(JSON.stringify(message.usage));
    expect(rows[0]?.updated_at).not.toBe(session.updatedAt);
  }, 15000);

  it('migrates legacy chat_session_compression_records rows by adding new record columns', async () => {
    const legacyDbPath = path.join(tempUserDataDir, 'tibis.db');
    const legacyDb = new DatabaseSync(legacyDbPath);

    legacyDb.exec(`
      CREATE TABLE chat_session_compression_records (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        build_mode TEXT NOT NULL,
        derived_from_record_id TEXT,
        covered_start_message_id TEXT NOT NULL,
        covered_end_message_id TEXT NOT NULL,
        covered_until_message_id TEXT NOT NULL,
        source_message_ids_json TEXT NOT NULL,
        preserved_message_ids_json TEXT NOT NULL,
        record_text TEXT NOT NULL,
        structured_summary_json TEXT NOT NULL,
        trigger_reason TEXT NOT NULL,
        message_count_snapshot INTEGER NOT NULL,
        char_count_snapshot INTEGER NOT NULL,
        schema_version INTEGER NOT NULL,
        status TEXT NOT NULL,
        invalid_reason TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    legacyDb.close();

    const { initDatabase, dbSelect } = await import('../../electron/main/modules/database/service.mts');
    await initDatabase();

    const columns = dbSelect<{ name: string }>('PRAGMA table_info(chat_session_compression_records)');
    const columnNames = columns.map((column) => column.name);

    expect(columnNames).toContain('token_count_snapshot');
    expect(columnNames).toContain('degrade_reason');
    expect(columnNames).toContain('record_set_id');
    expect(columnNames).toContain('segment_index');
    expect(columnNames).toContain('segment_count');
    expect(columnNames).toContain('topic_tags_json');
  });

  it('deleteSession atomically removes messages and session', async () => {
    const { initDatabase, dbSelect } = await import('../../electron/main/modules/database/service.mts');
    await initDatabase();

    const { chatSessionManager } = await import('../../electron/main/modules/chat/service.mts');

    const session = createSession();
    chatSessionManager.createSession(session);
    chatSessionManager.addMessage(createMessage({ id: 'msg-1' }));
    chatSessionManager.addMessage(createMessage({ id: 'msg-2', createdAt: '2026-04-25T00:00:02.000Z' }));

    chatSessionManager.deleteSession(session.id);

    const sessions = dbSelect('SELECT * FROM chat_sessions WHERE id = ?', [session.id]);
    const messages = dbSelect('SELECT * FROM chat_messages WHERE session_id = ?', [session.id]);

    expect(sessions).toHaveLength(0);
    expect(messages).toHaveLength(0);
  }, 15000);

  it('setSessionMessages atomically replaces all messages', async () => {
    const { initDatabase, dbSelect } = await import('../../electron/main/modules/database/service.mts');
    await initDatabase();

    const { chatSessionManager } = await import('../../electron/main/modules/chat/service.mts');

    const session = createSession();
    chatSessionManager.createSession(session);
    chatSessionManager.addMessage(createMessage({ id: 'old-msg' }));

    const newMessages = [createMessage({ id: 'new-msg-1' }), createMessage({ id: 'new-msg-2', createdAt: '2026-04-25T00:00:02.000Z' })];
    chatSessionManager.setSessionMessages(session.id, newMessages);

    const messages = dbSelect<{ id: string }>('SELECT id FROM chat_messages WHERE session_id = ? ORDER BY created_at', [session.id]);
    expect(messages.map((m) => m.id)).toEqual(['new-msg-1', 'new-msg-2']);
  }, 15000);
});
