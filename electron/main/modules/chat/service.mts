/**
 * @file service.mts
 * @description 主进程聊天会话管理器，封装会话 + 消息 + 压缩记录的全部持久化逻辑。
 */
import type { AIUsage } from 'types/ai';
import type {
  ChatCompressionMeta,
  ChatMessageFile,
  ChatMessageHistoryCursor,
  ChatMessagePart,
  ChatMessageRecord,
  ChatMessageRole,
  ChatSession,
  ChatSessionType,
  PaginatedSessionsResult,
  SessionCursor,
  SessionPaginationParams
} from 'types/chat';
import type { ChatMessageRuntimeMeta } from 'types/chat-runtime';
import type { CompressionBuildMode, CompressionRecord, CompressionRecordStatus, StructuredConversationSummary, TriggerReason } from 'types/compression';
import dayjs from 'dayjs';
import { dbExecute, dbSelect, transaction } from '../database/service.mjs';

// ==================== 常量 ====================

const CHAT_MESSAGE_HISTORY_LIMIT = 30;
const CURRENT_SCHEMA_VERSION = 2;

// ==================== SQL — 会话 (7 条) ====================

const SELECT_SESSIONS_BY_TYPE_SQL = `
  SELECT id, type, title, created_at, updated_at, last_message_at, usage_json
  FROM chat_sessions
  WHERE type = ?
  ORDER BY last_message_at DESC, updated_at DESC, created_at DESC
  LIMIT ?
`;
const SELECT_SESSIONS_BY_CURSOR_SQL = `
  SELECT id, type, title, created_at, updated_at, last_message_at, usage_json
  FROM chat_sessions
  WHERE type = ?
    AND (last_message_at < ? OR (last_message_at = ? AND created_at < ?))
  ORDER BY last_message_at DESC, updated_at DESC, created_at DESC
  LIMIT ?
`;
const UPSERT_SESSION_SQL = `
  INSERT OR REPLACE INTO chat_sessions
    (id, type, title, created_at, updated_at, last_message_at, usage_json)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`;
const UPDATE_SESSION_LAST_MESSAGE_AT_SQL = `
  UPDATE chat_sessions
  SET last_message_at = ?
  WHERE id = ?
`;
const UPDATE_SESSION_TITLE_SQL = `
  UPDATE chat_sessions
  SET title = ?, updated_at = ?
  WHERE id = ?
`;
const SELECT_SESSION_USAGE_SQL = 'SELECT usage_json FROM chat_sessions WHERE id = ?';
const UPDATE_SESSION_USAGE_SQL = 'UPDATE chat_sessions SET usage_json = ? WHERE id = ?';
const SELECT_MESSAGE_USAGE_SQL = 'SELECT usage_json FROM chat_messages WHERE session_id = ? AND id = ?';

// ==================== SQL — 消息 (5 条) ====================

const SELECT_MESSAGES_BY_SESSION_SQL = `
  SELECT id, session_id, role, content, parts_json, thinking, files_json, usage_json, compression_json, created_at, loading, finished,
         summary, meta_json, agent_id, runtime_id, parent_runtime_id
  FROM chat_messages
  WHERE session_id = ?
  ORDER BY created_at DESC, id DESC
  LIMIT ?
`;
const SELECT_MESSAGES_BEFORE_CURSOR_SQL = `
  SELECT id, session_id, role, content, parts_json, thinking, files_json, usage_json, compression_json, created_at, loading, finished,
         summary, meta_json, agent_id, runtime_id, parent_runtime_id
  FROM chat_messages
  WHERE session_id = ?
    AND (created_at < ? OR (created_at = ? AND id < ?))
  ORDER BY created_at DESC, id DESC
  LIMIT ?
`;
const UPSERT_MESSAGE_SQL = `
  INSERT OR REPLACE INTO chat_messages
    (id, session_id, role, content, parts_json, thinking, files_json, usage_json, compression_json, created_at, loading, finished,
     summary, meta_json, agent_id, runtime_id, parent_runtime_id)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;
const DELETE_SESSION_SQL = 'DELETE FROM chat_sessions WHERE id = ?';
const DELETE_MESSAGES_BY_SESSION_SQL = 'DELETE FROM chat_messages WHERE session_id = ?';
const DELETE_MESSAGE_SQL = 'DELETE FROM chat_messages WHERE session_id = ? AND id = ?';

// ==================== SQL — 压缩记录 (4 条) ====================

const SELECT_LATEST_VALID_RECORD_SQL = `
  SELECT *
  FROM chat_session_compression_records
  WHERE session_id = ? AND status = 'valid'
  ORDER BY created_at DESC
  LIMIT 1
`;
const INSERT_RECORD_SQL = `
  INSERT INTO chat_session_compression_records (
    id, session_id, build_mode, derived_from_record_id,
    covered_start_message_id, covered_end_message_id, covered_until_message_id,
    source_message_ids_json, preserved_message_ids_json,
    record_text, structured_summary_json,
    trigger_reason, message_count_snapshot, char_count_snapshot, token_count_snapshot,
    schema_version, status, invalid_reason, degrade_reason,
    record_set_id, segment_index, segment_count, topic_tags_json,
    created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;
const UPDATE_RECORD_STATUS_SQL = `
  UPDATE chat_session_compression_records
  SET status = ?, invalid_reason = ?, updated_at = ?
  WHERE id = ?
`;
const SELECT_ALL_RECORDS_SQL = `
  SELECT *
  FROM chat_session_compression_records
  WHERE session_id = ?
  ORDER BY created_at DESC
`;

// ==================== Row 接口 ====================

interface ChatSessionRow {
  id: string;
  type: string;
  title: string;
  created_at: string;
  updated_at: string;
  last_message_at: string;
  usage_json: string | null;
}

interface ChatMessageRow {
  id: string;
  session_id: string;
  role: string;
  content: string;
  parts_json: string | null;
  thinking: string | null;
  files_json: string | null;
  usage_json: string | null;
  compression_json: string | null;
  created_at: string;
  loading: number | null;
  finished: number | null;
  summary: number | null;
  meta_json: string | null;
  agent_id: string | null;
  runtime_id: string | null;
  parent_runtime_id: string | null;
}

interface ChatSessionUsageRow {
  usage_json: string | null;
}

interface ChatCompressionRecordRow {
  id: string;
  session_id: string;
  build_mode: string;
  derived_from_record_id: string | null;
  covered_start_message_id: string;
  covered_end_message_id: string;
  covered_until_message_id: string;
  source_message_ids_json: string;
  preserved_message_ids_json: string;
  record_text: string;
  structured_summary_json: string;
  trigger_reason: string;
  message_count_snapshot: number;
  char_count_snapshot: number;
  token_count_snapshot: number | null;
  schema_version: number;
  status: string;
  invalid_reason: string | null;
  degrade_reason: string | null;
  created_at: string;
  updated_at: string;
  record_set_id: string | null;
  segment_index: number | null;
  segment_count: number | null;
  topic_tags_json: string | null;
}

// ==================== 工具函数 ====================

function parseJson<T>(json: string | null): T | undefined {
  if (!json) return undefined;
  try {
    return JSON.parse(json) as T;
  } catch {
    return undefined;
  }
}

function stringifyJson(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return JSON.stringify(value);
}

function isChatSessionType(value: string): value is ChatSessionType {
  return value === 'assistant';
}

function isChatMessageRole(value: string): value is ChatMessageRole {
  return value === 'user' || value === 'system' || value === 'assistant' || value === 'error' || value === 'compression' || value === 'interrupt';
}

function addUsage(currentUsage: AIUsage | undefined, nextUsage: AIUsage): AIUsage {
  return {
    inputTokens: (currentUsage?.inputTokens ?? 0) + nextUsage.inputTokens,
    outputTokens: (currentUsage?.outputTokens ?? 0) + nextUsage.outputTokens,
    totalTokens: (currentUsage?.totalTokens ?? 0) + nextUsage.totalTokens
  };
}

/**
 * 计算新旧消息用量之间的差量。
 * @param nextUsage - 即将写入消息的新用量。
 * @param previousUsage - 当前已持久化的旧用量。
 * @returns 需要累加到会话用量的差量。
 */
function subtractUsage(nextUsage: AIUsage, previousUsage: AIUsage | undefined): AIUsage {
  return {
    inputTokens: nextUsage.inputTokens - (previousUsage?.inputTokens ?? 0),
    outputTokens: nextUsage.outputTokens - (previousUsage?.outputTokens ?? 0),
    totalTokens: nextUsage.totalTokens - (previousUsage?.totalTokens ?? 0)
  };
}

/**
 * 判断用量差量是否会改变会话累计值。
 * @param usage - 用量差量。
 * @returns 差量不为零时返回 true。
 */
function hasUsageDelta(usage: AIUsage): boolean {
  return usage.inputTokens !== 0 || usage.outputTokens !== 0 || usage.totalTokens !== 0;
}

/**
 * 获取同一时间戳下的消息角色排序权重。
 * @param role - 消息角色
 * @returns 排序权重，数值越小越靠前
 */
function getMessageRoleOrder(role: ChatMessageRecord['role']): number {
  const roleOrder: Record<ChatMessageRecord['role'], number> = {
    system: 0,
    compression: 1,
    user: 2,
    assistant: 3,
    interrupt: 4,
    error: 5
  };

  return roleOrder[role];
}

/**
 * 按会话展示顺序排序消息。
 * @param messages - 待排序消息
 * @returns 已排序消息
 */
function sortMessages(messages: ChatMessageRecord[]): ChatMessageRecord[] {
  return [...messages].sort((left, right) => {
    if (left.createdAt !== right.createdAt) return left.createdAt.localeCompare(right.createdAt);
    const roleOrderDelta = getMessageRoleOrder(left.role) - getMessageRoleOrder(right.role);
    if (roleOrderDelta !== 0) return roleOrderDelta;
    return left.id.localeCompare(right.id);
  });
}

function mapSessionRow(row: ChatSessionRow): ChatSession | null {
  if (!isChatSessionType(row.type)) return null;
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastMessageAt: row.last_message_at,
    usage: parseJson<AIUsage>(row.usage_json)
  };
}

function mapMessageRow(row: ChatMessageRow): ChatMessageRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    role: isChatMessageRole(row.role) ? row.role : 'user',
    content: row.content,
    parts: parseJson<ChatMessagePart[]>(row.parts_json) ?? [],
    thinking: row.thinking ?? undefined,
    files: parseJson<ChatMessageFile[]>(row.files_json),
    usage: parseJson<AIUsage>(row.usage_json),
    compression: parseJson<ChatCompressionMeta>(row.compression_json),
    createdAt: row.created_at,
    loading: row.loading === null ? undefined : row.loading === 1,
    finished: row.finished === null ? undefined : row.finished === 1,
    summary: row.summary === null ? undefined : row.summary === 1,
    agentId: row.agent_id ?? undefined,
    runtimeId: row.runtime_id ?? undefined,
    parentRuntimeId: row.parent_runtime_id ?? undefined,
    meta: parseJson<ChatMessageRuntimeMeta>(row.meta_json)
  };
}

/**
 * 将布尔值转换为 SQLite 布尔整型。
 * @param value - 可选布尔值。
 * @returns SQLite 可存储值。
 */
function toSqlBoolean(value: boolean | undefined): number | null {
  if (value === undefined) return null;
  return value ? 1 : 0;
}

/**
 * 构建消息 upsert SQL 参数。
 * @param message - 要写入的聊天消息。
 * @returns SQL 参数列表。
 */
function buildMessageUpsertParams(message: ChatMessageRecord): unknown[] {
  return [
    message.id,
    message.sessionId,
    message.role,
    message.content,
    stringifyJson(message.parts),
    message.thinking ?? null,
    stringifyJson(message.files),
    stringifyJson(message.usage),
    stringifyJson(message.compression),
    message.createdAt,
    toSqlBoolean(message.loading),
    toSqlBoolean(message.finished),
    toSqlBoolean(message.summary),
    stringifyJson(message.meta),
    message.agentId ?? null,
    message.runtimeId ?? null,
    message.parentRuntimeId ?? null
  ];
}

function buildPaginatedResult(items: ChatSession[], limit: number): PaginatedSessionsResult {
  const hasMore = items.length === limit;
  let nextCursor: SessionCursor | undefined;
  if (hasMore && items.length > 0) {
    const lastItem = items[items.length - 1];
    nextCursor = { lastMessageAt: lastItem.lastMessageAt, createdAt: lastItem.createdAt };
  }
  return { items, hasMore, nextCursor };
}

// ==================== 压缩记录 Row Mapping ====================

function parseStructuredSummary(row: ChatCompressionRecordRow): StructuredConversationSummary | null {
  if (row.schema_version !== CURRENT_SCHEMA_VERSION && row.schema_version !== 1) {
    return null;
  }
  const parsed = parseJson<StructuredConversationSummary>(row.structured_summary_json);
  if (!parsed) return null;
  if (typeof parsed.goal !== 'string' || typeof parsed.recentTopic !== 'string') return null;

  const arrayFields: (keyof StructuredConversationSummary)[] = [
    'userPreferences',
    'constraints',
    'decisions',
    'importantFacts',
    'fileContext',
    'openQuestions',
    'pendingActions'
  ];
  for (const field of arrayFields) {
    if (!Array.isArray(parsed[field])) return null;
  }
  return parsed;
}

function mapCompressionRowToRecord(row: ChatCompressionRecordRow): CompressionRecord | null {
  const parsedSummary = parseStructuredSummary(row);
  if (!parsedSummary) return null;

  const isV1 = row.schema_version === 1;

  return {
    id: row.id,
    sessionId: row.session_id,
    buildMode: row.build_mode as CompressionBuildMode,
    derivedFromRecordId: row.derived_from_record_id ?? undefined,
    coveredStartMessageId: row.covered_start_message_id,
    coveredEndMessageId: row.covered_end_message_id,
    coveredUntilMessageId: row.covered_until_message_id,
    sourceMessageIds: parseJson<string[]>(row.source_message_ids_json) ?? [],
    preservedMessageIds: parseJson<string[]>(row.preserved_message_ids_json) ?? [],
    recordText: row.record_text,
    structuredSummary: parsedSummary,
    triggerReason: row.trigger_reason as TriggerReason,
    messageCountSnapshot: row.message_count_snapshot,
    charCountSnapshot: row.char_count_snapshot,
    tokenCountSnapshot: row.token_count_snapshot ?? undefined,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    status: isV1 ? 'valid' : (row.status as CompressionRecordStatus),
    invalidReason: row.invalid_reason ?? undefined,
    degradeReason: (row.degrade_reason as 'degraded_to_incremental' | null) ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    recordSetId: row.record_set_id ?? row.id,
    segmentIndex: row.segment_index ?? 0,
    segmentCount: row.segment_count ?? 1,
    topicTags: parseJson<string[]>(row.topic_tags_json) ?? [],
    relevanceEmbedding: undefined
  };
}

// ==================== ChatSessionManager ====================

class ChatSessionManager {
  // ======== Session ========

  getSessionsByType(type: ChatSessionType, pagination?: SessionPaginationParams): PaginatedSessionsResult {
    const limit = pagination?.limit ?? 20;
    const cursor = pagination?.cursor;

    let rows: ChatSessionRow[];
    if (!cursor) {
      rows = dbSelect<ChatSessionRow>(SELECT_SESSIONS_BY_TYPE_SQL, [type, limit]);
    } else {
      rows = dbSelect<ChatSessionRow>(SELECT_SESSIONS_BY_CURSOR_SQL, [type, cursor.lastMessageAt, cursor.lastMessageAt, cursor.createdAt, limit]);
    }

    const items = rows.map(mapSessionRow).filter((item): item is ChatSession => item !== null);
    return buildPaginatedResult(items, limit);
  }

  createSession(session: ChatSession): void {
    dbExecute(UPSERT_SESSION_SQL, [
      session.id,
      session.type,
      session.title,
      session.createdAt,
      session.updatedAt,
      session.lastMessageAt,
      stringifyJson(session.usage)
    ]);
  }

  updateSessionTitle(sessionId: string, title: string): void {
    dbExecute(UPDATE_SESSION_TITLE_SQL, [title, dayjs().toISOString(), sessionId]);
  }

  getSessionUsage(sessionId: string): AIUsage | undefined {
    const rows = dbSelect<ChatSessionUsageRow>(SELECT_SESSION_USAGE_SQL, [sessionId]);
    return parseJson<AIUsage>(rows[0]?.usage_json ?? null);
  }

  // ======== Message ========

  getMessages(sessionId: string, cursor?: ChatMessageHistoryCursor): ChatMessageRecord[] {
    const rows = cursor
      ? dbSelect<ChatMessageRow>(SELECT_MESSAGES_BEFORE_CURSOR_SQL, [
          sessionId,
          cursor.beforeCreatedAt,
          cursor.beforeCreatedAt,
          cursor.beforeId,
          CHAT_MESSAGE_HISTORY_LIMIT
        ])
      : dbSelect<ChatMessageRow>(SELECT_MESSAGES_BY_SESSION_SQL, [sessionId, CHAT_MESSAGE_HISTORY_LIMIT]);

    return sortMessages(rows.map(mapMessageRow));
  }

  addMessage(message: ChatMessageRecord): void {
    transaction(() => {
      dbExecute(UPSERT_MESSAGE_SQL, buildMessageUpsertParams(message));
      dbExecute(UPDATE_SESSION_LAST_MESSAGE_AT_SQL, [message.createdAt, message.sessionId]);
      if (message.usage) {
        const rows = dbSelect<ChatSessionUsageRow>(SELECT_SESSION_USAGE_SQL, [message.sessionId]);
        const current = parseJson<AIUsage>(rows[0]?.usage_json ?? null);
        dbExecute(UPDATE_SESSION_USAGE_SQL, [stringifyJson(addUsage(current, message.usage)), message.sessionId]);
      }
    });
  }

  /**
   * 更新或创建单条消息，不更新会话用量汇总。
   * 用于流式 assistant 草稿和硬中断恢复回写。
   * @param message - 要更新的聊天消息。
   */
  updateMessage(message: ChatMessageRecord): void {
    transaction(() => {
      // 查询当前消息已有的用量记录，用于后续计算用量差值
      let previousMessageUsage: AIUsage | undefined;
      if (message.usage !== undefined) {
        const rows = dbSelect<ChatSessionUsageRow>(SELECT_MESSAGE_USAGE_SQL, [message.sessionId, message.id]);
        previousMessageUsage = parseJson<AIUsage>(rows[0]?.usage_json ?? null);
      }

      dbExecute(UPSERT_MESSAGE_SQL, buildMessageUpsertParams(message));
      dbExecute(UPDATE_SESSION_LAST_MESSAGE_AT_SQL, [message.createdAt, message.sessionId]);
      if (message.usage) {
        const usageDelta = subtractUsage(message.usage, previousMessageUsage);
        if (hasUsageDelta(usageDelta)) {
          const rows = dbSelect<ChatSessionUsageRow>(SELECT_SESSION_USAGE_SQL, [message.sessionId]);
          const current = parseJson<AIUsage>(rows[0]?.usage_json ?? null);
          dbExecute(UPDATE_SESSION_USAGE_SQL, [stringifyJson(addUsage(current, usageDelta)), message.sessionId]);
        }
      }
    });
  }

  /**
   * 删除指定会话中的单条消息。
   * @param sessionId - 会话 ID。
   * @param messageId - 消息 ID。
   */
  deleteMessage(sessionId: string, messageId: string): void {
    dbExecute(DELETE_MESSAGE_SQL, [sessionId, messageId]);
  }

  setSessionMessages(sessionId: string, messages: ChatMessageRecord[]): void {
    transaction(() => {
      dbExecute(DELETE_MESSAGES_BY_SESSION_SQL, [sessionId]);
      for (const msg of messages) {
        dbExecute(UPSERT_MESSAGE_SQL, buildMessageUpsertParams(msg));
      }
      if (messages.length > 0) {
        dbExecute(UPDATE_SESSION_LAST_MESSAGE_AT_SQL, [messages[messages.length - 1].createdAt, sessionId]);
      }
      const totalUsage = messages.reduce<AIUsage | undefined>((sum, m) => (m.usage ? addUsage(sum, m.usage) : sum), undefined);
      dbExecute(UPDATE_SESSION_USAGE_SQL, [stringifyJson(totalUsage), sessionId]);
    });
  }

  // ======== Delete ========

  deleteSession(sessionId: string): void {
    transaction(() => {
      dbExecute(DELETE_MESSAGES_BY_SESSION_SQL, [sessionId]);
      dbExecute(DELETE_SESSION_SQL, [sessionId]);
    });
  }

  // ======== Compression Records ========

  getLatestValidRecord(sessionId: string): CompressionRecord | undefined {
    const rows = dbSelect<ChatCompressionRecordRow>(SELECT_LATEST_VALID_RECORD_SQL, [sessionId]);
    for (const row of rows) {
      const parsed = mapCompressionRowToRecord(row);
      if (parsed) return parsed;
      // 标记无法解析的行为 invalid
      this.updateRecordStatus(row.id, 'invalid', 'unsupported_schema_version');
    }
    return undefined;
  }

  createRecord(record: Omit<CompressionRecord, 'id' | 'createdAt' | 'updatedAt'>): CompressionRecord {
    const now = dayjs().toISOString();
    const newRecord: CompressionRecord = {
      ...record,
      id: `compression-record-${dayjs().valueOf()}-${Math.random().toString(36).slice(2, 9)}`,
      createdAt: now,
      updatedAt: now
    };

    dbExecute(INSERT_RECORD_SQL, [
      newRecord.id,
      newRecord.sessionId,
      newRecord.buildMode,
      newRecord.derivedFromRecordId ?? null,
      newRecord.coveredStartMessageId,
      newRecord.coveredEndMessageId,
      newRecord.coveredUntilMessageId,
      stringifyJson(newRecord.sourceMessageIds),
      stringifyJson(newRecord.preservedMessageIds),
      newRecord.recordText,
      stringifyJson(newRecord.structuredSummary),
      newRecord.triggerReason,
      newRecord.messageCountSnapshot,
      newRecord.charCountSnapshot,
      newRecord.tokenCountSnapshot ?? null,
      newRecord.schemaVersion,
      newRecord.status,
      newRecord.invalidReason ?? null,
      newRecord.degradeReason ?? null,
      newRecord.recordSetId ?? null,
      newRecord.segmentIndex ?? null,
      newRecord.segmentCount ?? null,
      stringifyJson(newRecord.topicTags ?? []),
      newRecord.createdAt,
      newRecord.updatedAt
    ]);

    return newRecord;
  }

  updateRecordStatus(id: string, status: CompressionRecordStatus, invalidReason?: string): void {
    dbExecute(UPDATE_RECORD_STATUS_SQL, [status, invalidReason ?? null, dayjs().toISOString(), id]);
  }

  getAllRecords(sessionId: string): CompressionRecord[] {
    const rows = dbSelect<ChatCompressionRecordRow>(SELECT_ALL_RECORDS_SQL, [sessionId]);
    return rows.map(mapCompressionRowToRecord).filter((record): record is CompressionRecord => record !== null);
  }
}

export const chatSessionManager = new ChatSessionManager();
