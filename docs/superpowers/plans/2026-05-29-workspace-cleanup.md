# 工作区概念统一清理实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 统一渲染进程工作区相关代码：抽取 `useWorkspaceRoot` composable、搬迁 `pathUtils` 到共享目录、归拢 JSON 工具函数。

**Architecture:** 新增 2 个文件（composable + 共享 pathUtils），修改 6 个文件，删除 2 个旧文件。不改变工作区语义（`~/.tibis` 单根沙箱）。

**Tech Stack:** Vue 3 Composition API, TypeScript

---

## 文件结构

### 新增文件

| 文件 | 职责 |
|------|------|
| `src/hooks/useWorkspaceRoot.ts` | 工作区根目录 composable，onMounted 自动初始化 |
| `src/shared/workspace/pathUtils.ts` | 从 `src/ai/tools/shared/pathUtils.ts` 整体搬迁 |

### 修改文件

| 文件 | 改动 |
|------|------|
| `src/components/BChatSidebar/index.vue` | 删除 workspaceRootCache，改用 useWorkspaceRoot |
| `src/ai/tools/builtin/ShellTool/index.ts` | import 路径更新 + 删除 native 回退 |
| `src/ai/tools/builtin/FileReadTool/index.ts` | import 路径更新 |
| `src/ai/tools/shared/fileTool.ts` | import 路径更新 |
| `src/utils/json.ts` | 并入 parseJson/stringifyJson/parseJsonArray |
| `src/shared/storage/utils/index.ts` | 移除 json barrel re-export |

### 删除文件

| 文件 | 说明 |
|------|------|
| `src/ai/tools/shared/pathUtils.ts` | 已搬迁 |
| `src/shared/storage/utils/json.ts` | 已搬迁 |

---

### Task 1: 创建 `src/shared/workspace/pathUtils.ts`（搬迁）

**Files:**
- Create: `src/shared/workspace/pathUtils.ts`

- [ ] **Step 1: 创建目录并拷贝文件**

```bash
mkdir -p src/shared/workspace
cp src/ai/tools/shared/pathUtils.ts src/shared/workspace/pathUtils.ts
```

- [ ] **Step 2: 更新 pathUtils.ts 文件头注释**

`src/shared/workspace/pathUtils.ts` 的 `@file` 注释改为：
```typescript
/**
 * @file pathUtils.ts
 * @description 渲染进程共享路径解析与工作区边界校验。
 */
```

其余内容不变。

- [ ] **Step 3: 更新消费方 import**

**`src/ai/tools/shared/fileTool.ts`** 第 11 行：
```typescript
// 旧
import { isAbsoluteFilePath, isPathInsideWorkspace, resolvePathAgainstWorkspace } from './pathUtils';
// 新
import { isAbsoluteFilePath, isPathInsideWorkspace, resolvePathAgainstWorkspace } from '@/shared/workspace/pathUtils';
```

**`src/ai/tools/builtin/FileReadTool/index.ts`** 第 18 行：
```typescript
// 旧
import { isAbsoluteFilePath } from '../../shared/pathUtils';
// 新
import { isAbsoluteFilePath } from '@/shared/workspace/pathUtils';
```

**`src/ai/tools/builtin/ShellTool/index.ts`** 第 12 行：
```typescript
// 旧
import { isPathInsideWorkspace } from '../../shared/pathUtils';
// 新
import { isPathInsideWorkspace } from '@/shared/workspace/pathUtils';
```

- [ ] **Step 4: 删除旧文件**

```bash
rm src/ai/tools/shared/pathUtils.ts
```

- [ ] **Step 5: 运行 typecheck 确认**

```bash
pnpm exec tsc --noEmit
```
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: move pathUtils from ai/tools/shared to shared/workspace"
```

---

### Task 2: 创建 `src/hooks/useWorkspaceRoot.ts`

**Files:**
- Create: `src/hooks/useWorkspaceRoot.ts`

- [ ] **Step 1: 创建 composable 文件**

`src/hooks/useWorkspaceRoot.ts`：

```typescript
/**
 * @file useWorkspaceRoot.ts
 * @description 工作区根目录 composable，挂载时自动异步初始化，提供同步读取能力。
 */
import { shallowRef, ref, onMounted } from 'vue';
import { native } from '@/shared/platform';

/**
 * 工作区根目录 composable。
 * 挂载时自动异步初始化，提供同步读取能力。
 * @returns workspaceRoot（响应式引用）和 getWorkspaceRoot（工具回调）
 */
export function useWorkspaceRoot() {
  /** 工作区根目录，挂载后同步读取 */
  const workspaceRoot = shallowRef<string | null>(null);

  /** 是否已完成初始化 */
  const initialized = ref(false);

  onMounted(async () => {
    const tibisWorkspace = await native.getTibisWorkspaceRoot();
    workspaceRoot.value = tibisWorkspace?.rootPath ?? null;
    initialized.value = true;
  });

  /** 同步获取工作区根目录，供工具选项使用 */
  function getWorkspaceRoot(): string | null {
    return workspaceRoot.value;
  }

  return { workspaceRoot, initialized, getWorkspaceRoot };
}
```

- [ ] **Step 2: 运行 typecheck 确认**

```bash
pnpm exec tsc --noEmit
```
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add useWorkspaceRoot composable"
```

---

### Task 3: 改造 BChatSidebar 使用 useWorkspaceRoot

**Files:**
- Modify: `src/components/BChatSidebar/index.vue`

- [ ] **Step 1: 添加 import**

在 `src/components/BChatSidebar/index.vue` 的 `<script setup>` 区域，在 `useOpenDraft` import 后添加：

```typescript
import { useWorkspaceRoot } from '@/hooks/useWorkspaceRoot';
```

- [ ] **Step 2: 删除 workspaceRootCache 定义**

删除第 353-354 行：
```typescript
/** 工作区根目录缓存，异步初始化后同步读取供 getWorkspaceRoot 使用 */
const workspaceRootCache = shallowRef<string | null>(null);
```

替换为：
```typescript
const { workspaceRoot, getWorkspaceRoot } = useWorkspaceRoot();
```

- [ ] **Step 3: 更新 createBuiltinTools 调用中的 getWorkspaceRoot**

第 371 行：
```typescript
// 旧
getWorkspaceRoot: () => workspaceRootCache.value,
// 新
getWorkspaceRoot,
```

- [ ] **Step 4: 更新 getActiveTools 中的 hasWorkspace**

第 410 行：
```typescript
// 旧
const hasWorkspace = Boolean(workspaceRootCache.value);
// 新
const hasWorkspace = Boolean(workspaceRoot.value);
```

- [ ] **Step 5: 从 onMounted 中删除工作区初始化**

删除 onMounted 中的第 844-846 行：
```typescript
  // 异步初始化工作区根目录缓存，供 getWorkspaceRoot 同步读取
  const tibisWorkspace = await native.getTibisWorkspaceRoot();
  workspaceRootCache.value = tibisWorkspace?.rootPath ?? null;
```

onMounted 变为：
```typescript
onMounted(async () => {
  await modelSelectionEvents.loadSelectedModel();
  initializeActiveSession();
  // 确保 filesStore 已加载最近文件列表
  await filesStore.ensureLoaded();
});
```

- [ ] **Step 6: 运行 typecheck + lint 确认**

```bash
pnpm exec tsc --noEmit && pnpm lint
```
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(BChatSidebar): use useWorkspaceRoot composable"
```

---

### Task 4: 移除 ShellTool 中的 native.getTibisWorkspaceRoot 回退

**Files:**
- Modify: `src/ai/tools/builtin/ShellTool/index.ts`

- [ ] **Step 1: 修改 execute 中的工作区获取逻辑**

第 238-246 行区域，将：
```typescript
      const workspaceRoot = options.getWorkspaceRoot?.() ?? null;
      let primaryWorkspaceRoot = workspaceRoot;

      // 调用方未提供工作区根目录时，回退到工作区
      if (!primaryWorkspaceRoot) {
        const tibisWorkspace = await native.getTibisWorkspaceRoot();
        if (tibisWorkspace) {
          primaryWorkspaceRoot = tibisWorkspace.rootPath;
        }
      }
```

改为：
```typescript
      const workspaceRoot = options.getWorkspaceRoot?.() ?? null;
      const primaryWorkspaceRoot = workspaceRoot;
```

- [ ] **Step 2: 运行 typecheck 确认**

```bash
pnpm exec tsc --noEmit
```
Expected: PASS。如果 `native` 不再被其他地方使用，检查 lint 是否会报 unused import。检查 ShellTool 中是否还有其他地方使用 `native`。

- [ ] **Step 3: 检查 native import 是否需要保留**

```bash
grep -n 'native\.' src/ai/tools/builtin/ShellTool/index.ts
```

如果 `native` 还有其他用途（如 `native.analyzeShellCommand`、`native.runShellCommand`），则保留 import。如果只用于已删除的 `getTibisWorkspaceRoot`，则删除 `import { native } from '@/shared/platform';`。

- [ ] **Step 4: 运行 typecheck + lint 确认**

```bash
pnpm exec tsc --noEmit && pnpm lint
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(ShellTool): remove native.getTibisWorkspaceRoot fallback"
```

---

### Task 5: 合并 JSON 工具函数到 `src/utils/json.ts`

**Files:**
- Modify: `src/utils/json.ts`
- Modify: `src/shared/storage/utils/index.ts`
- Delete: `src/shared/storage/utils/json.ts`

- [ ] **Step 1: 将函数并入 `src/utils/json.ts`**

在 `src/utils/json.ts` 现有 `safeJsonParse` 函数后追加：

```typescript
/**
 * 安全解析 JSON 字符串，返回 undefined 而非抛错。
 * @param json - JSON 字符串或 null
 * @returns 解析结果，解析失败或输入为空时返回 undefined
 */
export function parseJson<T>(json: string | null): T | undefined {
  if (!json) return undefined;

  try {
    return JSON.parse(json) as T;
  } catch {
    return undefined;
  }
}

/**
 * 将值序列化为 JSON 字符串。
 * @param value - 待序列化值
 * @returns JSON 字符串，值为 undefined/null 时返回 null
 */
export function stringifyJson(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return JSON.stringify(value);
}

/**
 * 安全解析 JSON 字符串为数组。
 * @param json - JSON 字符串或 null
 * @returns 解析结果数组，解析失败或非数组时返回 undefined
 */
export function parseJsonArray<T>(json: string | null): T[] | undefined {
  const parsed = parseJson<unknown>(json);
  if (!Array.isArray(parsed)) return undefined;
  return parsed as T[];
}
```

- [ ] **Step 2: 移除 barrel re-export**

`src/shared/storage/utils/index.ts` 改为：
```typescript
export * from './database';
```

（删除 `export * from './json';` 行）

- [ ] **Step 3: 删除旧文件**

```bash
rm src/shared/storage/utils/json.ts
```

- [ ] **Step 4: 运行 typecheck + lint 确认**

```bash
pnpm exec tsc --noEmit && pnpm lint
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: merge storage utils json into src/utils/json.ts"
```

---

### Task 6: 最终验证

- [ ] **Step 1: 运行完整检查**

```bash
pnpm exec tsc --noEmit && pnpm lint && pnpm lint:style
```
Expected: ALL PASS

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "chore: final verification after workspace cleanup"
```
