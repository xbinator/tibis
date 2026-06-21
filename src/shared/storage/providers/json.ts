/**
 * @file json.ts
 * @description 基于 ~/.tibis/settings.json 的 provider 配置持久化存储层，替代 SQLite
 */
import type { StoredProviderSettings, StoredProviderEntry, SettingsFileContent } from './types';
import type { AIProviderType, AIProviderModel, AIProvider, AICustomProvider } from 'types/ai';
import { cloneDeep, omitBy, isUndefined, pick, isBoolean, isString, isArray } from 'lodash-es';
import { settingsFileStorage } from '@/shared/storage/settings';
import { DEFAULT_MCP_TOOL_SETTINGS, DEFAULT_TOOL_SETTINGS, normalizeMCPSettings, normalizeTavilySettings } from '@/shared/storage/tool-settings';
import { DEFAULT_PROVIDERS } from './defaults';

// ─────────────────────────────────────────────
// 常量
// ─────────────────────────────────────────────

const REQUEST_FORMATS: AIProviderType[] = ['openai', 'anthropic', 'google', 'deepseek', 'alibaba', 'volcengine', 'moonshot', 'glm', 'minimax', 'mimo'];

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
  if (isBoolean(raw.readonly)) result.readonly = raw.readonly;

  return result;
}

/** 归一化整个 settings.json 文件内容 */
function normalizeSettingsFile(raw: unknown): SettingsFileContent {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { version: 1, providers: [], mcp: DEFAULT_MCP_TOOL_SETTINGS, tavily: DEFAULT_TOOL_SETTINGS.tavily };
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

  return { version: 1, providers: unique, mcp: normalizeMCPSettings(source.mcp), tavily: normalizeTavilySettings(source.tavily) };
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

/** 将写操作加入串行化队列：读取最新 → 应用修改 → 写入 */
async function enqueueWrite(transformer: (current: SettingsFileContent) => SettingsFileContent): Promise<SettingsFileContent> {
  const result = await settingsFileStorage.update((current) => transformer(normalizeSettingsFile(current)));
  return normalizeSettingsFile(result);
}

// ─────────────────────────────────────────────
// 合并逻辑
// ─────────────────────────────────────────────

const DEFAULT_PROVIDERS_MAP = new Map(DEFAULT_PROVIDERS.map((p) => [p.id, p]));

/** 根据 ID 获取内置服务商默认配置 */
function getDefaultProvider(id: string): AIProvider | undefined {
  return DEFAULT_PROVIDERS_MAP.get(id);
}

/** 判断模型是否为用户删除标记 */
function isDeletedModel(model: AIProviderModel): boolean {
  return model.isDelete === true;
}

/** 克隆模型并清理删除标记，用于恢复已删除模型 */
function restoreModel(model: AIProviderModel): AIProviderModel {
  const nextModel = cloneDeep(model);
  delete nextModel.isDelete;
  return nextModel;
}

/** 克隆模型并标记为已删除，用于阻止内置默认模型刷新时被补回 */
function markModelDeleted(model: AIProviderModel): AIProviderModel {
  return { ...cloneDeep(model), isDelete: true };
}

/**
 * 生成内置服务商需要持久化的模型列表。
 * @param base 内置服务商默认配置
 * @param existing 已保存的服务商覆盖配置
 * @param models 本次保存的可见模型列表
 * @returns 包含删除标记的持久化模型列表
 */
function buildStoredModels(base: AIProvider, existing: StoredProviderEntry | undefined, models: AIProviderModel[]): AIProviderModel[] {
  const savedModelIds = new Set(models.map((model) => model.id));
  const defaultModelIds = new Set((base.models ?? []).map((model) => model.id));
  const activeModels = models.map((model) => restoreModel(model));
  const deletedDefaultModels = (base.models ?? []).filter((model) => !savedModelIds.has(model.id)).map((model) => markModelDeleted(model));
  const preservedDeletedModels = (existing?.models ?? []).filter(
    (model) => isDeletedModel(model) && !savedModelIds.has(model.id) && !defaultModelIds.has(model.id)
  );

  return [...activeModels, ...deletedDefaultModels, ...cloneDeep(preservedDeletedModels)];
}

/** 合并内置服务商的默认配置与用户覆盖设置，models 增量合并并隐藏用户删除过的模型 */
function mergeProvider(base: AIProvider, stored?: StoredProviderEntry): AIProvider {
  const overrides = stored ? sanitizeProviderEntry(stored) : null;

  let mergedModels: AIProviderModel[];
  if (overrides?.models) {
    const overrideModelIds = new Set(overrides.models.map((m) => m.id));
    const visibleOverrideModels = overrides.models.filter((model) => !isDeletedModel(model));
    const newBaseModels = (base.models ?? []).filter((m) => !overrideModelIds.has(m.id));
    mergedModels = [...cloneDeep(visibleOverrideModels), ...cloneDeep(newBaseModels)];
  } else {
    mergedModels = cloneDeep(base.models ?? []);
  }

  const providerOverrides = overrides ? omitBy(overrides, isUndefined) : {};

  return {
    ...cloneDeep(base),
    ...providerOverrides,
    models: mergedModels
  };
}

/**
 * 构造内置服务商的完整持久化快照。
 * @param base 内置服务商默认配置
 * @param existing 已保存的服务商配置
 * @param patch 本次要写入的用户覆盖配置
 * @returns 可直接写入 settings.json 的完整服务商条目
 */
function buildCompleteBuiltInEntry(base: AIProvider, existing: StoredProviderEntry | undefined, patch: StoredProviderSettings): StoredProviderEntry {
  const sanitizedPatch = sanitizeProviderSettings(patch);
  const mergedProvider = mergeProvider(base, existing);
  const nextModels = sanitizedPatch.models ?? mergedProvider.models ?? [];

  return sanitizeProviderEntry({
    id: base.id,
    name: base.name,
    description: base.description,
    type: base.type,
    logo: base.logo,
    isEnabled: sanitizedPatch.isEnabled ?? mergedProvider.isEnabled,
    apiKey: sanitizedPatch.apiKey ?? mergedProvider.apiKey,
    baseUrl: sanitizedPatch.baseUrl ?? mergedProvider.baseUrl,
    readonly: base.readonly,
    models: buildStoredModels(base, existing, nextModels)
  });
}

/**
 * 将旧的稀疏内置服务商条目补齐为完整快照。
 * @param entry settings.json 中的服务商条目
 * @returns 补齐后的服务商条目
 */
function completeStoredProviderEntry(entry: StoredProviderEntry): StoredProviderEntry {
  const base = getDefaultProvider(entry.id);
  if (!base) return sanitizeProviderEntry(entry);
  return buildCompleteBuiltInEntry(base, entry, {});
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
    models: (entry.models ?? []).filter((model) => !isDeletedModel(model)),
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
  /** 列出所有服务商（内置按 DEFAULT_PROVIDERS 顺序，自定义追加到末尾） */
  async listProviders(): Promise<AIProvider[]> {
    const settings = normalizeSettingsFile(await settingsFileStorage.read());
    const entries = settings.providers;
    const entryMap = new Map(entries.map((e) => [e.id, e]));

    const merged: AIProvider[] = [];
    const seenIds = new Set<string>();

    // 先按内置默认顺序输出，避免本地配置写入顺序影响服务商展示顺序。
    for (const base of DEFAULT_PROVIDERS) {
      merged.push(mergeProvider(base, entryMap.get(base.id)));
      seenIds.add(base.id);
    }

    // 自定义服务商继续按 settings.json 中的顺序追加。
    for (const entry of entries) {
      if (!getDefaultProvider(entry.id) && !seenIds.has(entry.id)) {
        merged.push(entryToCustomProvider(entry));
        seenIds.add(entry.id);
      }
    }

    return merged;
  },

  /** 获取单个服务商 */
  async getProvider(id: string): Promise<AIProvider | null> {
    const normalizedId = sanitizeProviderId(id);
    const base = getDefaultProvider(normalizedId);

    if (base) {
      const settings = normalizeSettingsFile(await settingsFileStorage.read());
      const entry = settings.providers.find((e) => e.id === normalizedId);
      return mergeProvider(base, entry);
    }

    // 自定义服务商
    const settings = normalizeSettingsFile(await settingsFileStorage.read());
    const entry = settings.providers.find((e) => e.id === normalizedId);
    return entry && !getDefaultProvider(entry.id) ? entryToCustomProvider(entry) : null;
  },

  /** 创建或更新自定义服务商 */
  async createOrUpdateCustomProvider(payload: AICustomProvider): Promise<AIProvider | null> {
    const normalized = normalizeCustomProviderPayload(payload);
    const { id } = normalized;

    if (!id || !normalized.name || !isProviderRequestFormat(normalized.type) || getDefaultProvider(id)) {
      return null;
    }

    const result = await enqueueWrite((current) => {
      const existing = current.providers.find((e) => e.id === id);
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
        readonly: false
      };
      return { ...current, providers: upsertEntry(current.providers, entry) };
    });

    const entry = result.providers.find((e) => e.id === id);
    return entry && !getDefaultProvider(entry.id) ? entryToCustomProvider(entry) : null;
  },

  /** 更新服务商设置 */
  async updateProvider(id: string, patch: StoredProviderSettings): Promise<AIProvider | null> {
    const normalizedId = sanitizeProviderId(id);
    const base = getDefaultProvider(normalizedId);

    if (base) {
      // 内置服务商：更新覆盖设置
      const result = await enqueueWrite((current) => {
        const existing = current.providers.find((e) => e.id === normalizedId);
        const entry = buildCompleteBuiltInEntry(base, existing, patch);
        return { ...current, providers: upsertEntry(current.providers, entry) };
      });

      const entry = result.providers.find((e) => e.id === normalizedId);
      return entry ? mergeProvider(base, entry) : null;
    }

    // 自定义服务商
    const result = await enqueueWrite((current) => {
      const existing = current.providers.find((e) => e.id === normalizedId);
      if (!existing) return current;

      const sanitized = sanitizeProviderSettings(patch);
      const updated: StoredProviderEntry = {
        ...existing,
        ...sanitized,
        models: sanitized.models ?? existing.models,
        readonly: false
      };
      const next = [...current.providers];
      const index = next.findIndex((e) => e.id === normalizedId);
      next[index] = updated;
      return { ...current, providers: next };
    });

    const entry = result.providers.find((e) => e.id === normalizedId);
    return entry && !getDefaultProvider(entry.id) ? entryToCustomProvider(entry) : null;
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

    const existedBefore = normalizeSettingsFile(await settingsFileStorage.read()).providers.some((e) => e.id === normalizedId && !getDefaultProvider(e.id));
    if (!existedBefore) return false;

    const result = await enqueueWrite((current) => {
      const existing = current.providers.find((e) => e.id === normalizedId);
      if (!existing) return current;

      return { ...current, providers: current.providers.filter((e) => e.id !== normalizedId) };
    });

    return !result.providers.some((e) => e.id === normalizedId && !getDefaultProvider(e.id));
  },

  /** 重新排序服务商列表 */
  async reorderProviders(orderedIds: string[]): Promise<AIProvider[]> {
    await enqueueWrite((current) => {
      const completeEntries = current.providers.map((entry) => completeStoredProviderEntry(entry));
      return { ...current, providers: reorderEntries(completeEntries, orderedIds) };
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
  isDeletedModel,
  buildStoredModels,
  buildCompleteBuiltInEntry,
  completeStoredProviderEntry,
  entryToCustomProvider,
  upsertEntry,
  reorderEntries,
  isProviderRequestFormat,
  sanitizeProviderId
};
