/**
 * @file session.test.ts
 * @description 聊天会话 store 消息草稿恢复与单条更新测试。
 */
import type { ChatMessageRecord, ChatSession, PaginatedSessionsResult, SessionPaginationParams } from 'types/chat';
import type { ChatHandlerResult } from 'types/electron-api';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HARD_INTERRUPTED_ASSISTANT_MESSAGE } from '@/components/BChat/utils/interruptedDraftRecovery';
import type { Message } from '@/components/BChat/utils/types';
import { useChatSessionStore } from '@/stores/chat/session';

const mockElectronAPI = vi.hoisted(() => ({
  chatSessionList: vi.fn<(type: 'assistant', pagination?: SessionPaginationParams) => Promise<ChatHandlerResult<PaginatedSessionsResult>>>(),
  chatSessionCreate: vi.fn<(session: ChatSession) => Promise<ChatHandlerResult<void>>>(),
  chatSessionBranch: vi.fn<(sourceSessionId: string, targetMessageId: string) => Promise<ChatHandlerResult<ChatSession>>>(),
  chatSessionUpdateTitle: vi.fn<(sessionId: string, title: string) => Promise<ChatHandlerResult<void>>>(),
  chatSessionDelete: vi.fn<(sessionId: string) => Promise<ChatHandlerResult<void>>>(),
  chatMessageList: vi.fn<(sessionId: string) => Promise<{ ok: true; data: ChatMessageRecord[] }>>(),
  chatMessageAdd: vi.fn<(message: ChatMessageRecord) => Promise<{ ok: true; data: void }>>(),
  chatMessageUpdate: vi.fn<(message: ChatMessageRecord) => Promise<{ ok: true; data: void }>>()
}));

/**
 * 可由测试显式完成的异步结果。
 */
interface Deferred<T> {
  /** 等待中的 Promise。 */
  promise: Promise<T>;
  /** 完成 Promise。 */
  resolve: (value: T) => void;
}

/**
 * 创建可控的异步结果。
 * @returns 可控 Promise 与完成函数
 */
function createDeferred<T>(): Deferred<T> {
  let resolvePromise: (value: T) => void = (): void => undefined;
  const promise = new Promise<T>((resolve: (value: T) => void): void => {
    resolvePromise = resolve;
  });

  return { promise, resolve: resolvePromise };
}

/**
 * 创建测试会话。
 * @param id - 会话 ID
 * @param lastMessageAt - 最近消息时间
 * @returns 测试会话
 */
function createSession(id: string, lastMessageAt = '2026-07-22T00:00:00.000Z'): ChatSession {
  return {
    id,
    type: 'assistant',
    title: `会话 ${id}`,
    createdAt: lastMessageAt,
    updatedAt: lastMessageAt,
    lastMessageAt
  };
}

vi.mock('@/shared/platform/electron-api', () => ({
  getElectronAPI: vi.fn(() => mockElectronAPI),
  unwrap: vi.fn(<T>(result: { ok: true; data: T } | { ok: false; error: string; code: string }): T => {
    if (!result.ok) throw Object.assign(new Error(result.error), { code: result.code });
    return result.data;
  })
}));

/**
 * 创建一条测试用未完成 assistant 持久化记录。
 * @returns 未完成 assistant 记录。
 */
function createInterruptedAssistantRecord(): ChatMessageRecord {
  return {
    id: 'assistant-draft-1',
    sessionId: 'session-1',
    role: 'assistant',
    content: '半截内容',
    parts: [{ id: 'part0131', type: 'text', text: '半截内容' }],
    createdAt: '2026-06-13T00:00:00.000Z',
    loading: true,
    finished: false
  };
}

describe('useChatSessionStore', () => {
  beforeEach((): void => {
    setActivePinia(createPinia());
    mockElectronAPI.chatSessionList.mockReset();
    mockElectronAPI.chatSessionCreate.mockReset();
    mockElectronAPI.chatSessionBranch.mockReset();
    mockElectronAPI.chatSessionUpdateTitle.mockReset();
    mockElectronAPI.chatSessionDelete.mockReset();
    mockElectronAPI.chatMessageList.mockReset();
    mockElectronAPI.chatMessageAdd.mockReset();
    mockElectronAPI.chatMessageUpdate.mockReset();
  });

  it('loads the session collection once and appends later pages without duplicates', async (): Promise<void> => {
    const store = useChatSessionStore();
    const firstCursor = {
      lastMessageAt: '2026-07-21T00:00:00.000Z',
      createdAt: '2026-07-21T00:00:00.000Z'
    };
    mockElectronAPI.chatSessionList
      .mockResolvedValueOnce({
        ok: true,
        data: { items: [createSession('session-a', '2026-07-22T00:00:00.000Z')], hasMore: true, nextCursor: firstCursor }
      })
      .mockResolvedValueOnce({
        ok: true,
        data: {
          items: [createSession('session-a', '2026-07-22T00:00:00.000Z'), createSession('session-b', '2026-07-21T00:00:00.000Z')],
          hasMore: false
        }
      });

    await store.ensureSessions();
    await store.ensureSessions();
    await store.loadMoreSessions();

    expect(mockElectronAPI.chatSessionList).toHaveBeenCalledTimes(2);
    expect(mockElectronAPI.chatSessionList).toHaveBeenNthCalledWith(1, 'assistant', { limit: 20, cursor: undefined });
    expect(mockElectronAPI.chatSessionList).toHaveBeenNthCalledWith(2, 'assistant', { limit: 20, cursor: firstCursor });
    expect(store.sessions.map((session: ChatSession): string => session.id)).toEqual(['session-a', 'session-b']);
    expect(store.sessionsLoaded).toBe(true);
    expect(store.sessionsHasMore).toBe(false);
  });

  it('preserves a session created while the first page is loading', async (): Promise<void> => {
    const store = useChatSessionStore();
    const pageDeferred = createDeferred<ChatHandlerResult<PaginatedSessionsResult>>();
    mockElectronAPI.chatSessionList.mockReturnValue(pageDeferred.promise);
    mockElectronAPI.chatSessionCreate.mockResolvedValue({ ok: true, data: undefined });

    const loadingPromise = store.ensureSessions();
    const createdSession = await store.createSession('assistant', { title: '运行中新会话' });
    pageDeferred.resolve({ ok: true, data: { items: [createSession('session-existing')], hasMore: false } });
    await loadingPromise;

    expect(store.sessions.map((session: ChatSession): string => session.id)).toEqual([createdSession.id, 'session-existing']);
  });

  it('recovers interrupted assistant drafts and persists the interrupt marker while loading messages', async (): Promise<void> => {
    const store = useChatSessionStore();
    mockElectronAPI.chatMessageList.mockResolvedValue({ ok: true, data: [createInterruptedAssistantRecord()] });
    mockElectronAPI.chatMessageAdd.mockResolvedValue({ ok: true, data: undefined });
    mockElectronAPI.chatMessageUpdate.mockResolvedValue({ ok: true, data: undefined });

    const messages = await store.getSessionMessages('session-1');

    expect(messages[0]).toMatchObject({
      id: 'assistant-draft-1',
      role: 'assistant',
      loading: false,
      finished: true
    });
    expect(messages[0].content).toBe('半截内容');
    expect(messages[1]).toMatchObject({
      id: 'assistant-draft-1-interrupt',
      role: 'interrupt',
      content: HARD_INTERRUPTED_ASSISTANT_MESSAGE,
      loading: false,
      finished: true
    });
    expect(mockElectronAPI.chatMessageUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'assistant-draft-1',
        sessionId: 'session-1',
        loading: false,
        finished: true
      })
    );
    expect(mockElectronAPI.chatMessageAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'assistant-draft-1-interrupt',
        sessionId: 'session-1',
        role: 'interrupt',
        content: HARD_INTERRUPTED_ASSISTANT_MESSAGE,
        loading: false,
        finished: true
      })
    );
  });

  it('creates a session branch through the Electron API', async (): Promise<void> => {
    const store = useChatSessionStore();
    const branchedSession: ChatSession = {
      id: 'session-branch',
      type: 'assistant',
      title: '原标题',
      createdAt: '2026-07-14T12:00:00.000Z',
      updatedAt: '2026-07-14T12:00:00.000Z',
      lastMessageAt: '2026-07-14T12:00:00.000Z'
    };
    mockElectronAPI.chatSessionBranch.mockResolvedValue({ ok: true, data: branchedSession });

    const result = await store.branchSession('session-source', 'assistant-1');

    expect(mockElectronAPI.chatSessionBranch).toHaveBeenCalledWith('session-source', 'assistant-1');
    expect(result).toEqual(branchedSession);
    expect(store.findSession('session-branch')).toEqual(branchedSession);
  });

  it('updates the in-memory title only after persistence succeeds', async (): Promise<void> => {
    const store = useChatSessionStore();
    store.sessions = [createSession('session-a')];
    mockElectronAPI.chatSessionUpdateTitle.mockResolvedValue({ ok: true, data: undefined });

    await store.updateSessionTitle('session-a', '新标题');

    expect(store.findSession('session-a')?.title).toBe('新标题');
  });

  it('removes a session from the collection only after persistence succeeds', async (): Promise<void> => {
    const store = useChatSessionStore();
    store.sessions = [createSession('session-a')];
    mockElectronAPI.chatSessionDelete.mockResolvedValue({ ok: true, data: undefined });

    await store.deleteSession('session-a');

    expect(store.findSession('session-a')).toBeUndefined();
  });

  it('moves a session to the front after a new message is persisted', async (): Promise<void> => {
    const store = useChatSessionStore();
    const messageTime = '2026-07-23T00:00:00.000Z';
    const message: Message = {
      id: 'message-a',
      role: 'user',
      content: '继续聊天',
      parts: [{ id: 'part-a', type: 'text', text: '继续聊天' }],
      createdAt: messageTime,
      loading: false,
      finished: true
    };
    store.sessions = [createSession('session-b', '2026-07-22T00:00:00.000Z'), createSession('session-a', '2026-07-21T00:00:00.000Z')];
    mockElectronAPI.chatMessageAdd.mockResolvedValue({ ok: true, data: undefined });

    await store.addSessionMessage('session-a', message);

    expect(store.sessions.map((session: ChatSession): string => session.id)).toEqual(['session-a', 'session-b']);
    expect(store.findSession('session-a')?.lastMessageAt).toBe(messageTime);
  });

  it('preserves the collection when title update or deletion persistence fails', async (): Promise<void> => {
    const store = useChatSessionStore();
    store.sessions = [createSession('session-a')];
    mockElectronAPI.chatSessionUpdateTitle.mockResolvedValue({ ok: false, error: '标题写入失败', code: 'SQLITE_ERROR' });
    mockElectronAPI.chatSessionDelete.mockResolvedValue({ ok: false, error: '删除写入失败', code: 'SQLITE_ERROR' });

    await expect(store.updateSessionTitle('session-a', '不应出现')).rejects.toThrow('标题写入失败');
    await expect(store.deleteSession('session-a')).rejects.toThrow('删除写入失败');

    expect(store.findSession('session-a')?.title).toBe('会话 session-a');
  });

  it('throws the Electron branch error without returning a partial session', async (): Promise<void> => {
    const store = useChatSessionStore();
    mockElectronAPI.chatSessionBranch.mockResolvedValue({ ok: false, error: '分支写入失败', code: 'SQLITE_CONSTRAINT' });

    await expect(store.branchSession('session-source', 'assistant-1')).rejects.toMatchObject({
      message: '分支写入失败',
      code: 'SQLITE_CONSTRAINT'
    });
    expect(store.findSession('session-branch')).toBeUndefined();
  });
});
