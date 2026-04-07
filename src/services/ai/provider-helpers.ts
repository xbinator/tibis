import type { AIProviderConfig, CreateLanguageModelInput, GenerateTextInput, GenerateTextResult, TestConnectionResult } from './types';
import type { LanguageModel } from 'ai';
import { generateText } from 'ai';
import { asyncTo } from '@/utils/asyncTo';
import { AIError, AI_ERROR_CODE } from './errors';

export interface AIProviderErrorNormalizerContext {
  fallbackMessage?: string;
}

export type AIProviderErrorNormalizer = (error: unknown, context?: AIProviderErrorNormalizerContext) => AIError;

export interface LanguageModelFactory {
  createLanguageModel(input: CreateLanguageModelInput): LanguageModel;
}

export async function executeGenerateText(
  factory: LanguageModelFactory,
  config: AIProviderConfig,
  input: GenerateTextInput,
  normalizeError: AIProviderErrorNormalizer
): Promise<GenerateTextResult> {
  const model = factory.createLanguageModel({
    config,
    modelId: input.modelId
  });

  const [error, result] = await asyncTo(
    generateText({
      model,
      system: input.system,
      prompt: input.prompt,
      temperature: input.temperature,
      maxTokens: input.maxTokens
    })
  );

  if (error) {
    throw normalizeError(error, { fallbackMessage: '文本生成失败' });
  }

  if (!result.text) {
    throw new AIError(AI_ERROR_CODE.INVALID_RESPONSE, '模型未返回有效文本');
  }

  return {
    text: result.text
  };
}

export async function executeDefaultTestConnection(
  factory: LanguageModelFactory,
  config: AIProviderConfig,
  modelId: string,
  normalizeError: AIProviderErrorNormalizer
): Promise<TestConnectionResult> {
  const result = await executeGenerateText(
    factory,
    config,
    {
      modelId,
      prompt: 'Reply with OK.',
      maxTokens: 8
    },
    normalizeError
  );

  return {
    ok: true,
    text: result.text
  };
}
