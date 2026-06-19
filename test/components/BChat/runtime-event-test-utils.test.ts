/**
 * @file runtime-event-test-utils.test.ts
 * @description BChat runtime 事件测试工具测试。
 */
import type { ChatRuntimeEventMap, ChatRuntimeMessageEvent } from 'types/chat-runtime';
import { describe, expect, it, vi } from 'vitest';
import { createRuntimeEventListeners, emitRuntimeEvent, resetRuntimeEventListeners } from './runtime-event-test-utils';

describe('runtime-event-test-utils', (): void => {
  it('stores, emits, and resets runtime event listeners', (): void => {
    const listeners = createRuntimeEventListeners();
    const onMessageUpdated = vi.fn<(event: ChatRuntimeMessageEvent) => void>();
    const onComplete = vi.fn<(event: ChatRuntimeEventMap['chat:runtime:complete']) => void>();

    listeners.messageUpdated = onMessageUpdated;
    listeners.complete = onComplete;

    emitRuntimeEvent(listeners, 'messageUpdated', {
      runtimeId: 'runtime-1',
      sessionId: 'session-1',
      clientId: 'bchat',
      agentId: 'default',
      message: {
        id: 'message-1',
        sessionId: 'session-1',
        role: 'assistant',
        content: 'ok',
        parts: [],
        createdAt: '2026-06-19T00:00:00.000Z'
      }
    });
    emitRuntimeEvent(listeners, 'complete', {
      runtimeId: 'runtime-1',
      sessionId: 'session-1',
      clientId: 'bchat',
      agentId: 'default'
    });

    expect(onMessageUpdated).toHaveBeenCalledWith(expect.objectContaining({ runtimeId: 'runtime-1' }));
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ runtimeId: 'runtime-1' }));

    resetRuntimeEventListeners(listeners);
    emitRuntimeEvent(listeners, 'messageUpdated', {
      runtimeId: 'runtime-2',
      sessionId: 'session-1',
      clientId: 'bchat',
      agentId: 'default',
      message: {
        id: 'message-2',
        sessionId: 'session-1',
        role: 'assistant',
        content: 'ignored',
        parts: [],
        createdAt: '2026-06-19T00:00:01.000Z'
      }
    });

    expect(onMessageUpdated).toHaveBeenCalledTimes(1);
  });
});
