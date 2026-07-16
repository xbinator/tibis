/**
 * @file service.test.ts
 * @description AI 主进程服务返回值封装测试。
 */
import type { AIProvider } from '../../../../../electron/main/modules/ai/types.mjs';
import type { AICreateOptions, AIInvokeResult } from 'types/ai';
import { describe, expect, it, vi } from 'vitest';
import { AlibabaProvider } from '../../../../../electron/main/modules/ai/providers/alibaba.mjs';
import { DeepSeekProvider } from '../../../../../electron/main/modules/ai/providers/deepseek.mjs';
import { GLMProvider } from '../../../../../electron/main/modules/ai/providers/glm.mjs';
import { MiMoProvider } from '../../../../../electron/main/modules/ai/providers/mimo.mjs';
import { MiniMaxProvider } from '../../../../../electron/main/modules/ai/providers/minimax.mjs';
import { MoonshotProvider } from '../../../../../electron/main/modules/ai/providers/moonshot.mjs';
import { VolcengineProvider } from '../../../../../electron/main/modules/ai/providers/volcengine.mjs';
import { aiService, createAIInvokeResult } from '../../../../../electron/main/modules/ai/service.mjs';
import { log } from '../../../../../electron/main/modules/logger/service.mjs';

const { generateTextMock } = vi.hoisted(() => ({ generateTextMock: vi.fn() }));

vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>();
  return { ...actual, generateText: generateTextMock };
});

log.transports.file.level = false;
log.transports.console.level = false;

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

describe('AIService.generateText abort', (): void => {
  it('registers requestId abort signal and cancels synchronous generation', async (): Promise<void> => {
    const createOptions: AICreateOptions = {
      providerType: 'openai',
      providerId: 'provider-1',
      providerName: 'OpenAI'
    };
    vi.spyOn(aiService.aiProvider, 'create').mockReturnValue({} as ReturnType<typeof aiService.aiProvider.create>);
    generateTextMock.mockImplementationOnce(
      (options: { abortSignal?: AbortSignal }): Promise<never> =>
        new Promise((_resolve, reject): void => {
          options.abortSignal?.addEventListener('abort', (): void => reject(new Error('aborted')), { once: true });
        })
    );

    const invocation = aiService.generateText(createOptions, {
      requestId: 'summary-runtime-1',
      modelId: 'model-1',
      prompt: 'compress'
    });
    await vi.waitFor((): void => {
      expect(generateTextMock).toHaveBeenCalledTimes(1);
    });
    aiService.abortStream('summary-runtime-1');
    const [error] = await invocation;

    expect(error).toBeDefined();
    expect(generateTextMock.mock.calls[0][0].abortSignal).toBeInstanceOf(AbortSignal);
  });
});

describe('AIService sensitive logging', (): void => {
  it('logs only invocation metadata without prompt or structured output', async (): Promise<void> => {
    const promptSecret = 'PRIVATE_COMPACTION_SOURCE_CONTENT';
    const outputSecret = 'PRIVATE_STRUCTURED_SUMMARY_CONTENT';
    const infoSpy = vi.spyOn(log, 'info').mockImplementation((): void => undefined);
    vi.spyOn(aiService.aiProvider, 'create').mockReturnValue({} as ReturnType<typeof aiService.aiProvider.create>);
    generateTextMock.mockResolvedValueOnce({
      text: '',
      output: { secret: outputSecret },
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 }
    });

    await aiService.generateText(
      { providerType: 'openai', providerId: 'provider-1', providerName: 'OpenAI' },
      {
        requestId: 'summary-runtime-sensitive',
        modelId: 'model-1',
        prompt: promptSecret,
        output: { schema: { type: 'object' } }
      }
    );

    const serializedLogs = JSON.stringify(infoSpy.mock.calls);
    expect(serializedLogs).toContain('summary-runtime-sensitive');
    expect(serializedLogs).toContain('model-1');
    expect(serializedLogs).not.toContain(promptSecret);
    expect(serializedLogs).not.toContain(outputSecret);
    infoSpy.mockRestore();
  });

  it('does not log provider errors that may echo private request content', async (): Promise<void> => {
    const errorSecret = 'PRIVATE_PROVIDER_REQUEST_ECHO';
    const errorSpy = vi.spyOn(log, 'error').mockImplementation((): void => undefined);
    const warnSpy = vi.spyOn(log, 'warn').mockImplementation((): void => undefined);
    vi.spyOn(aiService.aiProvider, 'create').mockReturnValue({} as ReturnType<typeof aiService.aiProvider.create>);
    generateTextMock.mockRejectedValueOnce(new Error(errorSecret));

    await aiService.generateText(
      { providerType: 'openai', providerId: 'provider-1', providerName: 'OpenAI' },
      { requestId: 'summary-runtime-error', modelId: 'model-1', prompt: 'private prompt' }
    );

    const loggedText = [...errorSpy.mock.calls, ...warnSpy.mock.calls]
      .flat()
      .map((value: unknown): string => (value instanceof Error ? `${value.message}\n${value.stack ?? ''}` : String(value)))
      .join('\n');
    expect(loggedText).not.toContain(errorSecret);
    errorSpy.mockRestore();
    warnSpy.mockRestore();
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
