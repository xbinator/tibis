/**
 * @file chat.test.ts
 * @description 验证聊天 store 的消息持久化字段映射。
 */
import type { ChatMessageHistoryCursor, ChatMessageRecord } from 'types/chat';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Message } from '@/components/BChatSidebar/utils/types';

type HandlerResult<T> = { ok: true; data: T } | { ok: false; error: string; code: string };
const ok = <T>(data: T): HandlerResult<T> => ({ ok: true, data });

const chatMessageListMock = vi.fn<(sessionId: string, cursor?: ChatMessageHistoryCursor) => Promise<HandlerResult<ChatMessageRecord[]>>>();
const chatSessionUsageGetMock = vi.fn<(sessionId: string) => Promise<HandlerResult<NonNullable<Message['usage']> | undefined>>>();
const chatMessageAddMock = vi.fn<(message: ChatMessageRecord) => Promise<HandlerResult<void>>>();
const chatMessageSetAllMock = vi.fn<(sessionId: string, messages: ChatMessageRecord[]) => Promise<HandlerResult<void>>>();
const chatSessionUpdateTitleMock = vi.fn<(sessionId: string, title: string) => Promise<HandlerResult<void>>>();
const chatSessionCreateMock = vi.fn<(session: unknown) => Promise<HandlerResult<void>>>();
const chatSessionListMock = vi.fn<() => Promise<HandlerResult<unknown>>>();
const chatSessionDeleteMock = vi.fn<() => Promise<HandlerResult<void>>>();

const electronAPIMock = {
  chatMessageList: chatMessageListMock,
  chatSessionUsageGet: chatSessionUsageGetMock,
  chatMessageAdd: chatMessageAddMock,
  chatMessageSetAll: chatMessageSetAllMock,
  chatSessionUpdateTitle: chatSessionUpdateTitleMock,
  chatSessionCreate: chatSessionCreateMock,
  chatSessionList: chatSessionListMock,
  chatSessionDelete: chatSessionDeleteMock
};

vi.mock('@/shared/platform/electron-api', () => ({
  getElectronAPI: () => electronAPIMock,
  unwrap: (result: { ok: true; data: unknown } | { ok: false; error: string; code: string }) => {
    if (!result.ok) throw new Error(result.error);
    return result.data;
  }
}));

describe('useChatSessionStore', () => {
  beforeEach(() => {
    vi.resetModules();
    chatMessageListMock.mockReset();
    chatSessionUsageGetMock.mockReset();
    chatMessageAddMock.mockReset();
    chatMessageSetAllMock.mockReset();
    chatSessionUpdateTitleMock.mockReset();
    chatSessionCreateMock.mockReset();
    chatSessionListMock.mockReset();
    chatSessionDeleteMock.mockReset();
    setActivePinia(createPinia());
  });

  it('loads session messages with a timestamp cursor', async () => {
    const { useChatSessionStore } = await import('@/stores/chat/session');
    const chatStore = useChatSessionStore();
    const cursor: ChatMessageHistoryCursor = { beforeCreatedAt: '2026-04-21T00:00:02.000Z', beforeId: 'message-2' };

    chatMessageListMock.mockResolvedValue(
      ok([
        {
          id: 'message-1',
          sessionId: 'session-1',
          role: 'user',
          content: '历史消息',
          parts: [{ type: 'text', text: '历史消息' }],
          createdAt: '2026-04-21T00:00:01.000Z'
        }
      ])
    );

    const messages = await chatStore.getSessionMessages('session-1', cursor);

    expect(chatMessageListMock).toHaveBeenCalledWith('session-1', cursor);
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

    chatSessionUsageGetMock.mockResolvedValue(ok({ inputTokens: 4, outputTokens: 6, totalTokens: 10 }));

    const usage = await chatStore.getSessionUsage('session-1');

    expect(chatSessionUsageGetMock).toHaveBeenCalledWith('session-1');
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

    chatMessageAddMock.mockResolvedValue(ok(undefined));

    await chatStore.addSessionMessage('session-1', message);

    const persistedRecord = chatMessageAddMock.mock.calls[0]?.[0] as ChatMessageRecord | undefined;

    expect(persistedRecord?.thinking).toBe('先分析问题');
    expect(persistedRecord?.parts).toEqual([{ type: 'text', text: '最终答案' }]);
  });

  it('adds assistant message via single IPC call (cascade handled in main process)', async () => {
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

    chatMessageAddMock.mockResolvedValue(ok(undefined));

    await chatStore.addSessionMessage('session-1', message);

    expect(chatMessageAddMock).toHaveBeenCalledTimes(1);
    const persistedRecord = chatMessageAddMock.mock.calls[0]?.[0] as ChatMessageRecord | undefined;
    expect(persistedRecord?.usage).toEqual({ inputTokens: 3, outputTokens: 5, totalTokens: 8 });
  });

  it('replaces session messages via single IPC call (cascade handled in main process)', async () => {
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

    chatMessageSetAllMock.mockResolvedValue(ok(undefined));

    await chatStore.setSessionMessages('session-1', messages);

    expect(chatMessageSetAllMock).toHaveBeenCalledTimes(1);
    expect(chatMessageSetAllMock).toHaveBeenCalledWith('session-1', expect.any(Array));
  });

  it('updates a session title without rewriting the whole session', async () => {
    const { useChatSessionStore } = await import('@/stores/chat/session');
    const chatStore = useChatSessionStore();

    chatSessionUpdateTitleMock.mockResolvedValue(ok(undefined));

    await chatStore.updateSessionTitle('session-1', '自动生成标题');

    expect(chatSessionUpdateTitleMock).toHaveBeenCalledWith('session-1', '自动生成标题');
  });
});
