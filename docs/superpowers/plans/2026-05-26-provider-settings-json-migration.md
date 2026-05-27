# Provider Settings JSON Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 provider 设置从 SQLite 迁移到 `~/.tibis/settings.json`，复用 native 层文件读写能力，对外接口不变。

**Architecture:** 新建 `json.ts` 替代 `sqlite.ts`，通过 `native.readFile/writeFile/getPathStatus/getTibisWorkspaceRoot` 读写 JSON 文件。所有 public 方法入口通过 `ensureMigrated()` 守卫确保迁移完成。写操作通过 `enqueueWrite()` 异步队列串行化。首次加载时从 SQLite 一次性迁移数据。

**Tech Stack:** TypeScript, lodash-es, native platform API (readFile/writeFile/getPathStatus/getTibisWorkspaceRoot)

---

## File Structure

| 文件 | 职责 |
|------|------|
| `src/shared/storage/providers/types.ts` | 新增 `StoredProviderEntry` / `SettingsFileContent` 类型 |
| `src/shared/storage/providers/json.ts` | **新建**，JSON 文件读写的 providerStorage 实现 |
| `src/shared/storage/providers/sqlite.ts` | 保留不动，迁移逻辑从 json.ts 调用 |
| `src/shared/storage/providers/index.ts` | 导出从 `sqlite` 切换到 `json` |
| `src/shared/storage/providers/defaults.ts` | 不变 |

---

### Task 1: 新增类型定义

**Files:**
- Modify: `src/shared/storage/providers/types.ts`

- [ ] **Step 1: 在 types.ts 中新增 StoredProviderEntry 和 SettingsFileContent 类型**

在 `StoredProviderSettings` 接口下方添加：

```typescript
/**
 * settings.json 中的单个 provider 条目
 * 内置服务商仅存用户覆盖的字段，自定义服务商全量存储
 */
export interface StoredProviderEntry {
  /** 服务商 ID（唯一标识，规范化为小写） */
  id: string;
  /** 是否启用 */
  isEnabled?: boolean;
  /** API 密钥 */
  apiKey?: string;
  /** 自定义 API 基础地址 */
  baseUrl?: string;
  /** 模型配置列表 */
  models?: AIProviderModel[];
  /** 服务商名称（自定义服务商必填） */
  name?: string;
  /** 服务商描述 */
  description?: string;
  /** 请求格式类型（自定义服务商必填） */
  type?: AIProviderType;
  /** 服务商 Logo URL */
  logo?: string;
  /** 是否为自定义服务商 */
  isCustom?: boolean;
}

/**
 * settings.json 文件内容
 */
export interface SettingsFileContent {
  /** Schema 版本号 */
  version: number;
  /** 服务商配置列表（数组顺序即展示顺序） */
  providers: StoredProviderEntry[];
}
```

需要在文件顶部添加 import：

```typescript
import type { AIProviderModel, AIProviderType } from 'types/ai';
```

- [ ] **Step 2: 验证类型检查通过**

Run: `pnpm exec tsc --noEmit`
Expected: 无新增错误

- [ ] **Step 3: Commit**

```bash
git add src/shared/storage/providers/types.ts
git commit -m "feat: add StoredProviderEntry and SettingsFileContent types for JSON migration"
```

---

### Task 2: 新建 json.ts — 基础设施（文件读写 + 迁移守卫 + 并发队列）

**Files:**
- Create: `src/shared/storage/providers/json.ts`

- [ ] **Step 1: 创建 json.ts 文件，写入基础设施代码**

```typescript
/**
 * @file json.ts
 * @description 基于 ~/.tibis/settings.json 的 provider 配置持久化存储层，替代 SQLite
 */
import type { StoredProviderSettings, StoredProviderEntry, SettingsFileContent } from './types';
import type { AIProviderType, AIProviderModel, AIProvider, AICustomProvider } from 'types/ai';
import { cloneDeep, omitBy, isUndefined, pick, isBoolean, isString, isArray } from 'lodash-es';
import { native } from '@/shared/platform/native';
import { dbSelect, isDatabaseAvailable, parseJson } from '../utils';
import { DEFAULT_PROVIDERS } from './defaults';

// ─────────────────────────────────────────────
// 常量
// ─────────────────────────────────────────────

const SETTINGS_FILE = 'settings.json';
const MIGRATION_MARKER = '.providers-migrated';
const REQUEST_FORMATS: AIProviderType[] = ['openai', 'anthropic', 'google', 'deepseek'];

// ─────────────────────────────────────────────
// 克隆工具
// ─────────────────────────────────────────────

/** 深克隆模型列表，防止外部修改污染内部状态 */
function cloneModels(models: AIProviderModel[]): AIProviderModel[] {
  return cloneDeep(models);
}

/** 深克隆服务商对象 */
function cloneProvider(provider: AIProvider): AIProvider {
  return cloneDeep(provider);
}

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
    result.models = raw.models
      .map((m: unknown) => sanitizeModel(m))
      .filter((m): m is AIProviderModel => m !== null);
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
  const providers = isArray(source.providers)
    ? source.providers
        .map((e: unknown) => sanitizeProviderEntry(e as Partial<StoredProviderEntry>))
        .filter(e => e.id)
    : [];

  // id 去重（保留首次出现）
  const seen = new Set<string>();
  const unique = providers.filter(e => {
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
    result.models = raw.models
      .map((m: unknown) => sanitizeModel(m))
      .filter((m): m is AIProviderModel => m !== null);
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
  // 使用正斜杠拼接，native 层在 Windows 上也能正确处理
  return `${root.rootPath}/${SETTINGS_FILE}`;
}

/** 获取迁移标记文件路径 */
async function getMigrationMarkerPath(): Promise<string | null> {
  const root = await native.getTibisWorkspaceRoot();
  if (!root) return null;
  return `${root.rootPath}/${MIGRATION_MARKER}`;
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
async function enqueueWrite(
  transformer: (current: SettingsFileContent) => SettingsFileContent
): Promise<SettingsFileContent> {
  const result = await new Promise<SettingsFileContent>((resolve, reject) => {
    writeQueue = writeQueue.then(async () => {
      try {
        const current = await readSettingsFile() ?? { version: 1, providers: [] };
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
// 迁移守卫
// ─────────────────────────────────────────────

/** 迁移状态：null=未检查，true=已完成，false=进行中 */
let migrationStatus: boolean | null = null;

/** 确保迁移已完成再执行任何操作 */
async function ensureMigrated(): Promise<void> {
  if (migrationStatus === true) return;

  if (migrationStatus === null) {
    migrationStatus = false;
    await migrateFromSQLiteIfNeeded();
    migrationStatus = true;
  } else {
    // 迁移正在进行中，等待完成
    while (migrationStatus === false) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
}

// ─────────────────────────────────────────────
// 迁移逻辑
// ─────────────────────────────────────────────

/** 检查迁移标记文件是否存在 */
async function isMigrated(): Promise<boolean> {
  const markerPath = await getMigrationMarkerPath();
  if (!markerPath) return false;
  const status = await native.getPathStatus(markerPath);
  return status.exists;
}

/** 创建迁移标记文件 */
async function markMigrated(): Promise<void> {
  const markerPath = await getMigrationMarkerPath();
  if (!markerPath) return;
  await native.writeFile(markerPath, new Date().toISOString());
}

/** SQLite 行类型（与 sqlite.ts 一致） */
interface ProviderSettingsRow {
  id: string;
  is_enabled: number;
  api_key: string | null;
  base_url: string | null;
  models_json: string | null;
}

interface CustomProviderRow {
  id: string;
  name: string;
  description: string;
  type: string;
  logo: string | null;
  is_enabled: number;
  api_key: string | null;
  base_url: string | null;
  models_json: string | null;
}

/** 从 SQLite 迁移数据到 settings.json */
async function migrateFromSQLiteIfNeeded(): Promise<void> {
  // 已迁移则跳过
  if (await isMigrated()) return;

  // settings.json 已存在（用户手动创建），标记迁移完成，不覆盖
  const settingsPath = await getSettingsPath();
  if (settingsPath) {
    const status = await native.getPathStatus(settingsPath);
    if (status.exists) {
      await markMigrated();
      return;
    }
  }

  // SQLite 不可用，创建空 settings.json
  if (!isDatabaseAvailable()) {
    await writeSettingsFile({ version: 1, providers: [] });
    await markMigrated();
    return;
  }

  // 从 SQLite 读取数据
  const entries: StoredProviderEntry[] = [];

  // 读取内置服务商覆盖设置
  const settingsRows = await dbSelect<ProviderSettingsRow>(
    'SELECT id, is_enabled, api_key, base_url, models_json FROM provider_settings'
  );
  for (const row of settingsRows) {
    const models = parseJson<AIProviderModel[]>(row.models_json);
    const entry: StoredProviderEntry = {
      id: sanitizeProviderId(row.id),
      isEnabled: Boolean(row.is_enabled),
      apiKey: row.api_key ?? undefined,
      baseUrl: row.base_url ?? undefined,
      models: isArray(models) ? models : undefined,
    };
    // 过滤掉无效条目
    if (entry.id) entries.push(entry);
  }

  // 读取自定义服务商
  const customRows = await dbSelect<CustomProviderRow>(
    'SELECT id, name, description, type, logo, is_enabled, api_key, base_url, models_json FROM custom_providers'
  );
  for (const row of customRows) {
    if (!isProviderRequestFormat(row.type)) continue;
    const models = parseJson<AIProviderModel[]>(row.models_json);
    const entry: StoredProviderEntry = {
      id: sanitizeProviderId(row.id),
      name: row.name,
      description: row.description,
      type: row.type,
      logo: row.logo ?? undefined,
      isEnabled: Boolean(row.is_enabled),
      apiKey: row.api_key ?? undefined,
      baseUrl: row.base_url ?? undefined,
      models: isArray(models) ? models : [],
      isCustom: true,
    };
    if (entry.id) entries.push(entry);
  }

  // 按 DEFAULT_PROVIDERS 顺序排列内置服务商，自定义服务商追加到末尾
  const defaultOrder = DEFAULT_PROVIDERS.map(p => p.id);
  const builtinEntries: StoredProviderEntry[] = [];
  const customEntries: StoredProviderEntry[] = [];

  for (const entry of entries) {
    if (defaultOrder.includes(entry.id)) {
      builtinEntries.push(entry);
    } else {
      customEntries.push(entry);
    }
  }

  // 按 DEFAULT_PROVIDERS 原始顺序排列内置条目
  builtinEntries.sort((a, b) => defaultOrder.indexOf(a.id) - defaultOrder.indexOf(b.id));

  const sortedEntries = [...builtinEntries, ...customEntries];

  await writeSettingsFile({ version: 1, providers: sortedEntries });
  await markMigrated();
}

// ─────────────────────────────────────────────
// 合并逻辑
// ─────────────────────────────────────────────

const DEFAULT_PROVIDERS_MAP = new Map(DEFAULT_PROVIDERS.map(p => [p.id, p]));

function getDefaultProvider(id: string): AIProvider | undefined {
  return DEFAULT_PROVIDERS_MAP.get(id);
}

/** 合并内置服务商的默认配置与用户覆盖设置，models 增量合并 */
function mergeProvider(base: AIProvider, stored?: StoredProviderEntry): AIProvider {
  const overrides = stored ? sanitizeProviderEntry(stored) : {};

  // models 增量合并：用户覆盖的 models + base 中新增的 models
  let mergedModels: AIProviderModel[];
  if (overrides.models && overrides.models.length > 0) {
    const overrideModelIds = new Set(overrides.models.map(m => m.id));
    const newBaseModels = (base.models ?? []).filter(m => !overrideModelIds.has(m.id));
    mergedModels = [...overrides.models, ...newBaseModels];
  } else {
    mergedModels = cloneModels(base.models ?? []);
  }

  return {
    ...cloneProvider(base),
    ...omitBy(overrides, isUndefined),
    models: mergedModels,
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
    isCustom: true,
  };
}

// ─────────────────────────────────────────────
// 数组操作工具
// ─────────────────────────────────────────────

/** 更新或插入条目（保持顺序） */
function upsertEntry(entries: StoredProviderEntry[], entry: StoredProviderEntry): StoredProviderEntry[] {
  const index = entries.findIndex(e => e.id === entry.id);
  if (index >= 0) {
    const next = [...entries];
    next[index] = entry;
    return next;
  }
  return [...entries, entry];
}

/** 按 ID 列表重排序，不在 orderedIds 中的条目追加到末尾 */
function reorderEntries(entries: StoredProviderEntry[], orderedIds: string[]): StoredProviderEntry[] {
  const map = new Map(entries.map(e => [e.id, e]));
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
  async listProviders(): Promise<AIProvider[]> {
    await ensureMigrated();

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
        merged.push(cloneProvider(base));
      }
    }

    return merged;
  },

  async getProvider(id: string): Promise<AIProvider | null> {
    await ensureMigrated();

    const normalizedId = sanitizeProviderId(id);
    const base = getDefaultProvider(normalizedId);

    if (base) {
      const settings = await readSettingsFile();
      const entry = settings?.providers.find(e => e.id === normalizedId);
      return mergeProvider(base, entry);
    }

    // 自定义服务商
    const settings = await readSettingsFile();
    const entry = settings?.providers.find(e => e.id === normalizedId && e.isCustom);
    return entry ? entryToCustomProvider(entry) : null;
  },

  async createOrUpdateCustomProvider(payload: AICustomProvider): Promise<AIProvider | null> {
    await ensureMigrated();

    const normalized = normalizeCustomProviderPayload(payload);
    const { id } = normalized;

    if (!id || !normalized.name || !isProviderRequestFormat(normalized.type) || getDefaultProvider(id)) {
      return null;
    }

    const result = await enqueueWrite(current => {
      const existing = current.providers.find(e => e.id === id && e.isCustom);
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
        isCustom: true,
      };
      return { ...current, providers: upsertEntry(current.providers, entry) };
    });

    const entry = result.providers.find(e => e.id === id);
    return entry ? entryToCustomProvider(entry) : null;
  },

  async updateProvider(id: string, patch: StoredProviderSettings): Promise<AIProvider | null> {
    await ensureMigrated();

    const normalizedId = sanitizeProviderId(id);
    const base = getDefaultProvider(normalizedId);

    if (base) {
      // 内置服务商：更新覆盖设置
      const result = await enqueueWrite(current => {
        const existing = current.providers.find(e => e.id === normalizedId);
        const sanitized = sanitizeProviderSettings(patch);
        const entry: StoredProviderEntry = {
          ...existing,
          id: normalizedId,
          ...sanitized,
        };
        return { ...current, providers: upsertEntry(current.providers, entry) };
      });

      const entry = result.providers.find(e => e.id === normalizedId);
      return entry ? mergeProvider(base, entry) : null;
    }

    // 自定义服务商
    const result = await enqueueWrite(current => {
      const existing = current.providers.find(e => e.id === normalizedId && e.isCustom);
      if (!existing) return current;

      const sanitized = sanitizeProviderSettings(patch);
      const updated: StoredProviderEntry = {
        ...existing,
        ...sanitized,
        models: sanitized.models ?? existing.models,
      };
      const next = [...current.providers];
      const index = next.findIndex(e => e.id === normalizedId);
      next[index] = updated;
      return { ...current, providers: next };
    });

    const entry = result.providers.find(e => e.id === normalizedId);
    return entry && entry.isCustom ? entryToCustomProvider(entry) : null;
  },

  async toggleProvider(id: string, enabled: boolean): Promise<AIProvider | null> {
    return this.updateProvider(id, { isEnabled: enabled });
  },

  async saveProviderConfig(id: string, config: Pick<StoredProviderSettings, 'apiKey' | 'baseUrl'>): Promise<AIProvider | null> {
    return this.updateProvider(id, config);
  },

  async saveProviderModels(id: string, models: AIProviderModel[]): Promise<AIProvider | null> {
    return this.updateProvider(id, { models: cloneModels(models) });
  },

  async deleteCustomProvider(id: string): Promise<boolean> {
    await ensureMigrated();

    const normalizedId = sanitizeProviderId(id);

    const result = await enqueueWrite(current => {
      const existing = current.providers.find(e => e.id === normalizedId && e.isCustom);
      if (!existing) return current;

      return { ...current, providers: current.providers.filter(e => e.id !== normalizedId) };
    });

    return !result.providers.some(e => e.id === normalizedId && e.isCustom);
  },

  async reorderProviders(orderedIds: string[]): Promise<AIProvider[]> {
    await ensureMigrated();

    await enqueueWrite(current => {
      return { ...current, providers: reorderEntries(current.providers, orderedIds) };
    });

    return this.listProviders();
  },
};
```

- [ ] **Step 2: 验证类型检查通过**

Run: `pnpm exec tsc --noEmit`
Expected: 无新增错误

- [ ] **Step 3: Commit**

```bash
git add src/shared/storage/providers/json.ts
git commit -m "feat: add json.ts provider storage with SQLite migration, concurrency guard, and backup recovery"
```

---

### Task 3: 切换导出从 sqlite 到 json

**Files:**
- Modify: `src/shared/storage/providers/index.ts`

- [ ] **Step 1: 修改 index.ts，将 providerStorage 导出源从 sqlite 切换到 json**

将 `index.ts` 内容改为：

```typescript
export { DEFAULT_PROVIDERS } from './defaults';
export { providerStorage } from './json';

export type { SettingsState, StoredProviderSettings, StoredProviderEntry, SettingsFileContent } from './types';
```

- [ ] **Step 2: 验证类型检查通过**

Run: `pnpm exec tsc --noEmit`
Expected: 无新增错误

- [ ] **Step 3: 验证 ESLint 通过**

Run: `pnpm lint`
Expected: 无新增错误

- [ ] **Step 4: Commit**

```bash
git add src/shared/storage/providers/index.ts
git commit -m "feat: switch provider storage export from sqlite to json"
```

---

### Task 4: 在 Provider Store 中新增 reorderProviders action

**Files:**
- Modify: `src/stores/ai/provider.ts`

- [ ] **Step 1: 在 useProviderStore 的 actions 中新增 reorderProviders 方法**

在 `deleteCustomProvider` action 之后添加：

```typescript
    /**
     * 重新排序服务商列表
     * @param orderedIds 排序后的服务商 ID 数组
     */
    async reorderProviders(orderedIds: string[]): Promise<AIProvider[]> {
      await providerStorage.reorderProviders(orderedIds);
      await this.loadProviders();
      return this.providers;
    },
```

- [ ] **Step 2: 验证类型检查通过**

Run: `pnpm exec tsc --noEmit`
Expected: 无新增错误

- [ ] **Step 3: Commit**

```bash
git add src/stores/ai/provider.ts
git commit -m "feat: add reorderProviders action to provider store"
```

---

### Task 5: 端到端验证

**Files:**
- 无新增文件

- [ ] **Step 1: 运行 TypeScript 类型检查**

Run: `pnpm exec tsc --noEmit`
Expected: 无错误

- [ ] **Step 2: 运行 ESLint 检查**

Run: `pnpm lint`
Expected: 无新增错误

- [ ] **Step 3: 运行 Stylelint 检查**

Run: `pnpm lint:style`
Expected: 无新增错误

- [ ] **Step 4: 启动应用验证**

Run: `pnpm dev`
Expected: 应用正常启动，设置页服务商列表正常显示

- [ ] **Step 5: 功能验证清单**

手动验证以下场景：
1. 服务商列表正常加载（首次启动触发 SQLite → JSON 迁移）
2. 切换服务商启用/禁用状态
3. 编辑服务商 apiKey / baseUrl
4. 编辑服务商模型列表
5. 创建自定义服务商
6. 删除自定义服务商
7. 检查 `~/.tibis/settings.json` 文件内容是否正确
8. 检查 `~/.tibis/.providers-migrated` 标记文件是否存在
9. 重启应用，确认不再重复迁移

- [ ] **Step 6: Commit**

```bash
git commit --allow-empty -m "chore: verify provider settings JSON migration end-to-end"
```

---

### Task 6: 记录 Changelog

**Files:**
- Create: `changelog/2026-05-26.md`（如不存在）

- [ ] **Step 1: 检查并创建 changelog 文件**

如果 `changelog/2026-05-26.md` 不存在，创建并写入：

```markdown
# 2026-05-26

## Changed
- Provider 设置持久化从 SQLite 迁移到 ~/.tibis/settings.json，支持用户直接编辑和版本控制
- providers 使用数组结构，支持排序（新增 reorderProviders API）
- models 字段采用增量合并策略，应用升级新增 model 不再被用户覆盖的 models 遮蔽

## Features
- 新增 provider 拖拽排序能力（reorderProviders）
- 新增文件损坏自动恢复（从 .bak 备份恢复）
- 新增并发写入保护（异步队列串行化）
```

如果已存在，在对应分类下追加条目。

- [ ] **Step 2: Commit**

```bash
git add changelog/2026-05-26.md
git commit -m "chore: add changelog for provider settings JSON migration"
```
