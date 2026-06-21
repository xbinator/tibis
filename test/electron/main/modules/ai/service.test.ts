/**
 * @file service.test.ts
 * @description AI 主进程服务返回值封装测试。
 */
import type { AIInvokeResult } from 'types/ai';
import { describe, expect, it } from 'vitest';
import { AlibabaProvider } from '../../../../../electron/main/modules/ai/providers/alibaba.mjs';
import { DeepSeekProvider } from '../../../../../electron/main/modules/ai/providers/deepseek.mjs';
import { GLMProvider } from '../../../../../electron/main/modules/ai/providers/glm.mjs';
import { MiMoProvider } from '../../../../../electron/main/modules/ai/providers/mimo.mjs';
import { MiniMaxProvider } from '../../../../../electron/main/modules/ai/providers/minimax.mjs';
import { MoonshotProvider } from '../../../../../electron/main/modules/ai/providers/moonshot.mjs';
import { VolcengineProvider } from '../../../../../electron/main/modules/ai/providers/volcengine.mjs';
import { createAIInvokeResult } from '../../../../../electron/main/modules/ai/service.mjs';

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
    const provider = new GLMProvider();

    expect(provider.createProviderOptions?.({ modelId: 'glm-5.2', reasoning: { enabled: true } })).toBeUndefined();
  });

  it('does not add provider options for MiniMax unless a supported mapping is introduced', (): void => {
    const provider = new MiniMaxProvider();

    expect(provider.createProviderOptions?.({ modelId: 'MiniMax-M3', reasoning: { enabled: true } })).toBeUndefined();
  });

  it('does not add provider options for MiMo unless a supported mapping is introduced', (): void => {
    const provider = new MiMoProvider();

    expect(provider.createProviderOptions?.({ modelId: 'mimo-v2.5-pro', reasoning: { enabled: true } })).toBeUndefined();
  });
});
