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
    const anthropicProvider = normalized.providers.find((provider) => provider.id === 'anthropic');
    const defaultOpenAIProvider = DEFAULT_PROVIDERS.find((provider) => provider.id === 'openai');

    expect(defaultOpenAIProvider).toBeDefined();
    expect(openAIProvider).toMatchObject({
      id: 'openai',
      name: defaultOpenAIProvider?.name,
      description: defaultOpenAIProvider?.description,
      type: defaultOpenAIProvider?.type,
      baseUrl: 'https://example.test/v1',
      readonly: defaultOpenAIProvider?.readonly,
      isCustom: false
    });
    expect(openAIProvider?.models).toEqual(defaultOpenAIProvider?.models);
    expect(anthropicProvider).toMatchObject({
      id: 'anthropic',
      type: 'anthropic',
      isCustom: false
    });
  });
});
