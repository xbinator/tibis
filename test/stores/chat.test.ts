/**
 * @file chat.test.ts
 * @description 验证聊天 store 的消息持久化字段映射。
 */
import type { ChatMessageHistoryCursor, ChatMessageRecord } from 'types/chat';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Message } from '@/components/BChatSidebar/utils/types';

type AddMessageMock = (message: ChatMessageRecord) => Promise<void>;
type GetMessagesMock = (sessionId: string, cursor?: ChatMessageHistoryCursor) => Promise<ChatMessageRecord[]>;
type GetSessionUsageMock = (sessionId: string) => Promise<NonNullable<Message['usage']> | undefined>;
type SetSessionMessagesMock = (sessionId: string, messages: ChatMessageRecord[]) => Promise<void>;
type UpdateSessionLastMessageAtMock = (sessionId: string, lastMessageAt: string) => Promise<void>;
type AddSessionUsageMock = (sessionId: string, usage: NonNullable<Message['usage']>) => Promise<void>;
type UpdateSessionUsageMock = (sessionId: string, usage: NonNullable<Message['usage']> | undefined) => Promise<void>;
type UpdateSessionTitleMock = (sessionId: string, title: string) => Promise<void>;

/**
 * 模拟消息写入存储层的行为。
 */
const addMessageMock = vi.fn<AddMessageMock>();

/**
 * 模拟按游标读取会话消息的行为。
 */
const getMessagesMock = vi.fn<GetMessagesMock>();

/**
 * 妯℃嫙浼氳瘽 usage 璇诲彇琛屼负銆?
 */
const getSessionUsageMock = vi.fn<GetSessionUsageMock>();

/**
 * 模拟会话消息整体替换行为。
 */
const setSessionMessagesMock = vi.fn<SetSessionMessagesMock>();

/**
 * 模拟会话最近消息时间更新行为。
 */
const updateSessionLastMessageAtMock = vi.fn<UpdateSessionLastMessageAtMock>();

/**
 * 模拟会话 usage 累加行为。
 */
const addSessionUsageMock = vi.fn<AddSessionUsageMock>();

/**
 * 模拟会话 usage 重算写入行为。
 */
const updateSessionUsageMock = vi.fn<UpdateSessionUsageMock>();

/**
 * 模拟会话标题更新行为。
 */
const updateSessionTitleMock = vi.fn<UpdateSessionTitleMock>();

vi.mock('@/shared/storage', () => ({
  chatStorage: {
    getMessages: getMessagesMock,
    getSessionUsage: getSessionUsageMock,
    addMessage: addMessageMock,
    setSessionMessages: setSessionMessagesMock,
    updateSessionLastMessageAt: updateSessionLastMessageAtMock,
    addSessionUsage: addSessionUsageMock,
    updateSessionUsage: updateSessionUsageMock,
    updateSessionTitle: updateSessionTitleMock
  }
}));

describe('useChatSessionStore', () => {
  beforeEach(() => {
    vi.resetModules();
    addMessageMock.mockReset();
    getMessagesMock.mockReset();
    getSessionUsageMock.mockReset();
    setSessionMessagesMock.mockReset();
    updateSessionLastMessageAtMock.mockReset();
    addSessionUsageMock.mockReset();
    updateSessionUsageMock.mockReset();
    updateSessionTitleMock.mockReset();
    setActivePinia(createPinia());
  });

  it('loads session messages with a timestamp cursor', async () => {
    const { useChatSessionStore } = await import('@/stores/chat/session');
    const chatStore = useChatSessionStore();
    const cursor: ChatMessageHistoryCursor = { beforeCreatedAt: '2026-04-21T00:00:02.000Z', beforeId: 'message-2' };

    getMessagesMock.mockResolvedValue([
      {
        id: 'message-1',
        sessionId: 'session-1',
        role: 'user',
        content: '历史消息',
        parts: [{ type: 'text', text: '历史消息' }],
        createdAt: '2026-04-21T00:00:01.000Z'
      }
    ]);

    const messages = await chatStore.getSessionMessages('session-1', cursor);

    expect(getMessagesMock).toHaveBeenCalledWith('session-1', cursor);
    expect(messages).toEqual([
      {
        id: 'message-1',
        sessionId: 'session-1',
        role: 'user',
        content: '历史消息',
        parts: [{ type: 'text', text: '历史消息' }],
        createdAt: '2026-04-21T00:00:01.000Z',
        finished: true
      }
    ]);
  });

  it('reads persisted session usage without recomputing from messages', async () => {
    const { useChatSessionStore } = await import('@/stores/chat/session');
    const chatStore = useChatSessionStore();

    getSessionUsageMock.mockResolvedValue({ inputTokens: 4, outputTokens: 6, totalTokens: 10 });

    const usage = await chatStore.getSessionUsage('session-1');

    expect(getSessionUsageMock).toHaveBeenCalledWith('session-1');
    expect(usage).toEqual({ inputTokens: 4, outputTokens: 6, totalTokens: 10 });
  });

  it('persists assistant thinking content with chat messages', async () => {
    const { useChatSessionStore } = await import('@/stores/chat/session');
    const chatStore = useChatSessionStore();
    const message: Message = {
      id: 'assistant-1',
      role: 'assistant',
      content: '最终答案',
      parts: [{ type: 'text', text: '最终答案' }],
      thinking: '先分析问题',
      createdAt: '2026-04-21T00:00:00.000Z'
    };

    await chatStore.addSessionMessage('session-1', message);

    const persistedRecord = addMessageMock.mock.calls[0]?.[0] as ChatMessageRecord | undefined;

    expect(persistedRecord?.thinking).toBe('先分析问题');
    expect(persistedRecord?.parts).toEqual([{ type: 'text', text: '最终答案' }]);
  });

  it('adds assistant usage to the active session when a message completes', async () => {
    const { useChatSessionStore } = await import('@/stores/chat/session');
    const chatStore = useChatSessionStore();
    const message: Message = {
      id: 'assistant-2',
      role: 'assistant',
      content: '回答',
      parts: [{ type: 'text', text: '回答' }],
      usage: { inputTokens: 3, outputTokens: 5, totalTokens: 8 },
      createdAt: '2026-04-21T00:00:00.000Z'
    };

    await chatStore.addSessionMessage('session-1', message);

    expect(addSessionUsageMock).toHaveBeenCalledWith('session-1', { inputTokens: 3, outputTokens: 5, totalTokens: 8 });
  });

  it('recalculates session usage from retained messages when session messages are replaced', async () => {
    const { useChatSessionStore } = await import('@/stores/chat/session');
    const chatStore = useChatSessionStore();
    const messages: Message[] = [
      {
        id: 'assistant-1',
        role: 'assistant',
        content: '旧回答',
        parts: [{ type: 'text', text: '旧回答' }],
        usage: { inputTokens: 2, outputTokens: 4, totalTokens: 6 },
        createdAt: '2026-04-21T00:00:00.000Z'
      },
      {
        id: 'assistant-2',
        role: 'assistant',
        content: '新回答',
        parts: [{ type: 'text', text: '新回答' }],
        usage: { inputTokens: 3, outputTokens: 5, totalTokens: 8 },
        createdAt: '2026-04-21T00:00:01.000Z'
      }
    ];

    await chatStore.setSessionMessages('session-1', messages);

    expect(updateSessionUsageMock).toHaveBeenCalledWith('session-1', { inputTokens: 5, outputTokens: 9, totalTokens: 14 });
  });

  it('updates a session title without rewriting the whole session', async () => {
    const { useChatSessionStore } = await import('@/stores/chat/session');
    const chatStore = useChatSessionStore();

    await chatStore.updateSessionTitle('session-1', '自动生成标题');

    expect(updateSessionTitleMock).toHaveBeenCalledWith('session-1', '自动生成标题');
  });
});
