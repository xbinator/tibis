/**
 * @file runtime-compact-context.test.ts
 * @description BChat 主进程 runtime 压缩 hook 测试。
 */
import type { ChatRuntimeMessageEvent } from 'types/chat-runtime';
import { effectScope, ref } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { useRuntimeCompactContext } from '@/components/BChat/hooks/useRuntimeCompactContext';
import type { Message } from '@/components/BChat/utils/types';

/** runtime message-created 监听器。 */
let messageCreatedListener: ((event: ChatRuntimeMessageEvent) => void) | undefined;
/** runtime message-updated 监听器。 */
let messageUpdatedListener: ((event: ChatRuntimeMessageEvent) => void) | undefined;

/** Electron API 测试替身。 */
const electronAPIMock = vi.hoisted(() => ({
  chatRuntimeCompact: vi.fn(),
  chatRuntimeOnMessageCreated: vi.fn((callback: (event: ChatRuntimeMessageEvent) => void) => {
    messageCreatedListener = callback;
    return vi.fn();
  }),
  chatRuntimeOnMessageUpdated: vi.fn((callback: (event: ChatRuntimeMessageEvent) => void) => {
    messageUpdatedListener = callback;
    return vi.fn();
  })
}));

vi.mock('@/shared/platform/electron-api', () => ({
  getElectronAPI: vi.fn(() => electronAPIMock),
  unwrap: vi.fn((result: { ok: true; data: unknown } | { ok: false; error: string }) => {
    if (!result.ok) throw new Error(result.error);
    return result.data;
  })
}));

/**
 * 创建测试消息。
 * @param id - 消息 ID
 * @param role - 消息角色
 * @param content - 消息内容
 * @returns BChat 消息
 */
function createMessage(id: string, role: Message['role'], content: string): Message {
  return {
    id,
    role,
    content,
    parts: [{ type: 'text', text: content }],
    createdAt: '2026-06-18T00:00:00.000Z',
    finished: true
  };
}

describe('useRuntimeCompactContext', (): void => {
  it('calls main-process compact and applies runtime message events', async (): Promise<void> => {
    const scope = effectScope();
    const messages = ref<Message[]>([createMessage('u1', 'user', '旧用户消息'), createMessage('a1', 'assistant', '旧助手回复')]);
    const finishCompactTask = vi.fn();

    electronAPIMock.chatRuntimeCompact.mockImplementation(async () => {
      messageCreatedListener?.({
        runtimeId: 'runtime-compact-test',
        sessionId: 'session-1',
        clientId: 'bchat',
        agentId: 'agent-1',
        message: {
          id: 'c1',
          sessionId: 'session-1',
          role: 'compression',
          content: '正在压缩上下文…',
          parts: [{ type: 'text', text: '正在压缩上下文…' }],
          createdAt: '2026-06-18T00:00:00.000Z',
          loading: true,
          finished: false
        }
      });
      messageUpdatedListener?.({
        runtimeId: 'runtime-compact-test',
        sessionId: 'session-1',
        clientId: 'bchat',
        agentId: 'agent-1',
        message: {
          id: 'c1',
          sessionId: 'session-1',
          role: 'compression',
          content: 'COMPRESSED_CONTEXT',
          parts: [{ type: 'text', text: 'COMPRESSED_CONTEXT' }],
          createdAt: '2026-06-18T00:00:00.000Z',
          loading: false,
          finished: true,
          compression: {
            status: 'success',
            recordText: 'COMPRESSED_CONTEXT',
            recordId: 'record-1'
          }
        }
      });
      return { ok: true, data: { status: 'success', messageId: 'c1', recordId: 'record-1' } };
    });

    const compact = scope.run(() =>
      useRuntimeCompactContext({
        messages,
        getSessionId: () => 'session-1',
        getContextWindow: () => 128_000,
        beginCompactTask: () => ({ ok: true }),
        finishCompactTask,
        scrollToBottom: vi.fn()
      })
    );

    await compact?.handleCompactContext();

    expect(electronAPIMock.chatRuntimeCompact).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'session-1',
        clientId: 'bchat',
        agentId: 'default',
        reason: 'manual',
        contextWindow: 128_000,
        messages: expect.arrayContaining([expect.objectContaining({ id: 'u1' }), expect.objectContaining({ id: 'a1' })])
      })
    );
    expect(messages.value.at(-1)).toMatchObject({
      id: 'c1',
      role: 'compression',
      content: 'COMPRESSED_CONTEXT',
      loading: false,
      finished: true
    });
    expect(finishCompactTask).toHaveBeenCalledTimes(1);
    scope.stop();
  });

  it('ignores compact runtime messages from a different client', (): void => {
    const scope = effectScope();
    const messages = ref<Message[]>([createMessage('u1', 'user', '旧用户消息'), createMessage('a1', 'assistant', '旧助手回复')]);

    scope.run(() =>
      useRuntimeCompactContext({
        messages,
        getSessionId: () => 'session-1',
        beginCompactTask: () => ({ ok: true }),
        finishCompactTask: vi.fn(),
        scrollToBottom: vi.fn(),
        clientId: 'client-active'
      })
    );
    messageCreatedListener?.({
      runtimeId: 'runtime-compact-other',
      sessionId: 'session-1',
      clientId: 'client-other',
      agentId: 'agent-1',
      message: {
        id: 'c-other',
        sessionId: 'session-1',
        role: 'compression',
        content: 'OTHER_CONTEXT',
        parts: [{ type: 'text', text: 'OTHER_CONTEXT' }],
        createdAt: '2026-06-18T00:00:00.000Z',
        loading: false,
        finished: true
      }
    });

    expect(messages.value.map((message) => message.id)).toEqual(['u1', 'a1']);
    scope.stop();
  });

  it('ignores compact runtime messages rejected by the event guard', (): void => {
    const scope = effectScope();
    const messages = ref<Message[]>([createMessage('u1', 'user', '旧用户消息')]);

    scope.run(() =>
      useRuntimeCompactContext({
        messages,
        getSessionId: () => 'session-1',
        beginCompactTask: () => ({ ok: true }),
        finishCompactTask: vi.fn(),
        scrollToBottom: vi.fn(),
        isRuntimeEventIgnored: (runtimeId: string): boolean => runtimeId === 'runtime-rollback'
      })
    );
    messageCreatedListener?.({
      runtimeId: 'runtime-rollback',
      sessionId: 'session-1',
      clientId: 'bchat',
      agentId: 'agent-1',
      message: {
        id: 'interrupt-rollback',
        sessionId: 'session-1',
        role: 'interrupt',
        content: '已中断',
        parts: [],
        createdAt: '2026-06-18T00:00:00.000Z',
        loading: false,
        finished: true
      }
    });

    expect(messages.value.map((message) => message.id)).toEqual(['u1']);
    scope.stop();
  });

  it('sends cloneable message snapshots to the main-process compact command', async (): Promise<void> => {
    const scope = effectScope();
    const messages = ref<Message[]>([
      {
        ...createMessage('u1', 'user', '带附件的用户消息'),
        files: [
          {
            id: 'file-1',
            name: 'note.md',
            path: '/workspace/note.md',
            type: 'document',
            mimeType: 'text/markdown'
          }
        ]
      },
      createMessage('a1', 'assistant', '助手回复')
    ]);

    electronAPIMock.chatRuntimeCompact.mockImplementation(async (input: unknown) => {
      structuredClone(input);
      return { ok: true, data: { status: 'skipped', reason: 'already_compact' } };
    });

    const compact = scope.run(() =>
      useRuntimeCompactContext({
        messages,
        getSessionId: () => 'session-1',
        beginCompactTask: () => ({ ok: true }),
        finishCompactTask: vi.fn(),
        scrollToBottom: vi.fn()
      })
    );

    await compact?.handleCompactContext();

    const compactInput = electronAPIMock.chatRuntimeCompact.mock.calls.at(-1)?.[0] as { messages: Array<{ sessionId: string; files?: unknown }> };
    expect(compactInput.messages).toEqual([
      expect.objectContaining({
        id: 'u1',
        sessionId: 'session-1',
        files: [{ id: 'file-1', name: 'note.md', path: '/workspace/note.md', type: 'document', mimeType: 'text/markdown' }]
      }),
      expect.objectContaining({ id: 'a1', sessionId: 'session-1' })
    ]);

    scope.stop();
  });

  it('finishes the compact task without throwing when the compact IPC command fails', async (): Promise<void> => {
    const scope = effectScope();
    const messages = ref<Message[]>([createMessage('u1', 'user', '旧用户消息'), createMessage('a1', 'assistant', '旧助手回复')]);
    const finishCompactTask = vi.fn();
    electronAPIMock.chatRuntimeCompact.mockRejectedValue(new Error('An object could not be cloned.'));

    const compact = scope.run(() =>
      useRuntimeCompactContext({
        messages,
        getSessionId: () => 'session-1',
        beginCompactTask: () => ({ ok: true }),
        finishCompactTask,
        scrollToBottom: vi.fn()
      })
    );

    await expect(compact?.handleCompactContext()).resolves.toBeUndefined();

    expect(finishCompactTask).toHaveBeenCalledTimes(1);

    scope.stop();
  });
});
