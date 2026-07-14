/**
 * @file service.test.ts
 * @description AI 主进程服务返回值封装测试。
 */
import type { AIProvider } from '../../../../../electron/main/modules/ai/types.mjs';
import type { ModelMessage } from 'ai';
import type { AICreateOptions, AIInvokeResult } from 'types/ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AlibabaProvider } from '../../../../../electron/main/modules/ai/providers/alibaba.mjs';
import { DeepSeekProvider } from '../../../../../electron/main/modules/ai/providers/deepseek.mjs';
import { GLMProvider } from '../../../../../electron/main/modules/ai/providers/glm.mjs';
import { MiMoProvider } from '../../../../../electron/main/modules/ai/providers/mimo.mjs';
import { MiniMaxProvider } from '../../../../../electron/main/modules/ai/providers/minimax.mjs';
import { MoonshotProvider } from '../../../../../electron/main/modules/ai/providers/moonshot.mjs';
import { VolcengineProvider } from '../../../../../electron/main/modules/ai/providers/volcengine.mjs';
import { aiService, createAIInvokeResult } from '../../../../../electron/main/modules/ai/service.mjs';

/** AI SDK 外部调用边界 mock。 */
const aiSdkMocks = vi.hoisted(() => ({
  generateText: vi.fn(),
  isStepCount: vi.fn((count: number): { count: number } => ({ count })),
  streamText: vi.fn()
}));

/** AI 服务日志边界 mock。 */
const logMocks = vi.hoisted(() => ({
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn()
}));

vi.mock('ai', async (importOriginal: <T = unknown>() => Promise<T>): Promise<Record<string, unknown>> => {
  const actual = await importOriginal<typeof import('ai')>();

  return {
    ...actual,
    generateText: aiSdkMocks.generateText,
    isStepCount: aiSdkMocks.isStepCount,
    streamText: aiSdkMocks.streamText
  };
});

vi.mock('../../../../../electron/main/modules/logger/service.mjs', (): { log: typeof logMocks } => ({ log: logMocks }));

/** AI 服务测试创建选项。 */
const AI_CREATE_OPTIONS: AICreateOptions = {
  providerType: 'openai',
  providerId: 'openai-test',
  providerName: 'OpenAI Test',
  apiKey: 'test-key'
};

/** AI 文本生成结果夹具类型。 */
type GenerateTextResultFixture = Parameters<typeof createAIInvokeResult>[0];

/**
 * 创建 output getter 会抛错的纯文本生成结果。
 * @returns AI SDK 文本生成结果形状
 */
function createTextOnlyResultWithThrowingOutput(): GenerateTextResultFixture {
  const resultWithoutOutput = {
    text: '',
    usage: {
      inputTokens: 737,
      outputTokens: 150,
      totalTokens: 887
    }
  } satisfies Omit<GenerateTextResultFixture, 'output'>;

  return Object.defineProperty(resultWithoutOutput, 'output', {
    get: (): unknown => {
      throw new Error('No output generated');
    }
  }) as GenerateTextResultFixture;
}

/**
 * 创建结构化输出生成结果。
 * @returns AI SDK 文本生成结果形状
 */
function createStructuredResult(): GenerateTextResultFixture {
  return {
    text: '',
    output: { title: '摘要' },
    usage: {
      inputTokens: 1,
      outputTokens: 2,
      totalTokens: 3
    }
  };
}

/**
 * 创建空的 AI SDK 事件流。
 * @returns 不产生事件的异步流
 */
async function* createEmptyStream(): AsyncGenerator<never, void, undefined> {
  yield* [];
}

describe('AI SDK 7 service integration', (): void => {
  beforeEach((): void => {
    vi.clearAllMocks();
    vi.spyOn(aiService.aiProvider, 'create').mockReturnValue({} as ReturnType<typeof aiService.aiProvider.create>);
    vi.spyOn(aiService.aiProvider, 'createProviderOptions').mockReturnValue(undefined);
  });

  afterEach((): void => {
    vi.restoreAllMocks();
  });

  it('passes trusted system messages with v7 instructions', async (): Promise<void> => {
    const messages: ModelMessage[] = [
      { role: 'system', content: 'Compressed project context.' },
      { role: 'user', content: 'Continue the task.' }
    ];
    aiSdkMocks.generateText.mockResolvedValue({
      text: 'Generated response',
      usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5 }
    });

    const [error] = await aiService.generateText(AI_CREATE_OPTIONS, {
      modelId: 'gpt-test',
      system: 'Follow the workspace rules.',
      messages
    });

    expect(error).toBeUndefined();
    expect(aiSdkMocks.generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        instructions: 'Follow the workspace rules.',
        allowSystemInMessages: true,
        messages
      })
    );
    expect(aiSdkMocks.generateText).not.toHaveBeenCalledWith(expect.objectContaining({ system: expect.anything() }));
  });

  it('uses the v7 step-count stop condition for executable tools', async (): Promise<void> => {
    aiSdkMocks.generateText.mockResolvedValue({
      text: 'Search result',
      usage: { inputTokens: 4, outputTokens: 3, totalTokens: 7 }
    });

    const [error] = await aiService.generateText(AI_CREATE_OPTIONS, {
      modelId: 'gpt-test',
      prompt: 'Search the web.',
      tavily: { enabled: true, apiKey: 'tavily-test-key' }
    });

    expect(error).toBeUndefined();
    expect(aiSdkMocks.isStepCount).toHaveBeenCalledWith(5);
    expect(aiSdkMocks.generateText).toHaveBeenCalledWith(expect.objectContaining({ stopWhen: { count: 5 } }));
  });

  it('preserves final-step usage for generated text', async (): Promise<void> => {
    aiSdkMocks.generateText.mockResolvedValue({
      text: 'Final answer',
      usage: { inputTokens: 12, outputTokens: 8, totalTokens: 20 },
      finalStep: {
        usage: { inputTokens: 7, outputTokens: 5, totalTokens: 12 }
      }
    });

    const [error, result] = await aiService.generateText(AI_CREATE_OPTIONS, {
      modelId: 'gpt-test',
      prompt: 'Use tools and answer.'
    });

    expect(error).toBeUndefined();
    expect(result?.usage).toEqual({ inputTokens: 7, outputTokens: 5, totalTokens: 12 });
  });

  it('returns the v7 full event stream', async (): Promise<void> => {
    const stream = createEmptyStream();
    aiSdkMocks.streamText.mockReturnValue({ stream });

    const [error, result] = await aiService.streamText(AI_CREATE_OPTIONS, {
      modelId: 'gpt-test',
      prompt: 'Stream a response.'
    });

    expect(error).toBeUndefined();
    expect(result?.stream).toBe(stream);
  });
});

describe('createAIInvokeResult', (): void => {
  it('does not read SDK output when no structured output was requested', (): void => {
    const result = createAIInvokeResult(createTextOnlyResultWithThrowingOutput(), false);

    expect(result).toEqual<AIInvokeResult>({
      text: '',
      usage: {
        inputTokens: 737,
        outputTokens: 150,
        totalTokens: 887
      }
    });
    expect(result).not.toHaveProperty('output');
  });

  it('passes through SDK output when structured output was requested', (): void => {
    expect(createAIInvokeResult(createStructuredResult(), true)).toEqual<AIInvokeResult>({
      text: '',
      output: { title: '摘要' },
      usage: {
        inputTokens: 1,
        outputTokens: 2,
        totalTokens: 3
      }
    });
  });
});

describe('DeepSeekProvider.createProviderOptions', (): void => {
  it('maps disabled generic reasoning to DeepSeek thinking disabled options', (): void => {
    const provider = new DeepSeekProvider();

    expect(provider.createProviderOptions({ modelId: 'deepseek-chat', reasoning: { enabled: false } })).toEqual({
      deepseek: {
        thinking: { type: 'disabled' }
      }
    });
  });

  it('does not add DeepSeek provider options unless reasoning is explicitly disabled', (): void => {
    const provider = new DeepSeekProvider();

    expect(provider.createProviderOptions({ modelId: 'deepseek-chat' })).toBeUndefined();
    expect(provider.createProviderOptions({ modelId: 'deepseek-chat', reasoning: { enabled: true } })).toBeUndefined();
  });
});

describe('AlibabaProvider.createProviderOptions', (): void => {
  it('maps enabled generic reasoning to Alibaba enableThinking options', (): void => {
    const provider = new AlibabaProvider();

    expect(provider.createProviderOptions({ modelId: 'qwen3.7-max', reasoning: { enabled: true } })).toEqual({
      alibaba: {
        enableThinking: true
      }
    });
  });

  it('maps disabled generic reasoning to Alibaba enableThinking options', (): void => {
    const provider = new AlibabaProvider();

    expect(provider.createProviderOptions({ modelId: 'qwen3.7-max', reasoning: { enabled: false } })).toEqual({
      alibaba: {
        enableThinking: false
      }
    });
  });

  it('does not add Alibaba provider options unless reasoning is explicit', (): void => {
    const provider = new AlibabaProvider();

    expect(provider.createProviderOptions({ modelId: 'qwen3.7-max' })).toBeUndefined();
  });
});

describe('VolcengineProvider.createProviderOptions', (): void => {
  it('maps enabled generic reasoning to Volcengine thinking enabled options', (): void => {
    const provider = new VolcengineProvider();

    expect(provider.createProviderOptions({ modelId: 'doubao-seed-2.0-pro', reasoning: { enabled: true } })).toEqual({
      volcengine: {
        thinking: { type: 'enabled' }
      }
    });
  });

  it('maps disabled generic reasoning to Volcengine thinking disabled options', (): void => {
    const provider = new VolcengineProvider();

    expect(provider.createProviderOptions({ modelId: 'doubao-seed-2.0-pro', reasoning: { enabled: false } })).toEqual({
      volcengine: {
        thinking: { type: 'disabled' }
      }
    });
  });

  it('does not add Volcengine provider options unless reasoning is explicit', (): void => {
    const provider = new VolcengineProvider();

    expect(provider.createProviderOptions({ modelId: 'doubao-seed-2.0-pro' })).toBeUndefined();
  });
});

describe('MoonshotProvider.createProviderOptions', (): void => {
  it('maps enabled generic reasoning to Kimi thinking enabled options', (): void => {
    const provider = new MoonshotProvider();

    expect(provider.createProviderOptions({ modelId: 'kimi-k2.7-code', reasoning: { enabled: true } })).toEqual({
      moonshot: {
        thinking: { type: 'enabled', keep: 'all' }
      }
    });
  });

  it('does not send unsupported Kimi thinking disabled options', (): void => {
    const provider = new MoonshotProvider();

    expect(provider.createProviderOptions({ modelId: 'kimi-k2.7-code', reasoning: { enabled: false } })).toBeUndefined();
    expect(provider.createProviderOptions({ modelId: 'kimi-k2.7-code' })).toBeUndefined();
  });
});

describe('OpenAI-compatible provider option defaults', (): void => {
  it('does not add provider options for GLM unless a supported mapping is introduced', (): void => {
    const provider: AIProvider = new GLMProvider();

    expect(provider.createProviderOptions?.({ modelId: 'glm-5.2', reasoning: { enabled: true } })).toBeUndefined();
  });

  it('does not add provider options for MiniMax unless a supported mapping is introduced', (): void => {
    const provider: AIProvider = new MiniMaxProvider();

    expect(provider.createProviderOptions?.({ modelId: 'MiniMax-M3', reasoning: { enabled: true } })).toBeUndefined();
  });

  it('does not add provider options for MiMo unless a supported mapping is introduced', (): void => {
    const provider: AIProvider = new MiMoProvider();

    expect(provider.createProviderOptions?.({ modelId: 'mimo-v2.5-pro', reasoning: { enabled: true } })).toBeUndefined();
  });
});
