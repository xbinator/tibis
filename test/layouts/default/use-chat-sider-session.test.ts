/**
 * @file use-chat-sider-session.test.ts
 * @description ChatSider 会话选择 hook 测试。
 * @vitest-environment jsdom
 */
import type { ChatSession, PaginatedSessionsResult } from 'types/chat';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatSiderSession } from '@/layouts/default/hooks/useChatSiderSession';
import { useSettingStore } from '@/stores/ui/setting';

const chatStoreMock = vi.hoisted(() => ({
  getSessions: vi.fn<() => Promise<PaginatedSessionsResult>>()
}));

vi.mock('@/stores/chat/session', () => ({
  useChatSessionStore: vi.fn(() => chatStoreMock)
}));

/**
 * 创建测试会话。
 * @param id - 会话 ID
 * @param title - 会话标题
 * @returns 测试会话
 */
function createSession(id: string, title: string): ChatSession {
  return {
    id,
    type: 'assistant',
    title,
    createdAt: '2026-06-15T00:00:00.000Z',
    updatedAt: '2026-06-15T00:00:00.000Z',
    lastMessageAt: '2026-06-15T00:00:00.000Z'
  };
}

/**
 * 创建分页会话结果。
 * @param items - 会话列表
 * @returns 分页结果
 */
function createSessionPage(items: ChatSession[]): PaginatedSessionsResult {
  return {
    items,
    hasMore: false
  };
}

describe('useChatSiderSession', (): void => {
  beforeEach((): void => {
    setActivePinia(createPinia());
    chatStoreMock.getSessions.mockReset();
  });

  it('restores the latest assistant session when no active session exists', async (): Promise<void> => {
    const latestSession = createSession('session-1', '最近会话');
    chatStoreMock.getSessions.mockResolvedValue(createSessionPage([latestSession]));
    const settingStore = useSettingStore();
    const session = useChatSiderSession({ isChatLoading: () => false });

    await session.initializeActiveSession();

    expect(session.initialized.value).toBe(true);
    expect(settingStore.chatSidebarActiveSessionId).toBe('session-1');
    expect(session.currentSession.value).toEqual(latestSession);
    expect(chatStoreMock.getSessions).toHaveBeenCalledWith('assistant', { limit: 1 });
  });

  it('keeps an existing active session id and waits for current session hydration', async (): Promise<void> => {
    const settingStore = useSettingStore();
    settingStore.setChatSidebarActiveSessionId('session-existing');
    const session = useChatSiderSession({ isChatLoading: () => false });

    await session.initializeActiveSession();

    expect(session.initialized.value).toBe(true);
    expect(settingStore.chatSidebarActiveSessionId).toBe('session-existing');
    expect(session.currentSession.value).toBeUndefined();
    expect(chatStoreMock.getSessions).not.toHaveBeenCalled();
  });

  it('refuses to switch sessions while chat runtime is loading', async (): Promise<void> => {
    const settingStore = useSettingStore();
    settingStore.setChatSidebarActiveSessionId('session-a');
    const session = useChatSiderSession({ isChatLoading: () => true });

    await session.switchSession('session-b');

    expect(settingStore.chatSidebarActiveSessionId).toBe('session-a');
    expect(session.currentSession.value).toBeUndefined();
  });

  it('clears active and current session when the active session is deleted', (): void => {
    const settingStore = useSettingStore();
    const deletedSession = createSession('session-deleted', '待删除会话');
    settingStore.setChatSidebarActiveSessionId(deletedSession.id);
    const session = useChatSiderSession({ isChatLoading: () => false });
    session.setCurrentSession(deletedSession);

    session.handleDeletedSession(deletedSession.id);

    expect(settingStore.chatSidebarActiveSessionId).toBeNull();
    expect(session.currentSession.value).toBeUndefined();
  });
});
