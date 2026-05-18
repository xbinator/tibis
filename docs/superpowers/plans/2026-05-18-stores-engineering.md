# Stores 工程化重构实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `src/stores/` 从扁平结构重构为按领域分组的目录结构，提取共享持久化中间层，拆分 setting.ts 中的工具权限职责，解耦 store 间直接依赖。

**Architecture:** 按业务领域（editor/chat/ai/ui/workspace）分组 store 文件；提取 `helpers/persist.ts` 统一 localStorage 持久化模式（加载/归一化/迁移）；从 setting.ts 拆出 toolPermission 到 chat/ 目录；通过事件总线解耦 editorFileWatch 与 tabs 的直接依赖。

**Tech Stack:** Pinia 3, Vue 3, TypeScript, localStorage (BaseStorage), mitt (emitter)

---

## 文件结构

### 新增文件

| 文件 | 职责 |
|------|------|
| `src/stores/helpers/types.ts` | 持久化相关共享类型（MigrationStep, PersistConfig） |
| `src/stores/helpers/persist.ts` | 通用持久化工具函数（loadPersistedState, persistState） |
| `src/stores/chat/toolPermission.ts` | 工具权限 store（从 setting 拆出） |

### 移动文件

| 旧路径 | 新路径 |
|--------|--------|
| `src/stores/editorPreferences.ts` | `src/stores/editor/preferences.ts` |
| `src/stores/editorFileWatch.ts` | `src/stores/editor/fileWatch.ts` |
| `src/stores/fileSelectionIntent.ts` | `src/stores/editor/fileSelectionIntent.ts` |
| `src/stores/chat.ts` | `src/stores/chat/session.ts` |
| `src/stores/provider.ts` | `src/stores/ai/provider.ts` |
| `src/stores/serviceModel.ts` | `src/stores/ai/serviceModel.ts` |
| `src/stores/toolSettings.ts` | `src/stores/ai/toolSettings.ts` |
| `src/stores/setting.ts` | `src/stores/ui/setting.ts` |
| `src/stores/files.ts` | `src/stores/workspace/files.ts` |
| `src/stores/tabs.ts` | `src/stores/workspace/tabs.ts` |

### 修改文件（消费方 import 更新）

- `src/` 下约 30+ 文件的 import 路径
- `test/` 下约 9 个测试文件的 import 路径
- `src/ai/tools/permission.ts`：从 `useSettingStore` 改为 `useToolPermissionStore`
- `src/components/BChatSidebar/index.vue`：工具权限相关改为 `useToolPermissionStore`

---

### Task 1: 创建 helpers 目录和类型定义

**Files:**
- Create: `src/stores/helpers/types.ts`

- [ ] **Step 1: 创建 helpers/types.ts**

```typescript
/**
 * @file types.ts
 * @description stores 共享类型定义，主要用于持久化中间层。
 */

/** 迁移步骤：从旧存储键读取并转换为新格式 */
export interface MigrationStep {
  /** 旧存储键名 */
  legacyKey: string;
  /** 从旧值转换为新格式的函数 */
  migrate: (legacyValue: unknown) => Record<string, unknown>;
}

/** 持久化 Store 配置 */
export interface PersistConfig<T> {
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

- [ ] **Step 2: 运行 lint + typecheck 确认无错误**

Run: `pnpm run lint --fix && pnpm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/stores/helpers/types.ts
git commit -m "refactor(stores): add shared persist types"
```

---

### Task 2: 创建持久化中间层

**Files:**
- Create: `src/stores/helpers/persist.ts`

- [ ] **Step 1: 创建 helpers/persist.ts**

```typescript
/**
 * @file persist.ts
 * @description 通用 localStorage 持久化工具，统一加载/归一化/迁移/写入模式。
 */
import type { PersistConfig } from './types';
import { local } from '@/shared/storage/base';

/**
 * 加载持久化数据，支持归一化和旧版迁移。
 * 优先从主键读取并归一化；主键不存在时依次尝试迁移步骤。
 * @param config - 持久化配置
 * @returns 加载并归一化后的状态
 */
export function loadPersistedState<T>(config: PersistConfig<T>): T {
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
 * @param storageKey - 存储键名
 * @param state - 待持久化的状态
 */
export function persistState<T>(storageKey: string, state: T): void {
  local.setItem(storageKey, state);
}
```

- [ ] **Step 2: 运行 lint + typecheck 确认无错误**

Run: `pnpm run lint --fix && pnpm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/stores/helpers/persist.ts
git commit -m "refactor(stores): add shared persist helpers"
```

---

### Task 3: 创建目录结构并迁移 editor 组

**Files:**
- Move: `src/stores/editorPreferences.ts` → `src/stores/editor/preferences.ts`
- Move: `src/stores/editorFileWatch.ts` → `src/stores/editor/fileWatch.ts`
- Move: `src/stores/fileSelectionIntent.ts` → `src/stores/editor/fileSelectionIntent.ts`

迁移原则：文件内容不变，仅移动位置。内部 import 路径如需调整则同步修改。

- [ ] **Step 1: 创建 editor 目录并移动文件**

```bash
mkdir -p src/stores/editor
git mv src/stores/editorPreferences.ts src/stores/editor/preferences.ts
git mv src/stores/editorFileWatch.ts src/stores/editor/fileWatch.ts
git mv src/stores/fileSelectionIntent.ts src/stores/editor/fileSelectionIntent.ts
```

- [ ] **Step 2: 更新 editor/fileWatch.ts 内部 import**

文件中 `import { useTabsStore } from '@/stores/tabs'` 暂时保留（Task 9 会处理解耦）。

无需修改内部 import。

- [ ] **Step 3: 批量更新消费方 import 路径**

需要更新的文件（从 grep 结果汇总）：

| 文件 | 旧 import | 新 import |
|------|-----------|-----------|
| `src/components/BMarkdown/index.vue` | `@/stores/editorPreferences` | `@/stores/editor/preferences` |
| `src/ai/tools/builtin/SettingsTool/index.ts` | `@/stores/editorPreferences` | `@/stores/editor/preferences` |
| `src/ai/tools/builtin/SettingsTool/index.ts` | `@/stores/setting` | 暂保留（Task 6 迁移） |
| `src/hooks/useMenuAction.ts` | `@/stores/editorPreferences` | `@/stores/editor/preferences` |
| `src/views/settings/editor/index.vue` | `@/stores/editorPreferences` | `@/stores/editor/preferences` |
| `src/layouts/default/hooks/useViewActive.ts` | `@/stores/editorPreferences` | `@/stores/editor/preferences` |
| `src/views/editor/hooks/useSession.ts` | `@/stores/editorFileWatch` | `@/stores/editor/fileWatch` |
| `src/views/editor/hooks/useSession.ts` | `@/stores/editorPreferences` | `@/stores/editor/preferences` |
| `src/views/editor/hooks/useFileSelection.ts` | `@/stores/fileSelectionIntent` | `@/stores/editor/fileSelectionIntent` |
| `src/views/editor/index.vue` | `@/stores/editorPreferences` | `@/stores/editor/preferences` |
| `src/views/editor/hooks/useSavePolicy.ts` | `@/stores/editorPreferences` | `@/stores/editor/preferences` |
| `src/hooks/useNavigate.ts` | `@/stores/fileSelectionIntent` | `@/stores/editor/fileSelectionIntent` |
| `test/components/BMarkdown/index.page-width.test.ts` | `@/stores/editorPreferences` | `@/stores/editor/preferences` |
| `test/views/editor/useFileSelection.test.ts` | `@/stores/fileSelectionIntent` | `@/stores/editor/fileSelectionIntent` |
| `test/views/settings/editor/index.test.ts` | `@/stores/editorPreferences` | `@/stores/editor/preferences` |
| `test/stores/editorPreferences.test.ts` | `@/stores/editorPreferences` | `@/stores/editor/preferences` |
| `test/stores/editorFileWatch.test.ts` | `@/stores/editorFileWatch` | `@/stores/editor/fileWatch` |

对每个文件执行 SearchReplace，将旧路径替换为新路径。

- [ ] **Step 4: 运行 lint + typecheck 确认无错误**

Run: `pnpm run lint --fix && pnpm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(stores): migrate editor group to editor/ directory"
```

---

### Task 4: 迁移 chat 组

**Files:**
- Move: `src/stores/chat.ts` → `src/stores/chat/session.ts`

注意：store 名称从 `useChatStore` 改为 `useChatSessionStore`。

- [ ] **Step 1: 创建 chat 目录并移动文件**

```bash
mkdir -p src/stores/chat
git mv src/stores/chat.ts src/stores/chat/session.ts
```

- [ ] **Step 2: 修改 chat/session.ts 中的 store 名称**

将 `export const useChatStore = defineStore('chat', {` 改为 `export const useChatSessionStore = defineStore('chatSession', {`。

注意：Pinia 的 `defineStore` 第一个参数是 store ID，改名后 devtools 中显示名会变，但功能不受影响。如果希望保持 devtools 显示名不变，可以保留 `'chat'` 作为 ID，只改导出的 composable 名称。这里选择保留 ID 为 `'chat'`：

```typescript
export const useChatSessionStore = defineStore('chat', {
```

- [ ] **Step 3: 批量更新消费方 import 和引用**

| 文件 | 变更 |
|------|------|
| `src/components/BChatSidebar/index.vue` | `import { useChatStore } from '@/stores/chat'` → `import { useChatSessionStore } from '@/stores/chat/session'`，所有 `useChatStore()` → `useChatSessionStore()` |
| `src/components/BChatSidebar/components/SessionHistory.vue` | 同上 |
| `src/components/BChatSidebar/hooks/useSession.ts` | 同上 |
| `src/components/BChatSidebar/hooks/useAutoName.ts` | 同上 |
| `src/components/BChatSidebar/hooks/useUsagePanel.ts` | 同上 |
| `src/components/BChatSidebar/hooks/useChatHistory.ts` | 同上 |
| `test/stores/chat.test.ts` | 同上 |
| `test/stores/chat.compression-message.test.ts` | 同上 |

对每个文件：
1. 替换 import 路径 `@/stores/chat` → `@/stores/chat/session`
2. 替换 import 名称 `useChatStore` → `useChatSessionStore`
3. 替换所有调用处 `useChatStore()` → `useChatSessionStore()`

- [ ] **Step 4: 运行 lint + typecheck 确认无错误**

Run: `pnpm run lint --fix && pnpm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(stores): migrate chat store to chat/session, rename to useChatSessionStore"
```

---

### Task 5: 迁移 ai 组

**Files:**
- Move: `src/stores/provider.ts` → `src/stores/ai/provider.ts`
- Move: `src/stores/serviceModel.ts` → `src/stores/ai/serviceModel.ts`
- Move: `src/stores/toolSettings.ts` → `src/stores/ai/toolSettings.ts`

- [ ] **Step 1: 创建 ai 目录并移动文件**

```bash
mkdir -p src/stores/ai
git mv src/stores/provider.ts src/stores/ai/provider.ts
git mv src/stores/serviceModel.ts src/stores/ai/serviceModel.ts
git mv src/stores/toolSettings.ts src/stores/ai/toolSettings.ts
```

- [ ] **Step 2: 批量更新消费方 import 路径**

| 旧路径 | 新路径 |
|--------|--------|
| `@/stores/provider` | `@/stores/ai/provider` |
| `@/stores/serviceModel` | `@/stores/ai/serviceModel` |
| `@/stores/toolSettings` | `@/stores/ai/toolSettings` |

需要更新的消费方文件：

**provider:**
- `src/components/BChatSidebar/hooks/useModelSelection.ts`
- `src/components/BModelSelect/index.vue`
- `src/views/settings/provider/layout.vue`
- `src/views/settings/provider/index.vue`
- `src/views/settings/provider/detail.vue`
- `src/views/settings/provider/components/ProviderModal.vue`
- `src/views/settings/provider/components/ModelModal.vue`
- `src/views/settings/provider/components/ModelList.vue`
- `src/views/settings/service-model/components/ServiceConfig.vue`
- `src/components/BChatSidebar/components/InputToolbar/ModelSelector.vue`

**serviceModel:**
- `src/components/BMarkdown/components/SelectionAIInput.vue`
- `src/components/BMarkdown/components/SelectionToolbar.vue`
- `src/components/BChatSidebar/hooks/useChatStream.ts`
- `src/components/BChatSidebar/components/InputToolbar.vue`
- `src/components/BModelSelect/types.ts`
- `test/components/BModelSelect/index.test.ts`

**toolSettings:**
- `src/ai/tools/builtin/MCPSettingsTool/index.ts`
- `src/components/BChatSidebar/hooks/useChatStream.ts`
- `src/views/settings/tools/mcp/index.vue`
- `src/views/settings/tools/search/index.vue`
- `test/views/settings/tools-mcp/index.test.ts`
- `test/views/settings/tools-search/index.test.ts`
- `test/ai/tools/builtin-mcp-settings.test.ts`
- `test/stores/toolSettings.test.ts`

- [ ] **Step 3: 运行 lint + typecheck 确认无错误**

Run: `pnpm run lint --fix && pnpm run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(stores): migrate ai group (provider, serviceModel, toolSettings) to ai/ directory"
```

---

### Task 6: 迁移 ui 组（setting）

**Files:**
- Move: `src/stores/setting.ts` → `src/stores/ui/setting.ts`

- [ ] **Step 1: 创建 ui 目录并移动文件**

```bash
mkdir -p src/stores/ui
git mv src/stores/setting.ts src/stores/ui/setting.ts
```

- [ ] **Step 2: 批量更新消费方 import 路径**

| 旧路径 | 新路径 |
|--------|--------|
| `@/stores/setting` | `@/stores/ui/setting` |

需要更新的消费方文件：

- `src/components/BEditor/components/PaneMonacoEditor.vue`
- `src/ai/tools/builtin/SettingsTool/index.ts`
- `src/hooks/useMenuAction.ts`
- `src/layouts/default/hooks/useViewActive.ts`
- `src/components/BChatSidebar/hooks/useFileReference.ts`
- `src/components/BChatSidebar/index.vue`
- `src/views/settings/index.vue`
- `src/layouts/default/index.vue`
- `src/components/BModelIcon/index.vue`
- `src/views/settings/provider/layout.vue`
- `src/components/BChatSidebar/hooks/useSession.ts`
- `src/router/index.ts`
- `src/hooks/useAntdTheme.ts`
- `src/components/BChatSidebar/hooks/useUsagePanel.ts`
- `src/ai/tools/permission.ts`
- `test/ai/tools/builtin-mcp-settings.test.ts`
- `test/ai/tools/builtin-settings.test.ts`
- `test/ai/tools/permission.test.ts`
- `test/stores/setting.test.ts`

- [ ] **Step 3: 运行 lint + typecheck 确认无错误**

Run: `pnpm run lint --fix && pnpm run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(stores): migrate setting store to ui/setting"
```

---

### Task 7: 迁移 workspace 组

**Files:**
- Move: `src/stores/files.ts` → `src/stores/workspace/files.ts`
- Move: `src/stores/tabs.ts` → `src/stores/workspace/tabs.ts`

- [ ] **Step 1: 创建 workspace 目录并移动文件**

```bash
mkdir -p src/stores/workspace
git mv src/stores/files.ts src/stores/workspace/files.ts
git mv src/stores/tabs.ts src/stores/workspace/tabs.ts
```

- [ ] **Step 2: 更新 workspace/tabs.ts 内部 import**

文件中 `import { resolveRouteCacheName } from '@/router/cache'` 无需修改。

- [ ] **Step 3: 批量更新消费方 import 路径**

| 旧路径 | 新路径 |
|--------|--------|
| `@/stores/files` | `@/stores/workspace/files` |
| `@/stores/tabs` | `@/stores/workspace/tabs` |

**files 消费方：**
- `src/views/editor/hooks/useSession.ts`
- `src/components/BChatSidebar/index.vue`
- `src/components/BSearchRecent/index.vue`
- `src/views/welcome/index.vue`
- `src/views/welcome/components/DropZone.vue`
- `src/hooks/useOpenFile.ts`
- `src/hooks/useOpenDraft.ts`
- `test/stores/files-opened-at-actions.test.ts`

**tabs 消费方：**
- `src/layouts/default/components/HeaderTabs.vue`
- `src/layouts/default/hooks/useTabDragger.ts`
- `src/layouts/default/hooks/useViewActive.ts`
- `src/views/webview/shared/hooks/useWebviewTabTitle.ts`
- `src/hooks/useOpenFile.ts`
- `test/layouts/default/HeaderTabs.test.ts`
- `test/stores/tabs.test.ts`

- [ ] **Step 4: 运行 lint + typecheck 确认无错误**

Run: `pnpm run lint --fix && pnpm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(stores): migrate workspace group (files, tabs) to workspace/ directory"
```

---

### Task 8: 拆分 toolPermission store

**Files:**
- Create: `src/stores/chat/toolPermission.ts`
- Modify: `src/stores/ui/setting.ts` — 删除工具权限相关字段和 actions
- Modify: `src/ai/tools/permission.ts` — 改用 `useToolPermissionStore`
- Modify: `src/components/BChatSidebar/index.vue` — 工具权限改用 `useToolPermissionStore`
- Modify: 消费方中所有引用 setting 工具权限的地方

- [ ] **Step 1: 创建 chat/toolPermission.ts**

```typescript
/**
 * @file toolPermission.ts
 * @description AI 工具权限 Store，管理权限模式与授权记录。
 */
import { defineStore } from 'pinia';
import { loadPersistedState, persistState } from '@/stores/helpers/persist';
import type { PersistConfig } from '@/stores/helpers/types';
import { local } from '@/shared/storage/base';

export type ToolPermissionMode = 'ask' | 'readonly' | 'autoSafe';
export type ToolPermissionGrantScope = 'session' | 'always';

const TOOL_PERMISSION_STORAGE_KEY = 'tool_permission';

interface PersistedToolPermissionState {
  toolPermissionMode: ToolPermissionMode;
  alwaysToolPermissionGrants: Record<string, true>;
}

interface ToolPermissionState extends PersistedToolPermissionState {
  sessionToolPermissionGrants: Record<string, true>;
}

const DEFAULT_TOOL_PERMISSION: PersistedToolPermissionState = {
  toolPermissionMode: 'ask',
  alwaysToolPermissionGrants: {}
};

function isToolPermissionMode(value: unknown): value is ToolPermissionMode {
  return value === 'ask' || value === 'readonly' || value === 'autoSafe';
}

function normalizeToolPermission(value: unknown): PersistedToolPermissionState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...DEFAULT_TOOL_PERMISSION };
  }

  const state = value as Partial<PersistedToolPermissionState>;
  const normalized = { ...DEFAULT_TOOL_PERMISSION };

  if (isToolPermissionMode(state.toolPermissionMode)) {
    normalized.toolPermissionMode = state.toolPermissionMode;
  }

  if (
    state.alwaysToolPermissionGrants &&
    typeof state.alwaysToolPermissionGrants === 'object' &&
    !Array.isArray(state.alwaysToolPermissionGrants)
  ) {
    normalized.alwaysToolPermissionGrants = state.alwaysToolPermissionGrants as Record<string, true>;
  }

  return normalized;
}

const TOOL_PERMISSION_CONFIG: PersistConfig<PersistedToolPermissionState> = {
  storageKey: TOOL_PERMISSION_STORAGE_KEY,
  defaults: DEFAULT_TOOL_PERMISSION,
  normalize: normalizeToolPermission,
  migrations: [
    {
      legacyKey: 'app_settings',
      migrate: (legacyValue: unknown): Record<string, unknown> => {
        const settings = legacyValue as Record<string, unknown>;
        return {
          toolPermissionMode: settings.toolPermissionMode,
          alwaysToolPermissionGrants: settings.alwaysToolPermissionGrants
        };
      }
    }
  ]
};

export const useToolPermissionStore = defineStore('toolPermission', {
  state: (): ToolPermissionState => ({
    ...loadPersistedState(TOOL_PERMISSION_CONFIG),
    sessionToolPermissionGrants: {}
  }),

  actions: {
    /**
     * 持久化当前状态。
     */
    persist(): void {
      persistState(TOOL_PERMISSION_CONFIG.storageKey, {
        toolPermissionMode: this.toolPermissionMode,
        alwaysToolPermissionGrants: this.alwaysToolPermissionGrants
      });
    },

    /**
     * 设置 AI 工具权限模式。
     * @param mode - 工具权限模式
     */
    setToolPermissionMode(mode: ToolPermissionMode): void {
      this.toolPermissionMode = mode;
      this.persist();
    },

    /**
     * 授权指定 AI 工具。
     * @param toolName - 工具名称
     * @param scope - 授权范围
     */
    grantToolPermission(toolName: string, scope: ToolPermissionGrantScope): void {
      if (scope === 'session') {
        this.sessionToolPermissionGrants[toolName] = true;
        return;
      }

      this.alwaysToolPermissionGrants[toolName] = true;
      delete this.sessionToolPermissionGrants[toolName];
      this.persist();
    },

    /**
     * 撤销指定 AI 工具授权。
     * @param toolName - 工具名称
     */
    revokeToolPermission(toolName: string): void {
      delete this.alwaysToolPermissionGrants[toolName];
      delete this.sessionToolPermissionGrants[toolName];
      this.persist();
    },

    /**
     * 清除全部 AI 工具授权。
     */
    clearToolPermissionGrants(): void {
      this.alwaysToolPermissionGrants = {};
      this.sessionToolPermissionGrants = {};
      this.persist();
    },

    /**
     * 清除当前页面生命周期内的 AI 工具授权。
     */
    clearSessionToolPermissionGrants(): void {
      this.sessionToolPermissionGrants = {};
    }
  }
});
```

- [ ] **Step 2: 从 ui/setting.ts 中删除工具权限相关代码**

需要删除的内容：
1. 类型导出：`ToolPermissionMode`、`ToolPermissionGrantScope`
2. `PersistedSettingState` 中的 `toolPermissionMode` 和 `alwaysToolPermissionGrants` 字段
3. `SettingState` 中的 `sessionToolPermissionGrants` 字段
4. `DEFAULT_SETTINGS` 中的 `toolPermissionMode` 和 `alwaysToolPermissionGrants`
5. `isToolPermissionMode` 函数
6. `normalizeSettings` 中工具权限相关归一化逻辑
7. `persistSettings` 中工具权限相关字段
8. actions：`setToolPermissionMode`、`grantToolPermission`、`revokeToolPermission`、`clearToolPermissionGrants`、`clearSessionToolPermissionGrants`

- [ ] **Step 3: 更新 src/ai/tools/permission.ts**

将 `import { useSettingStore } from '@/stores/ui/setting'` 替换为 `import { useToolPermissionStore } from '@/stores/chat/toolPermission'`。

所有 `useSettingStore()` → `useToolPermissionStore()`，所有 `settingStore.toolPermissionMode` → `toolPermissionStore.toolPermissionMode`，`settingStore.alwaysToolPermissionGrants` → `toolPermissionStore.alwaysToolPermissionGrants`，`settingStore.sessionToolPermissionGrants` → `toolPermissionStore.sessionToolPermissionGrants`，`settingStore.grantToolPermission` → `toolPermissionStore.grantToolPermission`。

- [ ] **Step 4: 更新其他引用 setting 工具权限的消费方**

搜索 `settingStore.toolPermissionMode`、`settingStore.alwaysToolPermissionGrants`、`settingStore.sessionToolPermissionGrants`、`settingStore.grantToolPermission`、`settingStore.setToolPermissionMode`、`settingStore.revokeToolPermission`、`settingStore.clearToolPermissionGrants`、`settingStore.clearSessionToolPermissionGrants`，全部改为从 `useToolPermissionStore` 获取。

涉及文件：
- `test/ai/tools/builtin-mcp-settings.test.ts`
- `test/ai/tools/builtin-settings.test.ts`
- `test/ai/tools/permission.test.ts`
- `test/stores/setting.test.ts`（工具权限相关测试移到新文件或更新引用）

- [ ] **Step 5: 运行 lint + typecheck 确认无错误**

Run: `pnpm run lint --fix && pnpm run typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(stores): extract toolPermission from setting to chat/toolPermission"
```

---

### Task 9: 解耦 editorFileWatch 与 tabs

**Files:**
- Modify: `src/stores/editor/fileWatch.ts` — 用 emitter 替代直接调用 tabsStore
- Modify: `src/stores/workspace/tabs.ts` — 订阅 emitter 事件

- [ ] **Step 1: 修改 editor/fileWatch.ts，用 emitter 替代 tabsStore**

删除 `import { useTabsStore } from '@/stores/tabs'`。

添加 `import { emitter } from '@/utils/emitter'`。

修改 `markPathMissing` 方法：
```typescript
markPathMissing(filePath: string): void {
  const fileIds = this.pathToFileIds.get(filePath);
  if (!fileIds) return;

  fileIds.forEach((fileId: string) => {
    emitter.emit('store:file-missing', { fileId });
  });
}
```

修改 `clearPathMissing` 方法：
```typescript
clearPathMissing(filePath: string): void {
  const fileIds = this.pathToFileIds.get(filePath);
  if (!fileIds) return;

  fileIds.forEach((fileId: string) => {
    emitter.emit('store:file-recovered', { fileId });
  });
}
```

- [ ] **Step 2: 修改 workspace/tabs.ts，订阅 emitter 事件**

添加 `import { emitter } from '@/utils/emitter'`。

在 store 定义后添加订阅逻辑（在模块顶层执行，确保 tabs store 初始化时注册）：

```typescript
let emitterUnsubscribers: (() => void)[] = [];

function subscribeToFileEvents(): void {
  if (emitterUnsubscribers.length > 0) return;

  const tabsStore = useTabsStore();

  emitterUnsubscribers.push(
    emitter.on('store:file-missing', (payload: unknown) => {
      const { fileId } = payload as { fileId: string };
      tabsStore.markMissing(fileId);
    }),
    emitter.on('store:file-recovered', (payload: unknown) => {
      const { fileId } = payload as { fileId: string };
      tabsStore.clearMissing(fileId);
    })
  );
}
```

在 `useTabsStore` 的 actions 中添加 `init` 方法调用 `subscribeToFileEvents()`。

或者更简洁地：在 `loadSavedData` 函数之后、store 定义之前直接订阅（因为 tabs store 在应用启动时就会被初始化）。

- [ ] **Step 3: 更新 test/stores/editorFileWatch.test.ts**

测试中 `useTabsStore` 的 mock 需要改为 emitter 事件的验证方式。

- [ ] **Step 4: 运行 lint + typecheck 确认无错误**

Run: `pnpm run lint --fix && pnpm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(stores): decouple fileWatch from tabs via emitter"
```

---

### Task 10: 重构 setting.ts 和 editorPreferences.ts 使用持久化中间层

**Files:**
- Modify: `src/stores/ui/setting.ts` — 使用 `loadPersistedState` / `persistState`
- Modify: `src/stores/editor/preferences.ts` — 使用 `loadPersistedState` / `persistState`

- [ ] **Step 1: 重构 editor/preferences.ts 使用持久化中间层**

将现有的 `loadPersistedEditorPreferences` / `loadLegacyEditorPreferences` / `persistEditorPreferences` 替换为：

```typescript
import { loadPersistedState, persistState } from '@/stores/helpers/persist';
import type { PersistConfig } from '@/stores/helpers/types';

const EDITOR_PREFERENCES_CONFIG: PersistConfig<PersistedEditorPreferences> = {
  storageKey: EDITOR_PREFERENCES_STORAGE_KEY,
  defaults: DEFAULT_EDITOR_PREFERENCES,
  normalize: normalizeEditorPreferences,
  migrations: [
    {
      legacyKey: LEGACY_SETTINGS_STORAGE_KEY,
      migrate: (legacyValue: unknown): Record<string, unknown> => {
        const legacy = legacyValue as LegacySettingsSnapshot;
        return {
          viewMode: legacy?.sourceMode === true ? 'source' : 'rich',
          pageWidth: legacy?.editorPageWidth,
          saveStrategy: 'off'
        };
      }
    }
  ]
};
```

state 初始化改为：
```typescript
state: (): PersistedEditorPreferences => ({
  ...loadPersistedState(EDITOR_PREFERENCES_CONFIG)
}),
```

`savePreferences` 改为：
```typescript
savePreferences(): void {
  persistState(EDITOR_PREFERENCES_CONFIG.storageKey, {
    viewMode: this.viewMode,
    pageWidth: this.pageWidth,
    saveStrategy: this.saveStrategy
  });
},
```

删除 `loadPersistedEditorPreferences`、`loadLegacyEditorPreferences`、`persistEditorPreferences` 函数。

- [ ] **Step 2: 重构 ui/setting.ts 使用持久化中间层**

将现有的 `loadPersistedSettings` / `loadLegacySettings` / `normalizeSettings` 保留（normalize 仍需用于 PersistConfig），但替换加载和持久化逻辑：

```typescript
import { loadPersistedState, persistState } from '@/stores/helpers/persist';
import type { PersistConfig } from '@/stores/helpers/types';

const SETTING_CONFIG: PersistConfig<PersistedSettingState> = {
  storageKey: SETTINGS_STORAGE_KEY,
  defaults: DEFAULT_SETTINGS,
  normalize: normalizeSettings,
  migrations: [
    {
      legacyKey: LEGACY_THEME_STORAGE_KEY,
      migrate: (legacyValue: unknown): Record<string, unknown> => ({
        theme: legacyValue,
        sidebarVisible: undefined,
        sidebarWidth: undefined
      })
    }
  ]
};
```

state 初始化改为：
```typescript
state: (): SettingState => ({
  ...loadPersistedState(SETTING_CONFIG),
  title: 'Tibis'
}),
```

`persistSettings` 改为：
```typescript
persistSettings(): void {
  persistState(SETTING_CONFIG.storageKey, {
    chatSidebarActiveSessionId: this.chatSidebarActiveSessionId,
    providerSidebarCollapsed: this.providerSidebarCollapsed,
    settingsSidebarCollapsed: this.settingsSidebarCollapsed,
    theme: this.theme,
    sidebarVisible: this.sidebarVisible,
    sidebarWidth: this.sidebarWidth
  });
},
```

删除 `loadPersistedSettings`、`loadLegacySettings`、`removeLegacySettings` 函数。

- [ ] **Step 3: 运行 lint + typecheck 确认无错误**

Run: `pnpm run lint --fix && pnpm run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(stores): adopt persist helpers in setting and editorPreferences"
```

---

### Task 11: 重构 tabs.ts 使用持久化中间层

**Files:**
- Modify: `src/stores/workspace/tabs.ts` — 使用 `loadPersistedState` / `persistState`

- [ ] **Step 1: 重构 workspace/tabs.ts**

将现有的 `loadSavedData` / `persistData` 替换为持久化中间层：

```typescript
import { loadPersistedState, persistState } from '@/stores/helpers/persist';
import type { PersistConfig } from '@/stores/helpers/types';

const TABS_CONFIG: PersistConfig<TabsState> = {
  storageKey: TABS_STORAGE_KEY,
  defaults: { tabs: [], dirtyById: {}, missingById: {}, cachedKeys: [] },
  normalize: (value: unknown): TabsState => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { tabs: [], dirtyById: {}, missingById: {}, cachedKeys: [] };
    }
    const state = value as Partial<TabsState>;
    const tabs = Array.isArray(state.tabs) ? state.tabs.map(normalizeTab) : [];
    const savedCachedKeys = Array.isArray(state.cachedKeys) ? state.cachedKeys : [];
    return {
      tabs,
      dirtyById: state.dirtyById ?? {},
      missingById: state.missingById ?? {},
      cachedKeys: normalizeCachedKeys([...savedCachedKeys, ...tabs.map((tab) => tab.cacheKey || tab.id)])
    };
  }
};
```

state 初始化改为：
```typescript
state: (): TabsState => loadPersistedState(TABS_CONFIG),
```

所有 `persistData(this.$state)` 改为：
```typescript
persistState(TABS_CONFIG.storageKey, this.$state);
```

删除 `loadSavedData` 和 `persistData` 函数（但 `normalizeTab`、`normalizeCachedKeys` 等工具函数保留）。

注意：`loadSavedData` 目前被测试文件 `test/stores/tabs.test.ts` 直接 import 使用，需要同步更新测试。

- [ ] **Step 2: 更新 test/stores/tabs.test.ts**

将 `import { loadSavedData } from '@/stores/tabs'` 替换为从新位置导入，或改为直接测试 normalize 逻辑。

- [ ] **Step 3: 运行 lint + typecheck 确认无错误**

Run: `pnpm run lint --fix && pnpm run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(stores): adopt persist helpers in tabs"
```

---

### Task 12: 最终验证与清理

**Files:**
- Verify: 全部 `src/stores/` 旧文件已删除
- Verify: 全部 import 路径已更新

- [ ] **Step 1: 确认旧文件已删除**

```bash
ls src/stores/*.ts
```

Expected: 应该只剩 `helpers/`、`editor/`、`chat/`、`ai/`、`ui/`、`workspace/` 目录，不再有平铺的 `.ts` 文件。

- [ ] **Step 2: 全局搜索残留的旧 import 路径**

```bash
grep -r "from '@/stores/chat'" src/ test/ --include='*.ts' --include='*.vue'
grep -r "from '@/stores/editorPreferences'" src/ test/ --include='*.ts' --include='*.vue'
grep -r "from '@/stores/editorFileWatch'" src/ test/ --include='*.ts' --include='*.vue'
grep -r "from '@/stores/fileSelectionIntent'" src/ test/ --include='*.ts' --include='*.vue'
grep -r "from '@/stores/files'" src/ test/ --include='*.ts' --include='*.vue'
grep -r "from '@/stores/provider'" src/ test/ --include='*.ts' --include='*.vue'
grep -r "from '@/stores/serviceModel'" src/ test/ --include='*.ts' --include='*.vue'
grep -r "from '@/stores/toolSettings'" src/ test/ --include='*.ts' --include='*.vue'
grep -r "from '@/stores/tabs'" src/ test/ --include='*.ts' --include='*.vue'
grep -r "from '@/stores/setting'" src/ test/ --include='*.ts' --include='*.vue'
```

Expected: 所有搜索结果为空（或仅匹配新路径如 `@/stores/chat/session`）。

- [ ] **Step 3: 运行完整测试**

Run: `pnpm run test`
Expected: PASS

- [ ] **Step 4: 运行 lint + typecheck 最终确认**

Run: `pnpm run lint --fix && pnpm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(stores): final cleanup and verification"
```
