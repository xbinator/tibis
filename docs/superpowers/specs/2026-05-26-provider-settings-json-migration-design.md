# Provider Settings JSON Migration Design

## Background

Tibis 当前的 AI 服务商配置持久化在 SQLite 数据库中（`provider_settings` + `custom_providers` 两张表），通过 `src/shared/storage/providers/sqlite.ts` 中的 `providerStorage` 对外提供服务。

项目已引入 `~/.tibis` 工作区目录（`electron/main/modules/workspace/root.mts`），作为应用级的本地工作空间。将 provider 配置从 SQLite 迁移到 `~/.tibis/settings.json` 有以下好处：

- **用户可见、可编辑**：JSON 文件可被用户直接查看和修改，也可纳入版本控制
- **可移植**：JSON 文件可随工作区目录复制、同步、备份
- **排序支持**：数组结构天然支持拖拽排序
- **架构简化**：减少对 SQLite 的依赖，provider 配置不再需要数据库

## Goals

- 将 provider 全部设置（isEnabled / apiKey / baseUrl / models）从 SQLite 迁移到 `~/.tibis/settings.json`
- 内置服务商和自定义服务商统一存储在 JSON 文件中
- apiKey 明文存储在 JSON 文件中
- providers 使用数组结构，支持排序
- 复用现有 native 层文件读写能力，不新增 IPC handler
- 现有方法签名不变，新增 `reorderProviders`；消费方（`useProviderStore` 等）无需改动
- 提供 SQLite → JSON 一次性迁移，所有 public 方法入口均确保迁移完成后再操作

## Non-Goals

- 不加密 apiKey（用户已确认明文存储）
- 不删除 SQLite 中的旧表（保留安全回退）
- 不迁移 service-models / tool-settings 到 JSON（本次仅迁移 provider）
- 不实现多工作区配置切换
- 不新增 IPC handler

## 文件位置

```
~/.tibis/settings.json
```

路径通过 `native.getTibisWorkspaceRoot()` 获取根目录后，使用 `path.join(rootPath, 'settings.json')` 拼接（确保跨平台路径分隔符正确）。

## JSON Schema

```json
{
  "version": 1,
  "providers": [
    {
      "id": "openai",
      "isEnabled": true,
      "apiKey": "sk-xxx",
      "baseUrl": "https://api.openai.com/v1",
      "models": [
        {
          "id": "gpt-5.5",
          "name": "GPT-5.5",
          "type": "reasoning",
          "isEnabled": true,
          "contextWindow": 400000,
          "supportsTools": true,
          "supportsVision": true,
          "supportsDeepThought": true,
          "supportsWebSearch": true,
          "supportsImageGeneration": false,
          "supportsVideoRecognition": true
        }
      ]
    },
    {
      "id": "my-custom-provider",
      "name": "我的服务商",
      "description": "自定义 OpenAI 兼容服务",
      "type": "openai",
      "logo": "https://example.com/logo.png",
      "isEnabled": true,
      "apiKey": "sk-yyy",
      "baseUrl": "https://my-api.example.com/v1",
      "models": [],
      "isCustom": true
    }
  ]
}
```

### 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `version` | `number` | Schema 版本号，当前为 `1`，用于未来迁移 |
| `providers` | `StoredProviderEntry[]` | 服务商配置数组，数组顺序即展示顺序 |

### StoredProviderEntry 类型

```typescript
/** settings.json 中的单个 provider 条目 */
interface StoredProviderEntry {
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

  // 以下字段仅自定义服务商有
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

/** settings.json 文件内容 */
interface SettingsFileContent {
  /** Schema 版本号 */
  version: number;
  /** 服务商配置列表（数组顺序即展示顺序） */
  providers: StoredProviderEntry[];
}
```

### ID 规范化策略

所有 provider ID 在写入时统一 `trim().toLowerCase()` 处理。用户手动编辑 JSON 时如果写入了大小写混合的 ID（如 `"OpenAI"`），读取时会被规范化为 `"openai"`，与 `DEFAULT_PROVIDERS` 中的 ID 匹配。

### 内置 vs 自定义的区分

| 维度 | 内置服务商 | 自定义服务商 |
|------|-----------|-------------|
| `isCustom` | 不存在或 `false` | `true` |
| `name/description/type/logo` | 不存储（来自 `DEFAULT_PROVIDERS`） | 必须存储 |
| 存储内容 | 仅存用户覆盖的字段 | 全量存储 |
| 读取时合并 | 与 `DEFAULT_PROVIDERS` 合并 | 直接使用 |

## 数据流

```
渲染进程 providerStorage (json.ts)
  │
  ├─ native.getTibisWorkspaceRoot()   → 获取 ~/.tibis 路径
  ├─ native.getPathStatus(path)       → 检查 settings.json 是否存在
  ├─ native.readFile(path)            → 读取 settings.json
  └─ native.writeFile(path, content)  → 写入 settings.json
      │
      └─ IPC (已有的 fs:readFile / fs:writeFile / fs:getPathStatus)
          │
          └─ 主进程文件模块 (electron/main/modules/file/ipc.mts)
              │
              └─ ~/.tibis/settings.json
```

不新增任何 IPC handler，完全复用现有 native 层的 `readFile` / `writeFile` / `getPathStatus` / `getTibisWorkspaceRoot` 四个能力。

## 核心模块

### 新建 `src/shared/storage/providers/json.ts`

替代 `sqlite.ts`，实现相同的 `providerStorage` 接口。

#### 迁移守卫

所有 public 方法入口先确保迁移完成，防止首次调用非 `listProviders()` 时跳过迁移导致数据丢失：

```typescript
/** 迁移状态：null=未检查，true=已完成，false=进行中 */
let migrationStatus: boolean | null = null;

/**
 * 确保迁移已完成再执行任何操作
 * 使用模块级变量避免重复迁移，所有 public 方法入口必须调用
 */
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
```

每个 public 方法入口统一调用：

```typescript
async listProviders(): Promise<AIProvider[]> {
  await ensureMigrated();
  // ...
},

async getProvider(id: string): Promise<AIProvider | null> {
  await ensureMigrated();
  // ...
},

async updateProvider(id: string, patch: StoredProviderSettings): Promise<AIProvider | null> {
  await ensureMigrated();
  // ...
},
// ... 其余所有 public 方法同理
```

#### 文件读写

```typescript
const SETTINGS_FILE = 'settings.json';

/**
 * 获取 settings.json 的完整路径
 * 使用 path.join 确保跨平台路径分隔符正确
 */
async function getSettingsPath(): Promise<string | null> {
  const root = await native.getTibisWorkspaceRoot();
  return root ? path.join(root.rootPath, SETTINGS_FILE) : null;
}

/**
 * 从备份文件恢复
 * 当 settings.json 不存在或内容损坏时，尝试从 .bak 恢复
 */
async function recoverFromBackup(filePath: string): Promise<SettingsFileContent | null> {
  const bakPath = `${filePath}.bak`;
  const bakStatus = await native.getPathStatus(bakPath);
  if (!bakStatus.exists) return null;

  try {
    const { content } = await native.readFile(bakPath);
    const parsed = JSON.parse(content);
    const normalized = normalizeSettingsFile(parsed);
    // 恢复成功，写回 settings.json
    await native.writeFile(filePath, JSON.stringify(normalized, null, 2));
    return normalized;
  } catch {
    return null;
  }
}

/**
 * 读取 settings.json
 * 文件不存在返回 null；内容损坏时自动从 .bak 恢复
 */
async function readSettingsFile(): Promise<SettingsFileContent | null> {
  const filePath = await getSettingsPath();
  if (!filePath) return null;

  const status = await native.getPathStatus(filePath);
  if (!status.exists) {
    // 文件不存在，尝试从备份恢复
    return recoverFromBackup(filePath);
  }

  const { content } = await native.readFile(filePath);
  try {
    return normalizeSettingsFile(JSON.parse(content));
  } catch {
    // 文件存在但内容损坏，尝试从备份恢复
    return recoverFromBackup(filePath);
  }
}

/**
 * 写入 settings.json（带备份）
 * 写入失败时抛出异常，由调用方决定处理策略
 */
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
```

#### 并发写入保护

JSON 文件没有事务支持，桌面应用中虽然并发概率低，但快速连续操作（如连续切换多个 provider 的 isEnabled）可能导致后写者覆盖先写者的修改。使用异步队列将写操作串行化：

```typescript
/**
 * 写操作串行化队列
 * 确保同一时刻只有一个写操作在执行，避免并发读写导致数据丢失
 */
let writeQueue: Promise<void> = Promise.resolve();

/**
 * 将写操作加入串行化队列
 * 每个写操作：读取最新文件 → 应用修改 → 写入文件
 * 避免两个写操作同时读取旧数据后依次写入导致后者覆盖前者
 */
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
```

所有写操作通过 `enqueueWrite` 执行：

```typescript
async updateProvider(id: string, patch: StoredProviderSettings): Promise<AIProvider | null> {
  await ensureMigrated();

  const result = await enqueueWrite(current => {
    const entries = current.providers;
    const index = entries.findIndex(e => e.id === id);
    if (index < 0) return current;

    const updated = { ...entries[index], ...sanitizeProviderEntry(patch) };
    const next = [...entries];
    next[index] = updated;
    return { ...current, providers: next };
  });

  // ... 返回合并后的 AIProvider
}
```

#### 数组操作工具

```typescript
/** 从数组中按 id 查找 */
function findEntry(entries: StoredProviderEntry[], id: string): StoredProviderEntry | undefined {
  return entries.find(e => e.id === id);
}

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

/** 删除条目 */
function removeEntry(entries: StoredProviderEntry[], id: string): StoredProviderEntry[] {
  return entries.filter(e => e.id !== id);
}

/**
 * 按 ID 列表重排序
 * 不在 orderedIds 中的条目追加到末尾，避免静默丢弃
 */
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

  // 追加未参与排序的条目到末尾
  for (const entry of entries) {
    if (!seen.has(entry.id)) {
      ordered.push(entry);
    }
  }

  return ordered;
}
```

#### 合并逻辑

内置服务商的"默认值 + 用户覆盖"合并策略：

```typescript
/**
 * 合并内置服务商的默认配置与用户覆盖设置
 * models 字段采用增量合并：以 model.id 为 key，base 中有但 override 中没有的 model 自动追加
 */
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
    // omitBy 可能删除了 models（如果 overrides.models 为 undefined），显式设置
    models: mergedModels,
  };
}
```

**model 级别增量合并说明**：

当用户曾编辑过内置服务商的模型列表时，`overrides.models` 存储的是编辑时的完整模型列表。应用升级后 `DEFAULT_PROVIDERS` 中新增了 model，增量合并策略确保：

1. 用户修改过的 model（id 在 overrides.models 中存在）→ 使用用户的版本
2. 新增的 model（id 只在 base.models 中存在）→ 自动追加到末尾
3. 用户删除的 model（id 在 base.models 中存在但 overrides.models 中不存在）→ 保持删除状态（用户意图）

这样既尊重用户的历史编辑，又不会让升级新增的 model 不可见。

#### entryToCustomProvider 转换

将 `StoredProviderEntry`（isCustom: true）转换为完整的 `AIProvider` 对象：

```typescript
/**
 * 将自定义服务商的 StoredProviderEntry 转换为 AIProvider
 * 补全 AIProvider 所需的默认字段
 */
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
```

#### listProviders 合并顺序

```typescript
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
}
```

### providerStorage 接口

现有方法签名与当前 `sqlite.ts` 完全一致，新增 `reorderProviders`：

```typescript
export const providerStorage = {
  /** 列出所有服务商（内置 + 自定义，按 JSON 数组顺序） */
  async listProviders(): Promise<AIProvider[]>,
  /** 获取单个服务商 */
  async getProvider(id: string): Promise<AIProvider | null>,
  /** 创建或更新自定义服务商 */
  async createOrUpdateCustomProvider(payload: AICustomProvider): Promise<AIProvider | null>,
  /** 更新服务商设置 */
  async updateProvider(id: string, patch: StoredProviderSettings): Promise<AIProvider | null>,
  /** 切换服务商启用状态 */
  async toggleProvider(id: string, enabled: boolean): Promise<AIProvider | null>,
  /** 保存服务商配置（apiKey / baseUrl） */
  async saveProviderConfig(id: string, config: Pick<StoredProviderSettings, 'apiKey' | 'baseUrl'>): Promise<AIProvider | null>,
  /** 保存服务商模型列表 */
  async saveProviderModels(id: string, models: AIProviderModel[]): Promise<AIProvider | null>,
  /** 删除自定义服务商 */
  async deleteCustomProvider(id: string): Promise<boolean>,
  /** 重新排序服务商列表 */
  async reorderProviders(orderedIds: string[]): Promise<AIProvider[]>,
}
```

## SQLite → JSON 迁移

### 触发时机

所有 public 方法入口通过 `ensureMigrated()` 守卫触发，确保无论首次调用哪个方法都会执行迁移。

### 迁移标记

使用 `~/.tibis/.providers-migrated` 标记文件记录迁移完成。这比"settings.json 存在即已迁移"更可靠，避免用户误删 settings.json 后从 stale SQLite 重新迁移（覆盖用户新的配置）。

```typescript
async function isMigrated(): Promise<boolean> {
  const root = await native.getTibisWorkspaceRoot();
  if (!root) return false;
  const markerPath = path.join(root.rootPath, '.providers-migrated');
  const status = await native.getPathStatus(markerPath);
  return status.exists;
}

async function markMigrated(): Promise<void> {
  const root = await native.getTibisWorkspaceRoot();
  if (!root) return;
  const markerPath = path.join(root.rootPath, '.providers-migrated');
  await native.writeFile(markerPath, new Date().toISOString());
}
```

### 迁移流程

```
1. ensureMigrated() 检查迁移标记
   ├─ .providers-migrated 存在 → 跳过迁移
   └─ 不存在 → 继续迁移

2. 检查 settings.json 是否存在
   ├─ 存在 → 用户已有配置（可能是手动创建的），标记迁移完成，不覆盖
   └─ 不存在 → 继续迁移

3. 检查 SQLite 是否可用（isDatabaseAvailable()）
   ├─ 不可用 → 无数据可迁移，创建空 settings.json
   └─ 可用 → 继续迁移

4. 从 SQLite 读取数据
   ├─ provider_settings 表 → 内置服务商覆盖设置
   └─ custom_providers 表 → 自定义服务商

5. 转换为 StoredProviderEntry[] 格式

6. 写入 settings.json（version: 1）

7. 创建 .providers-migrated 标记文件

8. SQLite 表保留不删（安全回退）
```

### 迁移映射

| SQLite 表 | 字段映射 | JSON 位置 |
|-----------|---------|----------|
| `provider_settings` | id → id, is_enabled → isEnabled, api_key → apiKey, base_url → baseUrl, models_json → models | `providers[]` 中的内置条目 |
| `custom_providers` | 全字段映射 | `providers[]` 中的自定义条目（isCustom: true） |

### 迁移顺序

迁移后的 providers 数组顺序：先内置服务商（按 `DEFAULT_PROVIDERS` 原始顺序），再自定义服务商。

## 写入安全

由于 `native.writeFile()` 是通用文件写入，没有原子写入保护，在渲染进程存储层实现以下安全措施：

1. **写入前备份**：写入前将当前内容保存到 `settings.json.bak`
2. **文件损坏自动恢复**：读取时如果 JSON.parse 失败，自动从 `.bak` 恢复
3. **文件丢失自动恢复**：如果 `settings.json` 不存在但 `.bak` 存在，从备份恢复
4. **写入失败抛异常**：`writeSettingsFile` 失败时抛出异常，由调用方决定处理策略（如提示用户重试）
5. **写操作串行化**：通过 `enqueueWrite` 队列确保同一时刻只有一个写操作在执行

```
写入流程（通过 enqueueWrite 串行化）：
  1. 读取当前 settings.json 最新内容
  2. 应用 transformer 生成新数据
  3. 备份当前内容 → settings.json.bak
  4. 序列化新数据为 JSON 字符串
  5. 写入 settings.json
  6. 写入失败 → 抛出异常，.bak 保留

恢复流程（读取时自动触发）：
  1. settings.json 不存在 或 JSON.parse 失败
  2. 检查 settings.json.bak 是否存在
  3. 存在 → 读取 .bak 内容
  4. JSON.parse 校验
  5. 校验通过 → 写回 settings.json（恢复）+ 返回数据
  6. 校验失败 → 返回 null（调用方使用默认值）
```

## Web 平台降级

- `native.getTibisWorkspaceRoot()` 返回 `null`
- `getSettingsPath()` 返回 `null`
- `providerStorage` 所有方法返回空数据 / 默认值
- 与当前 SQLite 不可用时的行为一致

## 数据校验

读取 settings.json 后执行归一化校验，防止用户手动编辑引入非法数据：

```typescript
/**
 * 校验单个 model 的基本结构
 * 过滤掉缺少 id 的非法 model 条目
 */
function sanitizeModel(raw: unknown): AIProviderModel | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  if (!isString(m.id) || !m.id.trim()) return null;
  // 保留原始结构，只确保 id 存在
  return m as unknown as AIProviderModel;
}

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

  // 自定义服务商字段
  if (isString(raw.name)) result.name = raw.name;
  if (isString(raw.description)) result.description = raw.description;
  if (isProviderRequestFormat(raw.type)) result.type = raw.type;
  if (isString(raw.logo)) result.logo = raw.logo;
  if (raw.isCustom === true) result.isCustom = true;

  return result;
}

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
```

## 改动范围

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `src/shared/storage/providers/json.ts` | 新建 | 替代 `sqlite.ts`，实现 `providerStorage` |
| `src/shared/storage/providers/sqlite.ts` | 保留 | 迁移逻辑引用，迁移完成后不再作为主存储 |
| `src/shared/storage/providers/index.ts` | 修改 | 导出从 `sqlite.ts` 切换到 `json.ts` |
| `src/shared/storage/providers/types.ts` | 修改 | 新增 `StoredProviderEntry` / `SettingsFileContent` 类型 |
| `src/shared/storage/providers/defaults.ts` | 不变 | — |
| `src/stores/ai/provider.ts` | 不变 | 接口签名一致，无需改动 |
| `electron/main/modules/workspace/ipc.mts` | 不变 | 复用已有 IPC |
| `electron/main/modules/database/service.mts` | 不变 | SQLite 表保留 |

## 测试覆盖

- settings.json 读取：文件存在 / 不存在 / 内容非法 / 字段缺失
- settings.json 写入：正常写入 / 备份生成 / 恢复 / 写入失败抛异常
- 文件损坏恢复：JSON.parse 失败时从 .bak 恢复 / .bak 也损坏时返回默认值
- 合并逻辑：内置服务商覆盖 / 自定义服务商 / 新增默认服务商追加 / model 级别增量合并
- 迁移：SQLite 有数据 → JSON / SQLite 无数据 → 空 JSON / 已迁移跳过 / settings.json 已存在不覆盖
- 迁移守卫：首次调用 updateProvider 也能触发迁移 / 并发调用 ensureMigrated 不重复迁移
- 数组操作：upsert / remove / reorder（含未参与排序条目保留）/ id 去重
- 并发写入：快速连续调用写操作不丢失数据
- Web 降级：native 不可用时返回默认值
- 数据校验：非法字段过滤 / id 规范化 / 去重 / model 结构校验
