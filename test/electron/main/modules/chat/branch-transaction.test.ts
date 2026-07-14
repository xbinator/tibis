/**
 * @file branch-transaction.test.ts
 * @description 使用真实临时 SQLite 验证会话分支写入失败时的原子回滚。
 */
import * as fs from 'node:fs';
import type { ChatMessageRecord, ChatSession } from 'types/chat';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chatSessionManager } from '../../../../../electron/main/modules/chat/service.mts';
import { closeDatabase, dbSelect, initDatabase } from '../../../../../electron/main/modules/database/service.mts';

const testState = vi.hoisted(() => ({
  userDataPath: `${process.env.TMPDIR ?? '/tmp'}/tibis-branch-transaction-${process.pid}`,
  nanoid: vi.fn<() => string>()
}));

vi.mock('electron', () => ({
  app: {
    getPath: (): string => testState.userDataPath
  }
}));

vi.mock('nanoid', () => ({
  nanoid: testState.nanoid
}));

/** 仅在 ABI 与 better-sqlite3 一致的 Electron Node 进程中执行真实数据库测试。 */
const describeWithSqlite = 'electron' in process.versions ? describe : describe.skip;

/**
 * 创建真实数据库测试会话。
 * @param id - 会话 ID
 * @returns 固定标题和时间的助手会话
 */
function createSession(id: string): ChatSession {
  return {
    id,
    type: 'assistant',
    title: id,
    createdAt: '2026-07-14T08:00:00.000Z',
    updatedAt: '2026-07-14T08:00:00.000Z',
    lastMessageAt: '2026-07-14T08:00:00.000Z'
  };
}

/**
 * 创建真实数据库测试消息。
 * @param id - 消息 ID
 * @param sessionId - 所属会话 ID
 * @param role - 消息角色
 * @param content - 消息内容
 * @param createdAt - 消息时间
 * @returns 可持久化消息记录
 */
function createMessage(id: string, sessionId: string, role: 'user' | 'assistant', content: string, createdAt: string): ChatMessageRecord {
  return {
    id,
    sessionId,
    role,
    content,
    parts: [{ id: `part-${id}`, type: 'text', text: content }],
    createdAt,
    loading: false,
    finished: true,
    agentId: 'primary'
  };
}

describeWithSqlite('chat session branch transaction', (): void => {
  beforeEach(async (): Promise<void> => {
    fs.mkdirSync(testState.userDataPath, { recursive: true });
    await initDatabase();
    testState.nanoid.mockReset();
  });

  afterEach((): void => {
    closeDatabase();
    fs.rmSync(testState.userDataPath, { recursive: true, force: true });
  });

  it('rolls back the new session when a global message ID collision occurs', (): void => {
    chatSessionManager.createSession(createSession('session-source'));
    chatSessionManager.addMessage(createMessage('user-source', 'session-source', 'user', '问题', '2026-07-14T08:01:00.000Z'));
    chatSessionManager.addMessage(createMessage('assistant-source', 'session-source', 'assistant', '回答', '2026-07-14T08:02:00.000Z'));
    chatSessionManager.createSession(createSession('session-unrelated'));
    chatSessionManager.addMessage(createMessage('message-collision', 'session-unrelated', 'user', '保留内容', '2026-07-14T08:03:00.000Z'));
    testState.nanoid
      .mockReturnValueOnce('session-branch')
      .mockReturnValueOnce('message-collision')
      .mockReturnValueOnce('assistant-branch')
      .mockReturnValueOnce('part-user-branch')
      .mockReturnValueOnce('part-assistant-branch');

    expect((): void => {
      chatSessionManager.branchSession('session-source', 'assistant-source');
    }).toThrow();

    expect(dbSelect<{ id: string }>('SELECT id FROM chat_sessions WHERE id = ?', ['session-branch'])).toEqual([]);
    expect(dbSelect<{ id: string }>('SELECT id FROM chat_messages WHERE session_id = ? ORDER BY created_at', ['session-source'])).toEqual([
      { id: 'user-source' },
      { id: 'assistant-source' }
    ]);
    expect(dbSelect<{ content: string; session_id: string }>('SELECT session_id, content FROM chat_messages WHERE id = ?', ['message-collision'])).toEqual([
      { session_id: 'session-unrelated', content: '保留内容' }
    ]);
  });
});
