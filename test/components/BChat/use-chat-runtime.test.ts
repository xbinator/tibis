/**
 * @file use-chat-runtime.test.ts
 * @description BChat 主进程 ChatRuntime renderer hook 测试。
 * @vitest-environment jsdom
 */
import type { AIToolContext, AIToolExecutor } from 'types/ai';
import type { ChatMessageRecord } from 'types/chat';
import type { ChatRuntimeEventMap, ChatRuntimeMessageDeletedEvent, ChatRuntimeMessageEvent, ChatRuntimeToolRequestEvent } from 'types/chat-runtime';
import { effectScope, ref } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatRuntime } from '@/components/BChat/hooks/useChatRuntime';
import type { Message } from '@/components/BChat/utils/types';

/** Runtime 事件监听器集合。 */
interface RuntimeListeners {
  /** 消息创建监听器。 */
  messageCreated?: (event: ChatRuntimeMessageEvent) => void;
  /** 消息更新监听器。 */
  messageUpdated?: (event: ChatRuntimeMessageEvent) => void;
  /** 消息删除监听器。 */
  messageDeleted?: (event: ChatRuntimeMessageDeletedEvent) => void;
  /** 完成监听器。 */
  complete?: (event: ChatRuntimeEventMap['chat:runtime:complete']) => void;
  /** 错误监听器。 */
  error?: (event: ChatRuntimeEventMap['chat:runtime:error']) => void;
  /** 上下文用量监听器。 */
  contextUsage?: (event: ChatRuntimeEventMap['chat:runtime:context-usage-updated']) => void;
  /** 工具请求监听器。 */
  toolRequest?: (event: ChatRuntimeToolRequestEvent) => void;
}

const listeners = vi.hoisted<RuntimeListeners>(() => ({}));
const executeToolCallMock = vi.hoisted(() =>
  vi.fn(async () => ({
    toolCallId: 'tool-call-1',
    toolName: 'read_file',
    input: { path: 'src/index.ts' },
    result: { toolName: 'read_file', status: 'success' as const, data: { content: 'ok' } }
  }))
);
const electronAPIMock = vi.hoisted(() => ({
  chatRuntimeSend: vi.fn(),
  chatRuntimeContinue: vi.fn(),
  chatRuntimeAbort: vi.fn(),
  chatRuntimeSubmitToolResult: vi.fn(),
  chatRuntimeOnMessageCreated: vi.fn((callback: (event: ChatRuntimeMessageEvent) => void) => {
    listeners.messageCreated = callback;
    return vi.fn();
  }),
  chatRuntimeOnMessageUpdated: vi.fn((callback: (event: ChatRuntimeMessageEvent) => void) => {
    listeners.messageUpdated = callback;
    return vi.fn();
  }),
  chatRuntimeOnMessageDeleted: vi.fn((callback: (event: ChatRuntimeMessageDeletedEvent) => void) => {
    listeners.messageDeleted = callback;
    return vi.fn();
  }),
  chatRuntimeOnComplete: vi.fn((callback: (event: ChatRuntimeEventMap['chat:runtime:complete']) => void) => {
    listeners.complete = callback;
    return vi.fn();
  }),
  chatRuntimeOnError: vi.fn((callback: (event: ChatRuntimeEventMap['chat:runtime:error']) => void) => {
    listeners.error = callback;
    return vi.fn();
  }),
  chatRuntimeOnContextUsageUpdated: vi.fn((callback: (event: ChatRuntimeEventMap['chat:runtime:context-usage-updated']) => void) => {
    listeners.contextUsage = callback;
    return vi.fn();
  }),
  chatRuntimeOnToolRequest: vi.fn((callback: (event: ChatRuntimeToolRequestEvent) => void) => {
    listeners.toolRequest = callback;
    return vi.fn();
  })
}));

vi.mock('@/ai/tools/stream', () => ({
  executeToolCall: executeToolCallMock
}));

vi.mock('@/shared/platform/electron-api', () => ({
  getElectronAPI: vi.fn(() => electronAPIMock)
}));

/**
 * 创建测试消息。
 * @param overrides - 覆盖字段
 * @returns 测试消息
 */
function createMessage(overrides: Partial<ChatMessageRecord>): ChatMessageRecord {
  return {
    id: 'message-1',
    sessionId: 'session-1',
    role: 'assistant',
    content: '',
    parts: [],
    createdAt: '2026-06-19T00:00:00.000Z',
    ...overrides
  };
}

describe('useChatRuntime', (): void => {
  beforeEach((): void => {
    listeners.messageCreated = undefined;
    listeners.messageUpdated = undefined;
    listeners.messageDeleted = undefined;
    listeners.complete = undefined;
    listeners.error = undefined;
    listeners.contextUsage = undefined;
    listeners.toolRequest = undefined;
    executeToolCallMock.mockClear();
    electronAPIMock.chatRuntimeSend.mockReset();
    electronAPIMock.chatRuntimeContinue.mockReset();
    electronAPIMock.chatRuntimeAbort.mockReset();
    electronAPIMock.chatRuntimeSubmitToolResult.mockReset();
    electronAPIMock.chatRuntimeOnMessageCreated.mockClear();
    electronAPIMock.chatRuntimeOnMessageUpdated.mockClear();
    electronAPIMock.chatRuntimeOnMessageDeleted.mockClear();
    electronAPIMock.chatRuntimeOnComplete.mockClear();
    electronAPIMock.chatRuntimeOnError.mockClear();
    electronAPIMock.chatRuntimeOnContextUsageUpdated.mockClear();
    electronAPIMock.chatRuntimeOnToolRequest.mockClear();
    electronAPIMock.chatRuntimeSend.mockResolvedValue({
      ok: true,
      data: { runtimeId: 'runtime-1', sessionId: 'session-1' }
    });
    electronAPIMock.chatRuntimeContinue.mockResolvedValue({
      ok: true,
      data: { runtimeId: 'runtime-continued', sessionId: 'session-1' }
    });
    electronAPIMock.chatRuntimeAbort.mockResolvedValue({ ok: true });
    electronAPIMock.chatRuntimeSubmitToolResult.mockResolvedValue({ ok: true });
  });

  afterEach((): void => {
    vi.useRealTimers();
  });

  it('sends through main process runtime and applies runtime message events', async (): Promise<void> => {
    const messages = ref<Message[]>([]);
    const onComplete = vi.fn();
    const scope = effectScope();

    await scope.run(async () => {
      const runtime = useChatRuntime({
        messages,
        getSessionId: () => 'session-1',
        onComplete
      });

      const result = await runtime.send({
        sessionId: 'session-1',
        content: 'hello',
        userMessageId: 'user-1',
        userMessageCreatedAt: '2026-06-19T00:00:00.000Z'
      });

      expect(result).toEqual({ runtimeId: 'runtime-1', sessionId: 'session-1' });
      expect(electronAPIMock.chatRuntimeSend).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'session-1',
          clientId: 'bchat',
          agentId: 'default',
          content: 'hello',
          userMessageId: 'user-1'
        })
      );

      listeners.messageCreated?.({
        runtimeId: 'runtime-1',
        sessionId: 'session-1',
        clientId: 'bchat',
        agentId: 'default',
        message: createMessage({ id: 'user-1', role: 'user', content: 'hello', parts: [{ type: 'text', text: 'hello' }], runtimeId: 'runtime-1' })
      });
      listeners.messageCreated?.({
        runtimeId: 'runtime-1',
        sessionId: 'session-1',
        clientId: 'bchat',
        agentId: 'default',
        message: createMessage({ id: 'assistant-1', runtimeId: 'runtime-1', loading: true, finished: false })
      });
      listeners.messageUpdated?.({
        runtimeId: 'runtime-1',
        sessionId: 'session-1',
        clientId: 'bchat',
        agentId: 'default',
        message: createMessage({
          id: 'assistant-1',
          runtimeId: 'runtime-1',
          content: 'answer',
          parts: [{ type: 'text', text: 'answer' }],
          loading: false,
          finished: true
        })
      });
      listeners.complete?.({
        runtimeId: 'runtime-1',
        sessionId: 'session-1',
        clientId: 'bchat',
        agentId: 'default'
      });

      expect(messages.value).toEqual([
        expect.objectContaining({ id: 'user-1', content: 'hello' }),
        expect.objectContaining({ id: 'assistant-1', content: 'answer', finished: true })
      ]);
      expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ id: 'assistant-1', content: 'answer' }));
    });

    scope.stop();
  });

  it('removes a local runtime message when the main process deletes it', (): void => {
    const messages = ref<Message[]>([
      createMessage({ id: 'user-1', role: 'user', content: 'hello', parts: [{ type: 'text', text: 'hello' }] }) as Message,
      createMessage({ id: 'assistant-1', role: 'assistant', content: '', parts: [], runtimeId: 'runtime-1' }) as Message
    ]);
    const scope = effectScope();

    scope.run(() => {
      useChatRuntime({
        messages,
        getSessionId: () => 'session-1'
      });

      listeners.messageDeleted?.({
        runtimeId: 'runtime-1',
        sessionId: 'session-1',
        clientId: 'bchat',
        agentId: 'default',
        messageId: 'assistant-1'
      });

      expect(messages.value).toEqual([expect.objectContaining({ id: 'user-1' })]);
    });

    scope.stop();
  });

  it('continues a paused assistant turn through main process runtime', async (): Promise<void> => {
    const messages = ref<Message[]>([
      createMessage({ id: 'user-1', role: 'user', content: 'choose', parts: [{ type: 'text', text: 'choose' }] }) as Message,
      createMessage({ id: 'assistant-1', role: 'assistant', content: '', parts: [] }) as Message
    ]);
    const scope = effectScope();

    await scope.run(async () => {
      const runtime = useChatRuntime({
        messages,
        getSessionId: () => 'session-1'
      });

      const result = await runtime.continueTurn({
        sessionId: 'session-1',
        messages: messages.value,
        contextWindow: 200000,
        system: 'memory'
      });

      expect(result).toEqual({ runtimeId: 'runtime-continued', sessionId: 'session-1' });
      expect(electronAPIMock.chatRuntimeContinue).toHaveBeenCalledWith({
        sessionId: 'session-1',
        messages: messages.value,
        contextWindow: 200000,
        system: 'memory',
        clientId: 'bchat',
        agentId: 'default'
      });
      expect(runtime.activeRuntimeId.value).toBe('runtime-continued');
    });

    scope.stop();
  });

  it('passes structured-cloneable message snapshots when continuing a turn', async (): Promise<void> => {
    const userMessage = createMessage({ id: 'user-1', role: 'user', content: 'choose', parts: [{ type: 'text', text: 'choose' }] }) as Message;
    userMessage.references = [
      {
        token: '{{file-ref:ref-1}}',
        path: 'src/index.ts',
        startLine: 1,
        endLine: 1,
        fullContent: 'hello',
        selectedContent: 'hello'
      }
    ];
    const messages = ref<Message[]>([userMessage, createMessage({ id: 'assistant-1', role: 'assistant', content: '', parts: [] }) as Message]);
    const scope = effectScope();

    await scope.run(async () => {
      const runtime = useChatRuntime({
        messages,
        getSessionId: () => 'session-1'
      });

      await runtime.continueTurn({
        sessionId: 'session-1',
        messages: messages.value,
        contextWindow: 200000
      });

      const [continueInput] = electronAPIMock.chatRuntimeContinue.mock.calls[0];
      expect(() => structuredClone(continueInput)).not.toThrow();
      expect(continueInput.messages[0]).toEqual(
        expect.objectContaining({
          id: 'user-1',
          sessionId: 'session-1',
          role: 'user',
          content: 'choose',
          parts: [{ type: 'text', text: 'choose' }]
        })
      );
      expect('references' in continueInput.messages[0]).toBe(false);
    });

    scope.stop();
  });

  it('keeps the active runtime when abort command fails', async (): Promise<void> => {
    const messages = ref<Message[]>([]);
    const scope = effectScope();

    await scope.run(async () => {
      const runtime = useChatRuntime({
        messages,
        getSessionId: () => 'session-1'
      });

      await runtime.send({
        sessionId: 'session-1',
        content: 'hello'
      });
      electronAPIMock.chatRuntimeAbort.mockResolvedValueOnce({ ok: false, error: 'abort failed', code: 'ABORT_FAILED' });

      await expect(runtime.abort()).rejects.toThrow('abort failed');
      expect(electronAPIMock.chatRuntimeAbort).toHaveBeenCalledWith({ runtimeId: 'runtime-1' });
      expect(runtime.activeRuntimeId.value).toBe('runtime-1');
    });

    scope.stop();
  });

  it('clears the active runtime when abort command succeeds without data', async (): Promise<void> => {
    const messages = ref<Message[]>([]);
    const scope = effectScope();

    await scope.run(async () => {
      const runtime = useChatRuntime({
        messages,
        getSessionId: () => 'session-1'
      });

      await runtime.send({
        sessionId: 'session-1',
        content: 'hello'
      });

      await expect(runtime.abort()).resolves.toBeUndefined();
      expect(electronAPIMock.chatRuntimeAbort).toHaveBeenCalledWith({ runtimeId: 'runtime-1' });
      expect(runtime.activeRuntimeId.value).toBeNull();
    });

    scope.stop();
  });

  it('forwards context usage updates for the current session', async (): Promise<void> => {
    const messages = ref<Message[]>([]);
    const onContextUsageUpdated = vi.fn();
    const scope = effectScope();

    await scope.run(async () => {
      useChatRuntime({
        messages,
        getSessionId: () => 'session-1',
        onContextUsageUpdated
      });

      listeners.contextUsage?.({
        runtimeId: 'runtime-1',
        sessionId: 'session-1',
        clientId: 'bchat',
        agentId: 'default',
        snapshot: {
          runtimeId: 'runtime-1',
          sessionId: 'session-1',
          agentId: 'default',
          contextWindow: 128000,
          reservedOutputTokens: 8192,
          compactionBufferTokens: 4000,
          usableInputTokens: 115808,
          estimatedInputTokens: 1000,
          usagePercent: 1,
          remainingInputTokens: 114808,
          status: 'safe',
          shouldCompactBeforeSend: false
        }
      });

      expect(onContextUsageUpdated).toHaveBeenCalledWith(expect.objectContaining({ contextWindow: 128000, estimatedInputTokens: 1000 }));
    });

    scope.stop();
  });

  it('executes runtime tool requests through renderer tools and submits the result', async (): Promise<void> => {
    const messages = ref<Message[]>([]);
    const tool: AIToolExecutor = {
      definition: {
        name: 'read_file',
        description: 'Read file',
        source: 'builtin',
        riskLevel: 'read',
        parameters: { type: 'object', properties: {} }
      },
      execute: vi.fn()
    };
    const context: AIToolContext = {
      document: {
        id: 'doc-1',
        title: 'index.ts',
        path: '/workspace/src/index.ts',
        getContent: () => ''
      },
      editor: {
        getSelection: () => null,
        insertAtCursor: vi.fn(),
        replaceSelection: vi.fn(),
        replaceDocument: vi.fn()
      }
    };
    const scope = effectScope();

    await scope.run(async () => {
      useChatRuntime({
        messages,
        getSessionId: () => 'session-1',
        tools: [tool],
        getToolContext: () => context
      });

      listeners.toolRequest?.({
        runtimeId: 'runtime-1',
        sessionId: 'session-1',
        clientId: 'bchat',
        agentId: 'default',
        toolCallId: 'tool-call-1',
        toolName: 'read_file',
        input: { path: 'src/index.ts' }
      });
      await Promise.resolve();

      expect(executeToolCallMock).toHaveBeenCalledWith({ toolCallId: 'tool-call-1', toolName: 'read_file', input: { path: 'src/index.ts' } }, [tool], context);
      expect(electronAPIMock.chatRuntimeSubmitToolResult).toHaveBeenCalledWith({
        runtimeId: 'runtime-1',
        toolCallId: 'tool-call-1',
        result: { toolName: 'read_file', status: 'success', data: { content: 'ok' } }
      });
    });

    scope.stop();
  });
});
