/**
 * @file json.ts
 * @description 基于 ~/.tibis/settings.json 的 provider 配置持久化存储层，替代 SQLite
 */
import type { StoredProviderSettings, StoredProviderEntry, SettingsFileContent } from './types';
import type { AIProviderType, AIProviderModel, AIProvider, AICustomProvider } from 'types/ai';
import { cloneDeep, omitBy, isUndefined, pick, isBoolean, isString, isArray } from 'lodash-es';
import { native } from '@/shared/platform/native';
import { DEFAULT_PROVIDERS } from './defaults';

// ─────────────────────────────────────────────
// 常量
// ─────────────────────────────────────────────

const SETTINGS_FILE = 'settings.json';
const REQUEST_FORMATS: AIProviderType[] = ['openai', 'anthropic', 'google', 'deepseek'];

// ─────────────────────────────────────────────
// 类型守卫
// ─────────────────────────────────────────────

/** 判断一个值是否为合法的请求格式标识符 */
function isProviderRequestFormat(value: unknown): value is AIProviderType {
  return typeof value === 'string' && REQUEST_FORMATS.includes(value as AIProviderType);
}

/** ID 规范化 */
function sanitizeProviderId(id: string): string {
  return id.trim().toLowerCase();
}

// ─────────────────────────────────────────────
// 数据校验
// ─────────────────────────────────────────────

/** 校验单个 model 的基本结构，过滤掉缺少 id 的非法条目 */
function sanitizeModel(raw: unknown): AIProviderModel | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  if (!isString(m.id) || !m.id.trim()) return null;
  return m as unknown as AIProviderModel;
}

/** 校验单个 provider entry 的字段合法性 */
function sanitizeProviderEntry(raw: Partial<StoredProviderEntry>): StoredProviderEntry {
  const result: StoredProviderEntry = { id: '' };

  if (isString(raw.id)) result.id = raw.id.trim().toLowerCase();
  if (isBoolean(raw.isEnabled)) result.isEnabled = raw.isEnabled;
  if (isString(raw.apiKey)) result.apiKey = raw.apiKey;
  if (isString(raw.baseUrl)) result.baseUrl = raw.baseUrl;
  if (isArray(raw.models)) {
    result.models = raw.models.map((m: unknown) => sanitizeModel(m)).filter((m): m is AIProviderModel => m !== null);
  }
  if (isString(raw.name)) result.name = raw.name;
  if (isString(raw.description)) result.description = raw.description;
  if (isProviderRequestFormat(raw.type)) result.type = raw.type;
  if (isString(raw.logo)) result.logo = raw.logo;
  if (raw.isCustom === true) result.isCustom = true;

  return result;
}

/** 归一化整个 settings.json 文件内容 */
function normalizeSettingsFile(raw: unknown): SettingsFileContent {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { version: 1, providers: [] };
  }
  const source = raw as Partial<SettingsFileContent>;
  const providers = source.providers?.map((e: unknown) => sanitizeProviderEntry(e as Partial<StoredProviderEntry>)).filter((e) => e.id) || [];

  // id 去重（保留首次出现）
  const seen = new Set<string>();
  const unique = providers.filter((e) => {
    if (seen.has(e.id)) return false;
    seen.add(e.id);
    return true;
  });

  return { version: 1, providers: unique };
}

/** 校验 StoredProviderSettings patch */
function sanitizeProviderSettings(raw: Partial<StoredProviderSettings>): StoredProviderSettings {
  const result: StoredProviderSettings = {};
  if (isBoolean(raw.isEnabled)) result.isEnabled = raw.isEnabled;
  if (isString(raw.apiKey)) result.apiKey = raw.apiKey;
  if (isString(raw.baseUrl)) result.baseUrl = raw.baseUrl;
  if (isArray(raw.models)) {
    result.models = raw.models.map((m: unknown) => sanitizeModel(m)).filter((m): m is AIProviderModel => m !== null);
  }
  return result;
}

// ─────────────────────────────────────────────
// 文件路径
// ─────────────────────────────────────────────

/** 获取 settings.json 的完整路径 */
async function getSettingsPath(): Promise<string | null> {
  const root = await native.getTibisWorkspaceRoot();
  if (!root) return null;
  return `${root.rootPath}/${SETTINGS_FILE}`;
}

// ─────────────────────────────────────────────
// 文件读写
// ─────────────────────────────────────────────

/** 从备份文件恢复 */
async function recoverFromBackup(filePath: string): Promise<SettingsFileContent | null> {
  const bakPath = `${filePath}.bak`;
  const bakStatus = await native.getPathStatus(bakPath);
  if (!bakStatus.exists) return null;

  try {
    const { content } = await native.readFile(bakPath);
    const parsed = JSON.parse(content);
    const normalized = normalizeSettingsFile(parsed);
    await native.writeFile(filePath, JSON.stringify(normalized, null, 2));
    return normalized;
  } catch {
    return null;
  }
}

/** 读取 settings.json，文件损坏时自动从 .bak 恢复 */
async function readSettingsFile(): Promise<SettingsFileContent | null> {
  const filePath = await getSettingsPath();
  if (!filePath) return null;

  const status = await native.getPathStatus(filePath);
  if (!status.exists) {
    return recoverFromBackup(filePath);
  }

  const { content } = await native.readFile(filePath);
  try {
    return normalizeSettingsFile(JSON.parse(content));
  } catch {
    return recoverFromBackup(filePath);
  }
}

/** 写入 settings.json（带备份），写入失败抛异常 */
async function writeSettingsFile(data: SettingsFileContent): Promise<void> {
  const filePath = await getSettingsPath();
  if (!filePath) return;

  const content = JSON.stringify(data, null, 2);

  // 备份当前文件
  const status = await native.getPathStatus(filePath);
  if (status.exists) {
    const { content: currentContent } = await native.readFile(filePath);
    await native.writeFile(`${filePath}.bak`, currentContent);
  }

  await native.writeFile(filePath, content);
}

// ─────────────────────────────────────────────
// 并发写入保护
// ─────────────────────────────────────────────

/** 写操作串行化队列 */
let writeQueue: Promise<void> = Promise.resolve();

/** 将写操作加入串行化队列：读取最新 → 应用修改 → 写入 */
async function enqueueWrite(transformer: (current: SettingsFileContent) => SettingsFileContent): Promise<SettingsFileContent> {
  const result = await new Promise<SettingsFileContent>((resolve, reject) => {
    writeQueue = writeQueue.then(async () => {
      try {
        const current = (await readSettingsFile()) ?? { version: 1, providers: [] };
        const next = transformer(current);
        await writeSettingsFile(next);
        resolve(next);
      } catch (err) {
        reject(err);
      }
    });
  });
  return result;
}

// ─────────────────────────────────────────────
// 合并逻辑
// ─────────────────────────────────────────────

const DEFAULT_PROVIDERS_MAP = new Map(DEFAULT_PROVIDERS.map((p) => [p.id, p]));

/** 根据 ID 获取内置服务商默认配置 */
function getDefaultProvider(id: string): AIProvider | undefined {
  return DEFAULT_PROVIDERS_MAP.get(id);
}

/** 合并内置服务商的默认配置与用户覆盖设置，models 增量合并 */
function mergeProvider(base: AIProvider, stored?: StoredProviderEntry): AIProvider {
  const overrides = stored ? sanitizeProviderEntry(stored) : null;

  let mergedModels: AIProviderModel[];
  if (overrides?.models && overrides.models.length > 0) {
    const overrideModelIds = new Set(overrides.models.map((m) => m.id));
    const newBaseModels = (base.models ?? []).filter((m) => !overrideModelIds.has(m.id));
    mergedModels = [...overrides.models, ...newBaseModels];
  } else {
    mergedModels = cloneDeep(base.models ?? []);
  }

  return {
    ...cloneDeep(base),
    ...(overrides ? omitBy(overrides, isUndefined) : {}),
    models: mergedModels
  };
}

/** 将自定义服务商的 StoredProviderEntry 转换为 AIProvider */
function entryToCustomProvider(entry: StoredProviderEntry): AIProvider {
  return {
    id: entry.id,
    name: entry.name ?? entry.id,
    description: entry.description ?? '',
    type: entry.type ?? 'openai',
    logo: entry.logo ?? '',
    baseUrl: entry.baseUrl ?? '',
    apiKey: entry.apiKey ?? '',
    models: entry.models ?? [],
    isEnabled: entry.isEnabled ?? false,
    readonly: false,
    isCustom: true
  };
}

// ─────────────────────────────────────────────
// 数组操作工具
// ─────────────────────────────────────────────

/** 更新或插入条目（保持顺序） */
function upsertEntry(entries: StoredProviderEntry[], entry: StoredProviderEntry): StoredProviderEntry[] {
  const index = entries.findIndex((e) => e.id === entry.id);
  if (index >= 0) {
    const next = [...entries];
    next[index] = entry;
    return next;
  }
  return [...entries, entry];
}

/** 按 ID 列表重排序，不在 orderedIds 中的条目追加到末尾 */
function reorderEntries(entries: StoredProviderEntry[], orderedIds: string[]): StoredProviderEntry[] {
  const map = new Map(entries.map((e) => [e.id, e]));
  const ordered: StoredProviderEntry[] = [];
  const seen = new Set<string>();

  for (const id of orderedIds) {
    const entry = map.get(id);
    if (entry) {
      ordered.push(entry);
      seen.add(id);
    }
  }

  for (const entry of entries) {
    if (!seen.has(entry.id)) {
      ordered.push(entry);
    }
  }

  return ordered;
}

// ─────────────────────────────────────────────
// 自定义服务商 Payload 规范化
// ─────────────────────────────────────────────

/** 规范化自定义服务商创建/更新参数 */
function normalizeCustomProviderPayload(payload: AICustomProvider): AICustomProvider {
  return {
    ...pick(payload, ['id', 'name', 'description', 'type', 'logo', 'isEnabled', 'apiKey', 'baseUrl']),
    id: sanitizeProviderId(payload.id),
    name: payload.name.trim(),
    description: payload.description?.trim(),
    logo: payload.logo?.trim()
  };
}

// ─────────────────────────────────────────────
// 对外暴露的存储层接口
// ─────────────────────────────────────────────

export const providerStorage = {
  /** 列出所有服务商（内置 + 自定义，按 JSON 数组顺序） */
  async listProviders(): Promise<AIProvider[]> {
    const settings = await readSettingsFile();
    const entries = settings?.providers ?? [];

    const merged: AIProvider[] = [];
    const seenIds = new Set<string>();

    // 按 JSON 数组顺序输出
    for (const entry of entries) {
      const base = getDefaultProvider(entry.id);
      if (base) {
        merged.push(mergeProvider(base, entry));
        seenIds.add(entry.id);
      } else if (entry.isCustom) {
        merged.push(entryToCustomProvider(entry));
        seenIds.add(entry.id);
      }
    }

    // 追加 JSON 中不存在的新内置服务商（代码升级新增的默认服务商）
    for (const base of DEFAULT_PROVIDERS) {
      if (!seenIds.has(base.id)) {
        merged.push(cloneDeep(base));
      }
    }

    return merged;
  },

  /** 获取单个服务商 */
  async getProvider(id: string): Promise<AIProvider | null> {
    const normalizedId = sanitizeProviderId(id);
    const base = getDefaultProvider(normalizedId);

    if (base) {
      const settings = await readSettingsFile();
      const entry = settings?.providers.find((e) => e.id === normalizedId);
      return mergeProvider(base, entry);
    }

    // 自定义服务商
    const settings = await readSettingsFile();
    const entry = settings?.providers.find((e) => e.id === normalizedId && e.isCustom);
    return entry ? entryToCustomProvider(entry) : null;
  },

  /** 创建或更新自定义服务商 */
  async createOrUpdateCustomProvider(payload: AICustomProvider): Promise<AIProvider | null> {
    const normalized = normalizeCustomProviderPayload(payload);
    const { id } = normalized;

    if (!id || !normalized.name || !isProviderRequestFormat(normalized.type) || getDefaultProvider(id)) {
      return null;
    }

    const result = await enqueueWrite((current) => {
      const existing = current.providers.find((e) => e.id === id && e.isCustom);
      const entry: StoredProviderEntry = {
        id,
        name: normalized.name,
        description: normalized.description || existing?.description || '自定义服务商',
        type: normalized.type,
        logo: normalized.logo || existing?.logo,
        isEnabled: normalized.isEnabled ?? existing?.isEnabled ?? true,
        apiKey: normalized.apiKey ?? existing?.apiKey,
        baseUrl: normalized.baseUrl ?? existing?.baseUrl,
        models: existing?.models ?? [],
        isCustom: true
      };
      return { ...current, providers: upsertEntry(current.providers, entry) };
    });

    const entry = result.providers.find((e) => e.id === id);
    return entry ? entryToCustomProvider(entry) : null;
  },

  /** 更新服务商设置 */
  async updateProvider(id: string, patch: StoredProviderSettings): Promise<AIProvider | null> {
    const normalizedId = sanitizeProviderId(id);
    const base = getDefaultProvider(normalizedId);

    if (base) {
      // 内置服务商：更新覆盖设置
      const result = await enqueueWrite((current) => {
        const existing = current.providers.find((e) => e.id === normalizedId);
        const sanitized = sanitizeProviderSettings(patch);
        const entry: StoredProviderEntry = {
          ...existing,
          id: normalizedId,
          ...sanitized
        };
        return { ...current, providers: upsertEntry(current.providers, entry) };
      });

      const entry = result.providers.find((e) => e.id === normalizedId);
      return entry ? mergeProvider(base, entry) : null;
    }

    // 自定义服务商
    const result = await enqueueWrite((current) => {
      const existing = current.providers.find((e) => e.id === normalizedId && e.isCustom);
      if (!existing) return current;

      const sanitized = sanitizeProviderSettings(patch);
      const updated: StoredProviderEntry = {
        ...existing,
        ...sanitized,
        models: sanitized.models ?? existing.models
      };
      const next = [...current.providers];
      const index = next.findIndex((e) => e.id === normalizedId);
      next[index] = updated;
      return { ...current, providers: next };
    });

    const entry = result.providers.find((e) => e.id === normalizedId);
    return entry && entry.isCustom ? entryToCustomProvider(entry) : null;
  },

  /** 切换服务商启用状态 */
  async toggleProvider(id: string, enabled: boolean): Promise<AIProvider | null> {
    return this.updateProvider(id, { isEnabled: enabled });
  },

  /** 保存服务商配置（apiKey / baseUrl） */
  async saveProviderConfig(id: string, config: Pick<StoredProviderSettings, 'apiKey' | 'baseUrl'>): Promise<AIProvider | null> {
    return this.updateProvider(id, config);
  },

  /** 保存服务商模型列表 */
  async saveProviderModels(id: string, models: AIProviderModel[]): Promise<AIProvider | null> {
    return this.updateProvider(id, { models: cloneDeep(models) });
  },

  /** 删除自定义服务商 */
  async deleteCustomProvider(id: string): Promise<boolean> {
    const normalizedId = sanitizeProviderId(id);

    const existedBefore = (await readSettingsFile())?.providers.some((e) => e.id === normalizedId && e.isCustom) ?? false;
    if (!existedBefore) return false;

    const result = await enqueueWrite((current) => {
      const existing = current.providers.find((e) => e.id === normalizedId && e.isCustom);
      if (!existing) return current;

      return { ...current, providers: current.providers.filter((e) => e.id !== normalizedId) };
    });

    return !result.providers.some((e) => e.id === normalizedId && e.isCustom);
  },

  /** 重新排序服务商列表 */
  async reorderProviders(orderedIds: string[]): Promise<AIProvider[]> {
    await enqueueWrite((current) => {
      return { ...current, providers: reorderEntries(current.providers, orderedIds) };
    });

    return this.listProviders();
  }
};

// ─────────────────────────────────────────────
// 测试导出（仅供单元测试使用）
// ─────────────────────────────────────────────

export {
  normalizeSettingsFile,
  sanitizeProviderEntry,
  sanitizeProviderSettings,
  sanitizeModel,
  mergeProvider,
  entryToCustomProvider,
  upsertEntry,
  reorderEntries,
  isProviderRequestFormat,
  sanitizeProviderId
};
