/**
 * @file aiService.test.ts
 * @description 验证 Electron AI 服务的结构化输出接入与错误日志分级行为。
 */
import type { AICreateOptions, AIRequestOptions } from 'types/ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const generateTextMock = vi.fn();
const streamTextMock = vi.fn();
const jsonSchemaMock = vi.fn();
const outputObjectMock = vi.fn();
const logErrorMock = vi.fn();
const logWarnMock = vi.fn();
const toolMock = vi.fn();
const stepCountIsMock = vi.fn();
const tavilySearchMock = vi.fn();
const tavilyExtractMock = vi.fn();
const tavilyExtractExecuteMock = vi.fn();
const getMcpDiscoveryCacheMock = vi.fn();
const executeMcpToolMock = vi.fn();

vi.mock('ai', () => ({
  Output: {
    object: outputObjectMock
  },
  generateText: generateTextMock,
  jsonSchema: jsonSchemaMock,
  stepCountIs: stepCountIsMock,
  streamText: streamTextMock,
  tool: toolMock
}));

vi.mock('@tavily/ai-sdk', () => ({
  tavilySearch: tavilySearchMock,
  tavilyExtract: tavilyExtractMock
}));

vi.mock('../../electron/main/modules/logger/service.mjs', () => ({
  log: {
    info: vi.fn(),
    warn: logWarnMock,
    error: logErrorMock
  }
}));

vi.mock('../../electron/main/modules/ai/providers/_index.mjs', () => ({
  AIProviderRegistry: class MockAIProviderRegistry {
    /**
     * 创建测试模型实例。
     * @returns 测试模型
     */
    create(): unknown {
      return {};
    }

    /**
     * 将测试错误标准化为限流错误。
     * @returns 标准化限流错误
     */
    normalizeError(): { code: string; message: string } {
      return { code: 'RATE_LIMITED', message: '请求过于频繁或额度已耗尽，请稍后重试' };
    }
  }
}));

vi.mock('../../electron/main/modules/mcp/runtime.mjs', () => ({
  getMcpDiscoveryCache: getMcpDiscoveryCacheMock,
  executeMcpTool: executeMcpToolMock
}));

describe('aiService', () => {
  beforeEach(() => {
    vi.resetModules();
    generateTextMock.mockReset();
    streamTextMock.mockReset();
    jsonSchemaMock.mockReset();
    outputObjectMock.mockReset();
    logErrorMock.mockReset();
    logWarnMock.mockReset();
    toolMock.mockReset();
    stepCountIsMock.mockReset();
    tavilySearchMock.mockReset();
    tavilyExtractMock.mockReset();
    tavilyExtractExecuteMock.mockReset();
    getMcpDiscoveryCacheMock.mockReset();
    executeMcpToolMock.mockReset();
    toolMock.mockImplementation((definition) => definition);
  });

  it('passes structured output schema to AI SDK when request asks for object output', async () => {
    const { aiService } = await import('../../electron/main/modules/ai/service.mjs');
    const createOptions: AICreateOptions = { providerType: 'openai', providerId: 'provider-1', providerName: 'OpenAI' };
    const request: AIRequestOptions = {
      modelId: 'model-1',
      prompt: '生成结构化摘要',
      output: {
        schema: {
          type: 'object',
          properties: {
            goal: { type: 'string' }
          },
          required: ['goal'],
          additionalProperties: false
        },
        name: 'conversation_summary'
      }
    };

    jsonSchemaMock.mockImplementation((schema) => schema);
    outputObjectMock.mockReturnValue({ mocked: true });
    generateTextMock.mockResolvedValue({
      text: '{"goal":"整理需求"}',
      output: { goal: '整理需求' },
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }
    });

    const [error, result] = await aiService.generateText(createOptions, request);

    expect(error).toBeUndefined();
    expect(outputObjectMock).toHaveBeenCalledWith({
      schema: request.output?.schema,
      name: 'conversation_summary',
      description: undefined
    });
    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: '生成结构化摘要',
        output: { mocked: true }
      })
    );
    expect(result?.text).toBe('{"goal":"整理需求"}');
  });

  it('logs rate limited invoke errors without dumping the original stack', async () => {
    const { aiService } = await import('../../electron/main/modules/ai/service.mjs');
    const createOptions: AICreateOptions = { providerType: 'anthropic', providerId: 'provider-1', providerName: 'Anthropic' };
    const request: AIRequestOptions = { modelId: 'model-1', prompt: '生成标题' };
    const overloadedError = new Error('overloaded_error (529)');

    generateTextMock.mockRejectedValue(overloadedError);

    const [error] = await aiService.generateText(createOptions, request);

    expect(error?.code).toBe('RATE_LIMITED');
    expect(logWarnMock).toHaveBeenCalledWith('[AIService] generateText RATE_LIMITED:', '请求过于频繁或额度已耗尽，请稍后重试');
    expect(logErrorMock).not.toHaveBeenCalledWith('[AIService] generateText error:', overloadedError);
  });

  it('registers Tavily server tools when enabled and apiKey is present', async () => {
    const { aiService } = await import('../../electron/main/modules/ai/service.mjs');
    const createOptions: AICreateOptions = { providerType: 'openai', providerId: 'provider-1', providerName: 'OpenAI' };
    const request: AIRequestOptions = {
      modelId: 'model-1',
      prompt: '搜索一下今天的 AI 新闻',
      tavily: {
        enabled: true,
        apiKey: 'tvly-dev-key'
      }
    };

    tavilySearchMock.mockReturnValue({ kind: 'tavily-search-tool' });
    tavilyExtractMock.mockReturnValue({ kind: 'tavily-extract-tool', execute: tavilyExtractExecuteMock });
    stepCountIsMock.mockReturnValue({ kind: 'stop-when-5' });
    generateTextMock.mockResolvedValue({
      text: 'ok',
      output: undefined,
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }
    });

    await aiService.generateText(createOptions, request);

    expect(tavilySearchMock).toHaveBeenCalledWith({
      apiKey: 'tvly-dev-key',
      topic: 'general',
      country: 'china',
      maxResults: 5,
      includeAnswer: true,
      includeImages: false,
      includeDomains: [],
      excludeDomains: [],
      searchDepth: 'basic',
      timeRange: undefined
    });
    expect(tavilyExtractMock).toHaveBeenCalledWith({
      apiKey: 'tvly-dev-key',
      includeImages: false,
      extractDepth: 'basic',
      format: 'markdown'
    });
    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        stopWhen: { kind: 'stop-when-5' },
        tools: expect.objectContaining({
          tavily_search: { kind: 'tavily-search-tool' },
          tavily_extract: expect.objectContaining({
            description: expect.stringContaining('single URL'),
            execute: expect.any(Function)
          })
        })
      })
    );
  });

  it('enables multi-step tool continuation for Tavily during streamText', async () => {
    const { aiService } = await import('../../electron/main/modules/ai/service.mjs');
    const createOptions: AICreateOptions = { providerType: 'openai', providerId: 'provider-1', providerName: 'OpenAI' };
    const request: AIRequestOptions = {
      modelId: 'model-1',
      prompt: '搜索一下今天的 AI 新闻',
      tavily: {
        enabled: true,
        apiKey: 'tvly-dev-key'
      }
    };

    tavilySearchMock.mockReturnValue({ kind: 'tavily-search-tool' });
    tavilyExtractMock.mockReturnValue({ kind: 'tavily-extract-tool', execute: tavilyExtractExecuteMock });
    stepCountIsMock.mockReturnValue({ kind: 'stop-when-5' });
    streamTextMock.mockReturnValue({ fullStream: [] });

    await aiService.streamText(createOptions, request);

    expect(stepCountIsMock).toHaveBeenCalledWith(5);
    expect(streamTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: '搜索一下今天的 AI 新闻',
        stopWhen: { kind: 'stop-when-5' },
        tools: expect.objectContaining({
          tavily_search: { kind: 'tavily-search-tool' },
          tavily_extract: expect.objectContaining({
            description: expect.stringContaining('single URL'),
            execute: expect.any(Function)
          })
        })
      })
    );
  });

  it('adapts single url input to Tavily extract urls array', async () => {
    const { aiService } = await import('../../electron/main/modules/ai/service.mjs');
    const createOptions: AICreateOptions = { providerType: 'openai', providerId: 'provider-1', providerName: 'OpenAI' };
    const request: AIRequestOptions = {
      modelId: 'model-1',
      prompt: '提取这个页面',
      tavily: {
        enabled: true,
        apiKey: 'tvly-dev-key'
      }
    };

    tavilySearchMock.mockReturnValue({ kind: 'tavily-search-tool' });
    tavilyExtractMock.mockReturnValue({ kind: 'tavily-extract-tool', execute: tavilyExtractExecuteMock });
    stepCountIsMock.mockReturnValue({ kind: 'stop-when-5' });
    generateTextMock.mockImplementation(async (options) => {
      await options.tools.tavily_extract.execute(
        {
          url: 'https://example.com/post',
          extractDepth: 'advanced',
          query: 'Summarize the article'
        },
        {}
      );
      return {
        text: 'ok',
        output: undefined,
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }
      };
    });

    await aiService.generateText(createOptions, request);

    expect(tavilyExtractExecuteMock).toHaveBeenCalledWith(
      {
        urls: ['https://example.com/post'],
        extractDepth: 'advanced',
        query: 'Summarize the article'
      },
      expect.any(Object)
    );
  });

  it('does not register Tavily server tools when disabled', async () => {
    const { aiService } = await import('../../electron/main/modules/ai/service.mjs');
    const createOptions: AICreateOptions = { providerType: 'openai', providerId: 'provider-1', providerName: 'OpenAI' };
    const request: AIRequestOptions = {
      modelId: 'model-1',
      prompt: 'hello',
      tavily: {
        enabled: false,
        apiKey: 'tvly-dev-key'
      }
    };

    generateTextMock.mockResolvedValue({
      text: 'ok',
      output: undefined,
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }
    });

    await aiService.generateText(createOptions, request);

    expect(tavilySearchMock).not.toHaveBeenCalled();
    expect(tavilyExtractMock).not.toHaveBeenCalled();
  });

  it('appends MCP tool instructions to the system prompt in AI service', async () => {
    const { aiService } = await import('../../electron/main/modules/ai/service.mjs');
    const createOptions: AICreateOptions = { providerType: 'openai', providerId: 'provider-1', providerName: 'OpenAI' };
    const request: AIRequestOptions = {
      modelId: 'model-1',
      prompt: '列出文件',
      system: '你是本地写作助手。',
      mcp: {
        servers: [],
        enabledServerIds: ['filesystem'],
        enabledTools: [{ serverId: 'filesystem', toolName: 'list_directory' }],
        toolInstructions: '只读取用户当前工作区，不要访问系统目录。'
      }
    };

    generateTextMock.mockResolvedValue({
      text: 'ok',
      output: undefined,
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }
    });

    await aiService.generateText(createOptions, request);

    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        system: '你是本地写作助手。\n\nMCP tool usage instructions:\n只读取用户当前工作区，不要访问系统目录。'
      })
    );
  });

  it('registers discovered MCP tools and executes them through the local runtime', async () => {
    const { aiService } = await import('../../electron/main/modules/ai/service.mjs');
    const createOptions: AICreateOptions = { providerType: 'openai', providerId: 'provider-1', providerName: 'OpenAI' };
    const server = {
      id: 'filesystem',
      name: 'Filesystem',
      enabled: true,
      transport: 'stdio' as const,
      command: 'node',
      args: ['server.mjs'],
      env: {},
      toolAllowlist: ['list_directory'],
      connectTimeoutMs: 20000,
      toolCallTimeoutMs: 30000
    };
    const request: AIRequestOptions = {
      modelId: 'model-1',
      prompt: '列出文件',
      mcp: {
        servers: [server],
        enabledServerIds: ['filesystem'],
        enabledTools: [],
        toolInstructions: ''
      }
    };

    jsonSchemaMock.mockImplementation((schema) => schema);
    getMcpDiscoveryCacheMock.mockReturnValue({
      serverId: 'filesystem',
      discoveredAt: 1710000000000,
      tools: [{ serverId: 'filesystem', toolName: 'list_directory', description: 'List files', inputSchema: { type: 'object' } }]
    });
    executeMcpToolMock.mockResolvedValue({ content: [{ type: 'text', text: 'README.md' }] });
    generateTextMock.mockImplementation(async (options) => {
      const toolName = Object.keys(options.tools)[0];
      await options.tools[toolName].execute({ path: '.' }, {});
      return {
        text: 'ok',
        output: undefined,
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }
      };
    });

    await aiService.generateText(createOptions, request);

    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: expect.objectContaining({})
      })
    );
    expect(executeMcpToolMock).toHaveBeenCalledWith(server, 'list_directory', { path: '.' });
  });
});
