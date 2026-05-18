/**
 * @file useSession.test.ts
 * @description 验证聊天侧边栏会话初始化时的默认加载行为。
 */
import type { Message } from '@/components/BChatSidebar/utils/types';
import type { ChatSession, PaginatedSessionsResult } from 'types/chat';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 模拟按分页读取会话列表。
 */
const getSessionsMock = vi.fn<(type: 'assistant', pagination?: { limit?: number }) => Promise<PaginatedSessionsResult>>();

/**
 * 模拟读取指定会话的消息列表。
 */
const getSessionMessagesMock = vi.fn<(sessionId: string) => Promise<Message[]>>();

/**
 * 模拟写入当前激活会话 ID。
 */
const setChatSidebarActiveSessionIdMock = vi.fn<(sessionId: string | null) => void>();

/**
 * 可变的设置 store 状态，便于每个用例覆盖。
 */
const settingStoreState: { chatSidebarActiveSessionId: string | null } = {
  chatSidebarActiveSessionId: null
};

vi.mock('@/stores/chat', () => ({
  useChatSessionStore: () => ({
    getSessions: getSessionsMock,
    getSessionMessages: getSessionMessagesMock
  })
}));

vi.mock('@/stores/setting', () => ({
  useSettingStore: () => ({
    get chatSidebarActiveSessionId() {
      return settingStoreState.chatSidebarActiveSessionId;
    },
    setChatSidebarActiveSessionId: setChatSidebarActiveSessionIdMock
  })
}));

describe('BChatSidebar useSession', () => {
  beforeEach(() => {
    vi.resetModules();
    getSessionsMock.mockReset();
    getSessionMessagesMock.mockReset();
    setChatSidebarActiveSessionIdMock.mockReset();
    settingStoreState.chatSidebarActiveSessionId = null;
  });

  it('loads the latest persisted session when no active session id exists', async () => {
    const latestSession: ChatSession = {
      id: 'session-latest',
      type: 'assistant',
      title: '最近会话',
      createdAt: '2026-05-07T10:00:00.000Z',
      updatedAt: '2026-05-07T10:00:00.000Z',
      lastMessageAt: '2026-05-07T10:01:00.000Z'
    };
    const storedMessages: Message[] = [
      {
        id: 'message-1',
        role: 'user',
        content: '你好',
        parts: [{ type: 'text', text: '你好' }],
        createdAt: '2026-05-07T10:00:30.000Z',
        finished: true
      }
    ];
    const setLoadedMessages = vi.fn<(messages: Message[]) => void>();

    getSessionsMock.mockResolvedValue({
      items: [latestSession],
      hasMore: false
    });
    getSessionMessagesMock.mockResolvedValue(storedMessages);

    const { useSession } = await import('@/components/BChatSidebar/hooks/useSession');
    const session = useSession({
      resetUsagePanel: vi.fn(),
      setLoadedMessages,
      focusInput: vi.fn(),
      isStreamLoading: () => false,
      disposeConfirmationController: vi.fn(),
      resetHistoryState: vi.fn()
    });

    await session.initializeActiveSession();

    expect(getSessionsMock).toHaveBeenCalledWith('assistant', { limit: 1 });
    expect(setChatSidebarActiveSessionIdMock).toHaveBeenCalledWith('session-latest');
    expect(getSessionMessagesMock).toHaveBeenCalledWith('session-latest');
    expect(setLoadedMessages).toHaveBeenCalledWith(storedMessages);
  });
});
