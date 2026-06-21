/**
 * @file service.test.ts
 * @description AI 主进程服务返回值封装测试。
 */
import type { AIInvokeResult } from 'types/ai';
import { describe, expect, it } from 'vitest';
import { DeepSeekProvider } from '../../../../../electron/main/modules/ai/providers/deepseek.mjs';
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
