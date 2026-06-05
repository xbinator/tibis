/**
 * @file json.test.ts
 * @description provider JSON 存储层排序行为测试。
 */
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_PROVIDERS } from '@/shared/storage/providers/defaults';
import { providerStorage } from '@/shared/storage/providers/json';
import type { SettingsFileContent, StoredProviderEntry } from '@/shared/storage/providers/types';

/** settingsFileStorage 的测试替身。 */
const mockSettingsFileStorage = vi.hoisted(() => ({
  read: vi.fn<() => Promise<SettingsFileContent>>(),
  update: vi.fn<(transformer: (current: SettingsFileContent) => SettingsFileContent) => Promise<SettingsFileContent>>()
}));

vi.mock('@/shared/storage/settings', () => ({
  settingsFileStorage: mockSettingsFileStorage
}));

/**
 * 创建 settings.json 测试数据。
 * @param providers - 存储层 provider 条目
 * @returns settings.json 内容
 */
function createSettingsFile(providers: StoredProviderEntry[]): SettingsFileContent {
  return {
    version: 1,
    providers
  };
}

describe('providerStorage.listProviders', () => {
  it('lists default providers in DEFAULT_PROVIDERS order before saved custom providers', async (): Promise<void> => {
    mockSettingsFileStorage.read.mockResolvedValue(
      createSettingsFile([
        { id: 'openai', isEnabled: true },
        { id: 'custom-beta', name: 'Custom Beta', type: 'openai', isCustom: true },
        { id: 'anthropic', isEnabled: true },
        { id: 'custom-alpha', name: 'Custom Alpha', type: 'openai', isCustom: true },
        { id: 'deepseek', isEnabled: true }
      ])
    );

    const providers = await providerStorage.listProviders();
    const defaultProviderIds = DEFAULT_PROVIDERS.map((provider) => provider.id);

    expect(providers.map((provider) => provider.id)).toEqual([...defaultProviderIds, 'custom-beta', 'custom-alpha']);
    expect(providers.find((provider) => provider.id === 'openai')?.isEnabled).toBe(true);
  });
});
