/**
 * 服务商存储的 SQLite 实现
 * 用于在 Tauri 环境中持久化服务商配置
 */
import type { Provider, ProviderModel, StoredProviderSettings } from '../types';
import { isTauri } from '@tauri-apps/api/core';
import Database from '@tauri-apps/plugin-sql';
import { DEFAULT_PROVIDERS } from './defaults';

// ─── 常量 ────────────────────────────────────────────────────────────────────

const SETTINGS_DB_PATH = 'sqlite:texti.db';

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS provider_settings (
    id          TEXT    PRIMARY KEY,
    is_enabled  INTEGER NOT NULL,
    api_key     TEXT,
    base_url    TEXT,
    models_json TEXT,
    updated_at  INTEGER NOT NULL
  )
`;

const SELECT_ALL_SQL = 'SELECT id, is_enabled, api_key, base_url, models_json FROM provider_settings';
const SELECT_ONE_SQL = `${SELECT_ALL_SQL} WHERE id = ? LIMIT 1`;
const UPSERT_SQL = `
  INSERT OR REPLACE INTO provider_settings
    (id, is_enabled, api_key, base_url, models_json, updated_at)
  VALUES (?, ?, ?, ?, ?, ?)
`;

// ─── 类型 ────────────────────────────────────────────────────────────────────

interface ProviderSettingsRow {
  id: string;
  is_enabled: number;
  api_key: string | null;
  base_url: string | null;
  models_json: string | null;
}

// ─── 数据库单例 ───────────────────────────────────────────────────────────────

let dbInstance: Database | null = null;
let dbInitPromise: Promise<Database | null> | null = null;

/**
 * 获取（并懒初始化）数据库实例。
 * 并发调用共享同一个初始化 Promise，避免重复建表。
 */
async function getDatabase(): Promise<Database | null> {
  if (!isTauri()) return null;
  if (dbInstance) return dbInstance;

  dbInitPromise ??= (async () => {
    try {
      const db = await Database.load(SETTINGS_DB_PATH);
      await db.execute(CREATE_TABLE_SQL);
      dbInstance = db;
      return db;
    } catch (err) {
      dbInitPromise = null; // 允许下次重试
      console.error('[providerStorage] 数据库初始化失败:', err);
      return null;
    }
  })();

  return dbInitPromise;
}

// ─── 克隆工具 ─────────────────────────────────────────────────────────────────

function cloneModel(model: ProviderModel): ProviderModel {
  return { ...model, tags: model.tags ? [...model.tags] : [] };
}

function cloneModels(models: ProviderModel[]): ProviderModel[] {
  return models.map(cloneModel);
}

function cloneProvider(provider: Provider): Provider {
  return { ...provider, models: cloneModels(provider.models ?? []) };
}

// ─── 校验 ────────────────────────────────────────────────────────────────────

function isProviderModel(value: unknown): value is ProviderModel {
  if (!value || typeof value !== 'object') return false;
  const c = value as Record<string, unknown>;
  return (
    typeof c.id === 'string' &&
    typeof c.name === 'string' &&
    typeof c.description === 'string' &&
    typeof c.isEnabled === 'boolean' &&
    (c.tags === undefined || (Array.isArray(c.tags) && c.tags.every((t) => typeof t === 'string')))
  );
}

// ─── 序列化 / 反序列化 ────────────────────────────────────────────────────────

function parseModelsJson(json: string | null): ProviderModel[] | undefined {
  if (!json) return undefined;
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return undefined;
    return cloneModels(parsed.filter(isProviderModel));
  } catch {
    return undefined;
  }
}

function stringifyModels(models?: ProviderModel[]): string | null {
  return models ? JSON.stringify(cloneModels(models)) : null;
}

// ─── 设置映射 ─────────────────────────────────────────────────────────────────

/**
 * 从任意输入中提取合法字段，过滤掉类型不符或 undefined 的值。
 */
function sanitizeProviderSettings(raw: Partial<StoredProviderSettings>): StoredProviderSettings {
  const result: StoredProviderSettings = {};

  if (typeof raw.isEnabled === 'boolean') result.isEnabled = raw.isEnabled;
  if (typeof raw.apiKey === 'string') result.apiKey = raw.apiKey;
  if (typeof raw.baseUrl === 'string') result.baseUrl = raw.baseUrl;
  if (Array.isArray(raw.models)) result.models = cloneModels(raw.models.filter(isProviderModel));

  return result;
}

function mapRowToStoredSettings(row: ProviderSettingsRow): StoredProviderSettings {
  return sanitizeProviderSettings({
    isEnabled: Boolean(row.is_enabled),
    apiKey: row.api_key ?? undefined,
    baseUrl: row.base_url ?? undefined,
    models: parseModelsJson(row.models_json)
  });
}

// ─── 合并逻辑 ─────────────────────────────────────────────────────────────────

function mergeProvider(base: Provider, stored?: StoredProviderSettings): Provider {
  const overrides = stored ? sanitizeProviderSettings(stored) : {};
  return {
    ...cloneProvider(base),
    ...overrides,
    models: overrides.models ?? cloneModels(base.models ?? [])
  };
}

// ─── 默认服务商查找 ───────────────────────────────────────────────────────────

const DEFAULT_PROVIDERS_MAP = new Map(DEFAULT_PROVIDERS.map((p) => [p.id, p]));

function getDefaultProvider(id: string): Provider | undefined {
  return DEFAULT_PROVIDERS_MAP.get(id);
}

// ─── 数据库读写 ───────────────────────────────────────────────────────────────

/**
 * 全量读取存储设置（id → settings）。
 */
async function loadAllStoredSettings(): Promise<Map<string, StoredProviderSettings>> {
  const db = await getDatabase();
  if (!db) return new Map();

  const rows = await db.select<ProviderSettingsRow[]>(SELECT_ALL_SQL);
  return new Map(rows.map((row) => [row.id, mapRowToStoredSettings(row)]));
}

/**
 * 读取单条存储设置，找不到返回 undefined。
 */
async function loadStoredSetting(id: string): Promise<StoredProviderSettings | undefined> {
  const db = await getDatabase();
  if (!db) return undefined;

  const rows = await db.select<ProviderSettingsRow[]>(SELECT_ONE_SQL, [id]);
  return rows[0] ? mapRowToStoredSettings(rows[0]) : undefined;
}

/**
 * 将合并后的设置写入数据库（UPSERT）。
 */
async function persistSettings(db: Database, id: string, settings: StoredProviderSettings): Promise<void> {
  await db.execute(UPSERT_SQL, [
    id,
    settings.isEnabled ? 1 : 0,
    settings.apiKey ?? null,
    settings.baseUrl ?? null,
    stringifyModels(settings.models),
    Date.now()
  ]);
}

// ─── 公开 API ─────────────────────────────────────────────────────────────────

export const providerStorage = {
  /**
   * 获取所有服务商列表（默认列表 + 已存储的覆盖设置合并）。
   */
  async listProviders(): Promise<Provider[]> {
    const stored = await loadAllStoredSettings();

    return DEFAULT_PROVIDERS.map((provider) => mergeProvider(provider, stored.get(provider.id)));
  },

  /**
   * 根据 ID 获取单个服务商，未找到返回 null。
   */
  async getProvider(id: string): Promise<Provider | null> {
    const base = getDefaultProvider(id);
    if (!base) return null;

    const stored = await loadStoredSetting(id);
    return mergeProvider(base, stored);
  },

  /**
   * 更新服务商的部分字段，返回合并后的完整服务商。
   * 若 id 不存在于默认列表或数据库不可用，返回 null。
   */
  async updateProvider(id: string, patch: StoredProviderSettings): Promise<Provider | null> {
    const base = getDefaultProvider(id);
    const db = await getDatabase();
    if (!base || !db) return null;

    const current = (await loadStoredSetting(id)) ?? {};
    const next = sanitizeProviderSettings({ ...current, ...patch });

    await persistSettings(db, id, next);
    return mergeProvider(base, next);
  },

  /**
   * 切换服务商的启用状态。
   */
  async toggleProvider(id: string, enabled: boolean): Promise<Provider | null> {
    return this.updateProvider(id, { isEnabled: enabled });
  },

  /**
   * 保存服务商的 API 配置（apiKey / baseUrl）。
   */
  async saveProviderConfig(id: string, config: Pick<StoredProviderSettings, 'apiKey' | 'baseUrl'>): Promise<Provider | null> {
    return this.updateProvider(id, config);
  },

  /**
   * 保存服务商的模型列表。
   */
  async saveProviderModels(id: string, models: ProviderModel[]): Promise<Provider | null> {
    return this.updateProvider(id, { models: cloneModels(models) });
  }
};
