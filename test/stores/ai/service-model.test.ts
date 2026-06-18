/**
 * @file service-model.test.ts
 * @description AI 服务模型 store 可用性判断测试。
 * @vitest-environment jsdom
 */
import type { AIProvider } from 'types/ai';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useServiceModelStore } from '@/stores/ai/serviceModel';

const mockGetConfig = vi.hoisted(() => vi.fn());
const mockGetProvider = vi.hoisted(() => vi.fn());

vi.mock('@/shared/storage', () => ({
  providerStorage: {
    getProvider: mockGetProvider
  },
  serviceModelsStorage: {
    getConfig: mockGetConfig,
    saveConfig: vi.fn()
  }
}));

/**
 * 创建服务商测试数据。
 * @param modelEnabled - 当前模型是否启用
 * @returns AI 服务商配置
 */
function createProvider(modelEnabled: boolean): AIProvider {
  return {
    id: 'provider-1',
    name: 'Provider 1',
    description: 'Provider for tests',
    type: 'openai',
    isEnabled: true,
    models: [
      {
        id: 'model-1',
        name: 'Model 1',
        type: 'chat',
        isEnabled: modelEnabled
      }
    ]
  };
}

describe('useServiceModelStore', (): void => {
  beforeEach((): void => {
    setActivePinia(createPinia());
    mockGetConfig.mockReset();
    mockGetProvider.mockReset();
  });

  it('treats a disabled configured model as unavailable', async (): Promise<void> => {
    mockGetConfig.mockResolvedValue({ providerId: 'provider-1', modelId: 'model-1', updatedAt: 1 });
    mockGetProvider.mockResolvedValue(createProvider(false));

    const store = useServiceModelStore();
    const config = await store.getAvailableServiceConfig('chat');

    expect(config).toBeNull();
  });

  it('treats a missing configured model as unavailable', async (): Promise<void> => {
    mockGetConfig.mockResolvedValue({ providerId: 'provider-1', modelId: 'missing-model', updatedAt: 1 });
    mockGetProvider.mockResolvedValue(createProvider(true));

    const store = useServiceModelStore();
    const config = await store.getAvailableServiceConfig('chat');

    expect(config).toBeNull();
  });

  it('keeps an enabled configured model available', async (): Promise<void> => {
    mockGetConfig.mockResolvedValue({ providerId: 'provider-1', modelId: 'model-1', updatedAt: 1 });
    mockGetProvider.mockResolvedValue(createProvider(true));

    const store = useServiceModelStore();
    const config = await store.getAvailableServiceConfig('chat');

    expect(config).toEqual({ providerId: 'provider-1', modelId: 'model-1', updatedAt: 1 });
  });
});
