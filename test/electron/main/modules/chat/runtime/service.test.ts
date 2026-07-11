/**
 * @file service.test.ts
 * @description ChatRuntime 主进程服务骨架测试。
 */
import type { ChatRuntimeStreamExecutor } from '../../../../../../electron/main/modules/chat/runtime/types.mjs';
import type { AIServiceError } from 'types/ai';
import type { ChatMessagePart, ChatMessageRecord } from 'types/chat';
import type { ChatRuntimeCompactInput, ChatRuntimeContinueInput, ChatRuntimeEventMap, ChatRuntimeSendInput } from 'types/chat-runtime';
import { describe, expect, it, vi } from 'vitest';
import { createChatRuntimeService } from '../../../../../../electron/main/modules/chat/runtime/service.mjs';

/** 已捕获的 runtime 事件。 */
type CapturedRuntimeEvent = {
  /** 事件名。 */
  name: keyof ChatRuntimeEventMap;
  /** 事件载荷。 */
  payload: ChatRuntimeEventMap[keyof ChatRuntimeEventMap];
};

/** 捕获到的上下文用量事件。 */
type CapturedContextUsageEvent = {
  /** 事件名。 */
  name: 'chat:runtime:context-usage-updated';
  /** 事件载荷。 */
  payload: ChatRuntimeEventMap['chat:runtime:context-usage-updated'];
};

/** Runtime 输入夹具序号，确保同一测试内 ID 不冲突。 */
let runtimeInputSequence = 0;

/**
 * 创建发送入参测试夹具。
 * @param overrides - 需要覆盖的发送字段
 * @returns runtime send 输入
 */
function createInput(overrides: Partial<ChatRuntimeSendInput> = {}): ChatRuntimeSendInput {
  return {
    runtimeId: `runtime-test-${++runtimeInputSequence}`,
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
    runtimeId: `runtime-continue-test-${++runtimeInputSequence}`,
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
    parts: content ? [{ id: 'part0076', type: 'text', text: content }] : [],
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
 * 判断捕获事件是否为上下文用量事件。
 * @param event - 捕获的 runtime 事件
 * @returns 是否为上下文用量事件
 */
function isContextUsageEvent(event: CapturedRuntimeEvent): event is CapturedContextUsageEvent {
  return event.name === 'chat:runtime:context-usage-updated';
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
  it('uses the runtime id allocated by the renderer', async (): Promise<void> => {
    const service = createChatRuntimeService({
      emit: vi.fn(),
      messageWriter: createNoopMessageWriter(),
      messageReader: createNoopMessageReader(),
      streamExecutor: createNoopStreamExecutor(),
      keepRuntimeOpenForTest: true
    });
    const input = { ...createInput(), runtimeId: 'runtime-renderer-owned' } as ChatRuntimeSendInput;

    const result = await service.send(input);

    expect(result.runtimeId).toBe('runtime-renderer-owned');
    expect(service.getActiveRuntime('runtime-renderer-owned')).toBeDefined();
  });

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
    const addedMessages: ChatMessageRecord[] = [];
    const updatedMessages: ChatMessageRecord[] = [];
    const service = createChatRuntimeService({
      emit: collector.emit,
      createMessageId: (role) => `${role}-message-1`,
      now: () => '2026-06-19T00:00:00.000Z',
      streamExecutor: createNoopStreamExecutor(),
      messageReader: createNoopMessageReader(),
      messageWriter: {
        addMessage: (message) => {
          addedMessages.push({ ...message, parts: [...message.parts] });
        },
        updateMessage: (message) => {
          updatedMessages.push({ ...message, parts: [...message.parts] });
        }
      }
    });

    const result = await service.send(createInput({ content: 'hello runtime' }));
    await flushRuntimeTasks();

    expect(addedMessages).toHaveLength(2);
    expect(addedMessages[0]).toMatchObject({
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
    expect(addedMessages[1]).toMatchObject({
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
    expect(updatedMessages.at(-1)).toMatchObject({
      id: 'assistant-message-1',
      loading: false,
      finished: true
    });
    const createdMessageIds = collector.events.flatMap((event) => {
      if (event.name !== 'chat:runtime:message-created') return [];

      return [(event.payload as ChatRuntimeEventMap['chat:runtime:message-created']).message.id];
    });
    expect(createdMessageIds).toEqual(['user-message-1', 'assistant-message-1']);
  });

  it('materializes file input parts before persisting user messages', async (): Promise<void> => {
    const persistedMessages: ChatMessageRecord[] = [];
    const materializedParts: ChatMessagePart[] = [
      { id: 'part0077', type: 'text', text: 'fix ' },
      {
        type: 'file',
        id: 'file-part-1',
        filename: 'foo.ts',
        mime: 'text/plain',
        url: 'file:///workspace/src/foo.ts',
        path: 'src/foo.ts',
        sourceText: { start: 4, end: 19, value: '{{@src/foo.ts}}' },
        snapshot: {
          content: 'editor content',
          startLine: 1,
          endLine: 1,
          totalLines: 1,
          contentHash: 'hash-1',
          capturedAt: '2026-06-20T00:00:00.000Z'
        }
      }
    ];
    const materializeFileParts = vi.fn().mockResolvedValue(materializedParts);
    const service = createChatRuntimeService({
      emit: vi.fn(),
      messageWriter: {
        addMessage: (message) => {
          persistedMessages.push(message);
        },
        updateMessage: vi.fn(),
        deleteMessage: vi.fn()
      },
      messageReader: createNoopMessageReader(),
      streamExecutor: createNoopStreamExecutor(),
      materializeFileParts,
      now: () => '2026-06-20T00:00:00.000Z'
    });

    await service.send(
      createInput({
        content: 'fix {{@src/foo.ts}}',
        workspaceRoot: '/workspace',
        parts: [
          { id: 'part0078', type: 'text', text: 'fix ' },
          {
            type: 'file',
            id: 'file-part-1',
            filename: 'foo.ts',
            mime: 'text/plain',
            url: 'file:///workspace/src/foo.ts',
            path: 'src/foo.ts',
            sourceText: { start: 4, end: 19, value: '{{@src/foo.ts}}' }
          }
        ]
      })
    );

    expect(materializeFileParts).toHaveBeenCalledWith(
      expect.objectContaining({
        parts: expect.arrayContaining([expect.objectContaining({ type: 'file', path: 'src/foo.ts' })])
      })
    );
    expect(persistedMessages[0].parts[1]).toMatchObject({
      type: 'file',
      snapshot: expect.objectContaining({ startLine: 1, endLine: expect.any(Number) })
    });
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
        assistantMessage.parts = [{ id: 'part0079', type: 'text', text: 'hello from model' }];
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

  it('submits renderer message parts into the active assistant message', async (): Promise<void> => {
    const collector = createEventCollector();
    const streamDeferred = createDeferred();
    const updatedMessages: Array<ChatRuntimeEventMap['chat:runtime:message-updated']['message']> = [];
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
      streamExecutor: async ({ assistantMessage }) => {
        assistantMessage.parts.push({
          id: 'part-open-widget',
          type: 'tool',
          toolCallId: 'tool-call-widget',
          toolName: 'open_widget',
          status: 'done',
          input: { id: 'weather' },
          result: {
            toolName: 'open_widget',
            status: 'success',
            data: {
              sessionId: 'widget-weather-tool-call-widget',
              widgetId: 'weather',
              value: {},
              execution: { status: 'success', output: undefined }
            }
          }
        });
        await streamDeferred.promise;
        assistantMessage.content = '继续输出';
        assistantMessage.parts.push({ id: 'part-stream-text', type: 'text', text: '继续输出' });
        return {};
      }
    });

    const result = await service.send(createInput({ content: 'hello runtime' }));
    await flushRuntimeTasks();

    await service.submitMessagePart({
      runtimeId: result.runtimeId,
      messageId: 'assistant-message-1',
      part: {
        id: 'part-open-widget',
        type: 'tool',
        toolCallId: 'tool-call-widget',
        toolName: 'open_widget',
        status: 'done',
        input: { id: 'weather' },
        result: {
          toolName: 'open_widget',
          status: 'success',
          data: {
            sessionId: 'widget-weather-tool-call-widget',
            widgetId: 'weather',
            value: {},
            renderContext: {
              input: { city: '上海' },
              output: undefined,
              data: { weather: { temperature: 29 } },
              isMounted: true
            },
            execution: { status: 'success', output: undefined }
          }
        }
      }
    });
    streamDeferred.resolve();
    await flushRuntimeTasks();

    expect(updatedMessages[0]).toMatchObject({
      id: 'assistant-message-1',
      parts: [
        {
          type: 'tool',
          toolCallId: 'tool-call-widget',
          result: {
            data: {
              renderContext: {
                data: { weather: { temperature: 29 } },
                isMounted: true
              }
            }
          }
        }
      ]
    });
    expect(updatedMessages.at(-1)?.parts).toEqual([
      expect.objectContaining({
        type: 'tool',
        toolCallId: 'tool-call-widget',
        result: expect.objectContaining({
          data: expect.objectContaining({
            renderContext: expect.objectContaining({
              isMounted: true
            })
          })
        })
      }),
      expect.objectContaining({ type: 'text', text: '继续输出' })
    ]);
    expect(collector.events).toContainEqual(
      expect.objectContaining({
        name: 'chat:runtime:message-updated',
        payload: expect.objectContaining({
          runtimeId: result.runtimeId,
          message: expect.objectContaining({
            parts: expect.arrayContaining([
              expect.objectContaining({
                type: 'tool',
                toolCallId: 'tool-call-widget'
              })
            ])
          })
        })
      })
    );
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
        assistantMessage.parts = [{ id: 'part0080', type: 'text', text: 'large answer' }];
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
    const contextUsageEvents = collector.events.filter(isContextUsageEvent).filter((event) => event.payload.runtimeId === result.runtimeId);
    const preCompactionUsageEvent = contextUsageEvents.find((event) => event.payload.snapshot.providerUsageTokens === 8_000);
    expect(preCompactionUsageEvent?.payload).toMatchObject({
      snapshot: expect.objectContaining({
        providerUsageTokens: 8_000,
        status: 'danger'
      })
    });
    expect(contextUsageEvents.at(-1)?.payload.snapshot.providerUsageTokens).toBeUndefined();
    expect(contextUsageEvents.at(-1)?.payload.snapshot.status).toBe('safe');
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
            parts: [{ id: 'part0081', type: 'text', text: 'prior question' }],
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
            parts: [{ id: 'part0082', type: 'text', text: 'prior question' }],
            createdAt: '2026-06-19T00:00:00.000Z'
          }
        ]
      },
      streamExecutor: createNoopStreamExecutor()
    });

    const result = await service.send(createInput({ content: 'current question', contextWindow: 128_000 }));
    await flushRuntimeTasks();

    const usageEvent = collector.events.filter(isContextUsageEvent).find((event) => event.payload.runtimeId === result.runtimeId);
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
      parts: [{ id: 'part0083', type: 'text', text: '大量历史上下文'.repeat(40_000) }],
      createdAt: '2026-06-19T00:00:00.000Z'
    };
    const compactedBoundary: ChatMessageRecord = {
      id: 'compression-1',
      sessionId: 'session-1',
      role: 'compression',
      content: 'COMPRESSED_CONTEXT',
      parts: [{ id: 'part0084', type: 'text', text: 'COMPRESSED_CONTEXT' }],
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

  it('emits a refreshed context usage snapshot after automatic compaction succeeds', async (): Promise<void> => {
    const collector = createEventCollector();
    const priorMessage = createMessageRecord('prior-user', 'user', '大量历史上下文'.repeat(40_000), '2026-06-19T00:00:00.000Z');
    const compact = vi.fn(async (input: ChatRuntimeCompactInput) => {
      input.targetMessage?.parts.push({
        id: 'part0085',
        type: 'compaction',
        auto: true,
        reason: 'auto',
        status: 'success',
        recordId: 'record-1',
        recordText: 'COMPRESSED_CONTEXT',
        coveredUntilMessageId: 'current-user',
        sourceMessageIds: ['prior-user', 'current-user']
      });

      return { status: 'success' as const, messageId: input.targetMessage?.id ?? 'assistant-message-1', recordId: 'record-1' };
    });
    const service = createChatRuntimeService({
      emit: collector.emit,
      createMessageId: (role) => `${role}-message-1`,
      now: () => '2026-06-19T00:00:00.000Z',
      messageWriter: createNoopMessageWriter(),
      messageReader: { getMessages: () => [priorMessage] },
      compactionService: { compact },
      streamExecutor: createNoopStreamExecutor()
    });

    await service.send(createInput({ content: 'current question', contextWindow: 20_000, userMessageId: 'current-user' }));
    await flushRuntimeTasks();

    const usageEvents = collector.events.filter(isContextUsageEvent);
    expect(usageEvents.length).toBeGreaterThanOrEqual(2);
    expect(usageEvents.at(-1)?.payload.snapshot.estimatedInputTokens).toBeLessThan(usageEvents[0].payload.snapshot.estimatedInputTokens);
  });

  it('continues the runtime stream after renderer tool results are written', async (): Promise<void> => {
    const collector = createEventCollector();
    const streamExecutor = vi.fn<ChatRuntimeStreamExecutor>(async ({ assistantMessage }, updateAssistant) => {
      if (streamExecutor.mock.calls.length === 1) {
        assistantMessage.parts = [
          {
            id: 'part0086',
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
      assistantMessage.parts = [...assistantMessage.parts, { id: 'part0087', type: 'text', text: 'final answer' }];
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

  it('compacts before the next continuation round without finishing the active assistant message', async (): Promise<void> => {
    const operations: string[] = [];
    const compactTargetFinishedStates: Array<boolean | undefined> = [];
    const compact = vi.fn(async (input: ChatRuntimeCompactInput & { signal?: AbortSignal }) => {
      operations.push('compact');
      compactTargetFinishedStates.push(input.targetMessage?.finished);
      if (input.targetMessage) {
        input.targetMessage.parts.push({
          id: 'part0088',
          type: 'compaction',
          auto: true,
          reason: 'auto',
          status: 'success',
          recordId: 'record-1',
          recordText: 'COMPRESSED_CONTEXT',
          coveredUntilMessageId: 'user-message-1',
          sourceMessageIds: ['user-message-1']
        });
      }

      return { status: 'success' as const, messageId: input.targetMessage?.id ?? 'assistant-message-1', recordId: 'record-1' };
    });
    const streamExecutor = vi.fn<ChatRuntimeStreamExecutor>(async ({ assistantMessage }, updateAssistant) => {
      if (streamExecutor.mock.calls.length === 1) {
        operations.push('stream-1');
        assistantMessage.parts.push({
          id: 'part0089',
          type: 'tool',
          toolCallId: 'tool-call-1',
          toolName: 'operate_webpage',
          status: 'done',
          input: { index: 25 },
          result: { toolName: 'operate_webpage', status: 'success', data: { clicked: true } }
        });
        await updateAssistant(assistantMessage);
        return { usage: { inputTokens: 15_000, outputTokens: 6_000, totalTokens: 21_000 }, shouldContinue: true };
      }

      operations.push('stream-2');
      assistantMessage.content = '继续检查页面';
      assistantMessage.parts.push({ id: 'part0090', type: 'text', text: '继续检查页面' });
      await updateAssistant(assistantMessage);
      return { usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 } };
    });
    const service = createChatRuntimeService({
      emit: vi.fn(),
      createMessageId: (role) => `${role}-message-1`,
      now: () => '2026-06-19T00:00:00.000Z',
      messageReader: createNoopMessageReader(),
      messageWriter: createNoopMessageWriter(),
      compactionService: { compact },
      streamExecutor
    });

    await service.send(createInput({ content: '继续网页长任务', contextWindow: 20_000 }));
    await flushRuntimeTasks();

    expect(operations).toEqual(['stream-1', 'compact', 'stream-2']);
    expect(compactTargetFinishedStates).toEqual([false]);
    expect(streamExecutor).toHaveBeenCalledTimes(2);
    expect(streamExecutor.mock.calls[1]?.[0].sourceMessages?.find((message) => message.id === 'assistant-message-1')?.parts).toContainEqual(
      expect.objectContaining({
        type: 'compaction',
        status: 'success',
        recordId: 'record-1'
      })
    );
  });

  it('keeps assistant message unfinished when the stream pauses for user choice', async (): Promise<void> => {
    const collector = createEventCollector();
    const updatedMessages: ChatMessageRecord[] = [];
    const streamExecutor = vi.fn<ChatRuntimeStreamExecutor>(async ({ assistantMessage }, updateAssistant) => {
      assistantMessage.parts = [
        {
          id: 'part0091',
          type: 'tool',
          toolCallId: 'tool-call-question',
          toolName: 'question',
          status: 'done',
          input: {
            question: '确认下单生椰拿铁，实付 9.9?',
            mode: 'single',
            options: [
              { label: '确认下单!', value: 'confirm' },
              { label: '再想想...', value: 'cancel' }
            ]
          },
          result: {
            toolName: 'question',
            status: 'awaiting_user_input',
            data: {
              questionId: 'question-1',
              toolCallId: 'tool-call-question',
              question: '确认下单生椰拿铁，实付 9.9?',
              mode: 'single',
              options: [
                { label: '确认下单!', value: 'confirm' },
                { label: '再想想...', value: 'cancel' }
              ]
            }
          }
        }
      ];
      assistantMessage.loading = false;
      assistantMessage.finished = false;
      await updateAssistant(assistantMessage);
      return {};
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

    const result = await service.send(createInput({ content: 'order coffee' }));
    await flushRuntimeTasks();

    expect(updatedMessages.at(-1)).toMatchObject({
      id: 'assistant-message-1',
      loading: false,
      finished: false,
      parts: [
        {
          type: 'tool',
          toolCallId: 'tool-call-question',
          toolName: 'question',
          result: {
            toolName: 'question',
            status: 'awaiting_user_input',
            data: expect.objectContaining({ questionId: 'question-1' })
          }
        }
      ]
    });
    expect(collector.events).toContainEqual(
      expect.objectContaining({
        name: 'chat:runtime:complete',
        payload: expect.objectContaining({ runtimeId: result.runtimeId })
      })
    );
  });

  it('marks assistant message finished after continuation rounds stop at the runtime limit', async (): Promise<void> => {
    const updatedMessages: ChatMessageRecord[] = [];
    const streamExecutor = vi.fn<ChatRuntimeStreamExecutor>(async ({ assistantMessage }, updateAssistant) => {
      assistantMessage.parts = [
        {
          id: 'part0092',
          type: 'tool',
          toolCallId: 'tool-call-1',
          toolName: 'read_file',
          status: 'done',
          input: { path: 'src/index.ts' },
          result: { toolName: 'read_file', status: 'success', data: { content: 'ok' } }
        }
      ];
      assistantMessage.loading = false;
      assistantMessage.finished = false;
      await updateAssistant(assistantMessage);
      return { shouldContinue: true };
    });
    const service = createChatRuntimeService({
      emit: createEventCollector().emit,
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

    await service.send(createInput({ content: 'inspect file' }));
    await flushRuntimeTasks();

    expect(streamExecutor).toHaveBeenCalledTimes(26);
    expect(updatedMessages.at(-1)).toMatchObject({
      loading: false,
      finished: true
    });
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

  it('projects active runtimes and their pending renderer requests for recovery', async (): Promise<void> => {
    const service = createChatRuntimeService({
      emit: vi.fn(),
      messageWriter: createNoopMessageWriter(),
      messageReader: createNoopMessageReader(),
      streamExecutor: createNoopStreamExecutor(),
      keepRuntimeOpenForTest: true
    });
    const result = await service.send(
      createInput({
        capabilities: { rendererToolNames: ['read_current_document'], documentId: 'document-1' }
      })
    );
    const decisionPromise = service.requestConfirmation({
      runtimeId: result.runtimeId,
      confirmationId: 'confirmation-recovery',
      request: { toolName: 'write_file', title: '写入文件', description: '是否写入？', riskLevel: 'write' }
    });
    const bridgePromise = service.requestBridge({ runtimeId: result.runtimeId, requestId: 'bridge-recovery', kind: 'document-snapshot' });

    const snapshots = service.listRecoverySnapshots();
    expect(structuredClone(snapshots)).toEqual(snapshots);
    expect(snapshots).toEqual([
      expect.objectContaining({
        runtimeId: result.runtimeId,
        capabilities: { rendererToolNames: ['read_current_document'], documentId: 'document-1' },
        pendingRequests: expect.arrayContaining([
          expect.objectContaining({ type: 'confirmation', event: expect.objectContaining({ confirmationId: 'confirmation-recovery' }) }),
          expect.objectContaining({ type: 'bridge', event: expect.objectContaining({ requestId: 'bridge-recovery' }) })
        ])
      })
    ]);

    service.submitConfirmation({ runtimeId: result.runtimeId, confirmationId: 'confirmation-recovery', decision: { approved: false } });
    service.submitBridgeResponse({ runtimeId: result.runtimeId, requestId: 'bridge-recovery', result: { status: 'success', data: null } });
    await Promise.all([decisionPromise, bridgePromise]);
    expect(service.listRecoverySnapshots()[0]?.pendingRequests).toEqual([]);
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
          id: 'part0093',
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
          id: 'part0094',
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
        assistantMessage.parts = [{ id: 'part0095', type: 'text', text: 'done' }];
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
            id: 'part0096',
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
      assistantMessage.parts = [...assistantMessage.parts, { id: 'part0097', type: 'text', text: 'final answer' }];
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
      parts: [{ id: 'part0098', type: 'text', text: 'choose' }],
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
          id: 'part0099',
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
      draft.parts = [...draft.parts, { id: 'part0100', type: 'text', text: 'continued answer' }];
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

  it('creates an assistant placeholder when continuing from a user-only snapshot', async (): Promise<void> => {
    const collector = createEventCollector();
    const addedMessages: ChatMessageRecord[] = [];
    const updatedMessages: ChatMessageRecord[] = [];
    const userMessage: ChatMessageRecord = {
      id: 'user-regenerate',
      sessionId: 'session-1',
      role: 'user',
      content: '重新回答',
      parts: [{ id: 'part0101', type: 'text', text: '重新回答' }],
      createdAt: '2026-06-19T00:00:00.000Z',
      finished: true
    };
    const streamExecutor = vi.fn<ChatRuntimeStreamExecutor>(async ({ assistantMessage: draft }, updateAssistant) => {
      draft.content = '新回答';
      draft.parts = [{ id: 'part0102', type: 'text', text: '新回答' }];
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
        addMessage: (message) => {
          addedMessages.push({ ...message, parts: [...message.parts] });
        },
        updateMessage: (message) => {
          updatedMessages.push({ ...message, parts: [...message.parts] });
        }
      },
      streamExecutor
    });

    const result = await service.continue(createContinueInput({ messages: [userMessage], contextWindow: 200_000 }));
    await flushRuntimeTasks();

    expect(addedMessages).toEqual([
      expect.objectContaining({
        id: 'assistant-message-1',
        role: 'assistant',
        runtimeId: result.runtimeId,
        content: '',
        parts: [],
        loading: true,
        finished: false,
        createdAt: '2026-06-19T00:00:02.000Z'
      })
    ]);
    expect(collector.events).toContainEqual(
      expect.objectContaining({
        name: 'chat:runtime:message-created',
        payload: expect.objectContaining({
          runtimeId: result.runtimeId,
          message: expect.objectContaining({ id: 'assistant-message-1', role: 'assistant' })
        })
      })
    );
    expect(streamExecutor).toHaveBeenCalledWith(
      expect.objectContaining({
        userMessage,
        assistantMessage: expect.objectContaining({ id: 'assistant-message-1', runtimeId: result.runtimeId }),
        sourceMessages: [userMessage, expect.objectContaining({ id: 'assistant-message-1', runtimeId: result.runtimeId })]
      }),
      expect.any(Function)
    );
    expect(updatedMessages.at(-1)).toMatchObject({
      id: 'assistant-message-1',
      content: '新回答',
      finished: true
    });
  });

  it('passes invalidated historical Skill results into continuation streams', async (): Promise<void> => {
    const previousUser = createMessageRecord('previous-user', 'user', 'previous question', '2026-06-19T00:00:00.000Z');
    const previousAssistant = createMessageRecord('previous-assistant', 'assistant', '', '2026-06-19T00:00:01.000Z');
    previousAssistant.parts = [
      {
        id: 'previous-skill-part',
        type: 'tool',
        toolCallId: 'previous-skill-call',
        toolName: 'skill',
        status: 'done',
        input: { name: 'weather' },
        result: {
          toolName: 'skill',
          status: 'success',
          data: '<skill_metadata><content_hash>old-hash</content_hash></skill_metadata><skill_content name="weather">old instructions</skill_content>'
        }
      }
    ];
    const currentUser = createMessageRecord('current-user', 'user', 'current question', '2026-06-19T00:00:02.000Z');
    const streamExecutor = vi.fn<ChatRuntimeStreamExecutor>(async (): Promise<{}> => ({}));
    const service = createChatRuntimeService({
      emit: vi.fn(),
      createMessageId: (role) => `${role}-message-1`,
      messageReader: createNoopMessageReader(),
      messageWriter: createNoopMessageWriter(),
      streamExecutor
    });

    await service.continue(
      createContinueInput({
        messages: [previousUser, previousAssistant, currentUser],
        skillContentHashes: { weather: 'new-hash' }
      })
    );
    await flushRuntimeTasks();

    const sourceMessages = streamExecutor.mock.calls[0]?.[0].sourceMessages ?? [];
    const serialized = JSON.stringify(sourceMessages);
    expect(serialized).toContain('skill_invalidated');
    expect(serialized).not.toContain('old instructions');
  });

  it('does not reuse a previous turn assistant when continuation history ends with a user message', async (): Promise<void> => {
    const collector = createEventCollector();
    const addedMessages: ChatMessageRecord[] = [];
    const updatedMessages: ChatMessageRecord[] = [];
    const previousUserMessage: ChatMessageRecord = {
      id: 'user-previous',
      sessionId: 'session-1',
      role: 'user',
      content: '上一轮问题',
      parts: [{ id: 'part0103', type: 'text', text: '上一轮问题' }],
      createdAt: '2026-06-19T00:00:00.000Z',
      finished: true
    };
    const previousAssistantMessage: ChatMessageRecord = {
      id: 'assistant-previous',
      sessionId: 'session-1',
      role: 'assistant',
      content: '上一轮回答',
      parts: [{ id: 'part0104', type: 'text', text: '上一轮回答' }],
      createdAt: '2026-06-19T00:00:00.000Z',
      finished: true,
      loading: false
    };
    const currentUserMessage: ChatMessageRecord = {
      id: 'user-current',
      sessionId: 'session-1',
      role: 'user',
      content: '重新生成当前回答',
      parts: [{ id: 'part0105', type: 'text', text: '重新生成当前回答' }],
      createdAt: '2026-06-19T00:00:01.000Z',
      finished: true
    };
    const streamExecutor = vi.fn<ChatRuntimeStreamExecutor>(async ({ assistantMessage: draft }, updateAssistant) => {
      draft.content = '当前新回答';
      draft.parts = [{ id: 'part0106', type: 'text', text: '当前新回答' }];
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
        addMessage: (message) => {
          addedMessages.push({ ...message, parts: [...message.parts] });
        },
        updateMessage: (message) => {
          updatedMessages.push({ ...message, parts: [...message.parts] });
        }
      },
      streamExecutor
    });

    const result = await service.continue(
      createContinueInput({ messages: [previousUserMessage, previousAssistantMessage, currentUserMessage], contextWindow: 200_000 })
    );
    await flushRuntimeTasks();

    expect(addedMessages).toEqual([
      expect.objectContaining({
        id: 'assistant-message-1',
        role: 'assistant',
        runtimeId: result.runtimeId,
        loading: true,
        finished: false,
        createdAt: '2026-06-19T00:00:02.000Z'
      })
    ]);
    expect(updatedMessages).not.toContainEqual(expect.objectContaining({ id: 'assistant-previous', loading: true }));
    expect(streamExecutor).toHaveBeenCalledWith(
      expect.objectContaining({
        userMessage: currentUserMessage,
        assistantMessage: expect.objectContaining({ id: 'assistant-message-1', runtimeId: result.runtimeId }),
        sourceMessages: [
          previousUserMessage,
          previousAssistantMessage,
          currentUserMessage,
          expect.objectContaining({ id: 'assistant-message-1', runtimeId: result.runtimeId })
        ]
      }),
      expect.any(Function)
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
      parts: [{ id: 'part0107', type: 'text', text: 'choose' }],
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
          id: 'part0108',
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
      draft.parts = [...draft.parts, { id: 'part0109', type: 'text', text: 'continued answer' }];
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
      runtimeId: 'runtime-choice-answer',
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

  it('continues the runtime with a cancelled user choice result', async (): Promise<void> => {
    const collector = createEventCollector();
    const updatedMessages: ChatMessageRecord[] = [];
    const userMessage: ChatMessageRecord = {
      id: 'user-1',
      sessionId: 'session-1',
      role: 'user',
      content: 'choose',
      parts: [{ id: 'part0110', type: 'text', text: 'choose' }],
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
          id: 'part0111',
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
          status: 'cancelled',
          error: { code: 'USER_CANCELLED', message: '用户取消了选择' }
        }
      });
      draft.content = 'cancel acknowledged';
      draft.parts = [...draft.parts, { id: 'part0112', type: 'text', text: 'cancel acknowledged' }];
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
      runtimeId: 'runtime-choice-cancelled',
      sessionId: 'session-1',
      clientId: 'client-1',
      agentId: 'agent-1',
      contextWindow: 200_000,
      answer: {
        questionId: 'question-1',
        toolCallId: 'tool-call-1',
        answers: [],
        questionAnswers: [],
        otherText: ''
      }
    });
    await flushRuntimeTasks();

    expect(result).toEqual({ runtimeId: expect.stringMatching(/^runtime-/), sessionId: 'session-1' });
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
              status: 'cancelled',
              error: { code: 'USER_CANCELLED', message: '用户取消了选择' }
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

  it('marks pending tool part as failed without appending duplicate error part when stream executor fails', async (): Promise<void> => {
    const collector = createEventCollector();
    const updatedMessages: ChatMessageRecord[] = [];
    const runtimeError = { code: 'REQUEST_FAILED', message: 'model failed' } as AIServiceError;
    const service = createChatRuntimeService({
      emit: collector.emit,
      createMessageId: (role) => `${role}-message-1`,
      now: () => '2026-06-19T00:00:00.000Z',
      messageReader: createNoopMessageReader(),
      messageWriter: {
        addMessage: (): void => undefined,
        updateMessage: (message): void => {
          updatedMessages.push(structuredClone(message));
        }
      },
      streamExecutor: async ({ assistantMessage }, updateAssistant): Promise<{}> => {
        const pendingSkillPart: ChatMessagePart = {
          id: 'tool-part-1',
          type: 'tool',
          toolCallId: 'tool-call-skill',
          toolName: 'skill',
          status: 'inputting',
          input: { name: 'debugging' },
          inputText: '{"name":"debugging"'
        };

        assistantMessage.parts.push(pendingSkillPart);
        await updateAssistant(assistantMessage);
        throw runtimeError;
      }
    });

    const result = await service.send(createInput({ content: 'hello runtime' }));
    await flushRuntimeTasks();

    const finalMessage = updatedMessages[updatedMessages.length - 1];
    expect(result.runtimeId).toMatch(/^runtime-/);
    expect(finalMessage).toMatchObject({
      id: 'assistant-message-1',
      content: 'model failed',
      parts: [
        {
          type: 'tool',
          toolName: 'skill',
          status: 'done',
          result: {
            toolName: 'skill',
            status: 'failure',
            error: { code: 'EXECUTION_FAILED', message: 'model failed' }
          }
        }
      ],
      loading: false,
      finished: true
    });
    expect(finalMessage.parts).toHaveLength(1);
    expect(finalMessage.parts.some((part) => part.type === 'error')).toBe(false);
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
      parts: [{ id: 'part0113', type: 'text', text: priorMessage.content }],
      createdAt: '2026-06-19T00:00:00.000Z',
      finished: true
    };
    const compressionBoundary: ChatMessageRecord = {
      id: 'compression-1',
      sessionId: 'session-1',
      role: 'compression',
      content: 'COMPRESSED_CONTEXT',
      parts: [{ id: 'part0114', type: 'text', text: 'COMPRESSED_CONTEXT' }],
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
      assistantMessage.parts = [{ id: 'part0115', type: 'text', text: 'replayed answer' }];
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
      parts: [{ id: 'part0116', type: 'text', text: 'COMPRESSED_CONTEXT' }],
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
        assistantMessage.parts.push({ id: 'part0117', type: 'text', text: 'partial answer' });
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

  it('emits a refreshed context usage snapshot after manual compaction succeeds', async (): Promise<void> => {
    const collector = createEventCollector();
    const priorMessage = createMessageRecord('prior-user', 'user', '大量历史上下文'.repeat(40_000), '2026-06-19T00:00:00.000Z');
    const compactedBoundary: ChatMessageRecord = {
      id: 'compression-1',
      sessionId: 'session-1',
      role: 'compression',
      content: 'COMPRESSED_CONTEXT',
      parts: [{ id: 'part0118', type: 'text', text: 'COMPRESSED_CONTEXT' }],
      createdAt: '2026-06-19T00:01:00.000Z',
      compression: {
        status: 'success',
        recordText: 'COMPRESSED_CONTEXT',
        coveredUntilMessageId: 'prior-user'
      }
    };
    const service = createChatRuntimeService({
      emit: collector.emit,
      messageWriter: createNoopMessageWriter(),
      messageReader: { getMessages: () => [priorMessage, compactedBoundary] },
      streamExecutor: createNoopStreamExecutor(),
      compactionService: {
        compact: vi.fn().mockResolvedValue({ status: 'success', messageId: 'compression-1', recordId: 'record-1' })
      }
    });

    await service.compact({
      runtimeId: 'runtime-manual-compact',
      sessionId: 'session-1',
      clientId: 'client-1',
      agentId: 'agent-1',
      reason: 'manual',
      contextWindow: 20_000,
      messages: [priorMessage]
    });

    const usageEvent = collector.events.find(isContextUsageEvent);
    expect(usageEvent?.payload.snapshot.estimatedInputTokens).toBeLessThan(1_000);
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
          input.targetMessage?.parts.push({ id: 'part0119', type: 'compaction', auto: true, reason: 'auto', status: 'pending' });
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

  it('aborts automatic compaction inside a chat runtime without creating an interrupt message', async (): Promise<void> => {
    let compactSignal: AbortSignal | undefined;
    const compactDeferred = createDeferred();
    const addedMessages: ChatMessageRecord[] = [];
    const deletedMessages: Array<{ sessionId: string; messageId: string }> = [];
    const priorMessage: ChatMessageRecord = {
      id: 'prior-user',
      sessionId: 'session-1',
      role: 'user',
      content: '大量历史上下文'.repeat(40_000),
      parts: [{ id: 'part0120', type: 'text', text: '大量历史上下文'.repeat(40_000) }],
      createdAt: '2026-06-19T00:00:00.000Z'
    };
    const service = createChatRuntimeService({
      emit: vi.fn(),
      createMessageId: (role) => `${role}-message-1`,
      now: () => '2026-06-19T00:00:00.000Z',
      messageReader: {
        getMessages: () => [priorMessage]
      },
      messageWriter: {
        addMessage: (message) => {
          addedMessages.push({ ...message, parts: [...message.parts] });
        },
        updateMessage: (): void => undefined,
        deleteMessage: (sessionId, messageId) => {
          deletedMessages.push({ sessionId, messageId });
        }
      },
      streamExecutor: createNoopStreamExecutor(),
      compactionService: {
        compact: async (input) => {
          compactSignal = input.signal;
          await compactDeferred.promise;
          return { status: 'cancelled', messageId: 'compression-1' };
        }
      }
    });

    const result = await service.send(createInput({ content: 'current question', contextWindow: 20_000 }));
    await flushRuntimeTasks();

    await service.abort({ runtimeId: result.runtimeId });

    expect(compactSignal?.aborted).toBe(true);
    expect(addedMessages).not.toContainEqual(expect.objectContaining({ role: 'interrupt' }));
    expect(deletedMessages).toContainEqual({ sessionId: 'session-1', messageId: 'assistant-message-1' });

    compactDeferred.resolve();
  });
});
