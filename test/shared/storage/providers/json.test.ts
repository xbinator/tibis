/**
 * @file json.test.ts
 * @description provider JSON 存储层排序行为测试。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
  beforeEach((): void => {
    mockSettingsFileStorage.read.mockReset();
    mockSettingsFileStorage.update.mockReset();
  });

  it('lists default providers in DEFAULT_PROVIDERS order before saved custom providers', async (): Promise<void> => {
    mockSettingsFileStorage.read.mockResolvedValue(
      createSettingsFile([
        { id: 'openai', isEnabled: true },
        { id: 'custom-beta', name: 'Custom Beta', type: 'openai' },
        { id: 'anthropic', isEnabled: true },
        { id: 'custom-alpha', name: 'Custom Alpha', type: 'openai' },
        { id: 'deepseek', isEnabled: true }
      ])
    );

    const providers = await providerStorage.listProviders();
    const defaultProviderIds = DEFAULT_PROVIDERS.map((provider) => provider.id);

    expect(providers.map((provider) => provider.id)).toEqual([...defaultProviderIds, 'custom-beta', 'custom-alpha']);
    expect(providers.find((provider) => provider.id === 'openai')?.isEnabled).toBe(true);
  });

  it('preserves Alibaba request format for custom providers', async (): Promise<void> => {
    mockSettingsFileStorage.read.mockResolvedValue(
      createSettingsFile([{ id: 'custom-qwen', name: 'Custom Qwen', type: 'alibaba', baseUrl: 'https://example.test/v1' }])
    );

    const providers = await providerStorage.listProviders();
    const provider = providers.find((item) => item.id === 'custom-qwen');

    expect(provider).toMatchObject({
      id: 'custom-qwen',
      name: 'Custom Qwen',
      type: 'alibaba',
      baseUrl: 'https://example.test/v1'
    });
  });

  it('preserves Volcengine request format for custom providers', async (): Promise<void> => {
    mockSettingsFileStorage.read.mockResolvedValue(
      createSettingsFile([{ id: 'custom-volcengine', name: 'Custom Volcengine', type: 'volcengine', baseUrl: 'https://example.test/api/v3' }])
    );

    const providers = await providerStorage.listProviders();
    const provider = providers.find((item) => item.id === 'custom-volcengine');

    expect(provider).toMatchObject({
      id: 'custom-volcengine',
      name: 'Custom Volcengine',
      type: 'volcengine',
      baseUrl: 'https://example.test/api/v3'
    });
  });

  it('preserves additional OpenAI-compatible request formats for custom providers', async (): Promise<void> => {
    mockSettingsFileStorage.read.mockResolvedValue(
      createSettingsFile([
        { id: 'custom-moonshot', name: 'Custom Moonshot', type: 'moonshot', baseUrl: 'https://example.test/moonshot/v1' },
        { id: 'custom-glm', name: 'Custom GLM', type: 'glm', baseUrl: 'https://example.test/glm/v4' },
        { id: 'custom-minimax', name: 'Custom MiniMax', type: 'minimax', baseUrl: 'https://example.test/minimax/v1' },
        { id: 'custom-mimo', name: 'Custom MiMo', type: 'mimo', baseUrl: 'https://example.test/mimo/v1' }
      ])
    );

    const providers = await providerStorage.listProviders();

    expect(providers.find((item) => item.id === 'custom-moonshot')).toMatchObject({ type: 'moonshot' });
    expect(providers.find((item) => item.id === 'custom-glm')).toMatchObject({ type: 'glm' });
    expect(providers.find((item) => item.id === 'custom-minimax')).toMatchObject({ type: 'minimax' });
    expect(providers.find((item) => item.id === 'custom-mimo')).toMatchObject({ type: 'mimo' });
  });

  it('uses Volcengine request format for the built-in Volcengine provider', async (): Promise<void> => {
    mockSettingsFileStorage.read.mockResolvedValue(createSettingsFile([{ id: 'volcengine', isEnabled: true }]));

    const providers = await providerStorage.listProviders();
    const provider = providers.find((item) => item.id === 'volcengine');

    expect(provider).toMatchObject({
      id: 'volcengine',
      name: '火山引擎',
      type: 'volcengine',
      baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
      isEnabled: true
    });
  });

  it('uses dedicated request formats for built-in OpenAI-compatible providers', async (): Promise<void> => {
    mockSettingsFileStorage.read.mockResolvedValue(createSettingsFile([{ id: 'moonshot', isEnabled: true }]));

    const providers = await providerStorage.listProviders();

    expect(providers.find((item) => item.id === 'moonshot')).toMatchObject({ type: 'moonshot', baseUrl: 'https://api.moonshot.cn/v1', isEnabled: true });
    expect(providers.find((item) => item.id === 'zhipu')).toMatchObject({ type: 'glm', baseUrl: 'https://open.bigmodel.cn/api/paas/v4' });
    expect(providers.find((item) => item.id === 'minimax')).toMatchObject({ type: 'minimax', baseUrl: 'https://api.minimaxi.com/v1' });
    expect(providers.find((item) => item.id === 'xiaomi')).toMatchObject({ type: 'mimo', baseUrl: 'https://api.xiaomimimo.com/v1' });
  });

  it('stores built-in providers as complete snapshots after provider config updates', async (): Promise<void> => {
    const baseProvider = DEFAULT_PROVIDERS.find((provider) => provider.id === 'openai');
    expect(baseProvider).toBeDefined();

    if (!baseProvider) {
      throw new Error('测试需要 OpenAI 内置服务商');
    }

    let settings = createSettingsFile([]);

    mockSettingsFileStorage.read.mockImplementation(async (): Promise<SettingsFileContent> => settings);
    mockSettingsFileStorage.update.mockImplementation(
      async (transformer: (current: SettingsFileContent) => SettingsFileContent): Promise<SettingsFileContent> => {
        settings = transformer(settings);
        return settings;
      }
    );

    await providerStorage.saveProviderConfig(baseProvider.id, { baseUrl: 'https://example.test/v1' });

    const storedProvider = settings.providers.find((provider) => provider.id === baseProvider.id);

    expect(storedProvider).toMatchObject({
      id: baseProvider.id,
      name: baseProvider.name,
      description: baseProvider.description,
      type: baseProvider.type,
      baseUrl: 'https://example.test/v1',
      isEnabled: baseProvider.isEnabled,
      readonly: baseProvider.readonly
    });
    expect(storedProvider?.models).toEqual(baseProvider.models);
  });

  it('stores deleted default models as isDelete markers and overwrites them when recreated', async (): Promise<void> => {
    const baseProvider = DEFAULT_PROVIDERS.find((provider) => (provider.models?.length ?? 0) > 1);
    expect(baseProvider).toBeDefined();

    if (!baseProvider?.models) {
      throw new Error('测试需要至少包含两个默认模型的内置服务商');
    }

    let settings = createSettingsFile([]);
    const deletedModel = baseProvider.models[0];
    const savedModels = baseProvider.models.slice(1).map((model) => ({ ...model }));

    mockSettingsFileStorage.read.mockImplementation(async (): Promise<SettingsFileContent> => settings);
    mockSettingsFileStorage.update.mockImplementation(
      async (transformer: (current: SettingsFileContent) => SettingsFileContent): Promise<SettingsFileContent> => {
        settings = transformer(settings);
        return settings;
      }
    );

    await providerStorage.saveProviderModels(baseProvider.id, savedModels);

    const providers = await providerStorage.listProviders();
    const provider = providers.find((item) => item.id === baseProvider.id);

    expect(settings.providers[0].models).toContainEqual(expect.objectContaining({ id: deletedModel.id, isDelete: true }));
    expect(provider?.models?.map((model) => model.id)).not.toContain(deletedModel.id);
    expect(provider?.models?.map((model) => model.id)).toEqual(savedModels.map((model) => model.id));

    const recreatedModel = { ...deletedModel, name: `${deletedModel.name} Recreated` };

    await providerStorage.saveProviderModels(baseProvider.id, [recreatedModel, ...savedModels]);

    const restoredProviders = await providerStorage.listProviders();
    const restoredProvider = restoredProviders.find((item) => item.id === baseProvider.id);

    expect(settings.providers[0].models).toContainEqual(expect.objectContaining({ id: deletedModel.id, name: recreatedModel.name }));
    expect(settings.providers[0].models).not.toContainEqual(expect.objectContaining({ id: deletedModel.id, isDelete: true }));
    expect(restoredProvider?.models?.find((model) => model.id === deletedModel.id)?.name).toBe(recreatedModel.name);
  });
});
