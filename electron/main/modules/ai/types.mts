import type { LanguageModel } from 'ai';
import type { AIServiceError, AIProviderType, AICreateOptions } from 'types/ai';

export interface AIProvider {
  readonly type: AIProviderType;

  create(options: AICreateOptions, modelId: string): LanguageModel;

  normalizeError(error: unknown, fallbackMessage?: string): AIServiceError;
}
