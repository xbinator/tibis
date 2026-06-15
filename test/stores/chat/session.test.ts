/**
 * @file session.test.ts
 * @description 聊天会话 store 消息草稿恢复与单条更新测试。
 */
import type { ChatMessageRecord } from 'types/chat';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HARD_INTERRUPTED_ASSISTANT_MESSAGE } from '@/components/BChat/utils/interruptedDraftRecovery';
import { useChatSessionStore } from '@/stores/chat/session';

const mockElectronAPI = vi.hoisted(() => ({
  chatMessageList: vi.fn<(sessionId: string) => Promise<{ ok: true; data: ChatMessageRecord[] }>>(),
  chatMessageUpdate: vi.fn<(message: ChatMessageRecord) => Promise<{ ok: true; data: void }>>()
}));

vi.mock('@/shared/platform/electron-api', () => ({
  getElectronAPI: vi.fn(() => mockElectronAPI),
  unwrap: vi.fn(<T>(result: { ok: true; data: T } | { ok: false; error: string; code: string }): T => {
    if (!result.ok) throw new Error(result.error);
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
    parts: [{ type: 'text', text: '半截内容' }],
    createdAt: '2026-06-13T00:00:00.000Z',
    loading: true,
    finished: false
  };
}

describe('useChatSessionStore', () => {
  beforeEach((): void => {
    setActivePinia(createPinia());
    mockElectronAPI.chatMessageList.mockReset();
    mockElectronAPI.chatMessageUpdate.mockReset();
  });

  it('recovers interrupted assistant drafts while loading persisted messages', async (): Promise<void> => {
    const store = useChatSessionStore();
    mockElectronAPI.chatMessageList.mockResolvedValue({ ok: true, data: [createInterruptedAssistantRecord()] });
    mockElectronAPI.chatMessageUpdate.mockResolvedValue({ ok: true, data: undefined });

    const messages = await store.getSessionMessages('session-1');

    expect(messages[0]).toMatchObject({
      id: 'assistant-draft-1',
      role: 'assistant',
      loading: false,
      finished: true
    });
    expect(messages[0].content).toContain(HARD_INTERRUPTED_ASSISTANT_MESSAGE);
    expect(mockElectronAPI.chatMessageUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'assistant-draft-1',
        sessionId: 'session-1',
        loading: false,
        finished: true
      })
    );
  });
});
