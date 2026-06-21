/**
 * @file index.test.ts
 * @description settings.json 基础归一化测试。
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_PROVIDERS } from '@/shared/storage/providers/defaults';
import { normalizeSettingsFile } from '@/shared/storage/settings';

describe('normalizeSettingsFile', () => {
  it('normalizes sparse built-in providers into complete provider snapshots', (): void => {
    const normalized = normalizeSettingsFile({
      version: 1,
      providers: [{ id: 'openai', baseUrl: 'https://example.test/v1' }]
    });

    const openAIProvider = normalized.providers.find((provider) => provider.id === 'openai');
    const alibabaProvider = normalized.providers.find((provider) => provider.id === 'alibaba');
    const anthropicProvider = normalized.providers.find((provider) => provider.id === 'anthropic');
    const glmProvider = normalized.providers.find((provider) => provider.id === 'zhipu');
    const minimaxProvider = normalized.providers.find((provider) => provider.id === 'minimax');
    const mimoProvider = normalized.providers.find((provider) => provider.id === 'xiaomi');
    const moonshotProvider = normalized.providers.find((provider) => provider.id === 'moonshot');
    const volcengineProvider = normalized.providers.find((provider) => provider.id === 'volcengine');
    const defaultOpenAIProvider = DEFAULT_PROVIDERS.find((provider) => provider.id === 'openai');

    expect(defaultOpenAIProvider).toBeDefined();
    expect(openAIProvider).toMatchObject({
      id: 'openai',
      name: defaultOpenAIProvider?.name,
      description: defaultOpenAIProvider?.description,
      type: defaultOpenAIProvider?.type,
      baseUrl: 'https://example.test/v1',
      readonly: defaultOpenAIProvider?.readonly
    });
    expect(openAIProvider?.models).toEqual(defaultOpenAIProvider?.models);
    expect(alibabaProvider).toMatchObject({
      id: 'alibaba',
      type: 'alibaba',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1'
    });
    expect(anthropicProvider).toMatchObject({
      id: 'anthropic',
      type: 'anthropic'
    });
    expect(volcengineProvider).toMatchObject({
      id: 'volcengine',
      type: 'volcengine',
      baseUrl: 'https://ark.cn-beijing.volces.com/api/v3'
    });
    expect(moonshotProvider).toMatchObject({
      id: 'moonshot',
      type: 'moonshot',
      baseUrl: 'https://api.moonshot.cn/v1'
    });
    expect(glmProvider).toMatchObject({
      id: 'zhipu',
      type: 'glm',
      baseUrl: 'https://open.bigmodel.cn/api/paas/v4'
    });
    expect(minimaxProvider).toMatchObject({
      id: 'minimax',
      type: 'minimax',
      baseUrl: 'https://api.minimaxi.com/v1'
    });
    expect(mimoProvider).toMatchObject({
      id: 'xiaomi',
      type: 'mimo',
      baseUrl: 'https://api.xiaomimimo.com/v1'
    });
  });
});
