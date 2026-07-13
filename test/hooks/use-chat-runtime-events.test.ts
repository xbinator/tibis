/**
 * @file use-chat-runtime-events.test.ts
 * @description 应用级 ChatRuntime 事件路由 hook 测试。
 * @vitest-environment jsdom
 */
import type {
  ChatRuntimeCompleteEvent,
  ChatRuntimeConfirmationRequestEvent,
  ChatRuntimeContextUsageEvent,
  ChatRuntimeErrorEvent,
  ChatRuntimeMessageDeletedEvent,
  ChatRuntimeMessageEvent
} from 'types/chat-runtime';
import { effectScope } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createChatActorSystem } from '@/ai/chat/actorSystem';
import { useChatRuntimeEvents } from '@/hooks/useChatRuntimeEvents';
import { useToolPermissionStore } from '@/stores/chat/toolPermission';

const runtimeListeners = vi.hoisted(() => ({
  messageCreated: undefined as ((event: ChatRuntimeMessageEvent) => void) | undefined,
  messageUpdated: undefined as ((event: ChatRuntimeMessageEvent) => void) | undefined,
  messageDeleted: undefined as ((event: ChatRuntimeMessageDeletedEvent) => void) | undefined,
  contextUsage: undefined as ((event: ChatRuntimeContextUsageEvent) => void) | undefined,
  confirmation: undefined as ((event: ChatRuntimeConfirmationRequestEvent) => void) | undefined,
  complete: undefined as ((event: ChatRuntimeCompleteEvent) => void) | undefined,
  error: undefined as ((event: ChatRuntimeErrorEvent) => void) | undefined
}));

const runtimeCommands = vi.hoisted(() => ({
  submitConfirmation: vi.fn()
}));

vi.mock('@/shared/platform/electron-api', () => ({
  getElectronAPI: vi.fn(() => ({
    chatRuntimeOnMessageCreated: vi.fn((listener: (event: ChatRuntimeMessageEvent) => void): (() => void) => {
      runtimeListeners.messageCreated = listener;
      return vi.fn();
    }),
    chatRuntimeOnMessageUpdated: vi.fn((listener: (event: ChatRuntimeMessageEvent) => void): (() => void) => {
      runtimeListeners.messageUpdated = listener;
      return vi.fn();
    }),
    chatRuntimeOnMessageDeleted: vi.fn((listener: (event: ChatRuntimeMessageDeletedEvent) => void): (() => void) => {
      runtimeListeners.messageDeleted = listener;
      return vi.fn();
    }),
    chatRuntimeOnContextUsageUpdated: vi.fn((listener: (event: ChatRuntimeContextUsageEvent) => void): (() => void) => {
      runtimeListeners.contextUsage = listener;
      return vi.fn();
    }),
    chatRuntimeOnToolRequest: vi.fn((): (() => void) => vi.fn()),
    chatRuntimeOnConfirmationRequested: vi.fn((listener: (event: ChatRuntimeConfirmationRequestEvent) => void): (() => void) => {
      runtimeListeners.confirmation = listener;
      return vi.fn();
    }),
    chatRuntimeSubmitConfirmation: runtimeCommands.submitConfirmation,
    chatRuntimeOnBridgeRequested: vi.fn((): (() => void) => vi.fn()),
    chatRuntimeOnComplete: vi.fn((listener: (event: ChatRuntimeCompleteEvent) => void): (() => void) => {
      runtimeListeners.complete = listener;
      return vi.fn();
    }),
    chatRuntimeOnError: vi.fn((listener: (event: ChatRuntimeErrorEvent) => void): (() => void) => {
      runtimeListeners.error = listener;
      return vi.fn();
    })
  }))
}));

/**
 * 创建 Runtime 事件基础字段。
 * @returns Runtime 事件基础字段
 */
function createEventBase(): {
  runtimeId: string;
  sessionId: string;
  clientId: string;
  agentId: string;
} {
  return {
    runtimeId: 'runtime-1',
    sessionId: 'session-1',
    clientId: 'bchat',
    agentId: 'primary'
  };
}

describe('useChatRuntimeEvents', (): void => {
  beforeEach((): void => {
    setActivePinia(createPinia());
    runtimeCommands.submitConfirmation.mockReset();
    runtimeCommands.submitConfirmation.mockResolvedValue({ ok: true });
    for (const key of Object.keys(runtimeListeners) as Array<keyof typeof runtimeListeners>) {
      runtimeListeners[key] = undefined;
    }
  });

  it('auto-approves remembered confirmation grants without moving the Session to waiting', async (): Promise<void> => {
    const system = createChatActorSystem();
    system.start();
    const session = system.ensureSession('session-1');
    session.send({ type: 'session.submit', input: { messageId: 'user-1', createdAt: '2026-07-11T00:00:00.000Z', content: 'hello', parts: [] } });
    session.send({ type: 'session.prepared' });
    const turn = session.getSnapshot().context.turnRef;
    system.registerRuntime(
      { sessionId: 'session-1', turnId: turn?.getSnapshot().context.turnId as string, agentId: 'primary', runtimeId: 'runtime-1' },
      { tools: [], getToolContext: () => undefined, handleBridgeRequest: async (): Promise<unknown> => undefined }
    );
    system.send({ type: 'runtime.event', runtimeId: 'runtime-1', event: { type: 'runtime.started', runtimeId: 'runtime-1' } });
    useToolPermissionStore().grantToolPermission('write_file', 'session');
    const visibleEvents = vi.fn();
    system.subscribeSessionEvents('session-1', visibleEvents);
    const scope = effectScope();
    scope.run((): void => useChatRuntimeEvents(system));

    runtimeListeners.confirmation?.({
      ...createEventBase(),
      confirmationId: 'confirmation-remembered',
      request: { toolName: 'write_file', title: '写入文件', description: '是否写入？', riskLevel: 'write', allowRemember: true }
    });
    await Promise.resolve();

    expect(runtimeCommands.submitConfirmation).toHaveBeenCalledWith({
      runtimeId: 'runtime-1',
      confirmationId: 'confirmation-remembered',
      decision: { approved: true }
    });
    expect(visibleEvents).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'confirmationRequested' }));
    expect(session.getSnapshot().matches('running')).toBe(true);
    scope.stop();
    system.stop();
  });

  it('publishes visible events and completes the addressed background Agent', (): void => {
    const system = createChatActorSystem();
    system.start();
    const session = system.ensureSession('session-1');
    session.send({
      type: 'session.submit',
      input: {
        messageId: 'user-1',
        createdAt: '2026-07-11T00:00:00.000Z',
        content: 'hello',
        parts: []
      }
    });
    session.send({ type: 'session.prepared' });
    const turn = session.getSnapshot().context.turnRef;
    const agent = turn?.getSnapshot().context.primaryAgentRef;
    const turnId = turn?.getSnapshot().context.turnId;
    system.registerRuntime(
      { sessionId: 'session-1', turnId: turnId as string, agentId: 'primary', runtimeId: 'runtime-1' },
      { tools: [], getToolContext: () => undefined, handleBridgeRequest: async (): Promise<unknown> => undefined }
    );
    system.send({ type: 'runtime.event', runtimeId: 'runtime-1', event: { type: 'runtime.started', runtimeId: 'runtime-1' } });
    const visibleEvents = vi.fn();
    system.subscribeSessionEvents('session-1', visibleEvents);
    const scope = effectScope();
    scope.run((): void => {
      useChatRuntimeEvents(system);
    });

    runtimeListeners.messageDeleted?.({ ...createEventBase(), messageId: 'assistant-1' });
    expect(visibleEvents).toHaveBeenCalledWith(expect.objectContaining({ type: 'messageDeleted', event: expect.objectContaining({ sessionId: 'session-1' }) }));
    runtimeListeners.confirmation?.({
      ...createEventBase(),
      confirmationId: 'confirmation-visible',
      request: { toolName: 'write_file', title: '写入文件', description: '是否写入？', riskLevel: 'write' }
    });
    expect(visibleEvents).toHaveBeenCalledWith(expect.objectContaining({ type: 'confirmationRequested' }));
    runtimeListeners.complete?.({ ...createEventBase(), reason: 'completed' });

    expect(agent?.getSnapshot().matches('completed')).toBe(true);
    expect(session.getSnapshot().matches('idle')).toBe(true);
    expect(system.getRuntimeCapabilities('runtime-1')).toBeUndefined();
    scope.stop();
    system.stop();
  });

  it('moves a background Session to waiting and replays its confirmation on subscribe', (): void => {
    const system = createChatActorSystem();
    system.start();
    const session = system.ensureSession('session-1');
    session.send({
      type: 'session.submit',
      input: { messageId: 'user-1', createdAt: '2026-07-11T00:00:00.000Z', content: 'hello', parts: [] }
    });
    session.send({ type: 'session.prepared' });
    const turn = session.getSnapshot().context.turnRef;
    const turnId = turn?.getSnapshot().context.turnId;
    system.registerRuntime(
      { sessionId: 'session-1', turnId: turnId as string, agentId: 'primary', runtimeId: 'runtime-1' },
      { tools: [], getToolContext: () => undefined, handleBridgeRequest: async (): Promise<unknown> => undefined }
    );
    system.send({ type: 'runtime.event', runtimeId: 'runtime-1', event: { type: 'runtime.started', runtimeId: 'runtime-1' } });
    const scope = effectScope();
    scope.run((): void => useChatRuntimeEvents(system));

    runtimeListeners.confirmation?.({
      ...createEventBase(),
      confirmationId: 'confirmation-1',
      request: { toolName: 'write_file', title: '写入文件', description: '是否写入？', riskLevel: 'write' }
    });

    expect(session.getSnapshot().matches('waitingForUser')).toBe(true);
    const visibleEvents = vi.fn();
    system.subscribeSessionEvents('session-1', visibleEvents);
    expect(visibleEvents).toHaveBeenCalledWith(expect.objectContaining({ type: 'confirmationRequested' }));
    scope.stop();
    system.stop();
  });

  it('keeps the Turn waiting when Runtime completion explicitly requests user input', (): void => {
    const system = createChatActorSystem();
    system.start();
    const session = system.ensureSession('session-1');
    session.send({
      type: 'session.submit',
      input: { messageId: 'user-1', createdAt: '2026-07-13T00:00:00.000Z', content: 'hello', parts: [] }
    });
    session.send({ type: 'session.prepared' });
    const turn = session.getSnapshot().context.turnRef;
    const agent = turn?.getSnapshot().context.primaryAgentRef;
    system.registerRuntime(
      { sessionId: 'session-1', turnId: turn?.getSnapshot().context.turnId as string, agentId: 'primary', runtimeId: 'runtime-1' },
      { tools: [], getToolContext: () => undefined, handleBridgeRequest: async (): Promise<unknown> => undefined }
    );
    system.send({ type: 'runtime.event', runtimeId: 'runtime-1', event: { type: 'runtime.started', runtimeId: 'runtime-1' } });
    const visibleEvents = vi.fn();
    system.subscribeSessionEvents('session-1', visibleEvents);
    const scope = effectScope();
    scope.run((): void => useChatRuntimeEvents(system));

    runtimeListeners.complete?.({
      ...createEventBase(),
      reason: 'awaiting_user_input',
      interaction: {
        type: 'userChoice',
        status: 'pending',
        sessionId: 'session-1',
        messageId: 'assistant-1',
        runtimeId: 'runtime-1',
        agentId: 'primary',
        toolCallId: 'tool-call-question',
        questionId: 'question-1'
      }
    });

    expect(session.getSnapshot().matches('waitingForUser')).toBe(true);
    expect(session.getSnapshot().context.pendingInteraction).toMatchObject({ questionId: 'question-1', status: 'pending' });
    expect(agent?.getSnapshot().matches('waiting')).toBe(true);
    expect(visibleEvents).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'runtimeCompleted' }));
    expect(system.getRuntimeCapabilities('runtime-1')).toBeUndefined();
    scope.stop();
    system.stop();
  });

  it('ignores events for runtimes that were not registered by the Actor system', (): void => {
    const system = createChatActorSystem();
    system.start();
    const visibleEvents = vi.fn();
    system.subscribeSessionEvents('session-1', visibleEvents);
    const scope = effectScope();
    scope.run((): void => {
      useChatRuntimeEvents(system);
    });

    runtimeListeners.messageDeleted?.({ ...createEventBase(), messageId: 'assistant-1' });

    expect(visibleEvents).not.toHaveBeenCalled();
    scope.stop();
    system.stop();
  });
});
