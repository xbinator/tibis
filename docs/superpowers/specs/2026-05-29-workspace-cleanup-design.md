# 工作区概念统一清理设计

## 背景

当前项目中"工作区"概念存在 6 个混乱点：

1. **无统一状态管理**：工作区根目录只在 `BChatSidebar` 的局部 `shallowRef` 中，没有可复用封装
2. **获取方式不一致**：`ShellTool` 直接调 `native.getTibisWorkspaceRoot()`，其他工具通过 `getWorkspaceRoot` 回调
3. **`isPathInsideWorkspace` 多处实现**：渲染进程 `pathUtils.ts`、主进程 `read.mts`、`shell/safety.mts`、`shell/runner.mts` 各有实现
4. **类型重复定义**：`TibisWorkspaceRoot` 在主进程 `root.mts` 和渲染进程 `native/types.ts` 各定义一份
5. **工具选项散落**：`getWorkspaceRoot`、`isFileInRecent` 等分散在不同接口中
6. **初始化逻辑分散**：`BChatSidebar` + `json.ts` 存储层各自调 `getTibisWorkspaceRoot`

## 目标

仅做代码清理，不改变工作区语义（仍是 `~/.tibis` 单根目录沙箱）。

## 不变的部分

- 工作区语义不变
- 主进程 `read.mts` / `safety.mts` / `runner.mts` 各自的路径检查逻辑不变（进程隔离，场景不同的安全防线合理）
- `TibisWorkspaceRoot` 类型定义两边保留（跨进程类型共享代价大于收益）

## 设计

### 新增文件

#### `src/hooks/useWorkspaceRoot.ts`

工作区根目录 composable，`onMounted` 时自动初始化，提供同步读取能力。

```typescript
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

#### `src/shared/workspace/pathUtils.ts`

从 `src/ai/tools/shared/pathUtils.ts` 整体搬迁，包含：

- `isAbsoluteFilePath` — 判断是否为绝对路径
- `resolvePathAgainstWorkspace` — 工作区相对路径解析为绝对路径
- `isPathInsideWorkspace` — 判断路径是否位于工作区内

### 修改文件

#### BChatSidebar

| 改动 | 说明 |
|------|------|
| 删除 `workspaceRootCache` ref | 移入 `useWorkspaceRoot` |
| 删除 `onMounted` 中的 `native.getTibisWorkspaceRoot()` | 移入 `useWorkspaceRoot` |
| 调用 `useWorkspaceRoot()` | 取 `getWorkspaceRoot` 传入 `createBuiltinTools` |

#### AI 工具

| 文件 | 改动 |
|------|------|
| `src/ai/tools/builtin/ShellTool/index.ts` | `isPathInsideWorkspace` import 改为 `@/shared/workspace/pathUtils`；删除 `native.getTibisWorkspaceRoot()` 回退逻辑，信任 `options.getWorkspaceRoot()` |
| `src/ai/tools/builtin/FileReadTool/index.ts` | `isAbsoluteFilePath` import 改为 `@/shared/workspace/pathUtils` |
| `src/ai/tools/shared/fileTool.ts` | `./pathUtils` import 改为 `@/shared/workspace/pathUtils` |

#### JSON 工具归拢

| 文件 | 改动 |
|------|------|
| `src/utils/json.ts` | 并入 `parseJson`、`stringifyJson`、`parseJsonArray` 三个函数（原 `safeJsonParse` 与 `parseJson` 语义相同，去除冗余） |
| `src/shared/storage/utils/json.ts` | **删除** |
| `src/shared/storage/utils/index.ts` | 移除 `export * from './json'` |

### 删除文件

| 文件 | 说明 |
|------|------|
| `src/ai/tools/shared/pathUtils.ts` | 整体搬迁到 `src/shared/workspace/pathUtils.ts` |
| `src/shared/storage/utils/json.ts` | 整体搬迁到 `src/utils/json.ts` |

## 改动影响范围

| 文件 | 改动量 |
|------|--------|
| 新增 `src/hooks/useWorkspaceRoot.ts` | ~25 行 |
| 新增 `src/shared/workspace/pathUtils.ts` | ~120 行（搬迁） |
| 修改 `src/components/BChatSidebar/index.vue` | 删除 ~5 行，新增 ~3 行 |
| 修改 `src/ai/tools/builtin/ShellTool/index.ts` | 改 2 处（import + 删除回退） |
| 修改 `src/ai/tools/builtin/FileReadTool/index.ts` | 改 1 处（import） |
| 修改 `src/ai/tools/shared/fileTool.ts` | 改 1 处（import） |
| 修改 `src/utils/json.ts` | 新增 ~15 行 |
| 修改 `src/shared/storage/utils/index.ts` | 删除 1 行 |
| 删除 `src/ai/tools/shared/pathUtils.ts` | 删除 |
| 删除 `src/shared/storage/utils/json.ts` | 删除 |
