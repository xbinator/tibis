# Stores 工程化重构设计

## 背景

`src/stores/` 目录下 10 个 Pinia Store 存在以下问题：

1. **持久化模式不统一**：`setting.ts`、`editorPreferences.ts`、`tabs.ts` 各自手写 `persistXxx` / `loadXxx` / `normalizeXxx`，逻辑重复
2. **迁移逻辑散落**：`setting.ts` 迁移 `app_theme` / `sidebar_visible`，`editorPreferences.ts` 迁移 `app_settings`，模式相同但各写一套
3. **setting.ts 职责过重**：主题、侧边栏、工具权限、窗口标题、聊天会话 ID 全塞一个 store（347 行）
4. **Store 间耦合**：`editorFileWatch` 直接 `useTabsStore()` 调用 `markMissing` / `clearMissing`，形成隐式依赖
5. **扁平结构无归属**：10 个文件平铺，新增 store 没有明确归属

## 目标

- 按业务领域分组，新增 store 有明确归属
- 提取共享持久化中间层，消除重复的加载/归一化/迁移逻辑
- 拆分 setting.ts 中与 UI 无关的工具权限职责
- 解耦 store 间直接依赖
- 不设 barrel export，消费方直接按领域路径引用

## 目录结构

```
src/stores/
├── helpers/
│   ├── persist.ts              # 通用持久化工具
│   └── types.ts                # 共享类型定义
├── editor/
│   ├── preferences.ts          # 原 editorPreferences.ts
│   ├── fileWatch.ts            # 原 editorFileWatch.ts
│   └── fileSelectionIntent.ts  # 原 fileSelectionIntent.ts
├── chat/
│   ├── session.ts              # 原 chat.ts
│   └── toolPermission.ts       # 从 setting.ts 拆出
├── ai/
│   ├── provider.ts             # 原 provider.ts
│   ├── serviceModel.ts         # 原 serviceModel.ts
│   └── toolSettings.ts         # 原 toolSettings.ts
├── ui/
│   └── setting.ts              # 主题+侧边栏+窗口标题，保持 useSettingStore
└── workspace/
    ├── files.ts                # 原 files.ts
    └── tabs.ts                 # 原 tabs.ts
```

### 分组逻辑

| 领域 | 职责 | 包含 |
|------|------|------|
| `editor/` | 编辑器相关状态 | 视图偏好、文件监听、选区意图 |
| `chat/` | AI 对话相关 | 会话消息、工具权限 |
| `ai/` | AI 服务配置 | 服务商、服务模型、Tavily/MCP |
| `ui/` | 界面交互状态 | 主题、侧边栏、窗口标题（保持 setting 不拆） |
| `workspace/` | 工作区与文件 | 最近文件、标签页 |
| `helpers/` | 跨 store 共享工具 | 持久化、类型 |

## 持久化中间层

### 类型定义

```typescript
// helpers/types.ts

/** 迁移步骤：从旧存储键读取并转换为新格式 */
interface MigrationStep {
  /** 旧存储键名 */
  legacyKey: string;
  /** 从旧值转换为新格式的函数 */
  migrate: (legacyValue: unknown) => Record<string, unknown>;
}

/** 持久化 Store 配置 */
interface PersistConfig<T> {
  /** 存储键名 */
  storageKey: string;
  /** 默认值 */
  defaults: T;
  /** 值归一化函数，确保读取的数据结构合法 */
  normalize: (value: unknown) => T;
  /** 旧版迁移步骤列表，按顺序执行，首个成功即停止 */
  migrations?: MigrationStep[];
}
```

### 核心函数

```typescript
// helpers/persist.ts

/**
 * 加载持久化数据，支持归一化和旧版迁移。
 * 优先从主键读取并归一化；主键不存在时依次尝试迁移步骤。
 */
function loadPersistedState<T>(config: PersistConfig<T>): T {
  const saved = local.getItem<unknown>(config.storageKey);
  if (saved !== null && saved !== undefined) {
    const normalized = config.normalize(saved);
    local.setItem(config.storageKey, normalized);
    return normalized;
  }

  if (config.migrations) {
    for (const step of config.migrations) {
      const legacyValue = local.getItem<unknown>(step.legacyKey);
      if (legacyValue !== null && legacyValue !== undefined) {
        const migrated = config.normalize(step.migrate(legacyValue));
        local.setItem(config.storageKey, migrated);
        local.removeItem(step.legacyKey);
        return migrated;
      }
    }
  }

  return { ...config.defaults };
}

/**
 * 持久化当前状态到 localStorage。
 */
function persistState<T>(storageKey: string, state: T): void {
  local.setItem(storageKey, state);
}
```

### 适用范围

| Store | 是否适用 | 原因 |
|-------|---------|------|
| `ui/setting` | ✅ | localStorage 持久化 |
| `editor/preferences` | ✅ | localStorage 持久化 |
| `workspace/tabs` | ✅ | localStorage 持久化 |
| `chat/toolPermission` | ✅ | localStorage 持久化 |
| `chat/session` | ❌ | SQLite 持久化 |
| `workspace/files` | ❌ | SQLite 持久化 |
| `ai/provider` | ❌ | SQLite 持久化 |
| `ai/serviceModel` | ❌ | SQLite 持久化 |
| `ai/toolSettings` | ❌ | SQLite 持久化 |
| `editor/fileWatch` | ❌ | 纯运行时状态 |
| `editor/fileSelectionIntent` | ❌ | 纯运行时状态 |

## setting.ts 拆分

### 拆出工具权限到 chat/toolPermission.ts

从 `setting.ts` 移出的字段和 actions：

**字段**：
- `toolPermissionMode: ToolPermissionMode`
- `alwaysToolPermissionGrants: Record<string, true>`
- `sessionToolPermissionGrants: Record<string, true>`（运行时，不持久化）

**Actions**：
- `setToolPermissionMode`
- `grantToolPermission`
- `revokeToolPermission`
- `clearToolPermissionGrants`
- `clearSessionToolPermissionGrants`

新 store 名称：`useToolPermissionStore`，持久化键：`tool_permission`。

**迁移**：`app_settings` 中的 `toolPermissionMode` 和 `alwaysToolPermissionGrants` 通过迁移步骤迁移到新键 `tool_permission`。

### setting.ts 瘦身后保留的字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `theme` | `ThemeMode` | 主题 |
| `sidebarVisible` | `boolean` | 侧边栏可见性 |
| `sidebarWidth` | `number` | 侧边栏宽度 |
| `providerSidebarCollapsed` | `boolean` | 服务商侧边栏折叠 |
| `settingsSidebarCollapsed` | `boolean` | 设置侧边栏折叠 |
| `chatSidebarActiveSessionId` | `string \| null` | 当前聊天会话 |
| `title` | `string` | 窗口标题（运行时，不持久化） |

预计从 347 行缩减到 ~180 行。

## Store 间解耦

### 当前耦合

`editorFileWatch.ts` 直接 `useTabsStore()` 调用 `markMissing` / `clearMissing`。

### 解耦方案

通过项目已有的事件总线 `emitter.ts` 解耦：

```typescript
// editor/fileWatch.ts
import { emitter } from '@/utils/emitter';

handleFileChanged(event: FileChangeEvent): void {
  if (event.type === 'unlink') {
    emitter.emit('file:missing', { filePath: event.filePath });
  } else if (event.type === 'add') {
    emitter.emit('file:recovered', { filePath: event.filePath });
  }
}
```

```typescript
// workspace/tabs.ts 订阅
emitter.on('file:missing', ({ filePath }) => { ... });
emitter.on('file:recovered', ({ filePath }) => { ... });
```

`fileWatch` 不再依赖 `tabs`，两个 store 可独立初始化。

## 消费方迁移

### 路径映射

| 旧路径 | 新路径 | Store 名变化 |
|--------|--------|-------------|
| `@/stores/chat` | `@/stores/chat/session` | `useChatStore` → `useChatSessionStore` |
| `@/stores/editorPreferences` | `@/stores/editor/preferences` | 不变 |
| `@/stores/editorFileWatch` | `@/stores/editor/fileWatch` | 不变 |
| `@/stores/fileSelectionIntent` | `@/stores/editor/fileSelectionIntent` | 不变 |
| `@/stores/files` | `@/stores/workspace/files` | 不变 |
| `@/stores/provider` | `@/stores/ai/provider` | 不变 |
| `@/stores/serviceModel` | `@/stores/ai/serviceModel` | 不变 |
| `@/stores/toolSettings` | `@/stores/ai/toolSettings` | 不变 |
| `@/stores/tabs` | `@/stores/workspace/tabs` | 不变 |
| `@/stores/setting`（主题/侧边栏/窗口） | `@/stores/ui/setting` | 不变 |
| `@/stores/setting`（工具权限部分） | `@/stores/chat/toolPermission` | `useSettingStore` → `useToolPermissionStore` |

### 类型导出迁移

| 旧路径 | 新路径 |
|--------|--------|
| `type { EditorViewMode, EditorPageWidth } from '@/stores/editorPreferences'` | `from '@/stores/editor/preferences'` |
| `type { ThemeMode } from '@/stores/setting'` | `from '@/stores/ui/setting'` |
| `type { SelectedModel } from '@/stores/serviceModel'` | `from '@/stores/ai/serviceModel'` |
| `type { Tab, TabCloseAction, TabClosePlan, TabMovePosition } from '@/stores/tabs'` | `from '@/stores/workspace/tabs'` |
| `type { ToolPermissionMode } from '@/stores/setting'` | `from '@/stores/chat/toolPermission'` |
| `type { EditorSaveStrategy } from '@/stores/editorPreferences'` | `from '@/stores/editor/preferences'` |

### 执行顺序

1. 创建目录结构和 helpers（纯新增，不影响现有代码）
2. 逐个迁移 store 文件（移动 + 改内部 import），每迁一个跑一次 lint + typecheck
3. 批量更新消费方 import（IDE Find & Replace）
4. 删除旧文件
5. 最终 lint + typecheck + 测试

### 风险控制

- 每迁移一个 store 立即跑 lint + typecheck，确保编译通过
- `useChatStore` → `useChatSessionStore` 通过 IDE Rename Symbol 完成，避免遗漏
- `setting.ts` 拆分工具权限时，先创建 `toolPermission.ts`，再从 `setting.ts` 删除对应字段，最后更新消费方
- 不设旧路径 re-export，直接改消费方引用，保持干净
