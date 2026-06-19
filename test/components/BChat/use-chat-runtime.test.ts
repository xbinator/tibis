/**
 * @file use-chat-runtime.test.ts
 * @description BChat 主进程 ChatRuntime renderer hook 测试。
 * @vitest-environment jsdom
 */
import type { AIToolContext, AIToolExecutor } from 'types/ai';
import type { ChatMessageRecord } from 'types/chat';
import type {
  ChatRuntimeBridgeRequestEvent,
  ChatRuntimeConfirmationRequestEvent,
  ChatRuntimeEventMap,
  ChatRuntimeMessageDeletedEvent,
  ChatRuntimeMessageEvent,
  ChatRuntimeToolRequestEvent
} from 'types/chat-runtime';
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
  /** 确认请求监听器。 */
  confirmationRequest?: (event: ChatRuntimeConfirmationRequestEvent) => void;
  /** Bridge 请求监听器。 */
  bridgeRequest?: (event: ChatRuntimeBridgeRequestEvent) => void;
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
  chatRuntimeSubmitUserChoice: vi.fn(),
  chatRuntimeSubmitConfirmation: vi.fn(),
  chatRuntimeSubmitBridgeResponse: vi.fn(),
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
  }),
  chatRuntimeOnConfirmationRequested: vi.fn((callback: (event: ChatRuntimeConfirmationRequestEvent) => void) => {
    listeners.confirmationRequest = callback;
    return vi.fn();
  }),
  chatRuntimeOnBridgeRequested: vi.fn((callback: (event: ChatRuntimeBridgeRequestEvent) => void) => {
    listeners.bridgeRequest = callback;
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
    listeners.confirmationRequest = undefined;
    listeners.bridgeRequest = undefined;
    executeToolCallMock.mockClear();
    electronAPIMock.chatRuntimeSend.mockReset();
    electronAPIMock.chatRuntimeContinue.mockReset();
    electronAPIMock.chatRuntimeSubmitUserChoice.mockReset();
    electronAPIMock.chatRuntimeSubmitConfirmation.mockReset();
    electronAPIMock.chatRuntimeSubmitBridgeResponse.mockReset();
    electronAPIMock.chatRuntimeAbort.mockReset();
    electronAPIMock.chatRuntimeSubmitToolResult.mockReset();
    electronAPIMock.chatRuntimeOnMessageCreated.mockClear();
    electronAPIMock.chatRuntimeOnMessageUpdated.mockClear();
    electronAPIMock.chatRuntimeOnMessageDeleted.mockClear();
    electronAPIMock.chatRuntimeOnComplete.mockClear();
    electronAPIMock.chatRuntimeOnError.mockClear();
    electronAPIMock.chatRuntimeOnContextUsageUpdated.mockClear();
    electronAPIMock.chatRuntimeOnToolRequest.mockClear();
    electronAPIMock.chatRuntimeOnConfirmationRequested.mockClear();
    electronAPIMock.chatRuntimeOnBridgeRequested.mockClear();
    electronAPIMock.chatRuntimeSend.mockResolvedValue({
      ok: true,
      data: { runtimeId: 'runtime-1', sessionId: 'session-1' }
    });
    electronAPIMock.chatRuntimeContinue.mockResolvedValue({
      ok: true,
      data: { runtimeId: 'runtime-continued', sessionId: 'session-1' }
    });
    electronAPIMock.chatRuntimeSubmitUserChoice.mockResolvedValue({
      ok: true,
      data: { runtimeId: 'runtime-choice', sessionId: 'session-1' }
    });
    electronAPIMock.chatRuntimeSubmitConfirmation.mockResolvedValue({ ok: true });
    electronAPIMock.chatRuntimeSubmitBridgeResponse.mockResolvedValue({ ok: true });
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

  it('keeps runtime messages in display order when events arrive out of order', (): void => {
    const messages = ref<Message[]>([]);
    const scope = effectScope();

    scope.run(() => {
      useChatRuntime({
        messages,
        getSessionId: () => 'session-1'
      });

      listeners.messageCreated?.({
        runtimeId: 'runtime-1',
        sessionId: 'session-1',
        clientId: 'bchat',
        agentId: 'default',
        message: createMessage({ id: 'assistant-1', runtimeId: 'runtime-1', loading: true, finished: false })
      });
      listeners.messageCreated?.({
        runtimeId: 'runtime-1',
        sessionId: 'session-1',
        clientId: 'bchat',
        agentId: 'default',
        message: createMessage({ id: 'user-1', role: 'user', content: 'hello', parts: [{ type: 'text', text: 'hello' }], runtimeId: 'runtime-1' })
      });

      expect(messages.value.map((message) => message.id)).toEqual(['user-1', 'assistant-1']);
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

  it('submits user choice answers through main process runtime without sending message snapshots', async (): Promise<void> => {
    const messages = ref<Message[]>([]);
    const scope = effectScope();

    await scope.run(async () => {
      const runtime = useChatRuntime({
        messages,
        getSessionId: () => 'session-1'
      });

      const result = await runtime.submitUserChoice({
        sessionId: 'session-1',
        contextWindow: 200000,
        answer: {
          questionId: 'question-1',
          toolCallId: 'tool-call-1',
          answers: ['yes'],
          otherText: ''
        }
      });

      expect(result).toEqual({ runtimeId: 'runtime-choice', sessionId: 'session-1' });
      expect(electronAPIMock.chatRuntimeSubmitUserChoice).toHaveBeenCalledWith({
        sessionId: 'session-1',
        contextWindow: 200000,
        clientId: 'bchat',
        agentId: 'default',
        answer: {
          questionId: 'question-1',
          toolCallId: 'tool-call-1',
          answers: ['yes'],
          otherText: ''
        }
      });
      expect(electronAPIMock.chatRuntimeSubmitUserChoice.mock.calls[0]?.[0]).not.toHaveProperty('messages');
      expect(runtime.activeRuntimeId.value).toBe('runtime-choice');
    });

    scope.stop();
  });

  it('routes runtime confirmation requests to the confirmation callback and submits decisions', async (): Promise<void> => {
    const messages = ref<Message[]>([]);
    const requestConfirmation = vi.fn(async () => ({ approved: true as const, grantScope: 'session' as const }));
    const scope = effectScope();

    await scope.run(async () => {
      useChatRuntime({
        messages,
        getSessionId: () => 'session-1',
        requestConfirmation
      });

      listeners.confirmationRequest?.({
        runtimeId: 'runtime-1',
        sessionId: 'session-1',
        clientId: 'bchat',
        agentId: 'default',
        confirmationId: 'confirmation-1',
        toolCallId: 'tool-call-1',
        request: {
          toolCallId: 'tool-call-1',
          toolName: 'write_file',
          title: '写入文件',
          description: '是否写入？',
          riskLevel: 'write'
        }
      });
      await Promise.resolve();

      expect(requestConfirmation).toHaveBeenCalledWith(
        expect.objectContaining({
          toolName: 'write_file',
          title: '写入文件'
        })
      );
      expect(electronAPIMock.chatRuntimeSubmitConfirmation).toHaveBeenCalledWith({
        runtimeId: 'runtime-1',
        confirmationId: 'confirmation-1',
        decision: { approved: true, grantScope: 'session' }
      });
    });

    scope.stop();
  });

  it('routes runtime bridge requests to the bridge handler and submits responses', async (): Promise<void> => {
    const messages = ref<Message[]>([]);
    const handleBridgeRequest = vi.fn(async () => ({ title: 'index.ts', content: 'hello' }));
    const scope = effectScope();

    await scope.run(async () => {
      useChatRuntime({
        messages,
        getSessionId: () => 'session-1',
        handleBridgeRequest
      });

      listeners.bridgeRequest?.({
        runtimeId: 'runtime-1',
        sessionId: 'session-1',
        clientId: 'bchat',
        agentId: 'default',
        requestId: 'bridge-1',
        toolCallId: 'tool-call-1',
        kind: 'document-snapshot',
        payload: { includeSelection: true }
      });
      await Promise.resolve();

      expect(handleBridgeRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'document-snapshot',
          payload: { includeSelection: true }
        })
      );
      expect(electronAPIMock.chatRuntimeSubmitBridgeResponse).toHaveBeenCalledWith({
        runtimeId: 'runtime-1',
        requestId: 'bridge-1',
        result: {
          status: 'success',
          data: { title: 'index.ts', content: 'hello' }
        }
      });
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

  it('preserves renderer tool error codes when submitting failed runtime tool results', async (): Promise<void> => {
    const messages = ref<Message[]>([]);
    const scope = effectScope();
    const error = new Error('用户取消确认') as Error & { code: string };
    error.code = 'CONFIRMATION_DISMISSED';
    executeToolCallMock.mockRejectedValueOnce(error);

    await scope.run(async () => {
      useChatRuntime({
        messages,
        getSessionId: () => 'session-1',
        tools: []
      });

      listeners.toolRequest?.({
        runtimeId: 'runtime-1',
        sessionId: 'session-1',
        clientId: 'bchat',
        agentId: 'default',
        toolCallId: 'tool-call-1',
        toolName: 'write_file',
        input: { path: 'src/index.ts' }
      });
      await Promise.resolve();

      expect(electronAPIMock.chatRuntimeSubmitToolResult).toHaveBeenCalledWith({
        runtimeId: 'runtime-1',
        toolCallId: 'tool-call-1',
        result: {
          toolName: 'write_file',
          status: 'failure',
          error: {
            code: 'CONFIRMATION_DISMISSED',
            message: '用户取消确认'
          }
        }
      });
    });

    scope.stop();
  });

  it('fails same-client runtime tool requests when the session has switched', async (): Promise<void> => {
    const messages = ref<Message[]>([]);
    const scope = effectScope();

    await scope.run(async () => {
      useChatRuntime({
        messages,
        getSessionId: () => 'session-2',
        tools: []
      });

      listeners.toolRequest?.({
        runtimeId: 'runtime-1',
        sessionId: 'session-1',
        clientId: 'bchat',
        agentId: 'default',
        toolCallId: 'tool-call-1',
        toolName: 'read_current_document',
        input: {}
      });
      await Promise.resolve();

      expect(executeToolCallMock).not.toHaveBeenCalled();
      expect(electronAPIMock.chatRuntimeSubmitToolResult).toHaveBeenCalledWith({
        runtimeId: 'runtime-1',
        toolCallId: 'tool-call-1',
        result: {
          toolName: 'read_current_document',
          status: 'failure',
          error: {
            code: 'EDITOR_UNAVAILABLE',
            message: '当前会话已切换，无法执行工具'
          }
        }
      });
    });

    scope.stop();
  });
});
