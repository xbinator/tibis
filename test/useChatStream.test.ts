/**
 * @file useChatStream.test.ts
 * @description 校验聊天流在用户主动中止时会正确收尾助手消息并触发持久化回调。
 */
import type { AIToolExecutor } from 'types/ai';
import type { ElectronShellCommandOutputChunk } from 'types/electron-api';
import { nextTick, ref } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAwaitingUserInputResult } from '@/ai/tools/results';
import { useChatStream } from '@/components/BChatSidebar/hooks/useChatStream';
import { create } from '@/components/BChatSidebar/utils/messageHelper';
import type { Message, ServiceConfig } from '@/components/BChatSidebar/utils/types';

// Mock localStorage
const mockLocalStorage = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (key: string) => mockLocalStorage.get(key) ?? null,
  setItem: (key: string, value: string) => mockLocalStorage.set(key, value),
  removeItem: (key: string) => mockLocalStorage.delete(key),
  clear: () => mockLocalStorage.clear()
});

// Mock localforage - must use factory function to avoid hoisting issues
const mockLocalforageStorage = new Map<string, unknown>();
vi.mock('localforage', () => {
  const createInstance = () => ({
    config: vi.fn(),
    getItem: vi.fn((key: string) => Promise.resolve(mockLocalforageStorage.get(key) ?? null)),
    setItem: vi.fn((key: string, value: unknown) => {
      mockLocalforageStorage.set(key, value);
      return Promise.resolve();
    }),
    removeItem: vi.fn((key: string) => {
      mockLocalforageStorage.delete(key);
      return Promise.resolve();
    }),
    clear: vi.fn(() => {
      mockLocalforageStorage.clear();
      return Promise.resolve();
    }),
    createInstance: vi.fn(() => createInstance())
  });
  return {
    default: createInstance()
  };
});

/**
 * 被测 hook 传给底层流式 Hook 的回调集合。
 */
interface MockChatCallbacks {
  /** 流式完成回调 */
  onComplete?: () => void | Promise<void>;
  /** 流式结束回调 */
  onFinish?: (chunk: import('types/ai').AIStreamFinishChunk) => void | Promise<void>;
  /** 工具输入开始回调 */
  onToolInputStart?: (chunk: import('types/ai').AIStreamToolInputStartChunk) => void | Promise<void>;
  /** 工具输入增量回调 */
  onToolInputDelta?: (chunk: import('types/ai').AIStreamToolInputDeltaChunk) => void | Promise<void>;
  /** 工具输入结束回调 */
  onToolInputEnd?: (chunk: import('types/ai').AIStreamToolInputEndChunk) => void | Promise<void>;
  /** 工具调用回调 */
  onToolCall?: (chunk: import('types/ai').AIStreamToolCallChunk) => void | Promise<void>;
  /** 工具结果回调 */
  onToolResult?: (chunk: import('types/ai').AIStreamToolResultChunk) => void | Promise<void>;
}

/**
 * 当前测试轮次里底层流式 Hook 捕获到的回调。
 */
let capturedCallbacks: MockChatCallbacks | null = null;
const streamSpy = vi.fn();
let shellOutputCallback: ((chunk: ElectronShellCommandOutputChunk) => void) | null = null;

// Mutable state for mocks - use module-level mutable state
let getAvailableServiceConfigCallCount = 0;
let getAvailableServiceConfigReturnValues: Array<ServiceConfig | null> = [];

const mcpServers: Array<{
  id: string;
  name: string;
  enabled: boolean;
  transport: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  toolAllowlist: string[];
  connectTimeoutMs: number;
  toolCallTimeoutMs: number;
}> = [];

const toolSettingsStoreState = {
  tavily: {
    enabled: false,
    apiKey: '',
    searchDefaults: {
      searchDepth: 'basic' as const,
      topic: 'general',
      timeRange: null as null | string,
      country: 'china',
      maxResults: 5,
      includeAnswer: true,
      includeImages: false,
      includeDomains: [] as string[],
      excludeDomains: [] as string[]
    },
    extractDefaults: {
      extractDepth: 'basic' as const,
      format: 'markdown',
      includeImages: false
    }
  },
  mcp: {
    get servers() {
      return mcpServers;
    }
  }
};

/**
 * 底层流式中止桩函数，用于模拟 Electron 流结束时的完成回调。
 */
const abortSpy = vi.fn<() => void>(() => {
  capturedCallbacks?.onComplete?.();
});

vi.mock('@/hooks/useChat', () => ({
  /**
   * 模拟底层聊天流 Hook，仅暴露本用例需要的 abort 行为。
   */
  useChat: (options: MockChatCallbacks) => {
    capturedCallbacks = options;
    return {
      agent: {
        invoke: vi.fn(),
        stream: streamSpy,
        abort: abortSpy
      }
    };
  }
}));

vi.mock('@/components/BChatSidebar/utils/compression/coordinator', () => ({
  createCompressionCoordinator: () => ({
    compressSessionManually: vi.fn()
  })
}));

vi.mock('@/shared/platform', () => ({
  native: {
    onShellCommandOutput: vi.fn((callback: (chunk: ElectronShellCommandOutputChunk) => void) => {
      shellOutputCallback = callback;
      return () => {
        shellOutputCallback = null;
      };
    })
  }
}));

vi.mock('@/stores/ai/serviceModel', () => ({
  /**
   * 模拟服务模型 store，避免测试初始化时依赖真实 store。
   */
  useServiceModelStore: () => ({
    getAvailableServiceConfig: async (type: string) => {
      const index = getAvailableServiceConfigCallCount++;
      const value = getAvailableServiceConfigReturnValues[index];
      return value !== undefined
        ? value
        : {
            providerId: 'openai',
            modelId: 'gpt-4o',
            toolSupport: { supported: false }
          };
    }
  })
}));

vi.mock('@/stores/ai/toolSettings', () => ({
  /**
   * 模拟工具设置 store，避免测试初始化时依赖真实 store。
   */
  useToolSettingsStore: () => toolSettingsStoreState
}));

/**
 * 创建一个已经收到部分流式内容、但仍处于 loading 的助手消息。
 * @returns 可用于中止测试的助手消息。
 */
function createStreamingAssistantMessage(): Message {
  const message = create.assistantPlaceholder();
  message.parts.push({ type: 'text', text: '部分回复' });
  message.content = '部分回复';
  message.createdAt = '2026-04-30T00:00:00.000Z';
  return message;
}

describe('useChatStream abort', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    capturedCallbacks = null;
    abortSpy.mockClear();
    streamSpy.mockClear();
    mockLocalStorage.clear();
    mockLocalforageStorage.clear();
    // Reset mutable state
    getAvailableServiceConfigCallCount = 0;
    getAvailableServiceConfigReturnValues = [];
    mcpServers.length = 0;
    shellOutputCallback = null;
  });

  it('finalizes the current assistant message and calls onComplete once when the user aborts', () => {
    const messages = ref<Message[]>([create.userMessage('你好'), createStreamingAssistantMessage()]);
    const onComplete = vi.fn<(message: Message) => void>();
    const { stream, loading } = useChatStream({
      messages,
      onComplete
    });

    loading.value = true;
    stream.abort();

    expect(abortSpy).toHaveBeenCalledTimes(1);
    expect(loading.value).toBe(false);
    expect(messages.value).toHaveLength(2);
    expect(messages.value[1].loading).toBe(false);
    expect(messages.value[1].finished).toBe(true);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith(messages.value[1]);
  });

  it('streams converted model messages during chat sends without invoking automatic compression', async () => {
    const messages = ref<Message[]>([]);
    const { stream } = useChatStream({
      messages,
      getSessionId: () => 'session-1'
    });

    const sourceMessages = [create.userMessage('需要压缩上下文')];
    messages.value = [...sourceMessages];

    const config: ServiceConfig = {
      providerId: 'openai',
      modelId: 'gpt-4o',
      toolSupport: {
        supported: false
      }
    };

    await stream.streamMessages(sourceMessages, config);

    expect(streamSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [{ role: 'user', content: '需要压缩上下文' }],
        modelId: 'gpt-4o'
      })
    );
  });

  it('passes enabled MCP servers to the AI stream request', async () => {
    const messages = ref<Message[]>([]);
    const { stream } = useChatStream({
      messages,
      getSessionId: () => 'session-1'
    });
    const sourceMessages = [create.userMessage('列出仓库文件')];
    const config: ServiceConfig = {
      providerId: 'openai',
      modelId: 'gpt-4o',
      toolSupport: {
        supported: false
      }
    };

    // Add server to the mutable array
    mcpServers.push({
      id: 'filesystem',
      name: 'Filesystem',
      enabled: true,
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem'],
      env: {},
      toolAllowlist: ['list_directory'],
      connectTimeoutMs: 20000,
      toolCallTimeoutMs: 30000
    });

    await stream.streamMessages(sourceMessages, config);

    expect(streamSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        mcp: expect.objectContaining({
          servers: expect.arrayContaining([expect.objectContaining({ id: 'filesystem', command: 'npx' })]),
          enabledServerIds: expect.arrayContaining(['filesystem'])
        })
      })
    );
  });

  it('retries resolving service config when startup race makes the first lookup return null', async () => {
    // Set up return values for sequential calls
    getAvailableServiceConfigReturnValues = [
      null,
      {
        providerId: 'openai',
        modelId: 'gpt-4o',
        toolSupport: {
          supported: false
        }
      }
    ];

    const messages = ref<Message[]>([]);
    const { stream } = useChatStream({ messages });

    const result = await stream.resolveServiceConfig();
    expect(result).toEqual(
      expect.objectContaining({
        providerId: 'openai',
        modelId: 'gpt-4o',
        toolSupport: expect.objectContaining({
          supported: false
        })
      })
    );
    expect(getAvailableServiceConfigCallCount).toBe(2);
  });

  it('does not try to execute Tavily SDK tools locally when the stream emits a remote tool call', async () => {
    const messages = ref<Message[]>([create.userMessage('搜索一下最新消息')]);
    const onComplete = vi.fn<(message: Message) => void>();
    const { stream } = useChatStream({
      messages,
      tools: [],
      onComplete
    });

    const config: ServiceConfig = {
      providerId: 'openai',
      modelId: 'gpt-4o',
      toolSupport: {
        supported: true
      }
    };

    await stream.streamMessages(messages.value, config);
    capturedCallbacks?.onToolCall?.({
      toolCallId: 'tool-call-1',
      toolName: 'tavily_search',
      input: { query: 'AI news' }
    });
    capturedCallbacks?.onComplete?.();
    await Promise.resolve();
    await Promise.resolve();

    expect(messages.value).toHaveLength(2);
    expect(messages.value[1].parts.some((p) => p.type === 'tool-call' && p.toolName === 'tavily_search')).toBe(true);
  });

  it('appends Tavily remote tool results into assistant message parts', async () => {
    const messages = ref<Message[]>([create.userMessage('搜索一下')]);
    const { stream } = useChatStream({ messages });

    const config: ServiceConfig = {
      providerId: 'openai',
      modelId: 'gpt-4o',
      toolSupport: {
        supported: true
      }
    };

    await stream.streamMessages(messages.value, config);
    capturedCallbacks?.onToolCall?.({
      toolCallId: 'tc-1',
      toolName: 'tavily_search',
      input: { query: 'weather' }
    });
    capturedCallbacks?.onToolResult?.({
      toolCallId: 'tc-1',
      toolName: 'tavily_search',
      result: { toolName: 'tavily_search', status: 'success', data: 'Sunny' }
    });
    capturedCallbacks?.onComplete?.();
    await Promise.resolve();

    const assistantMsg = messages.value[1];
    expect(assistantMsg.parts.some((p) => p.type === 'tool-result' && p.toolName === 'tavily_search')).toBe(true);
  });

  it('processes Tavily tool results and completes the stream', async () => {
    const messages = ref<Message[]>([create.userMessage('搜索')]);
    const { stream } = useChatStream({ messages });

    const config: ServiceConfig = {
      providerId: 'openai',
      modelId: 'gpt-4o',
      toolSupport: {
        supported: true
      }
    };

    await stream.streamMessages(messages.value, config);
    capturedCallbacks?.onToolCall?.({
      toolCallId: 'tc-2',
      toolName: 'tavily_search',
      input: { query: 'news' }
    });
    // Simulate tool result and complete
    capturedCallbacks?.onToolResult?.({
      toolCallId: 'tc-2',
      toolName: 'tavily_search',
      result: { toolName: 'tavily_search', status: 'success', data: 'News results' }
    });
    capturedCallbacks?.onComplete?.();
    await Promise.resolve();
    await Promise.resolve();

    // After stream completes, the assistant message should be created
    expect(messages.value).toHaveLength(2);
    expect(messages.value[1].role).toBe('assistant');
  });

  it('keeps stream loading active and leaves the assistant message unfinished while awaiting user choice submission', async () => {
    const messages = ref<Message[]>([create.userMessage('执行')]);
    const { stream, loading } = useChatStream({
      messages,
      tools: [
        {
          definition: {
            name: 'run_command',
            description: 'Run a command',
            parameters: { type: 'object', properties: {} }
          },
          execute: vi.fn(),
          isReadOnly: () => false,
          needConfirmation: () => true
        } as unknown as AIToolExecutor
      ]
    });

    const config: ServiceConfig = {
      providerId: 'openai',
      modelId: 'gpt-4o',
      toolSupport: {
        supported: true
      }
    };

    await stream.streamMessages(messages.value, config);
    capturedCallbacks?.onToolCall?.({
      toolCallId: 'tc-3',
      toolName: 'run_command',
      input: { cmd: 'ls' }
    });
    // Simulate tool result with awaiting_user_input status
    capturedCallbacks?.onToolResult?.({
      toolCallId: 'tc-3',
      toolName: 'run_command',
      result: createAwaitingUserInputResult('run_command', {
        questionId: 'tc-3',
        toolCallId: 'tc-3',
        mode: 'single',
        question: 'Confirm?',
        options: [{ label: 'Yes', value: 'yes' }]
      })
    });
    capturedCallbacks?.onComplete?.();
    await Promise.resolve();

    expect(loading.value).toBe(true);
    // After awaiting user input, the message should exist and loading should be true
    expect(messages.value).toHaveLength(2);
    expect(messages.value[1].role).toBe('assistant');
  });

  it('handles tool execution and completes the stream', async () => {
    const messages = ref<Message[]>([create.userMessage('循环测试')]);
    const { stream } = useChatStream({ messages });

    const config: ServiceConfig = {
      providerId: 'openai',
      modelId: 'gpt-4o',
      toolSupport: {
        supported: true
      }
    };

    await stream.streamMessages(messages.value, config);
    capturedCallbacks?.onToolCall?.({
      toolCallId: 'tc-loop',
      toolName: 'run_command',
      input: { cmd: 'whoami' }
    });
    capturedCallbacks?.onToolResult?.({
      toolCallId: 'tc-loop',
      toolName: 'run_command',
      result: { toolName: 'run_command', status: 'success', data: 'user' }
    });
    capturedCallbacks?.onComplete?.();
    await Promise.resolve();

    expect(messages.value).toHaveLength(2);
    expect(messages.value[1].role).toBe('assistant');
  });

  it('appends live shell output chunks to the matching tool call while execution is pending', async () => {
    let resolveTool: ((value: Awaited<ReturnType<AIToolExecutor['execute']>>) => void) | null = null;
    const shellTool: AIToolExecutor = {
      definition: {
        name: 'run_shell_command',
        description: 'Run shell command',
        source: 'builtin',
        riskLevel: 'dangerous',
        requiresActiveDocument: false,
        parameters: { type: 'object', properties: {} }
      },
      execute: vi.fn(
        () =>
          new Promise((resolve) => {
            resolveTool = resolve;
          })
      )
    };
    const messages = ref<Message[]>([create.userMessage('执行测试')]);
    const { stream } = useChatStream({ messages, tools: [shellTool] });
    const config: ServiceConfig = {
      providerId: 'openai',
      modelId: 'gpt-4o',
      toolSupport: {
        supported: true
      }
    };

    await stream.streamMessages(messages.value, config);
    const toolCallPromise = capturedCallbacks?.onToolCall?.({
      toolCallId: 'tc-shell',
      toolName: 'run_shell_command',
      input: { shell: 'bash', command: 'pnpm test' }
    });
    await Promise.resolve();
    shellOutputCallback?.({
      commandId: 'tc-shell',
      stream: 'stdout',
      text: 'running\n',
      sequence: 1,
      createdAt: '2026-05-24T00:00:00.000Z'
    });

    const assistantMessage = messages.value[1];
    const toolCallPart = assistantMessage.parts.find((part) => part.type === 'tool-call' && part.toolCallId === 'tc-shell');
    expect(toolCallPart?.type === 'tool-call' ? toolCallPart.shellOutput?.[0]?.text : '').toBe('running\n');

    resolveTool?.({ toolName: 'run_shell_command', status: 'success', data: { exitCode: 0 } });
    await toolCallPromise;
  });

  it('allows submitting user choice while stream loading remains active for awaiting input', async () => {
    const messages = ref<Message[]>([create.userMessage('选择')]);
    const { stream, loading } = useChatStream({ messages });

    const config: ServiceConfig = {
      providerId: 'openai',
      modelId: 'gpt-4o',
      toolSupport: {
        supported: true
      }
    };

    await stream.streamMessages(messages.value, config);
    capturedCallbacks?.onToolCall?.({
      toolCallId: 'tc-choice',
      toolName: 'ask_user_choice',
      input: createAwaitingUserInputResult('ask_user_choice', {
        questionId: 'tc-choice',
        toolCallId: 'tc-choice',
        mode: 'single',
        question: 'Continue?',
        options: [{ label: 'Yes', value: 'yes' }]
      }) as unknown as Record<string, unknown>
    });
    // Simulate tool result with awaiting_user_input status to set awaitingUserChoice to true
    capturedCallbacks?.onToolResult?.({
      toolCallId: 'tc-choice',
      toolName: 'ask_user_choice',
      result: createAwaitingUserInputResult('ask_user_choice', {
        questionId: 'tc-choice',
        toolCallId: 'tc-choice',
        mode: 'single',
        question: 'Continue?',
        options: [{ label: 'Yes', value: 'yes' }]
      })
    });
    capturedCallbacks?.onComplete?.();
    await Promise.resolve();

    expect(loading.value).toBe(true);

    // submitUserChoice expects AIUserChoiceAnswerData type
    const submitted = await stream.submitUserChoice({ questionId: 'tc-choice', toolCallId: 'tc-choice', answers: ['yes'] });
    expect(submitted).toBe(true);
  });

  it('processes tool input streaming during chat', async () => {
    const messages = ref<Message[]>([create.userMessage('写文件')]);
    const { stream } = useChatStream({ messages });

    const config: ServiceConfig = {
      providerId: 'openai',
      modelId: 'gpt-4o',
      toolSupport: {
        supported: true
      }
    };

    await stream.streamMessages(messages.value, config);
    capturedCallbacks?.onToolInputStart?.({
      toolCallId: 'tc-write',
      toolName: 'write_file'
    });
    capturedCallbacks?.onToolInputDelta?.({
      toolCallId: 'tc-write',
      inputTextDelta: '{"path": "test.txt"}'
    });
    capturedCallbacks?.onToolInputEnd?.({
      toolCallId: 'tc-write'
    });
    await Promise.resolve();

    const assistantMsg = messages.value[1];
    // Tool input is stored as 'tool-input' part type
    const inputPart = assistantMsg.parts.find((p) => p.type === 'tool-input');
    expect(inputPart).toBeTruthy();
  });
});
