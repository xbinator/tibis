import type { AIError } from '../errors';
import type { AIProvider, AIProviderConfig, CreateLanguageModelInput, GenerateTextInput, GenerateTextResult, TestConnectionResult } from '../types';
import type { LanguageModel } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { normalizeGoogleError } from '../errors';
import { executeDefaultTestConnection, executeGenerateText } from '../provider-helpers';

export class GoogleProvider implements AIProvider {
  readonly type = 'google' as const;

  private normalizeError(error: unknown): AIError {
    return normalizeGoogleError(error, 'Google AI 服务调用失败');
  }

  createLanguageModel(input: CreateLanguageModelInput): LanguageModel {
    const { apiKey, baseUrl, providerId } = input.config;

    const provider = createGoogleGenerativeAI({ apiKey, baseURL: baseUrl, name: providerId });

    return provider.chat(input.modelId) as unknown as LanguageModel;
  }

  async generateText(config: AIProviderConfig, input: GenerateTextInput): Promise<GenerateTextResult> {
    return executeGenerateText(this, config, input, (error: unknown) => this.normalizeError(error));
  }

  async testConnection(config: AIProviderConfig, modelId: string): Promise<TestConnectionResult> {
    return executeDefaultTestConnection(this, config, modelId, (error: unknown) => this.normalizeError(error));
  }
}
