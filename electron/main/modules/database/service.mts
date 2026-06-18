/**
 * @file service.mts
 * @description Electron 主进程 SQLite 数据库初始化、迁移与基础读写服务。
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import Database from 'better-sqlite3';
import { app } from 'electron';

type DatabaseInstance = InstanceType<typeof Database>;
type DatabaseTableName = 'chat_messages' | 'chat_sessions' | 'chat_session_compression_records';

interface DatabaseTableInfoRow {
  name: string;
}

let db: DatabaseInstance | null = null;

/**
 * 检查数据表是否已经包含指定列。
 * @param tableName - 数据表名称
 * @param columnName - 需要检查的列名
 * @returns 数据表是否包含该列
 */
function hasColumn(tableName: DatabaseTableName, columnName: string): boolean {
  if (!db) throw new Error('Database not initialized');

  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all() as DatabaseTableInfoRow[];

  return rows.some((row) => row.name === columnName);
}

/**
 * 按需补齐已有数据库缺失的表列。
 * @param tableName - 数据表名称
 * @param columnName - 需要补齐的列名
 * @param definition - SQLite 列定义
 */
function ensureColumn(tableName: DatabaseTableName, columnName: string, definition: string): void {
  if (!db) throw new Error('Database not initialized');
  if (hasColumn(tableName, columnName)) return;

  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${definition}`);
}

/**
 * 执行向后兼容的数据库结构迁移。
 */
function migrateDatabase(): void {
  ensureColumn('chat_sessions', 'usage_json', 'usage_json TEXT');
  ensureColumn('chat_messages', 'thinking', 'thinking TEXT');
  ensureColumn('chat_messages', 'parts_json', 'parts_json TEXT');
  ensureColumn('chat_messages', 'compression_json', 'compression_json TEXT');
  ensureColumn('chat_messages', 'loading', 'loading INTEGER');
  ensureColumn('chat_messages', 'finished', 'finished INTEGER');
  ensureColumn('chat_messages', 'summary', 'summary INTEGER');
  ensureColumn('chat_messages', 'meta_json', 'meta_json TEXT');
  ensureColumn('chat_messages', 'agent_id', 'agent_id TEXT');
  ensureColumn('chat_messages', 'runtime_id', 'runtime_id TEXT');
  ensureColumn('chat_messages', 'parent_runtime_id', 'parent_runtime_id TEXT');
  ensureColumn('chat_session_compression_records', 'token_count_snapshot', 'token_count_snapshot INTEGER');
  ensureColumn('chat_session_compression_records', 'degrade_reason', 'degrade_reason TEXT');
  ensureColumn('chat_session_compression_records', 'record_set_id', 'record_set_id TEXT');
  ensureColumn('chat_session_compression_records', 'segment_index', 'segment_index INTEGER');
  ensureColumn('chat_session_compression_records', 'segment_count', 'segment_count INTEGER');
  ensureColumn('chat_session_compression_records', 'topic_tags_json', 'topic_tags_json TEXT');
}

export function getDbPath(): string {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'tibis.db');
}

export async function initDatabase(): Promise<void> {
  const dbPath = getDbPath();
  const dbDir = path.dirname(dbPath);

  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS service_models (
      service_type TEXT PRIMARY KEY,
      provider_id TEXT,
      model_id TEXT,
      custom_prompt TEXT,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chat_sessions (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_message_at TEXT NOT NULL,
      usage_json TEXT
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      parts_json TEXT,
      thinking TEXT,
      files_json TEXT,
      usage_json TEXT,
      compression_json TEXT,
      created_at TEXT NOT NULL,
      loading INTEGER,
      finished INTEGER,
      summary INTEGER,
      meta_json TEXT,
      agent_id TEXT,
      runtime_id TEXT,
      parent_runtime_id TEXT
    );

    CREATE TABLE IF NOT EXISTS chat_session_compression_records (
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
      token_count_snapshot INTEGER,
      schema_version INTEGER NOT NULL,
      status TEXT NOT NULL,
      invalid_reason TEXT,
      degrade_reason TEXT,
      record_set_id TEXT,
      segment_index INTEGER,
      segment_count INTEGER,
      topic_tags_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_chat_sessions_type_last_message_at
    ON chat_sessions(type, last_message_at DESC);

    CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id_created_at
    ON chat_messages(session_id, created_at ASC);

    CREATE INDEX IF NOT EXISTS idx_chat_session_compression_records_session_id_status
    ON chat_session_compression_records(session_id, status);
  `);

  migrateDatabase();
}

export function dbExecute(sql: string, params?: unknown[]): { changes: number; lastInsertRowid: number | bigint } {
  if (!db) throw new Error('Database not initialized');
  return db.prepare(sql).run(...(params || []));
}

export function dbSelect<T = unknown[]>(sql: string, params?: unknown[]): T[] {
  if (!db) throw new Error('Database not initialized');
  return db.prepare(sql).all(...(params || [])) as T[];
}

export function transaction<T>(fn: () => T): T {
  if (!db) throw new Error('Database not initialized');
  return db.transaction(fn)();
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}
