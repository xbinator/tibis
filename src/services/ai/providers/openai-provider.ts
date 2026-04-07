import type { AIError } from '../errors';
import type { AIProvider, AIProviderConfig, CreateLanguageModelInput, GenerateTextInput, GenerateTextResult, TestConnectionResult } from '../types';
import type { LanguageModel } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { normalizeOpenAIError } from '../errors';
import { executeDefaultTestConnection, executeGenerateText } from '../provider-helpers';

export class OpenAIProvider implements AIProvider {
  readonly type = 'openai' as const;

  private normalizeError(error: unknown): AIError {
    return normalizeOpenAIError(error, 'OpenAI 兼容服务调用失败');
  }

  createLanguageModel(input: CreateLanguageModelInput): LanguageModel {
    const { apiKey, baseUrl, providerId } = input.config;

    const provider = createOpenAI({ apiKey, baseURL: baseUrl, name: providerId });

    return provider.chat(input.modelId) as unknown as LanguageModel;
  }

  async generateText(config: AIProviderConfig, input: GenerateTextInput): Promise<GenerateTextResult> {
    return executeGenerateText(this, config, input, (error: unknown) => this.normalizeError(error));
  }

  async testConnection(config: AIProviderConfig, modelId: string): Promise<TestConnectionResult> {
    return executeDefaultTestConnection(this, config, modelId, (error: unknown) => this.normalizeError(error));
  }
}
