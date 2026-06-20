/**
 * @file use-chat-session.test.ts
 * @description ChatSider 会话选择 hook 测试。
 * @vitest-environment jsdom
 */
import type { ChatSession } from 'types/chat';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { useChatSession } from '@/layouts/default/hooks/useChatSession';
import { useSettingStore } from '@/stores/ui/setting';

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

describe('useChatSession', (): void => {
  beforeEach((): void => {
    setActivePinia(createPinia());
  });

  it('refuses to switch sessions while chat runtime is loading', async (): Promise<void> => {
    const settingStore = useSettingStore();
    settingStore.setChatSidebarActiveSessionId('session-a');
    const session = useChatSession({ isChatLoading: () => true });

    await session.switchSession('session-b');

    expect(settingStore.chatSidebarActiveSessionId).toBe('session-a');
    expect(session.currentSession.value).toBeUndefined();
  });

  it('clears active and current session when the active session is deleted', (): void => {
    const settingStore = useSettingStore();
    const deletedSession = createSession('session-deleted', '待删除会话');
    settingStore.setChatSidebarActiveSessionId(deletedSession.id);
    const session = useChatSession({ isChatLoading: () => false });
    session.setCurrentSession(deletedSession);

    session.handleDeletedSession(deletedSession.id);

    expect(settingStore.chatSidebarActiveSessionId).toBeNull();
    expect(session.currentSession.value).toBeUndefined();
  });
});
