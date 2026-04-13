import type { AICreateOptions, AIRequestOptions, AIInvokeResult, AIStreamResult, AIServiceError } from 'types/ai';
import { generateText, streamText } from 'ai';
import { log } from '../logger/service.mjs';
import { AIProviderRegistry } from './providers/_index.mjs';

class AIService {
  public aiProvider: AIProviderRegistry = new AIProviderRegistry();

  private abortControllers = new Map<string, AbortController>();

  abortStream(requestId: string) {
    if (!this.abortControllers.has(requestId)) return;

    this.abortControllers.get(requestId)?.abort();
    this.abortControllers.delete(requestId);
    log.info(`[AIService] Stream aborted manually for requestId: ${requestId}`);
  }

  removeController(requestId: string) {
    this.abortControllers.delete(requestId);
  }

  private createModel(createOptions: AICreateOptions, modelId: string) {
    return this.aiProvider.create(createOptions, modelId);
  }

  async generateText(createOptions: AICreateOptions, request: AIRequestOptions): Promise<[AIServiceError] | [undefined, AIInvokeResult]> {
    try {
      const model = this.createModel(createOptions, request.modelId);
      const { prompt = '', system, temperature, messages } = request;

      log.info(`[AIService] generateText: Provider=${createOptions.providerType}, Model=${request.modelId}`);
      log.info(`[AIService] generateText payload:`, { prompt, system, temperature, messages });

      const baseOptions = { model, system, temperature };

      const result = messages ? await generateText({ ...baseOptions, messages }) : await generateText({ ...baseOptions, prompt });

      const { inputTokens = 0, outputTokens = 0, totalTokens = 0 } = result.usage || {};

      return [undefined, { text: result.text, usage: { inputTokens, outputTokens, totalTokens } }];
    } catch (error: unknown) {
      log.error('[AIService] generateText error:', error);

      return [this.aiProvider.normalizeError(error, createOptions.providerType)];
    }
  }

  async streamText(createOptions: AICreateOptions, request: AIRequestOptions): Promise<[AIServiceError] | [undefined, AIStreamResult]> {
    try {
      const model = this.createModel(createOptions, request.modelId);
      const { prompt = '', system, temperature, requestId, messages } = request;

      let abortSignal: AbortSignal | undefined;
      if (requestId) {
        const controller = new AbortController();
        this.abortControllers.set(requestId, controller);
        abortSignal = controller.signal;
      }

      log.info(`[AIService] streamText: Provider=${createOptions.providerType}, Model=${request.modelId}, RequestId=${requestId}`);
      log.info(`[AIService] streamText payload:`, { prompt, system, temperature, messages });

      const baseOptions = { model, system, temperature, abortSignal };

      const result = messages ? streamText({ ...baseOptions, messages }) : streamText({ ...baseOptions, prompt });

      return [undefined, { stream: result.fullStream }];
    } catch (error: unknown) {
      log.error('[AIService] streamText error:', error);

      return [this.aiProvider.normalizeError(error, createOptions.providerType)];
    }
  }
}

export const aiService = new AIService();
