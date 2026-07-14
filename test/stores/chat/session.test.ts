/**
 * @file session.test.ts
 * @description 聊天会话 store 消息草稿恢复与单条更新测试。
 */
import type { ChatMessageRecord, ChatSession } from 'types/chat';
import type { ChatHandlerResult } from 'types/electron-api';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HARD_INTERRUPTED_ASSISTANT_MESSAGE } from '@/components/BChat/utils/interruptedDraftRecovery';
import { useChatSessionStore } from '@/stores/chat/session';

const mockElectronAPI = vi.hoisted(() => ({
  chatSessionBranch: vi.fn<(sourceSessionId: string, targetMessageId: string) => Promise<ChatHandlerResult<ChatSession>>>(),
  chatMessageList: vi.fn<(sessionId: string) => Promise<{ ok: true; data: ChatMessageRecord[] }>>(),
  chatMessageAdd: vi.fn<(message: ChatMessageRecord) => Promise<{ ok: true; data: void }>>(),
  chatMessageUpdate: vi.fn<(message: ChatMessageRecord) => Promise<{ ok: true; data: void }>>()
}));

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
    mockElectronAPI.chatSessionBranch.mockReset();
    mockElectronAPI.chatMessageList.mockReset();
    mockElectronAPI.chatMessageAdd.mockReset();
    mockElectronAPI.chatMessageUpdate.mockReset();
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
  });

  it('throws the Electron branch error without returning a partial session', async (): Promise<void> => {
    const store = useChatSessionStore();
    mockElectronAPI.chatSessionBranch.mockResolvedValue({ ok: false, error: '分支写入失败', code: 'SQLITE_CONSTRAINT' });

    await expect(store.branchSession('session-source', 'assistant-1')).rejects.toMatchObject({
      message: '分支写入失败',
      code: 'SQLITE_CONSTRAINT'
    });
  });
});
