/**
 * @file use-chat-stream-persistence.test.ts
 * @description BChatSidebar 流式完成前的消息落库快照测试。
 */
import type { AIToolExecutor } from 'types/ai';
import { nextTick, ref, type Ref } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatStream } from '@/components/BChatSidebar/hooks/useChatStream';
import type { Message } from '@/components/BChatSidebar/utils/types';
import type { UseStreamOptions } from '@/hooks/useChat';

/** 捕获 useChat 注册的流式回调，供测试直接驱动。 */
const mockUseChatState = vi.hoisted(
  (): {
    options: UseStreamOptions | null;
    stream: ReturnType<typeof vi.fn<() => void>>;
  } => ({
    options: null,
    stream: vi.fn<() => void>()
  })
);

/**
 * 测试用可控 Promise。
 */
interface DeferredPromise {
  /** 等待中的 Promise。 */
  promise: Promise<void>;
  /** 手动 resolve 当前 Promise。 */
  resolve: () => void;
}

/**
 * 创建测试用可控 Promise。
 * @returns 可手动 resolve 的 Promise 包装。
 */
function createDeferredPromise(): DeferredPromise {
  let resolvePromise: () => void = () => undefined;
  const promise = new Promise<void>((resolve): void => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
}

/**
 * 创建用户消息测试数据。
 * @returns 用户消息。
 */
function createUserMessage(): Message {
  return {
    id: 'user-1',
    role: 'user',
    content: '请回答',
    parts: [{ type: 'text', text: '请回答' }],
    createdAt: '2026-06-05T00:00:00.000Z',
    finished: true
  };
}

/**
 * 创建无需编辑器上下文的测试工具。
 * @returns AI 工具执行器。
 */
function createTestTool(): AIToolExecutor {
  return {
    definition: {
      name: 'test_tool',
      description: '测试工具',
      source: 'builtin',
      riskLevel: 'read',
      requiresActiveDocument: false,
      parameters: {
        type: 'object',
        properties: {}
      }
    },
    execute: async () => ({
      toolName: 'test_tool',
      status: 'success',
      data: { ok: true }
    })
  };
}

/**
 * 等待工具调用异步执行队列完成。
 */
async function flushToolExecution(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

/**
 * 启动一轮测试聊天流。
 * @param messages - 消息列表。
 * @param onComplete - 完成回调。
 * @param tools - 可选工具列表。
 */
async function startChatStream(messages: Ref<Message[]>, onComplete?: (message: Message) => Promise<void> | void, tools: AIToolExecutor[] = []): Promise<void> {
  const chatStream = useChatStream({
    messages,
    tools,
    onComplete
  });

  await chatStream.stream.streamMessages(messages.value, {
    providerId: 'provider-1',
    modelId: 'model-1',
    toolSupport: { supported: Boolean(tools.length) }
  });
}

vi.mock('@/hooks/useChat', () => ({
  useChat: vi.fn((options: UseStreamOptions) => {
    mockUseChatState.options = options;
    return {
      agent: {
        stream: mockUseChatState.stream,
        abort: vi.fn<() => void>(),
        invoke: vi.fn()
      }
    };
  })
}));

vi.mock('@/shared/platform', () => ({
  native: {
    onShellCommandOutput: vi.fn<() => () => void>(() => vi.fn<() => void>())
  }
}));

vi.mock('@/stores/ai/serviceModel', () => ({
  useServiceModelStore: vi.fn(() => ({
    getAvailableServiceConfig: vi.fn()
  }))
}));

vi.mock('@/stores/ai/toolSettings', () => ({
  useToolSettingsStore: vi.fn(() => ({
    mcp: {
      servers: []
    },
    tavily: undefined
  }))
}));

vi.mock('@/stores/ai/memory', () => ({
  useMemoryStore: vi.fn(() => ({
    loaded: true,
    loadMemory: vi.fn(),
    buildSystemPromptContext: vi.fn(() => '')
  }))
}));

describe('useChatStream persistence snapshot', () => {
  beforeEach((): void => {
    mockUseChatState.options = null;
    mockUseChatState.stream.mockClear();
    vi.restoreAllMocks();
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((): number => 1)
    );
    vi.stubGlobal(
      'cancelAnimationFrame',
      vi.fn((): void => undefined)
    );
  });

  it('flushes buffered text before notifying completion so persisted assistant messages keep the final answer', async (): Promise<void> => {
    const messages = ref<Message[]>([createUserMessage()]);
    const completedMessages: Message[] = [];
    await startChatStream(messages, (message: Message): void => {
      completedMessages.push({ ...message, parts: [...message.parts] });
    });

    await mockUseChatState.options?.onText?.('最终回答');
    await mockUseChatState.options?.onComplete?.();

    expect(completedMessages).toHaveLength(1);
    expect(completedMessages[0].content).toBe('最终回答');
    expect(completedMessages[0].parts).toEqual([{ type: 'text', text: '最终回答' }]);
  });

  it('waits for intermediate tool-result persistence before starting the continuation round', async (): Promise<void> => {
    const messages = ref<Message[]>([createUserMessage()]);
    const firstPersist = createDeferredPromise();
    const completedMessages: Message[] = [];

    await startChatStream(
      messages,
      async (message: Message): Promise<void> => {
        completedMessages.push({ ...message, parts: [...message.parts] });
        if (completedMessages.length === 1) {
          await firstPersist.promise;
        }
      },
      [createTestTool()]
    );

    await mockUseChatState.options?.onToolCall?.({
      toolCallId: 'tool-call-1',
      toolName: 'test_tool',
      input: {}
    });
    await flushToolExecution();
    const completeTask = Promise.resolve(mockUseChatState.options?.onComplete?.());
    await nextTick();

    expect(completedMessages).toHaveLength(1);
    expect(mockUseChatState.stream).toHaveBeenCalledTimes(1);

    firstPersist.resolve();
    await completeTask;
    await nextTick();

    expect(mockUseChatState.stream).toHaveBeenCalledTimes(2);
  });
});
