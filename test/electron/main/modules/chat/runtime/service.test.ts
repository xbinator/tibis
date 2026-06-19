/**
 * @file service.test.ts
 * @description ChatRuntime 主进程服务骨架测试。
 */
import type { ChatRuntimeStreamExecutor } from '../../../../../../electron/main/modules/chat/runtime/types.mjs';
import type { AIServiceError } from 'types/ai';
import type { ChatMessageRecord } from 'types/chat';
import type { ChatRuntimeContinueInput, ChatRuntimeEventMap, ChatRuntimeSendInput } from 'types/chat-runtime';
import { describe, expect, it, vi } from 'vitest';
import { createChatRuntimeService } from '../../../../../../electron/main/modules/chat/runtime/service.mjs';

/** 已捕获的 runtime 事件。 */
type CapturedRuntimeEvent = {
  /** 事件名。 */
  name: keyof ChatRuntimeEventMap;
  /** 事件载荷。 */
  payload: ChatRuntimeEventMap[keyof ChatRuntimeEventMap];
};

/**
 * 创建发送入参测试夹具。
 * @param overrides - 需要覆盖的发送字段
 * @returns runtime send 输入
 */
function createInput(overrides: Partial<ChatRuntimeSendInput> = {}): ChatRuntimeSendInput {
  return {
    sessionId: 'session-1',
    clientId: 'client-1',
    agentId: 'agent-1',
    content: 'hello',
    ...overrides
  };
}

/**
 * 创建续轮入参测试夹具。
 * @param overrides - 需要覆盖的续轮字段
 * @returns runtime continue 输入
 */
function createContinueInput(overrides: Partial<ChatRuntimeContinueInput> = {}): ChatRuntimeContinueInput {
  return {
    sessionId: 'session-1',
    clientId: 'client-1',
    agentId: 'agent-1',
    messages: [],
    ...overrides
  };
}

/**
 * 创建聊天消息记录测试夹具。
 * @param id - 消息 ID
 * @param role - 消息角色
 * @param content - 文本内容
 * @param createdAt - 创建时间
 * @returns 聊天消息记录
 */
function createMessageRecord(id: string, role: ChatMessageRecord['role'], content: string, createdAt: string): ChatMessageRecord {
  return {
    id,
    sessionId: 'session-1',
    role,
    content,
    parts: content ? [{ type: 'text', text: content }] : [],
    createdAt,
    finished: true
  };
}

/**
 * 创建收集 runtime 事件的 emitter。
 * @returns 事件列表与 emitter
 */
function createEventCollector(): {
  events: CapturedRuntimeEvent[];
  emit: <TName extends keyof ChatRuntimeEventMap>(name: TName, payload: ChatRuntimeEventMap[TName]) => void;
} {
  const events: CapturedRuntimeEvent[] = [];

  return {
    events,
    emit: <TName extends keyof ChatRuntimeEventMap>(name: TName, payload: ChatRuntimeEventMap[TName]): void => {
      events.push({ name, payload });
    }
  };
}

/**
 * 创建测试用 no-op 消息写入器。
 * @returns no-op 消息写入器
 */
function createNoopMessageWriter(): { addMessage: () => void; updateMessage: () => void } {
  return {
    addMessage: (): void => undefined,
    updateMessage: (): void => undefined
  };
}

/**
 * 创建测试用 no-op 消息读取器。
 * @returns no-op 消息读取器
 */
function createNoopMessageReader(): { getMessages: () => [] } {
  return {
    getMessages: (): [] => []
  };
}

/**
 * 创建测试用 no-op 流式执行器。
 * @returns no-op 流式执行器
 */
function createNoopStreamExecutor(): ChatRuntimeStreamExecutor {
  return async (): Promise<{}> => ({});
}

/**
 * 创建可手动完成的 Promise。
 * @returns Promise 与完成函数
 */
function createDeferred(): { promise: Promise<void>; resolve: () => void } {
  let resolvePromise: () => void = () => undefined;
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });

  return { promise, resolve: resolvePromise };
}

/**
 * 等待后台 runtime microtask 完成。
 */
async function flushRuntimeTasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

describe('chat runtime service shell', (): void => {
  it('auto-names a session through the main process model path', async (): Promise<void> => {
    const updateSessionTitle = vi.fn();
    const generateText = vi.fn().mockResolvedValue([undefined, { text: '"运行时标题"', usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } }]);
    const service = createChatRuntimeService({
      emit: vi.fn(),
      messageWriter: createNoopMessageWriter(),
      messageReader: createNoopMessageReader(),
      streamExecutor: createNoopStreamExecutor(),
      autoNameResolveModel: async () => ({
        createOptions: {
          providerId: 'provider-1',
          providerName: 'Provider',
          apiKey: 'key',
          baseUrl: 'https://example.com',
          providerType: 'openai'
        },
        modelId: 'model-1'
      }),
      autoNameGenerateText: generateText,
      autoNameUpdateSessionTitle: updateSessionTitle
    });

    const result = await service.autoName({
      sessionId: 'session-1',
      userMessage: '用户问题',
      aiResponse: 'AI回答'
    });

    expect(generateText).toHaveBeenCalledWith(
      expect.objectContaining({ providerId: 'provider-1' }),
      expect.objectContaining({
        modelId: 'model-1',
        prompt: expect.stringContaining('用户问题')
      })
    );
    expect(generateText.mock.calls[0][1].prompt).toContain('AI回答');
    expect(updateSessionTitle).toHaveBeenCalledWith('session-1', '运行时标题');
    expect(result).toEqual({ status: 'success', title: '运行时标题' });
  });

  it('skips auto-name when no model config is available', async (): Promise<void> => {
    const generateText = vi.fn();
    const updateSessionTitle = vi.fn();
    const service = createChatRuntimeService({
      emit: vi.fn(),
      messageWriter: createNoopMessageWriter(),
      messageReader: createNoopMessageReader(),
      streamExecutor: createNoopStreamExecutor(),
      autoNameResolveModel: async () => null,
      autoNameGenerateText: generateText,
      autoNameUpdateSessionTitle: updateSessionTitle
    });

    await expect(service.autoName({ sessionId: 'session-1', userMessage: '用户问题', aiResponse: 'AI回答' })).resolves.toEqual({
      status: 'skipped',
      reason: 'no_model_config'
    });
    expect(generateText).not.toHaveBeenCalled();
    expect(updateSessionTitle).not.toHaveBeenCalled();
  });

  it('returns failed auto-name result when generation fails', async (): Promise<void> => {
    const error: AIServiceError = { code: 'REQUEST_FAILED', message: 'network failed' };
    const service = createChatRuntimeService({
      emit: vi.fn(),
      messageWriter: createNoopMessageWriter(),
      messageReader: createNoopMessageReader(),
      streamExecutor: createNoopStreamExecutor(),
      autoNameResolveModel: async () => ({
        createOptions: {
          providerId: 'provider-1',
          providerName: 'Provider',
          apiKey: 'key',
          baseUrl: 'https://example.com',
          providerType: 'openai'
        },
        modelId: 'model-1'
      }),
      autoNameGenerateText: async () => [error],
      autoNameUpdateSessionTitle: vi.fn()
    });

    await expect(service.autoName({ sessionId: 'session-1', userMessage: '用户问题', aiResponse: 'AI回答' })).resolves.toEqual({
      status: 'failed',
      errorMessage: 'network failed'
    });
  });

  it('passes workspaceRoot into active runtimes for main-process file tools', async (): Promise<void> => {
    const streamExecutor = vi.fn<ChatRuntimeStreamExecutor>(async () => ({}));
    const service = createChatRuntimeService({
      emit: vi.fn(),
      messageWriter: createNoopMessageWriter(),
      messageReader: createNoopMessageReader(),
      streamExecutor
    });

    await service.send(createInput({ content: 'read file', workspaceRoot: '/workspace' }));
    await flushRuntimeTasks();

    expect(streamExecutor).toHaveBeenCalledWith(
      expect.objectContaining({
        runtime: expect.objectContaining({ workspaceRoot: '/workspace' })
      }),
      expect.any(Function)
    );
  });

  it('starts a runtime and emits a complete event for the shell implementation', async (): Promise<void> => {
    const collector = createEventCollector();
    const service = createChatRuntimeService({
      emit: collector.emit,
      messageWriter: createNoopMessageWriter(),
      messageReader: createNoopMessageReader(),
      streamExecutor: createNoopStreamExecutor()
    });

    const result = await service.send(createInput());
    await flushRuntimeTasks();

    expect(result.runtimeId).toMatch(/^runtime-/);
    expect(result.sessionId).toBe('session-1');
    expect(collector.events).toContainEqual({
      name: 'chat:runtime:complete',
      payload: expect.objectContaining({
        runtimeId: result.runtimeId,
        sessionId: 'session-1',
        clientId: 'client-1',
        agentId: 'agent-1'
      })
    });
  });

  it('persists and emits user and assistant shell messages when sending', async (): Promise<void> => {
    const collector = createEventCollector();
    const persistedMessages: Array<ChatRuntimeEventMap['chat:runtime:message-created']['message']> = [];
    const service = createChatRuntimeService({
      emit: collector.emit,
      createMessageId: (role) => `${role}-message-1`,
      now: () => '2026-06-19T00:00:00.000Z',
      streamExecutor: createNoopStreamExecutor(),
      messageReader: createNoopMessageReader(),
      messageWriter: {
        addMessage: (message) => {
          persistedMessages.push(message);
        },
        updateMessage: (message) => {
          persistedMessages.push(message);
        }
      }
    });

    const result = await service.send(createInput({ content: 'hello runtime' }));
    await flushRuntimeTasks();

    expect(persistedMessages).toHaveLength(2);
    expect(persistedMessages[0]).toMatchObject({
      id: 'user-message-1',
      sessionId: 'session-1',
      role: 'user',
      content: 'hello runtime',
      parts: [{ type: 'text', text: 'hello runtime' }],
      runtimeId: result.runtimeId,
      agentId: 'agent-1',
      createdAt: '2026-06-19T00:00:00.000Z',
      finished: true
    });
    expect(persistedMessages[1]).toMatchObject({
      id: 'assistant-message-1',
      sessionId: 'session-1',
      role: 'assistant',
      content: '',
      parts: [],
      runtimeId: result.runtimeId,
      agentId: 'agent-1',
      createdAt: '2026-06-19T00:00:00.000Z',
      loading: true,
      finished: false
    });
    const createdMessageIds = collector.events.flatMap((event) => {
      if (event.name !== 'chat:runtime:message-created') return [];

      return [(event.payload as ChatRuntimeEventMap['chat:runtime:message-created']).message.id];
    });
    expect(createdMessageIds).toEqual(['user-message-1', 'assistant-message-1']);
  });

  it('uses renderer supplied user message identity when provided', async (): Promise<void> => {
    const collector = createEventCollector();
    const persistedMessages: Array<ChatRuntimeEventMap['chat:runtime:message-created']['message']> = [];
    const service = createChatRuntimeService({
      emit: collector.emit,
      createMessageId: (role) => `${role}-generated-message`,
      now: () => '2026-06-19T00:00:00.000Z',
      streamExecutor: createNoopStreamExecutor(),
      messageReader: createNoopMessageReader(),
      messageWriter: {
        addMessage: (message) => {
          persistedMessages.push(message);
        },
        updateMessage: (): void => undefined
      }
    });

    await service.send(
      createInput({
        userMessageId: 'renderer-user-message',
        userMessageCreatedAt: '2026-06-19T01:00:00.000Z'
      })
    );

    expect(persistedMessages[0]).toMatchObject({
      id: 'renderer-user-message',
      createdAt: '2026-06-19T01:00:00.000Z'
    });
    expect(persistedMessages[1]).toMatchObject({
      id: 'assistant-generated-message',
      createdAt: '2026-06-19T01:00:00.000Z'
    });
  });

  it('updates and completes assistant message through the runtime stream executor', async (): Promise<void> => {
    const collector = createEventCollector();
    const persistedMessages: Array<ChatRuntimeEventMap['chat:runtime:message-created']['message']> = [];
    const updatedMessages: Array<ChatRuntimeEventMap['chat:runtime:message-updated']['message']> = [];
    const service = createChatRuntimeService({
      emit: collector.emit,
      createMessageId: (role) => `${role}-message-1`,
      now: () => '2026-06-19T00:00:00.000Z',
      messageReader: createNoopMessageReader(),
      messageWriter: {
        addMessage: (message) => {
          persistedMessages.push({ ...message, parts: [...message.parts] });
        },
        updateMessage: (message) => {
          updatedMessages.push({ ...message, parts: [...message.parts] });
        }
      },
      streamExecutor: async ({ assistantMessage }, updateAssistant) => {
        assistantMessage.content = 'hello from model';
        assistantMessage.parts = [{ type: 'text', text: 'hello from model' }];
        assistantMessage.loading = false;
        assistantMessage.finished = true;
        assistantMessage.usage = { inputTokens: 3, outputTokens: 4, totalTokens: 7 };
        await updateAssistant(assistantMessage);

        return { usage: assistantMessage.usage };
      }
    });

    const result = await service.send(createInput({ content: 'hello runtime' }));
    await flushRuntimeTasks();

    expect(persistedMessages).toHaveLength(2);
    expect(updatedMessages).toHaveLength(1);
    expect(updatedMessages[0]).toMatchObject({
      id: 'assistant-message-1',
      runtimeId: result.runtimeId,
      content: 'hello from model',
      parts: [{ type: 'text', text: 'hello from model' }],
      loading: false,
      finished: true,
      usage: { inputTokens: 3, outputTokens: 4, totalTokens: 7 }
    });
    expect(collector.events).toContainEqual({
      name: 'chat:runtime:message-updated',
      payload: expect.objectContaining({
        runtimeId: result.runtimeId,
        message: expect.objectContaining({
          id: 'assistant-message-1',
          content: 'hello from model'
        })
      })
    });
    const completeEvent = collector.events.find((event) => event.name === 'chat:runtime:complete' && event.payload.runtimeId === result.runtimeId);
    expect(completeEvent?.payload).toMatchObject({
      usage: { inputTokens: 3, outputTokens: 4, totalTokens: 7 }
    });
  });

  it('auto-compacts after completion when provider usage exceeds usable input budget', async (): Promise<void> => {
    const collector = createEventCollector();
    const compact = vi.fn().mockResolvedValue({ status: 'success' as const, messageId: 'compression-1', recordId: 'record-1' });
    const service = createChatRuntimeService({
      emit: collector.emit,
      createMessageId: (role) => `${role}-message-1`,
      now: () => '2026-06-19T00:00:00.000Z',
      messageReader: createNoopMessageReader(),
      messageWriter: createNoopMessageWriter(),
      compactionService: { compact },
      streamExecutor: async ({ assistantMessage }, updateAssistant) => {
        assistantMessage.content = 'large answer';
        assistantMessage.parts = [{ type: 'text', text: 'large answer' }];
        assistantMessage.loading = false;
        assistantMessage.finished = true;
        assistantMessage.usage = { inputTokens: 6_000, outputTokens: 2_000, totalTokens: 8_000 };
        await updateAssistant(assistantMessage);

        return { usage: assistantMessage.usage };
      }
    });

    const result = await service.send(createInput({ content: 'hello runtime', contextWindow: 20_000 }));
    await flushRuntimeTasks();

    expect(compact).toHaveBeenCalledWith(
      expect.objectContaining({
        runtimeId: result.runtimeId,
        sessionId: 'session-1',
        clientId: 'client-1',
        agentId: 'agent-1',
        reason: 'auto',
        contextWindow: 20_000,
        messages: expect.arrayContaining([
          expect.objectContaining({ id: 'user-message-1', role: 'user' }),
          expect.objectContaining({ id: 'assistant-message-1', role: 'assistant', usage: { inputTokens: 6_000, outputTokens: 2_000, totalTokens: 8_000 } })
        ])
      })
    );
    const contextUsageEvent = collector.events
      .filter((event) => event.name === 'chat:runtime:context-usage-updated' && event.payload.runtimeId === result.runtimeId)
      .at(-1);
    expect(contextUsageEvent?.payload).toMatchObject({
      snapshot: expect.objectContaining({
        providerUsageTokens: 8_000,
        status: 'danger'
      })
    });
    expect(collector.events).toContainEqual(
      expect.objectContaining({
        name: 'chat:runtime:complete',
        payload: expect.objectContaining({ runtimeId: result.runtimeId, usage: { inputTokens: 6_000, outputTokens: 2_000, totalTokens: 8_000 } })
      })
    );
  });

  it('returns the runtime start result before the stream executor finishes', async (): Promise<void> => {
    const collector = createEventCollector();
    const streamDeferred = createDeferred();
    const service = createChatRuntimeService({
      emit: collector.emit,
      messageWriter: createNoopMessageWriter(),
      messageReader: createNoopMessageReader(),
      streamExecutor: async () => {
        await streamDeferred.promise;
        return {};
      }
    });

    const result = await Promise.race([
      service.send(createInput()),
      new Promise<'timeout'>((resolve) => {
        setTimeout(() => resolve('timeout'), 10);
      })
    ]);

    expect(result).not.toBe('timeout');
    if (result === 'timeout') return;
    expect(service.getActiveRuntime(result.runtimeId)?.status).toBe('running');

    streamDeferred.resolve();
    await Promise.resolve();
  });

  it('passes persisted session messages into the stream executor', async (): Promise<void> => {
    const collector = createEventCollector();
    const sourceMessagesByExecutor: Array<ChatRuntimeEventMap['chat:runtime:message-created']['message']> = [];
    const service = createChatRuntimeService({
      emit: collector.emit,
      messageWriter: createNoopMessageWriter(),
      messageReader: {
        getMessages: () => [
          {
            id: 'prior-user',
            sessionId: 'session-1',
            role: 'user',
            content: 'prior question',
            parts: [{ type: 'text', text: 'prior question' }],
            createdAt: '2026-06-19T00:00:00.000Z'
          }
        ]
      },
      streamExecutor: async ({ sourceMessages }) => {
        sourceMessagesByExecutor.push(...(sourceMessages ?? []));
        return {};
      }
    });

    await service.send(createInput({ content: 'current question' }));
    await flushRuntimeTasks();

    expect(sourceMessagesByExecutor).toEqual([
      expect.objectContaining({ id: 'prior-user', content: 'prior question' }),
      expect.objectContaining({ role: 'user', content: 'current question' })
    ]);
  });

  it('emits context usage before streaming with source messages', async (): Promise<void> => {
    const collector = createEventCollector();
    const service = createChatRuntimeService({
      emit: collector.emit,
      messageWriter: createNoopMessageWriter(),
      messageReader: {
        getMessages: () => [
          {
            id: 'prior-user',
            sessionId: 'session-1',
            role: 'user',
            content: 'prior question',
            parts: [{ type: 'text', text: 'prior question' }],
            createdAt: '2026-06-19T00:00:00.000Z'
          }
        ]
      },
      streamExecutor: createNoopStreamExecutor()
    });

    const result = await service.send(createInput({ content: 'current question', contextWindow: 128_000 }));
    await flushRuntimeTasks();

    const usageEvent = collector.events.find((event) => event.name === 'chat:runtime:context-usage-updated' && event.payload.runtimeId === result.runtimeId);
    expect(usageEvent?.payload).toMatchObject({
      runtimeId: result.runtimeId,
      sessionId: 'session-1',
      clientId: 'client-1',
      agentId: 'agent-1',
      snapshot: expect.objectContaining({
        runtimeId: result.runtimeId,
        sessionId: 'session-1',
        agentId: 'agent-1',
        contextWindow: 128_000,
        estimatedInputTokens: expect.any(Number),
        usagePercent: expect.any(Number)
      })
    });
  });

  it('runs automatic compaction before streaming when runtime context usage reaches danger', async (): Promise<void> => {
    const collector = createEventCollector();
    const operations: string[] = [];
    const priorMessage: ChatMessageRecord = {
      id: 'prior-user',
      sessionId: 'session-1',
      role: 'user',
      content: '大量历史上下文'.repeat(40_000),
      parts: [{ type: 'text', text: '大量历史上下文'.repeat(40_000) }],
      createdAt: '2026-06-19T00:00:00.000Z'
    };
    const compactedBoundary: ChatMessageRecord = {
      id: 'compression-1',
      sessionId: 'session-1',
      role: 'compression',
      content: 'COMPRESSED_CONTEXT',
      parts: [{ type: 'text', text: 'COMPRESSED_CONTEXT' }],
      createdAt: '2026-06-19T00:01:00.000Z',
      compression: {
        status: 'success',
        recordText: 'COMPRESSED_CONTEXT',
        coveredUntilMessageId: 'prior-user'
      }
    };
    const compact = vi.fn(async () => {
      operations.push('compact');
      return { status: 'success' as const, messageId: 'compression-1', recordId: 'record-1' };
    });
    const streamExecutor = vi.fn<ChatRuntimeStreamExecutor>(async () => {
      operations.push('stream');
      return {};
    });
    const getMessages = vi.fn<() => ChatMessageRecord[]>().mockReturnValueOnce([priorMessage]).mockReturnValueOnce([compactedBoundary, priorMessage]);
    const service = createChatRuntimeService({
      emit: collector.emit,
      createMessageId: (role) => `${role}-message-1`,
      now: () => '2026-06-19T00:00:00.000Z',
      messageWriter: createNoopMessageWriter(),
      messageReader: { getMessages },
      compactionService: { compact },
      streamExecutor
    });

    const result = await service.send(createInput({ content: 'current question', contextWindow: 20_000, userMessageId: 'current-user' }));
    await flushRuntimeTasks();

    expect(operations).toEqual(['compact', 'stream']);
    expect(compact).toHaveBeenCalledWith(
      expect.objectContaining({
        runtimeId: result.runtimeId,
        sessionId: 'session-1',
        clientId: 'client-1',
        agentId: 'agent-1',
        reason: 'auto',
        contextWindow: 20_000,
        messages: expect.arrayContaining([expect.objectContaining({ id: 'prior-user' }), expect.objectContaining({ id: 'current-user' })])
      })
    );
    expect(getMessages).toHaveBeenCalledTimes(2);
    expect(streamExecutor.mock.calls[0]?.[0].sourceMessages?.map((message) => message.id)).toEqual(['compression-1', 'prior-user', 'current-user']);
  });

  it('continues the runtime stream after renderer tool results are written', async (): Promise<void> => {
    const collector = createEventCollector();
    const streamExecutor = vi.fn<ChatRuntimeStreamExecutor>(async ({ assistantMessage }, updateAssistant) => {
      if (streamExecutor.mock.calls.length === 1) {
        assistantMessage.parts = [
          {
            type: 'tool',
            toolCallId: 'tool-call-1',
            toolName: 'read_file',
            status: 'done',
            input: { path: 'src/index.ts' },
            result: { toolName: 'read_file', status: 'success', data: { content: 'ok' } }
          }
        ];
        await updateAssistant(assistantMessage);
        return { shouldContinue: true };
      }

      assistantMessage.content = 'final answer';
      assistantMessage.parts = [...assistantMessage.parts, { type: 'text', text: 'final answer' }];
      assistantMessage.loading = false;
      assistantMessage.finished = true;
      await updateAssistant(assistantMessage);
      return {};
    });
    const service = createChatRuntimeService({
      emit: collector.emit,
      createMessageId: (role) => `${role}-message-1`,
      now: () => '2026-06-19T00:00:00.000Z',
      messageReader: createNoopMessageReader(),
      messageWriter: createNoopMessageWriter(),
      streamExecutor
    });

    const result = await service.send(createInput({ content: 'inspect file' }));
    await flushRuntimeTasks();

    expect(result.runtimeId).toMatch(/^runtime-/);
    expect(streamExecutor).toHaveBeenCalledTimes(2);
    expect(streamExecutor.mock.calls[1]?.[0].sourceMessages?.map((message) => message.id)).toEqual(['user-message-1', 'assistant-message-1']);
    expect(collector.events).toContainEqual(
      expect.objectContaining({
        name: 'chat:runtime:complete',
        payload: expect.objectContaining({ runtimeId: result.runtimeId })
      })
    );
  });

  it('waits for renderer confirmation decisions through the runtime confirmation bridge', async (): Promise<void> => {
    const collector = createEventCollector();
    const service = createChatRuntimeService({
      emit: collector.emit,
      messageWriter: createNoopMessageWriter(),
      messageReader: createNoopMessageReader(),
      streamExecutor: createNoopStreamExecutor(),
      keepRuntimeOpenForTest: true
    });

    const result = await service.send(createInput({ content: 'edit file' }));
    const decisionPromise = service.requestConfirmation({
      runtimeId: result.runtimeId,
      toolCallId: 'tool-call-1',
      confirmationId: 'confirmation-1',
      request: {
        toolCallId: 'tool-call-1',
        toolName: 'write_file',
        title: '写入文件',
        description: '是否写入 src/index.ts？',
        riskLevel: 'write'
      }
    });

    expect(collector.events).toContainEqual(
      expect.objectContaining({
        name: 'chat:runtime:confirmation-requested',
        payload: expect.objectContaining({
          runtimeId: result.runtimeId,
          sessionId: 'session-1',
          clientId: 'client-1',
          agentId: 'agent-1',
          toolCallId: 'tool-call-1',
          confirmationId: 'confirmation-1',
          request: expect.objectContaining({ toolName: 'write_file', title: '写入文件' })
        })
      })
    );

    service.submitConfirmation({
      runtimeId: result.runtimeId,
      confirmationId: 'confirmation-1',
      decision: { approved: true, grantScope: 'session' }
    });

    await expect(decisionPromise).resolves.toEqual({ approved: true, grantScope: 'session' });
  });

  it('keeps renderer confirmation requests pending until a decision is submitted', async (): Promise<void> => {
    vi.useFakeTimers();
    try {
      const collector = createEventCollector();
      const service = createChatRuntimeService({
        emit: collector.emit,
        messageWriter: createNoopMessageWriter(),
        messageReader: createNoopMessageReader(),
        streamExecutor: createNoopStreamExecutor(),
        keepRuntimeOpenForTest: true
      });

      const result = await service.send(createInput({ content: 'edit file' }));
      const decisionPromise = service.requestConfirmation({
        runtimeId: result.runtimeId,
        toolCallId: 'tool-call-timeout',
        confirmationId: 'confirmation-timeout',
        request: {
          toolCallId: 'tool-call-timeout',
          toolName: 'write_file',
          title: '写入文件',
          description: '是否写入 src/index.ts？',
          riskLevel: 'write'
        }
      });

      let settled = false;
      decisionPromise.then(() => {
        settled = true;
      });

      await vi.advanceTimersByTimeAsync(30_000);
      await Promise.resolve();

      expect(settled).toBe(false);
      service.submitConfirmation({
        runtimeId: result.runtimeId,
        confirmationId: 'confirmation-timeout',
        decision: { approved: true }
      });

      await expect(decisionPromise).resolves.toEqual({ approved: true });
    } finally {
      vi.useRealTimers();
    }
  });

  it('waits for renderer bridge responses through the runtime bridge', async (): Promise<void> => {
    const collector = createEventCollector();
    const service = createChatRuntimeService({
      emit: collector.emit,
      messageWriter: createNoopMessageWriter(),
      messageReader: createNoopMessageReader(),
      streamExecutor: createNoopStreamExecutor(),
      keepRuntimeOpenForTest: true
    });

    const result = await service.send(createInput({ content: 'read current document' }));
    const responsePromise = service.requestBridge({
      runtimeId: result.runtimeId,
      requestId: 'bridge-1',
      toolCallId: 'tool-call-1',
      kind: 'document-snapshot',
      payload: { includeSelection: true }
    });

    expect(collector.events).toContainEqual(
      expect.objectContaining({
        name: 'chat:runtime:bridge-requested',
        payload: expect.objectContaining({
          runtimeId: result.runtimeId,
          sessionId: 'session-1',
          clientId: 'client-1',
          agentId: 'agent-1',
          requestId: 'bridge-1',
          toolCallId: 'tool-call-1',
          kind: 'document-snapshot',
          payload: { includeSelection: true }
        })
      })
    );

    service.submitBridgeResponse({
      runtimeId: result.runtimeId,
      requestId: 'bridge-1',
      result: {
        status: 'success',
        data: { title: 'index.ts', content: 'hello' }
      }
    });

    await expect(responsePromise).resolves.toEqual({
      status: 'success',
      data: { title: 'index.ts', content: 'hello' }
    });
  });

  it('times out renderer bridge requests when no response is submitted', async (): Promise<void> => {
    vi.useFakeTimers();
    try {
      const collector = createEventCollector();
      const service = createChatRuntimeService({
        emit: collector.emit,
        messageWriter: createNoopMessageWriter(),
        messageReader: createNoopMessageReader(),
        streamExecutor: createNoopStreamExecutor(),
        keepRuntimeOpenForTest: true
      });

      const result = await service.send(createInput({ content: 'read current document' }));
      const responsePromise = service.requestBridge({
        runtimeId: result.runtimeId,
        requestId: 'bridge-timeout',
        toolCallId: 'tool-call-timeout',
        kind: 'document-snapshot',
        payload: { includeSelection: true }
      });

      await vi.advanceTimersByTimeAsync(30_000);

      await expect(responsePromise).resolves.toMatchObject({
        status: 'failure',
        error: { code: 'TOOL_TIMEOUT' }
      });
      expect(() =>
        service.submitBridgeResponse({
          runtimeId: result.runtimeId,
          requestId: 'bridge-timeout',
          result: { status: 'success', data: { title: 'late' } }
        })
      ).not.toThrow();
    } finally {
      vi.useRealTimers();
    }
  });

  it('prunes old large tool results after a successful turn', async (): Promise<void> => {
    const collector = createEventCollector();
    const updatedMessages: ChatMessageRecord[] = [];
    const largeContent = 'x'.repeat(12_000);
    const oldAssistant: ChatMessageRecord = {
      id: 'old-assistant',
      sessionId: 'session-1',
      role: 'assistant',
      content: '',
      parts: [
        {
          type: 'tool',
          toolCallId: 'tool-call-old',
          toolName: 'read_file',
          status: 'done',
          input: { path: 'src/large.ts' },
          result: {
            toolName: 'read_file',
            status: 'success',
            data: { path: 'src/large.ts', totalLines: 400, readLines: 400, content: largeContent }
          }
        }
      ],
      createdAt: '2026-06-19T00:00:01.000Z',
      finished: true
    };
    const recentAssistant: ChatMessageRecord = {
      id: 'recent-assistant',
      sessionId: 'session-1',
      role: 'assistant',
      content: '',
      parts: [
        {
          type: 'tool',
          toolCallId: 'tool-call-recent',
          toolName: 'read_file',
          status: 'done',
          input: { path: 'src/recent.ts' },
          result: {
            toolName: 'read_file',
            status: 'success',
            data: { path: 'src/recent.ts', totalLines: 1, readLines: 1, content: largeContent }
          }
        }
      ],
      createdAt: '2026-06-19T00:00:05.000Z',
      finished: true
    };
    const persistedMessages = [
      createMessageRecord('old-user', 'user', 'old question', '2026-06-19T00:00:00.000Z'),
      oldAssistant,
      createMessageRecord('middle-user', 'user', 'middle question', '2026-06-19T00:00:02.000Z'),
      createMessageRecord('middle-assistant', 'assistant', 'middle answer', '2026-06-19T00:00:03.000Z'),
      createMessageRecord('recent-user', 'user', 'recent question', '2026-06-19T00:00:04.000Z'),
      recentAssistant
    ];
    const service = createChatRuntimeService({
      emit: collector.emit,
      createMessageId: (role) => `${role}-message-1`,
      now: () => '2026-06-19T00:00:06.000Z',
      messageReader: { getMessages: () => persistedMessages },
      messageWriter: {
        addMessage: (): void => undefined,
        updateMessage: (message) => {
          updatedMessages.push({ ...message, parts: [...message.parts] });
        }
      },
      streamExecutor: async ({ assistantMessage }, updateAssistant) => {
        assistantMessage.content = 'done';
        assistantMessage.parts = [{ type: 'text', text: 'done' }];
        assistantMessage.loading = false;
        assistantMessage.finished = true;
        await updateAssistant(assistantMessage);
        return {};
      }
    });

    const result = await service.send(createInput({ content: 'current question' }));
    await flushRuntimeTasks();

    const prunedMessage = updatedMessages.find((message) => message.id === 'old-assistant');
    const oldToolPart = prunedMessage?.parts[0];
    expect(oldToolPart).toMatchObject({
      type: 'tool',
      toolCallId: 'tool-call-old',
      toolName: 'read_file',
      status: 'done',
      result: {
        toolName: 'read_file',
        status: 'success',
        data: expect.objectContaining({
          pruned: true,
          path: 'src/large.ts',
          totalLines: 400,
          readLines: 400
        })
      }
    });
    expect(JSON.stringify(oldToolPart)).not.toContain(largeContent);
    expect(updatedMessages.some((message) => message.id === 'recent-assistant')).toBe(false);
    expect(collector.events).toContainEqual(
      expect.objectContaining({
        name: 'chat:runtime:message-updated',
        payload: expect.objectContaining({
          runtimeId: result.runtimeId,
          message: expect.objectContaining({ id: 'old-assistant' })
        })
      })
    );
  });

  it('accumulates usage from multiple continuation stream rounds', async (): Promise<void> => {
    const collector = createEventCollector();
    const updatedMessages: ChatMessageRecord[] = [];
    const firstUsage = { inputTokens: 8, outputTokens: 5, totalTokens: 13 };
    const secondUsage = { inputTokens: 3, outputTokens: 4, totalTokens: 7 };
    const streamExecutor = vi.fn<ChatRuntimeStreamExecutor>(async ({ assistantMessage }, updateAssistant) => {
      if (streamExecutor.mock.calls.length === 1) {
        assistantMessage.parts = [
          {
            type: 'tool',
            toolCallId: 'tool-call-1',
            toolName: 'read_file',
            status: 'done',
            input: { path: 'src/index.ts' },
            result: { toolName: 'read_file', status: 'success', data: { content: 'ok' } }
          }
        ];
        assistantMessage.usage = firstUsage;
        await updateAssistant(assistantMessage);
        return { usage: firstUsage, shouldContinue: true };
      }

      assistantMessage.content = 'final answer';
      assistantMessage.parts = [...assistantMessage.parts, { type: 'text', text: 'final answer' }];
      assistantMessage.loading = false;
      assistantMessage.finished = true;
      assistantMessage.usage = secondUsage;
      await updateAssistant(assistantMessage);
      return { usage: secondUsage };
    });
    const service = createChatRuntimeService({
      emit: collector.emit,
      createMessageId: (role) => `${role}-message-1`,
      now: () => '2026-06-19T00:00:00.000Z',
      messageReader: createNoopMessageReader(),
      messageWriter: {
        addMessage: (): void => undefined,
        updateMessage: (message) => {
          updatedMessages.push({ ...message, parts: [...message.parts] });
        }
      },
      streamExecutor
    });

    const result = await service.send(createInput({ content: 'inspect file' }));
    await flushRuntimeTasks();

    const expectedUsage = { inputTokens: 11, outputTokens: 9, totalTokens: 20 };
    expect(updatedMessages.at(-1)?.usage).toEqual(expectedUsage);
    expect(collector.events).toContainEqual(
      expect.objectContaining({
        name: 'chat:runtime:complete',
        payload: expect.objectContaining({ runtimeId: result.runtimeId, usage: expectedUsage })
      })
    );
  });

  it('continues from a user choice answer using the provided message snapshot', async (): Promise<void> => {
    const collector = createEventCollector();
    const updatedMessages: ChatMessageRecord[] = [];
    const userMessage: ChatMessageRecord = {
      id: 'user-1',
      sessionId: 'session-1',
      role: 'user',
      content: 'choose',
      parts: [{ type: 'text', text: 'choose' }],
      createdAt: '2026-06-19T00:00:00.000Z',
      finished: true
    };
    const assistantMessage: ChatMessageRecord = {
      id: 'assistant-1',
      sessionId: 'session-1',
      role: 'assistant',
      content: '',
      parts: [
        {
          type: 'tool',
          toolCallId: 'tool-call-1',
          toolName: 'ask_user_choice',
          status: 'done',
          input: { question: 'Continue?' },
          result: {
            toolName: 'ask_user_choice',
            status: 'success',
            data: { questionId: 'question-1', toolCallId: 'tool-call-1', answers: ['yes'] }
          }
        }
      ],
      createdAt: '',
      finished: false,
      loading: false
    };
    const streamExecutor = vi.fn<ChatRuntimeStreamExecutor>(async ({ assistantMessage: draft }, updateAssistant) => {
      draft.content = 'continued answer';
      draft.parts = [...draft.parts, { type: 'text', text: 'continued answer' }];
      draft.loading = false;
      draft.finished = true;
      await updateAssistant(draft);
      return {};
    });
    const service = createChatRuntimeService({
      emit: collector.emit,
      createMessageId: (role) => `${role}-message-1`,
      now: () => '2026-06-19T00:00:02.000Z',
      messageReader: createNoopMessageReader(),
      messageWriter: {
        addMessage: (): void => undefined,
        updateMessage: (message) => {
          updatedMessages.push({ ...message, parts: [...message.parts] });
        }
      },
      streamExecutor
    });

    const result = await service.continue(createContinueInput({ messages: [userMessage, assistantMessage], contextWindow: 200_000 }));
    await flushRuntimeTasks();

    expect(result.runtimeId).toMatch(/^runtime-/);
    expect(streamExecutor).toHaveBeenCalledWith(
      expect.objectContaining({
        userMessage,
        assistantMessage: expect.objectContaining({ id: 'assistant-1', runtimeId: result.runtimeId }),
        sourceMessages: [userMessage, expect.objectContaining({ id: 'assistant-1', runtimeId: result.runtimeId })]
      }),
      expect.any(Function)
    );
    expect(updatedMessages.at(-1)).toMatchObject({
      id: 'assistant-1',
      runtimeId: result.runtimeId,
      content: 'continued answer',
      createdAt: '2026-06-19T00:00:02.000Z',
      finished: true
    });
    expect(collector.events).toContainEqual(
      expect.objectContaining({
        name: 'chat:runtime:complete',
        payload: expect.objectContaining({ runtimeId: result.runtimeId })
      })
    );
  });

  it('submits a user choice answer from persisted messages and continues the runtime', async (): Promise<void> => {
    const collector = createEventCollector();
    const updatedMessages: ChatMessageRecord[] = [];
    const userMessage: ChatMessageRecord = {
      id: 'user-1',
      sessionId: 'session-1',
      role: 'user',
      content: 'choose',
      parts: [{ type: 'text', text: 'choose' }],
      createdAt: '2026-06-19T00:00:00.000Z',
      finished: true
    };
    const assistantMessage: ChatMessageRecord = {
      id: 'assistant-1',
      sessionId: 'session-1',
      role: 'assistant',
      content: '',
      parts: [
        {
          type: 'tool',
          toolCallId: 'tool-call-1',
          toolName: 'ask_user_choice',
          status: 'done',
          input: { question: 'Continue?' },
          result: {
            toolName: 'ask_user_choice',
            status: 'awaiting_user_input',
            data: {
              questionId: 'question-1',
              toolCallId: 'tool-call-1',
              question: 'Continue?',
              mode: 'single',
              options: [{ label: 'Yes', value: 'yes' }]
            }
          }
        }
      ],
      createdAt: '2026-06-19T00:00:01.000Z',
      finished: false,
      loading: false
    };
    const streamExecutor = vi.fn<ChatRuntimeStreamExecutor>(async ({ sourceMessages, assistantMessage: draft }, updateAssistant) => {
      expect(sourceMessages?.find((message) => message.id === 'assistant-1')?.parts[0]).toMatchObject({
        type: 'tool',
        result: {
          status: 'success',
          data: {
            questionId: 'question-1',
            toolCallId: 'tool-call-1',
            answers: ['yes']
          }
        }
      });
      draft.content = 'continued answer';
      draft.parts = [...draft.parts, { type: 'text', text: 'continued answer' }];
      draft.loading = false;
      draft.finished = true;
      await updateAssistant(draft);
      return {};
    });
    const service = createChatRuntimeService({
      emit: collector.emit,
      createMessageId: (role) => `${role}-message-1`,
      now: () => '2026-06-19T00:00:02.000Z',
      messageReader: { getMessages: () => [userMessage, assistantMessage] },
      messageWriter: {
        addMessage: (): void => undefined,
        updateMessage: (message) => {
          updatedMessages.push({ ...message, parts: [...message.parts] });
        }
      },
      streamExecutor
    });

    const result = await service.submitUserChoice({
      sessionId: 'session-1',
      clientId: 'client-1',
      agentId: 'agent-1',
      contextWindow: 200_000,
      answer: {
        questionId: 'question-1',
        toolCallId: 'tool-call-1',
        answers: ['yes']
      }
    });
    await flushRuntimeTasks();

    expect(result.runtimeId).toMatch(/^runtime-/);
    expect(streamExecutor).toHaveBeenCalledOnce();
    expect(updatedMessages[0]).toEqual(
      expect.objectContaining({
        id: 'assistant-1',
        runtimeId: result.runtimeId,
        loading: true,
        finished: false,
        parts: [
          expect.objectContaining({
            result: {
              toolName: 'ask_user_choice',
              status: 'success',
              data: {
                questionId: 'question-1',
                toolCallId: 'tool-call-1',
                answers: ['yes']
              }
            }
          })
        ]
      })
    );
    expect(collector.events).toContainEqual(
      expect.objectContaining({
        name: 'chat:runtime:complete',
        payload: expect.objectContaining({ runtimeId: result.runtimeId })
      })
    );
  });

  it('marks assistant message as failed and emits runtime error when stream executor fails', async (): Promise<void> => {
    const collector = createEventCollector();
    const updatedMessages: Array<ChatRuntimeEventMap['chat:runtime:message-updated']['message']> = [];
    const runtimeError = { code: 'REQUEST_FAILED', message: 'model failed' } as AIServiceError;
    const service = createChatRuntimeService({
      emit: collector.emit,
      createMessageId: (role) => `${role}-message-1`,
      now: () => '2026-06-19T00:00:00.000Z',
      messageReader: createNoopMessageReader(),
      messageWriter: {
        addMessage: (): void => undefined,
        updateMessage: (message) => {
          updatedMessages.push({ ...message, parts: [...message.parts] });
        }
      },
      streamExecutor: async () => {
        throw runtimeError;
      }
    });

    const result = await service.send(createInput({ content: 'hello runtime' }));
    await flushRuntimeTasks();

    expect(result.runtimeId).toMatch(/^runtime-/);
    expect(updatedMessages).toHaveLength(1);
    expect(updatedMessages[0]).toMatchObject({
      id: 'assistant-message-1',
      content: 'model failed',
      parts: [{ type: 'error', text: 'model failed' }],
      loading: false,
      finished: true
    });
    const errorEvent = collector.events.find((event) => event.name === 'chat:runtime:error' && event.payload.runtimeId === result.runtimeId);
    const completeEvent = collector.events.find((event) => event.name === 'chat:runtime:complete' && event.payload.runtimeId === result.runtimeId);
    expect(errorEvent?.payload).toMatchObject({ error: runtimeError });
    expect(completeEvent).toBeDefined();
  });

  it('compacts and replays the user turn when the provider reports context overflow', async (): Promise<void> => {
    const collector = createEventCollector();
    const updatedMessages: ChatMessageRecord[] = [];
    const priorMessage = createInput({ content: 'prior' });
    const persistedPrior: ChatMessageRecord = {
      id: 'prior-user',
      sessionId: 'session-1',
      role: 'user',
      content: priorMessage.content,
      parts: [{ type: 'text', text: priorMessage.content }],
      createdAt: '2026-06-19T00:00:00.000Z',
      finished: true
    };
    const compressionBoundary: ChatMessageRecord = {
      id: 'compression-1',
      sessionId: 'session-1',
      role: 'compression',
      content: 'COMPRESSED_CONTEXT',
      parts: [{ type: 'text', text: 'COMPRESSED_CONTEXT' }],
      createdAt: '2026-06-19T00:00:00.000Z',
      finished: true,
      compression: {
        status: 'success',
        recordText: 'COMPRESSED_CONTEXT',
        coveredUntilMessageId: 'prior-user'
      }
    };
    const getMessages = vi.fn<() => ChatMessageRecord[]>().mockReturnValueOnce([persistedPrior]).mockReturnValueOnce([compressionBoundary]);
    const overflowError = { code: 'REQUEST_FAILED', message: 'Request failed: maximum context length exceeded (413)' } as AIServiceError;
    const compact = vi.fn().mockResolvedValue({ status: 'success' as const, messageId: 'compression-1', recordId: 'record-1' });
    const streamExecutor = vi.fn<ChatRuntimeStreamExecutor>(async ({ assistantMessage }, updateAssistant) => {
      if (streamExecutor.mock.calls.length === 1) {
        throw overflowError;
      }

      assistantMessage.content = 'replayed answer';
      assistantMessage.parts = [{ type: 'text', text: 'replayed answer' }];
      assistantMessage.loading = false;
      assistantMessage.finished = true;
      await updateAssistant(assistantMessage);
      return {};
    });
    const service = createChatRuntimeService({
      emit: collector.emit,
      createMessageId: (role) => `${role}-message-1`,
      now: () => '2026-06-19T00:00:00.000Z',
      messageReader: { getMessages },
      messageWriter: {
        addMessage: (): void => undefined,
        updateMessage: (message) => {
          updatedMessages.push({ ...message, parts: [...message.parts] });
        }
      },
      compactionService: { compact },
      streamExecutor
    });

    const result = await service.send(
      createInput({
        content: 'describe image',
        contextWindow: 128_000,
        files: [{ id: 'image-1', name: 'cat.png', type: 'image', mimeType: 'image/png', url: 'file://cat.png' }]
      })
    );
    await flushRuntimeTasks();

    expect(streamExecutor).toHaveBeenCalledTimes(2);
    expect(compact).toHaveBeenCalledWith(
      expect.objectContaining({
        runtimeId: result.runtimeId,
        sessionId: 'session-1',
        clientId: 'client-1',
        agentId: 'agent-1',
        reason: 'auto',
        messages: expect.arrayContaining([expect.objectContaining({ id: 'prior-user' }), expect.objectContaining({ id: 'user-message-1' })])
      })
    );
    expect(streamExecutor.mock.calls[1]?.[0].sourceMessages?.map((message) => message.id)).toEqual(['compression-1', 'user-message-1']);
    const replayUserMessage = streamExecutor.mock.calls[1]?.[0].sourceMessages?.find((message) => message.id === 'user-message-1');
    expect(replayUserMessage?.content).toContain('[Attached image/png: cat.png]');
    expect(replayUserMessage?.files?.[0]).not.toHaveProperty('url');
    expect(updatedMessages.at(-1)).toMatchObject({
      id: 'assistant-message-1',
      content: 'replayed answer',
      loading: false,
      finished: true
    });
    expect(collector.events.some((event) => event.name === 'chat:runtime:error' && event.payload.runtimeId === result.runtimeId)).toBe(false);
    expect(collector.events).toContainEqual(
      expect.objectContaining({
        name: 'chat:runtime:complete',
        payload: expect.objectContaining({ runtimeId: result.runtimeId })
      })
    );
  });

  it('marks assistant failed when overflow replay fails after successful compaction', async (): Promise<void> => {
    const collector = createEventCollector();
    const updatedMessages: ChatMessageRecord[] = [];
    const compressionBoundary: ChatMessageRecord = {
      id: 'compression-1',
      sessionId: 'session-1',
      role: 'compression',
      content: 'COMPRESSED_CONTEXT',
      parts: [{ type: 'text', text: 'COMPRESSED_CONTEXT' }],
      createdAt: '2026-06-19T00:00:00.000Z',
      finished: true,
      compression: {
        status: 'success',
        recordText: 'COMPRESSED_CONTEXT',
        coveredUntilMessageId: 'user-message-1'
      }
    };
    const getMessages = vi.fn<() => ChatMessageRecord[]>().mockReturnValueOnce([]).mockReturnValueOnce([compressionBoundary]);
    const overflowError = { code: 'REQUEST_FAILED', message: 'maximum context length exceeded' } as AIServiceError;
    const replayError = { code: 'REQUEST_FAILED', message: 'model failed after replay' } as AIServiceError;
    const streamExecutor = vi.fn<ChatRuntimeStreamExecutor>(async () => {
      if (streamExecutor.mock.calls.length === 1) throw overflowError;
      throw replayError;
    });
    const service = createChatRuntimeService({
      emit: collector.emit,
      createMessageId: (role) => `${role}-message-1`,
      now: () => '2026-06-19T00:00:00.000Z',
      messageReader: { getMessages },
      messageWriter: {
        addMessage: (): void => undefined,
        updateMessage: (message) => {
          updatedMessages.push({ ...message, parts: [...message.parts] });
        }
      },
      compactionService: {
        compact: vi.fn().mockResolvedValue({ status: 'success' as const, messageId: 'compression-1', recordId: 'record-1' })
      },
      streamExecutor
    });

    const result = await service.send(createInput({ content: 'hello runtime', contextWindow: 128_000 }));
    await flushRuntimeTasks();

    expect(streamExecutor).toHaveBeenCalledTimes(2);
    expect(updatedMessages.at(-1)).toMatchObject({
      id: 'assistant-message-1',
      content: 'model failed after replay',
      parts: [{ type: 'error', text: 'model failed after replay' }],
      loading: false,
      finished: true
    });
    expect(collector.events).toContainEqual(
      expect.objectContaining({
        name: 'chat:runtime:error',
        payload: expect.objectContaining({ runtimeId: result.runtimeId, error: replayError })
      })
    );
    expect(collector.events).toContainEqual(
      expect.objectContaining({
        name: 'chat:runtime:complete',
        payload: expect.objectContaining({ runtimeId: result.runtimeId })
      })
    );
  });

  it('rejects a second runtime for the same session while the first is active', async (): Promise<void> => {
    const collector = createEventCollector();
    const service = createChatRuntimeService({
      emit: collector.emit,
      messageWriter: createNoopMessageWriter(),
      messageReader: createNoopMessageReader(),
      streamExecutor: createNoopStreamExecutor(),
      keepRuntimeOpenForTest: true
    });

    const first = await service.send(createInput());

    await expect(service.send(createInput({ content: 'second' }))).rejects.toMatchObject({
      code: 'SESSION_BUSY'
    });

    service.abort({ runtimeId: first.runtimeId });
    const second = await service.send(createInput({ content: 'after abort' }));
    expect(second.sessionId).toBe('session-1');
  });

  it('aborts only the targeted runtime', async (): Promise<void> => {
    const collector = createEventCollector();
    const service = createChatRuntimeService({
      emit: collector.emit,
      messageWriter: createNoopMessageWriter(),
      messageReader: createNoopMessageReader(),
      streamExecutor: createNoopStreamExecutor(),
      keepRuntimeOpenForTest: true
    });
    const first = await service.send(createInput({ sessionId: 'session-1' }));
    const second = await service.send(createInput({ sessionId: 'session-2' }));

    service.abort({ runtimeId: first.runtimeId });

    expect(service.getActiveRuntime(first.runtimeId)).toBeUndefined();
    expect(service.getActiveRuntime(second.runtimeId)?.sessionId).toBe('session-2');
  });

  it('drops an empty assistant draft before creating an interrupt message', async (): Promise<void> => {
    const collector = createEventCollector();
    const streamDeferred = createDeferred();
    const addedMessages: ChatMessageRecord[] = [];
    const updatedMessages: Array<ChatRuntimeEventMap['chat:runtime:message-updated']['message']> = [];
    const deletedMessages: Array<{ sessionId: string; messageId: string }> = [];
    const abortStream = vi.fn();
    const service = createChatRuntimeService({
      emit: collector.emit,
      createMessageId: (role) => `${role}-message-1`,
      now: () => '2026-06-19T00:00:00.000Z',
      messageReader: createNoopMessageReader(),
      messageWriter: {
        addMessage: (message) => {
          addedMessages.push({ ...message, parts: [...message.parts] });
        },
        updateMessage: (message) => {
          updatedMessages.push({ ...message, parts: [...message.parts] });
        },
        deleteMessage: (sessionId, messageId) => {
          deletedMessages.push({ sessionId, messageId });
        }
      },
      streamAbort: abortStream,
      streamExecutor: async () => {
        await streamDeferred.promise;
        return {};
      }
    });

    const result = await service.send(createInput());
    await service.abort({ runtimeId: result.runtimeId });

    expect(abortStream).toHaveBeenCalledWith(result.runtimeId);
    expect(service.getActiveRuntime(result.runtimeId)).toBeUndefined();
    expect(updatedMessages).not.toContainEqual(
      expect.objectContaining({
        id: 'assistant-message-1',
        role: 'assistant',
        content: '',
        loading: false,
        finished: true,
        parts: []
      })
    );
    expect(deletedMessages).toContainEqual({
      sessionId: 'session-1',
      messageId: 'assistant-message-1'
    });
    expect(collector.events).toContainEqual({
      name: 'chat:runtime:message-deleted',
      payload: expect.objectContaining({
        runtimeId: result.runtimeId,
        messageId: 'assistant-message-1'
      })
    });
    expect(addedMessages).toContainEqual(
      expect.objectContaining({
        id: 'interrupt-message-1',
        role: 'interrupt',
        content: '已中断',
        loading: false,
        finished: true,
        parts: []
      })
    );
    expect(collector.events).toContainEqual({
      name: 'chat:runtime:message-created',
      payload: expect.objectContaining({
        runtimeId: result.runtimeId,
        message: expect.objectContaining({ id: 'interrupt-message-1', role: 'interrupt', content: '已中断' })
      })
    });

    streamDeferred.resolve();
  });

  it('keeps streamed assistant parts before creating an interrupt message', async (): Promise<void> => {
    const collector = createEventCollector();
    const streamDeferred = createDeferred();
    const addedMessages: ChatMessageRecord[] = [];
    const updatedMessages: Array<ChatRuntimeEventMap['chat:runtime:message-updated']['message']> = [];
    const service = createChatRuntimeService({
      emit: collector.emit,
      createMessageId: (role) => `${role}-message-1`,
      now: () => '2026-06-19T00:00:00.000Z',
      messageReader: createNoopMessageReader(),
      messageWriter: {
        addMessage: (message) => {
          addedMessages.push({ ...message, parts: [...message.parts] });
        },
        updateMessage: (message) => {
          updatedMessages.push({ ...message, parts: [...message.parts] });
        }
      },
      streamExecutor: async ({ assistantMessage }) => {
        assistantMessage.content = 'partial answer';
        assistantMessage.parts.push({ type: 'text', text: 'partial answer' });
        await streamDeferred.promise;
        return {};
      }
    });

    const result = await service.send(createInput());
    await flushRuntimeTasks();
    await service.abort({ runtimeId: result.runtimeId });

    expect(updatedMessages.at(-1)).toMatchObject({
      id: 'assistant-message-1',
      role: 'assistant',
      content: 'partial answer',
      loading: false,
      finished: true,
      parts: [{ type: 'text', text: 'partial answer' }]
    });
    expect(addedMessages.at(-1)).toMatchObject({
      id: 'interrupt-message-1',
      role: 'interrupt',
      content: '已中断',
      loading: false,
      finished: true,
      parts: []
    });

    streamDeferred.resolve();
  });

  it('delegates compact commands to the compaction service', async (): Promise<void> => {
    const collector = createEventCollector();
    const compact = vi.fn().mockResolvedValue({
      status: 'skipped',
      reason: 'no_messages'
    });
    const service = createChatRuntimeService({
      emit: collector.emit,
      messageWriter: createNoopMessageWriter(),
      messageReader: createNoopMessageReader(),
      streamExecutor: createNoopStreamExecutor(),
      compactionService: { compact }
    });

    const result = await service.compact({
      runtimeId: 'runtime-compact-1',
      sessionId: 'session-1',
      clientId: 'client-1',
      agentId: 'agent-1',
      reason: 'manual',
      messages: []
    });

    expect(result).toEqual({ status: 'skipped', reason: 'no_messages' });
    expect(compact).toHaveBeenCalledWith({
      runtimeId: 'runtime-compact-1',
      sessionId: 'session-1',
      clientId: 'client-1',
      agentId: 'agent-1',
      reason: 'manual',
      messages: [],
      signal: expect.any(AbortSignal)
    });
  });

  it('aborts an active compact runtime without creating an interrupt message', async (): Promise<void> => {
    let compactSignal: AbortSignal | undefined;
    const compactDeferred = createDeferred();
    const messageWriter = {
      addMessage: vi.fn(),
      updateMessage: vi.fn()
    };
    const service = createChatRuntimeService({
      emit: vi.fn(),
      messageWriter,
      messageReader: createNoopMessageReader(),
      streamExecutor: createNoopStreamExecutor(),
      compactionService: {
        compact: async (input) => {
          compactSignal = input.signal;
          await compactDeferred.promise;
          return { status: 'cancelled', messageId: 'compression-1' };
        }
      }
    });

    const compactPromise = service.compact({
      runtimeId: 'runtime-compact-abort',
      sessionId: 'session-1',
      clientId: 'client-1',
      agentId: 'agent-1',
      reason: 'manual',
      messages: []
    });
    await flushRuntimeTasks();

    await service.abort({ runtimeId: 'runtime-compact-abort' });

    expect(compactSignal?.aborted).toBe(true);
    expect(messageWriter.addMessage).not.toHaveBeenCalledWith(expect.objectContaining({ role: 'interrupt' }));

    compactDeferred.resolve();
    await expect(compactPromise).resolves.toEqual({ status: 'cancelled', messageId: 'compression-1' });
  });
});
