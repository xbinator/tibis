/**
 * @file session-metadata-migration.test.ts
 * @description 验证聊天会话元数据列可增量迁移且不损坏旧会话。
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeDatabase, dbSelect, initDatabase } from '../../../../../electron/main/modules/database/service.mts';

const testState = vi.hoisted(() => ({
  userDataPath: ''
}));

vi.mock('electron', () => ({
  app: {
    getPath: (): string => testState.userDataPath
  }
}));

/** 仅在 ABI 与 better-sqlite3 一致的 Electron Node 进程中执行真实数据库测试。 */
const describeWithSqlite = 'electron' in process.versions ? describe : describe.skip;

describeWithSqlite('chat session metadata migration', (): void => {
  beforeEach((): void => {
    testState.userDataPath = mkdtempSync(join(tmpdir(), 'tibis-session-metadata-'));
    const legacyDatabase = new Database(join(testState.userDataPath, 'tibis.db'));
    legacyDatabase.exec(`
      CREATE TABLE chat_sessions (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_message_at TEXT NOT NULL,
        usage_json TEXT
      );
      CREATE TABLE chat_messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        files_json TEXT,
        usage_json TEXT,
        created_at TEXT NOT NULL
      );
      INSERT INTO chat_sessions (id, type, title, created_at, updated_at, last_message_at, usage_json)
      VALUES ('legacy-session', 'assistant', 'Legacy', '2026-07-22T00:00:00.000Z', '2026-07-22T00:00:00.000Z', '2026-07-22T00:00:00.000Z', NULL);
    `);
    legacyDatabase.close();
  });

  afterEach((): void => {
    closeDatabase();
    rmSync(testState.userDataPath, { recursive: true, force: true });
  });

  it('adds metadata_json while preserving legacy sessions', async (): Promise<void> => {
    await initDatabase();

    expect(dbSelect<{ name: string }>('PRAGMA table_info(chat_sessions)').map((column): string => column.name)).toContain('metadata_json');
    expect(dbSelect<{ title: string }>('SELECT title FROM chat_sessions WHERE id = ?', ['legacy-session'])).toEqual([{ title: 'Legacy' }]);
  });
});
