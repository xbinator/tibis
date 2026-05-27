/* @vitest-environment jsdom */
/**
 * @file provider-json.test.ts
 * @description provider JSON 存储层单元测试，覆盖数据校验、合并逻辑、数组操作、文件读写等核心功能。
 */
import type { AIProvider, AIProviderModel, AICustomProvider } from 'types/ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PROVIDERS } from '@/shared/storage/providers/defaults';
import type { StoredProviderEntry, SettingsFileContent } from '@/shared/storage/providers/types';

// ─────────────────────────────────────────────
// Mock 设置
// ─────────────────────────────────────────────

/** 模拟的文件系统存储 */
let fileStore: Record<string, string> = {};

/** 模拟的 Electron API */
const mockElectronAPI = {
  getTibisWorkspaceRoot: vi.fn(),
  getPathStatus: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn()
};

beforeEach(() => {
  fileStore = {};
  vi.clearAllMocks();

  // 默认返回工作区根目录
  mockElectronAPI.getTibisWorkspaceRoot.mockResolvedValue({ rootPath: '/home/user/.tibis', created: false });

  // 模拟文件系统操作
  mockElectronAPI.getPathStatus.mockImplementation(async (path: string) => ({
    exists: path in fileStore,
    isFile: path in fileStore,
    isDirectory: false
  }));

  mockElectronAPI.readFile.mockImplementation(async (path: string) => ({
    content: fileStore[path] ?? '',
    name: path.split('/').pop() ?? '',
    ext: 'json'
  }));

  mockElectronAPI.writeFile.mockImplementation(async (path: string, content: string) => {
    fileStore[path] = content;
  });

  // 挂载到 window
  (window as Window & { electronAPI?: unknown }).electronAPI = mockElectronAPI;
});

afterEach(() => {
  delete (window as Window & { electronAPI?: unknown }).electronAPI;
});

/** 动态导入 providerStorage（每次重新加载以重置模块状态） */
async function importProviderStorage() {
  const mod = await import('@/shared/storage/providers/json');
  return mod.providerStorage;
}

/** 写入 settings.json 到模拟文件系统 */
function setSettingsFile(data: SettingsFileContent): void {
  fileStore['/home/user/.tibis/settings.json'] = JSON.stringify(data, null, 2);
}

/** 读取 settings.json */
function getSettingsFile(): SettingsFileContent | null {
  const content = fileStore['/home/user/.tibis/settings.json'];
  if (!content) return null;
  return JSON.parse(content);
}

// ─────────────────────────────────────────────
// 测试用例
// ─────────────────────────────────────────────

describe('provider JSON storage', () => {
  describe('数据校验 - normalizeSettingsFile', () => {
    it('空输入返回默认结构', async () => {
      const { normalizeSettingsFile } = await import('@/shared/storage/providers/json');
      const result = normalizeSettingsFile(null);
      expect(result).toEqual({ version: 1, providers: [] });
    });

    it('非对象输入返回默认结构', async () => {
      const { normalizeSettingsFile } = await import('@/shared/storage/providers/json');
      expect(normalizeSettingsFile('string')).toEqual({ version: 1, providers: [] });
      expect(normalizeSettingsFile(123)).toEqual({ version: 1, providers: [] });
      expect(normalizeSettingsFile(true)).toEqual({ version: 1, providers: [] });
    });

    it('数组输入返回默认结构', async () => {
      const { normalizeSettingsFile } = await import('@/shared/storage/providers/json');
      expect(normalizeSettingsFile([])).toEqual({ version: 1, providers: [] });
    });

    it('providers 数组中缺少 id 的条目被过滤', async () => {
      const { normalizeSettingsFile } = await import('@/shared/storage/providers/json');
      const result = normalizeSettingsFile({
        version: 1,
        providers: [{ id: 'openai', isEnabled: true }, { isEnabled: false }, { id: '', isEnabled: true }]
      });
      expect(result.providers).toHaveLength(1);
      expect(result.providers[0].id).toBe('openai');
    });

    it('id 重复时保留首次出现', async () => {
      const { normalizeSettingsFile } = await import('@/shared/storage/providers/json');
      const result = normalizeSettingsFile({
        version: 1,
        providers: [
          { id: 'openai', apiKey: 'first' },
          { id: 'openai', apiKey: 'second' }
        ]
      });
      expect(result.providers).toHaveLength(1);
      expect(result.providers[0].apiKey).toBe('first');
    });

    it('id 被规范化为小写', async () => {
      const { normalizeSettingsFile } = await import('@/shared/storage/providers/json');
      const result = normalizeSettingsFile({
        version: 1,
        providers: [{ id: 'OpenAI' }]
      });
      expect(result.providers[0].id).toBe('openai');
    });

    it('models 中缺少 id 的条目被过滤', async () => {
      const { normalizeSettingsFile } = await import('@/shared/storage/providers/json');
      const result = normalizeSettingsFile({
        version: 1,
        providers: [
          {
            id: 'openai',
            models: [
              { id: 'gpt-4', name: 'GPT-4', type: 'chat', isEnabled: true },
              { name: 'No ID', type: 'chat', isEnabled: true },
              { id: '', name: 'Empty ID', type: 'chat', isEnabled: true }
            ]
          }
        ]
      });
      expect(result.providers[0].models).toHaveLength(1);
      expect(result.providers[0].models![0].id).toBe('gpt-4');
    });

    it('非法字段被过滤', async () => {
      const { normalizeSettingsFile } = await import('@/shared/storage/providers/json');
      const result = normalizeSettingsFile({
        version: 1,
        providers: [
          {
            id: 'openai',
            isEnabled: 'yes',
            apiKey: 123,
            baseUrl: true,
            models: 'not-array',
            name: 456,
            type: 'invalid-format',
            isCustom: 'yes'
          }
        ]
      });
      const entry = result.providers[0];
      expect(entry.isEnabled).toBeUndefined();
      expect(entry.apiKey).toBeUndefined();
      expect(entry.baseUrl).toBeUndefined();
      expect(entry.models).toBeUndefined();
      expect(entry.name).toBeUndefined();
      expect(entry.type).toBeUndefined();
      expect(entry.isCustom).toBeUndefined();
    });
  });

  describe('合并逻辑 - mergeProvider', () => {
    it('无覆盖设置时返回默认配置的深拷贝', async () => {
      const { mergeProvider } = await import('@/shared/storage/providers/json');
      const base = DEFAULT_PROVIDERS.find((p) => p.id === 'openai')!;
      const result = mergeProvider(base);
      expect(result.id).toBe('openai');
      expect(result.name).toBe(base.name);
      expect(result.models).toEqual(base.models);
      // 确认是深拷贝
      expect(result.models).not.toBe(base.models);
    });

    it('用户覆盖的 isEnabled / apiKey / baseUrl 生效', async () => {
      const { mergeProvider } = await import('@/shared/storage/providers/json');
      const base = DEFAULT_PROVIDERS.find((p) => p.id === 'openai')!;
      const result = mergeProvider(base, {
        id: 'openai',
        isEnabled: true,
        apiKey: 'sk-test',
        baseUrl: 'https://custom.api.com/v1'
      });
      expect(result.isEnabled).toBe(true);
      expect(result.apiKey).toBe('sk-test');
      expect(result.baseUrl).toBe('https://custom.api.com/v1');
    });

    it('models 增量合并：用户覆盖的 models + base 中新增的 models', async () => {
      const { mergeProvider } = await import('@/shared/storage/providers/json');
      const base: AIProvider = {
        id: 'openai',
        name: 'OpenAI',
        description: '',
        type: 'openai',
        isEnabled: false,
        models: [
          { id: 'gpt-4', name: 'GPT-4', type: 'chat', isEnabled: true },
          { id: 'gpt-3.5', name: 'GPT-3.5', type: 'chat', isEnabled: true }
        ]
      };
      const stored: StoredProviderEntry = {
        id: 'openai',
        models: [{ id: 'gpt-4', name: 'GPT-4 Modified', type: 'chat', isEnabled: false }]
      };
      const result = mergeProvider(base, stored);
      // 用户修改的 model 使用用户的版本
      expect(result.models!.find((m) => m.id === 'gpt-4')!.name).toBe('GPT-4 Modified');
      expect(result.models!.find((m) => m.id === 'gpt-4')!.isEnabled).toBe(false);
      // base 中新增的 model 自动追加
      expect(result.models!.find((m) => m.id === 'gpt-3.5')).toBeDefined();
      expect(result.models!.find((m) => m.id === 'gpt-3.5')!.name).toBe('GPT-3.5');
    });

    it('models 增量合并：用户覆盖的 models 中不包含的 base model 会自动追加', async () => {
      const { mergeProvider } = await import('@/shared/storage/providers/json');
      const base: AIProvider = {
        id: 'openai',
        name: 'OpenAI',
        description: '',
        type: 'openai',
        isEnabled: false,
        models: [
          { id: 'gpt-4', name: 'GPT-4', type: 'chat', isEnabled: true },
          { id: 'gpt-3.5', name: 'GPT-3.5', type: 'chat', isEnabled: true }
        ]
      };
      const stored: StoredProviderEntry = {
        id: 'openai',
        models: [{ id: 'gpt-4', name: 'GPT-4 Modified', type: 'chat', isEnabled: false }]
      };
      const result = mergeProvider(base, stored);
      // 用户修改的 model 使用用户的版本
      expect(result.models!.find((m) => m.id === 'gpt-4')!.isEnabled).toBe(false);
      // base 中不在 override 中的 model 自动追加（升级新增场景）
      expect(result.models!.find((m) => m.id === 'gpt-3.5')).toBeDefined();
    });

    it('models 为空数组时使用 base 的 models', async () => {
      const { mergeProvider } = await import('@/shared/storage/providers/json');
      const base: AIProvider = {
        id: 'openai',
        name: 'OpenAI',
        description: '',
        type: 'openai',
        isEnabled: false,
        models: [{ id: 'gpt-4', name: 'GPT-4', type: 'chat', isEnabled: true }]
      };
      const result = mergeProvider(base, { id: 'openai', models: [] });
      // 空数组视为无覆盖，使用 base
      expect(result.models).toEqual(base.models);
    });
  });

  describe('自定义服务商转换 - entryToCustomProvider', () => {
    it('完整字段转换', async () => {
      const { entryToCustomProvider } = await import('@/shared/storage/providers/json');
      const entry: StoredProviderEntry = {
        id: 'my-provider',
        name: 'My Provider',
        description: 'A custom provider',
        type: 'openai',
        logo: 'https://example.com/logo.png',
        isEnabled: true,
        apiKey: 'sk-custom',
        baseUrl: 'https://custom.api.com/v1',
        models: [{ id: 'model-1', name: 'Model 1', type: 'chat', isEnabled: true }],
        isCustom: true
      };
      const result = entryToCustomProvider(entry);
      expect(result.id).toBe('my-provider');
      expect(result.name).toBe('My Provider');
      expect(result.description).toBe('A custom provider');
      expect(result.type).toBe('openai');
      expect(result.logo).toBe('https://example.com/logo.png');
      expect(result.isEnabled).toBe(true);
      expect(result.apiKey).toBe('sk-custom');
      expect(result.baseUrl).toBe('https://custom.api.com/v1');
      expect(result.models).toHaveLength(1);
      expect(result.readonly).toBe(false);
      expect(result.isCustom).toBe(true);
    });

    it('缺少可选字段时使用默认值', async () => {
      const { entryToCustomProvider } = await import('@/shared/storage/providers/json');
      const entry: StoredProviderEntry = {
        id: 'minimal',
        isCustom: true
      };
      const result = entryToCustomProvider(entry);
      expect(result.name).toBe('minimal');
      expect(result.description).toBe('');
      expect(result.type).toBe('openai');
      expect(result.logo).toBe('');
      expect(result.baseUrl).toBe('');
      expect(result.apiKey).toBe('');
      expect(result.models).toEqual([]);
      expect(result.isEnabled).toBe(false);
      expect(result.readonly).toBe(false);
    });
  });

  describe('数组操作', () => {
    describe('upsertEntry', () => {
      it('更新已有条目', async () => {
        const { upsertEntry } = await import('@/shared/storage/providers/json');
        const entries: StoredProviderEntry[] = [
          { id: 'openai', isEnabled: false },
          { id: 'anthropic', isEnabled: true }
        ];
        const result = upsertEntry(entries, { id: 'openai', isEnabled: true });
        expect(result).toHaveLength(2);
        expect(result[0].isEnabled).toBe(true);
        expect(result[1].id).toBe('anthropic');
      });

      it('插入新条目到末尾', async () => {
        const { upsertEntry } = await import('@/shared/storage/providers/json');
        const entries: StoredProviderEntry[] = [{ id: 'openai', isEnabled: false }];
        const result = upsertEntry(entries, { id: 'custom', isCustom: true });
        expect(result).toHaveLength(2);
        expect(result[1].id).toBe('custom');
      });

      it('不修改原数组', async () => {
        const { upsertEntry } = await import('@/shared/storage/providers/json');
        const entries: StoredProviderEntry[] = [{ id: 'openai', isEnabled: false }];
        const result = upsertEntry(entries, { id: 'openai', isEnabled: true });
        expect(entries[0].isEnabled).toBe(false);
        expect(result[0].isEnabled).toBe(true);
      });
    });

    describe('reorderEntries', () => {
      it('按指定顺序排列', async () => {
        const { reorderEntries } = await import('@/shared/storage/providers/json');
        const entries: StoredProviderEntry[] = [{ id: 'openai' }, { id: 'anthropic' }, { id: 'google' }];
        const result = reorderEntries(entries, ['google', 'anthropic', 'openai']);
        expect(result.map((e) => e.id)).toEqual(['google', 'anthropic', 'openai']);
      });

      it('不在 orderedIds 中的条目追加到末尾', async () => {
        const { reorderEntries } = await import('@/shared/storage/providers/json');
        const entries: StoredProviderEntry[] = [{ id: 'openai' }, { id: 'anthropic' }, { id: 'google' }, { id: 'deepseek' }];
        const result = reorderEntries(entries, ['google', 'openai']);
        expect(result.map((e) => e.id)).toEqual(['google', 'openai', 'anthropic', 'deepseek']);
      });

      it('orderedIds 中不存在的 id 被忽略', async () => {
        const { reorderEntries } = await import('@/shared/storage/providers/json');
        const entries: StoredProviderEntry[] = [{ id: 'openai' }, { id: 'anthropic' }];
        const result = reorderEntries(entries, ['nonexistent', 'anthropic', 'openai']);
        expect(result.map((e) => e.id)).toEqual(['anthropic', 'openai']);
      });
    });
  });

  describe('文件读写', () => {
    it('settings.json 不存在时返回默认服务商列表', async () => {
      const storage = await importProviderStorage();
      const providers = await storage.listProviders();
      // 无 settings.json → 返回 DEFAULT_PROVIDERS
      expect(providers.length).toBeGreaterThan(0);
    });

    it('写入后能正确读取', async () => {
      setSettingsFile({ version: 1, providers: [] });

      const storage = await importProviderStorage();
      await storage.toggleProvider('openai', true);

      const settings = getSettingsFile();
      expect(settings).not.toBeNull();
      const openai = settings!.providers.find((e) => e.id === 'openai');
      expect(openai).toBeDefined();
      expect(openai!.isEnabled).toBe(true);
    });

    it('写入前生成 .bak 备份', async () => {
      const originalContent = JSON.stringify({ version: 1, providers: [{ id: 'openai', isEnabled: false }] }, null, 2);
      setSettingsFile(JSON.parse(originalContent));

      const storage = await importProviderStorage();
      await storage.toggleProvider('openai', true);

      const bakContent = fileStore['/home/user/.tibis/settings.json.bak'];
      expect(bakContent).toBeDefined();
      expect(JSON.parse(bakContent)).toEqual(JSON.parse(originalContent));
    });
  });

  describe('文件损坏恢复', () => {
    it('JSON 内容损坏时从 .bak 恢复', async () => {
      // 写入损坏的 settings.json
      fileStore['/home/user/.tibis/settings.json'] = '{ invalid json content';
      // 写入正确的 .bak
      fileStore['/home/user/.tibis/settings.json.bak'] = JSON.stringify(
        {
          version: 1,
          providers: [{ id: 'openai', isEnabled: true, apiKey: 'sk-recovered' }]
        },
        null,
        2
      );

      const storage = await importProviderStorage();
      const provider = await storage.getProvider('openai');
      expect(provider).not.toBeNull();
      expect(provider!.apiKey).toBe('sk-recovered');
    });

    it('文件不存在但 .bak 存在时从 .bak 恢复', async () => {
      // 不写 settings.json，只写 .bak
      delete fileStore['/home/user/.tibis/settings.json'];
      fileStore['/home/user/.tibis/settings.json.bak'] = JSON.stringify(
        {
          version: 1,
          providers: [{ id: 'anthropic', isEnabled: true }]
        },
        null,
        2
      );

      const storage = await importProviderStorage();
      const provider = await storage.getProvider('anthropic');
      expect(provider).not.toBeNull();
      expect(provider!.isEnabled).toBe(true);
    });

    it('文件和 .bak 都损坏时返回默认值', async () => {
      fileStore['/home/user/.tibis/settings.json'] = '{ broken';
      fileStore['/home/user/.tibis/settings.json.bak'] = '{ also broken';

      const storage = await importProviderStorage();
      const providers = await storage.listProviders();
      // 应返回 DEFAULT_PROVIDERS
      expect(providers.length).toBeGreaterThan(0);
      expect(providers[0].id).toBe(DEFAULT_PROVIDERS[0].id);
    });
  });

  describe('CRUD 操作', () => {
    beforeEach(() => {
      setSettingsFile({ version: 1, providers: [] });
    });

    it('toggleProvider 切换启用状态', async () => {
      const storage = await importProviderStorage();
      const result = await storage.toggleProvider('openai', true);
      expect(result).not.toBeNull();
      expect(result!.isEnabled).toBe(true);

      const settings = getSettingsFile();
      const openai = settings!.providers.find((e) => e.id === 'openai');
      expect(openai!.isEnabled).toBe(true);
    });

    it('saveProviderConfig 保存 apiKey 和 baseUrl', async () => {
      const storage = await importProviderStorage();
      const result = await storage.saveProviderConfig('openai', {
        apiKey: 'sk-test',
        baseUrl: 'https://custom.api.com/v1'
      });
      expect(result).not.toBeNull();
      expect(result!.apiKey).toBe('sk-test');
      expect(result!.baseUrl).toBe('https://custom.api.com/v1');
    });

    it('saveProviderModels 保存模型列表（增量合并后包含 base 新增 models）', async () => {
      const storage = await importProviderStorage();
      const models: AIProviderModel[] = [{ id: 'gpt-4', name: 'GPT-4', type: 'chat', isEnabled: true }];
      const result = await storage.saveProviderModels('openai', models);
      expect(result).not.toBeNull();
      // gpt-4 在用户覆盖中，base 中其他 model 也会被增量追加
      expect(result!.models!.find((m) => m.id === 'gpt-4')).toBeDefined();
    });

    it('createOrUpdateCustomProvider 创建自定义服务商', async () => {
      const storage = await importProviderStorage();
      const payload: AICustomProvider = {
        id: 'my-custom',
        name: 'My Custom Provider',
        description: 'Test provider',
        type: 'openai',
        isEnabled: true,
        apiKey: 'sk-custom',
        baseUrl: 'https://custom.api.com/v1'
      };
      const result = await storage.createOrUpdateCustomProvider(payload);
      expect(result).not.toBeNull();
      expect(result!.id).toBe('my-custom');
      expect(result!.name).toBe('My Custom Provider');
      expect(result!.isCustom).toBe(true);
      expect(result!.readonly).toBe(false);
    });

    it('createOrUpdateCustomProvider 拒绝与内置服务商同 ID', async () => {
      const storage = await importProviderStorage();
      const payload: AICustomProvider = {
        id: 'openai',
        name: 'Fake OpenAI',
        type: 'openai'
      };
      const result = await storage.createOrUpdateCustomProvider(payload);
      expect(result).toBeNull();
    });

    it('createOrUpdateCustomProvider 拒绝无效的 type', async () => {
      const storage = await importProviderStorage();
      const payload: AICustomProvider = {
        id: 'bad-type',
        name: 'Bad Type',
        type: 'invalid-format' as AIProviderType
      };
      const result = await storage.createOrUpdateCustomProvider(payload);
      expect(result).toBeNull();
    });

    it('deleteCustomProvider 删除自定义服务商', async () => {
      const storage = await importProviderStorage();
      // 先创建
      await storage.createOrUpdateCustomProvider({
        id: 'to-delete',
        name: 'To Delete',
        type: 'openai'
      });
      // 再删除
      const result = await storage.deleteCustomProvider('to-delete');
      expect(result).toBe(true);
      // 确认已删除
      const provider = await storage.getProvider('to-delete');
      expect(provider).toBeNull();
    });

    it('deleteCustomProvider 不能删除内置服务商', async () => {
      const storage = await importProviderStorage();
      const result = await storage.deleteCustomProvider('openai');
      expect(result).toBe(false);
    });

    it('getProvider 获取内置服务商（带用户覆盖）', async () => {
      setSettingsFile({
        version: 1,
        providers: [{ id: 'openai', isEnabled: true, apiKey: 'sk-test' }]
      });
      const storage = await importProviderStorage();
      const provider = await storage.getProvider('openai');
      expect(provider).not.toBeNull();
      expect(provider!.id).toBe('openai');
      expect(provider!.isEnabled).toBe(true);
      expect(provider!.apiKey).toBe('sk-test');
    });

    it('getProvider 获取不存在的服务商返回 null', async () => {
      const storage = await importProviderStorage();
      const provider = await storage.getProvider('nonexistent');
      expect(provider).toBeNull();
    });

    it('ID 大小写不敏感', async () => {
      setSettingsFile({
        version: 1,
        providers: [{ id: 'openai', isEnabled: true }]
      });
      const storage = await importProviderStorage();
      const provider = await storage.getProvider('OpenAI');
      expect(provider).not.toBeNull();
      expect(provider!.id).toBe('openai');
    });
  });

  describe('listProviders 合并顺序', () => {
    it('按 JSON 数组顺序输出', async () => {
      setSettingsFile({
        version: 1,
        providers: [
          { id: 'anthropic', isEnabled: true },
          { id: 'openai', isEnabled: false }
        ]
      });

      const storage = await importProviderStorage();
      const providers = await storage.listProviders();
      const ids = providers.map((p) => p.id);

      // anthropic 应在 openai 之前
      expect(ids.indexOf('anthropic')).toBeLessThan(ids.indexOf('openai'));
    });

    it('JSON 中不存在的内置服务商追加到末尾', async () => {
      setSettingsFile({
        version: 1,
        providers: [{ id: 'anthropic', isEnabled: true }]
      });

      const storage = await importProviderStorage();
      const providers = await storage.listProviders();
      const ids = providers.map((p) => p.id);

      // anthropic 在前，openai 等其他内置服务商追加到后面
      expect(ids[0]).toBe('anthropic');
      expect(ids.filter((id) => id !== 'anthropic').length).toBeGreaterThan(0);
    });

    it('自定义服务商按 JSON 顺序输出', async () => {
      setSettingsFile({
        version: 1,
        providers: [
          { id: 'custom-a', name: 'A', type: 'openai', isCustom: true, isEnabled: true },
          { id: 'custom-b', name: 'B', type: 'openai', isCustom: true, isEnabled: true }
        ]
      });

      const storage = await importProviderStorage();
      const providers = await storage.listProviders();
      const customIds = providers.filter((p) => p.isCustom).map((p) => p.id);
      expect(customIds).toEqual(['custom-a', 'custom-b']);
    });
  });

  describe('reorderProviders', () => {
    it('重新排序服务商列表', async () => {
      setSettingsFile({
        version: 1,
        providers: [
          { id: 'openai', isEnabled: false },
          { id: 'anthropic', isEnabled: false },
          { id: 'google', isEnabled: false }
        ]
      });

      const storage = await importProviderStorage();
      const result = await storage.reorderProviders(['google', 'openai', 'anthropic']);
      const ids = result.map((p) => p.id);

      // 前三个应按新顺序排列
      expect(ids.slice(0, 3)).toEqual(['google', 'openai', 'anthropic']);
    });
  });

  describe('并发写入保护', () => {
    it('快速连续写入不丢失数据', async () => {
      setSettingsFile({ version: 1, providers: [] });

      const storage = await importProviderStorage();
      // 快速连续切换两个 provider
      const [p1, p2] = await Promise.all([storage.toggleProvider('openai', true), storage.toggleProvider('anthropic', true)]);

      expect(p1!.isEnabled).toBe(true);
      expect(p2!.isEnabled).toBe(true);

      // 两个都应持久化
      const settings = getSettingsFile();
      expect(settings!.providers.find((e) => e.id === 'openai')!.isEnabled).toBe(true);
      expect(settings!.providers.find((e) => e.id === 'anthropic')!.isEnabled).toBe(true);
    });
  });

  describe('Web 平台降级', () => {
    it('工作区根目录不可用时返回默认服务商列表', async () => {
      mockElectronAPI.getTibisWorkspaceRoot.mockResolvedValue(null);

      const storage = await importProviderStorage();
      const providers = await storage.listProviders();
      // 应返回 DEFAULT_PROVIDERS
      expect(providers.length).toBeGreaterThan(0);
      expect(providers[0].id).toBe(DEFAULT_PROVIDERS[0].id);
    });
  });
});
