/**
 * @file chat-model-resolver.test.ts
 * @description ChatRuntime chat 模型配置解析测试。
 */
import type { AIProvider } from 'types/ai';
import { describe, expect, it, vi } from 'vitest';
import { createChatModelResolver } from '../../../../../../electron/main/modules/chat/runtime/model/resolver.mjs';

describe('createChatModelResolver', (): void => {
  it('resolves enabled chat provider and model into AI create options', async (): Promise<void> => {
    const provider: AIProvider = {
      id: 'openai',
      name: 'OpenAI',
      description: 'OpenAI provider',
      type: 'openai',
      isEnabled: true,
      apiKey: 'sk-test',
      baseUrl: 'https://api.openai.com/v1',
      models: [{ id: 'gpt-test', name: 'GPT Test', type: 'chat', isEnabled: true }]
    };
    const resolver = createChatModelResolver({
      getChatModelConfig: vi.fn().mockResolvedValue({ providerId: 'openai', modelId: 'gpt-test' }),
      getProvider: vi.fn().mockResolvedValue(provider)
    });

    await expect(resolver.resolve()).resolves.toEqual({
      createOptions: {
        providerId: 'openai',
        providerName: 'OpenAI',
        apiKey: 'sk-test',
        baseUrl: 'https://api.openai.com/v1',
        providerType: 'openai'
      },
      modelId: 'gpt-test'
    });
  });

  it('returns null when selected provider is disabled or model is unavailable', async (): Promise<void> => {
    const resolver = createChatModelResolver({
      getChatModelConfig: vi.fn().mockResolvedValue({ providerId: 'openai', modelId: 'missing-model' }),
      getProvider: vi.fn().mockResolvedValue({
        id: 'openai',
        name: 'OpenAI',
        description: 'OpenAI provider',
        type: 'openai',
        isEnabled: false,
        models: [{ id: 'gpt-test', name: 'GPT Test', type: 'chat', isEnabled: true }]
      } satisfies AIProvider)
    });

    await expect(resolver.resolve()).resolves.toBeNull();
  });
});
