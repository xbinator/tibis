/**
 * @file use-model-selection.test.ts
 * @description BChat 模型选择状态可用性派生测试。
 * @vitest-environment jsdom
 */
import type { AIProvider } from 'types/ai';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { useModelSelection } from '@/components/BChat/hooks/useModelSelection';
import { useProviderStore } from '@/stores/ai/provider';
import { useServiceModelStore } from '@/stores/ai/serviceModel';

/**
 * 创建服务商测试数据。
 * @param options - 可用性配置
 * @returns AI 服务商配置
 */
function createProvider(options: { providerEnabled: boolean; modelEnabled: boolean }): AIProvider {
  return {
    id: 'provider-1',
    name: 'Provider 1',
    description: 'Provider for tests',
    type: 'openai',
    isEnabled: options.providerEnabled,
    models: [
      {
        id: 'model-1',
        name: 'Model 1',
        type: 'chat',
        isEnabled: options.modelEnabled,
        contextWindow: 128000,
        supportsVision: true
      }
    ]
  };
}

describe('useModelSelection', (): void => {
  beforeEach((): void => {
    setActivePinia(createPinia());
  });

  it('does not expose selectedModel when the provider is disabled', (): void => {
    const serviceModelStore = useServiceModelStore();
    const providerStore = useProviderStore();
    serviceModelStore.chatModel = { providerId: 'provider-1', modelId: 'model-1' };
    providerStore.providers = [createProvider({ providerEnabled: false, modelEnabled: true })];

    const modelSelection = useModelSelection();

    expect(modelSelection.selectedModel.value).toBeUndefined();
    expect(modelSelection.supportsVision.value).toBe(false);
  });

  it('does not expose selectedModel when the model is disabled', (): void => {
    const serviceModelStore = useServiceModelStore();
    const providerStore = useProviderStore();
    serviceModelStore.chatModel = { providerId: 'provider-1', modelId: 'model-1' };
    providerStore.providers = [createProvider({ providerEnabled: true, modelEnabled: false })];

    const modelSelection = useModelSelection();

    expect(modelSelection.selectedModel.value).toBeUndefined();
    expect(modelSelection.supportsVision.value).toBe(false);
  });

  it('exposes selectedModel when the provider and model are enabled', (): void => {
    const serviceModelStore = useServiceModelStore();
    const providerStore = useProviderStore();
    serviceModelStore.chatModel = { providerId: 'provider-1', modelId: 'model-1' };
    providerStore.providers = [createProvider({ providerEnabled: true, modelEnabled: true })];

    const modelSelection = useModelSelection();

    expect(modelSelection.selectedModel.value).toEqual({ providerId: 'provider-1', modelId: 'model-1' });
    expect(modelSelection.supportsVision.value).toBe(true);
    expect(modelSelection.contextWindow.value).toBe(128000);
  });
});
