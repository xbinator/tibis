/**
 * @file chat.compression-message.test.ts
 * @description 验证聊天 store 会持久化并恢复压缩消息的元数据。
 */
import type { ChatMessageHistoryCursor, ChatMessageRecord, ChatSession } from 'types/chat';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createCompressionMessage } from '@/components/BChatSidebar/hooks/useCompactContext';

type AddMessageMock = (message: ChatMessageRecord) => Promise<void>;
type CreateSessionMock = (session: ChatSession) => Promise<void>;
type GetMessagesMock = (sessionId: string, cursor?: ChatMessageHistoryCursor) => Promise<ChatMessageRecord[]>;

const { addMessageMock, createSessionMock, getMessagesMock } = vi.hoisted(() => ({
  addMessageMock: vi.fn<AddMessageMock>(),
  createSessionMock: vi.fn<CreateSessionMock>(),
  getMessagesMock: vi.fn<GetMessagesMock>()
}));

vi.mock('@/shared/storage', () => ({
  chatStorage: {
    createSession: createSessionMock,
    addMessage: addMessageMock,
    getMessages: getMessagesMock,
    updateSessionLastMessageAt: vi.fn(async () => undefined),
    addSessionUsage: vi.fn(async () => undefined),
    updateSessionUsage: vi.fn(async () => undefined),
    getSessionUsage: vi.fn(async () => undefined),
    setSessionMessages: vi.fn(async () => undefined),
    updateSessionTitle: vi.fn(async () => undefined),
    getSessionsByType: vi.fn(async () => ({ items: [], hasMore: false })),
    deleteSession: vi.fn(async () => undefined)
  }
}));

describe('useChatSessionStore compression message persistence', () => {
  beforeEach(() => {
    vi.resetModules();
    addMessageMock.mockReset();
    createSessionMock.mockReset();
    getMessagesMock.mockReset();
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

    await chatStore.addSessionMessage('session-1', message);

    const persistedRecord = addMessageMock.mock.calls[0]?.[0];
    expect(persistedRecord?.role).toBe('compression');
    expect(persistedRecord?.compression?.recordId).toBe('record-1');

    getMessagesMock.mockResolvedValue([
      {
        ...persistedRecord,
        sessionId: 'session-1'
      } as ChatMessageRecord
    ]);

    const messages = await chatStore.getSessionMessages('session-1');
    expect(messages[0].role).toBe('compression');
    expect(messages[0].compression?.coveredUntilMessageId).toBe('message-32');
  });
});
