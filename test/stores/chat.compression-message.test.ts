/**
 * @file chat.compression-message.test.ts
 * @description 验证聊天 store 会持久化并恢复压缩消息的元数据。
 */
import type { ChatMessageHistoryCursor, ChatMessageRecord, ChatSession } from 'types/chat';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createCompressionMessage } from '@/components/BChatSidebar/hooks/useCompactContext';

type HandlerResult<T> = { ok: true; data: T } | { ok: false; error: string; code: string };
const ok = <T>(data: T): HandlerResult<T> => ({ ok: true, data });

const { chatMessageAddMock, chatSessionCreateMock, chatMessageListMock } = vi.hoisted(() => ({
  chatMessageAddMock: vi.fn<(message: ChatMessageRecord) => Promise<HandlerResult<void>>>(),
  chatSessionCreateMock: vi.fn<(session: ChatSession) => Promise<HandlerResult<void>>>(),
  chatMessageListMock: vi.fn<(sessionId: string, cursor?: ChatMessageHistoryCursor) => Promise<HandlerResult<ChatMessageRecord[]>>>()
}));

const electronAPIMock = {
  chatMessageAdd: chatMessageAddMock,
  chatSessionCreate: chatSessionCreateMock,
  chatMessageList: chatMessageListMock,
  chatSessionUsageGet: vi.fn<() => Promise<HandlerResult<unknown>>>(),
  chatMessageSetAll: vi.fn<() => Promise<HandlerResult<void>>>(),
  chatSessionUpdateTitle: vi.fn<() => Promise<HandlerResult<void>>>(),
  chatSessionList: vi.fn<() => Promise<HandlerResult<unknown>>>(),
  chatSessionDelete: vi.fn<() => Promise<HandlerResult<void>>>()
};

vi.mock('@/shared/platform/electron-api', () => ({
  getElectronAPI: () => electronAPIMock,
  unwrap: (result: { ok: true; data: unknown } | { ok: false; error: string; code: string }) => {
    if (!result.ok) throw new Error(result.error);
    return result.data;
  }
}));

describe('useChatSessionStore compression message persistence', () => {
  beforeEach(() => {
    vi.resetModules();
    chatMessageAddMock.mockReset();
    chatSessionCreateMock.mockReset();
    chatMessageListMock.mockReset();
    setActivePinia(createPinia());
  });

  test('persists and restores compression messages with compression metadata', async () => {
    const { useChatSessionStore } = await import('@/stores/chat/session');
    const chatStore = useChatSessionStore();
    const message = createCompressionMessage({
      boundaryText: '已压缩 32 条历史消息',
      status: 'success',
      recordId: 'record-1',
      coveredUntilMessageId: 'message-32',
      sourceMessageIds: ['message-1', 'message-32']
    });

    chatMessageAddMock.mockResolvedValue(ok(undefined));

    await chatStore.addSessionMessage('session-1', message);

    const persistedRecord = chatMessageAddMock.mock.calls[0]?.[0];
    expect(persistedRecord?.role).toBe('compression');
    expect(persistedRecord?.compression?.recordId).toBe('record-1');

    chatMessageListMock.mockResolvedValue(
      ok([
        {
          ...persistedRecord,
          sessionId: 'session-1'
        } as ChatMessageRecord
      ])
    );

    const messages = await chatStore.getSessionMessages('session-1');
    expect(messages[0].role).toBe('compression');
    expect(messages[0].compression?.coveredUntilMessageId).toBe('message-32');
  });
});
