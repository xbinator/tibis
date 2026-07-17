# Remove Unused File Session Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 删除没有运行时消费者的 `useFileSession` 实现，同时保留自动保存和 Widget 页面所需的最小类型契约。

**Architecture:** 将通用文件状态类型迁移到 `src/hooks/types.ts`，将 Widget 子 Hook 的依赖收窄为本领域的 `WidgetDataSession`。Widget 专用 `useSession` 继续承担全部运行时行为，旧 Hook 及其专属测试直接删除。

**Tech Stack:** Vue 3.5、TypeScript 5.9 strict、Vitest、ESLint、Stylelint、pnpm 10.33。

## Global Constraints

- 不改变 Widget 页面加载、编辑、保存、自动保存和外部文件同步行为。
- 不重构 `src/views/widget/hooks/useSession.ts` 的业务流程。
- 不修改历史 `docs/superpowers/specs/` 和 `docs/superpowers/plans/` 记录。
- 所有新增接口和类型必须包含准确注释，禁止使用 `any`。
- 按用户要求，不执行 `git add` 或 `git commit`，由用户自行提交。

---

### Task 1: 迁移文件状态与 Widget 会话类型

**Files:**
- Create: `src/hooks/types.ts`
- Modify: `src/hooks/useFileAutoSave.ts`
- Modify: `src/views/widget/hooks/types.ts`
- Modify: `src/views/widget/hooks/useSession.ts`
- Modify: `src/views/widget/hooks/useSelection.ts`
- Modify: `src/views/widget/hooks/useMultiSelection.ts`
- Modify: `src/views/widget/hooks/useLayerActions.ts`
- Modify: `test/hooks/use-file-auto-save.test.ts`
- Modify: `test/views/widget/use-multi-selection.test.ts`

**Interfaces:**
- Produces: `FileSessionState extends File` from `src/hooks/types.ts`.
- Produces: `WidgetDataSession` with `data: Ref<WidgetData>` from `src/views/widget/hooks/types.ts`.
- Preserves: `WidgetSessionReturn` public properties and action signatures.

- [x] **Step 1: 创建共享文件状态类型**

Create `src/hooks/types.ts`:

```ts
/**
 * @file types.ts
 * @description 全局 Hook 共享类型。
 */
import type { File } from '@/shared/platform/native/types';

/**
 * 文件会话状态。
 */
export interface FileSessionState extends File {
  /** 文件唯一 ID */
  id: string;
}
```

- [x] **Step 2: 更新自动保存类型来源**

Replace the `FileSessionState` import in `src/hooks/useFileAutoSave.ts`:

```ts
import type { FileSessionState } from './types';
```

Apply the same import source in `test/hooks/use-file-auto-save.test.ts`:

```ts
import type { FileSessionState } from '@/hooks/types';
```

- [x] **Step 3: 新增 Widget 最小会话契约**

Add these imports and interface to `src/views/widget/hooks/types.ts`:

```ts
import type { Ref } from 'vue';
import type { WidgetData } from '@/components/BWidget/types';

/**
 * Widget 子 Hook 所需的最小数据会话。
 */
export interface WidgetDataSession {
  /** 当前 Widget 数据 */
  data: Ref<WidgetData>;
}
```

- [x] **Step 4: 让 Widget 子 Hook 使用领域契约**

In `useSelection.ts`, `useMultiSelection.ts`, and `useLayerActions.ts`, remove `UseFileSessionReturn` imports, import `WidgetDataSession` from `./types`, and use:

```ts
session: WidgetDataSession;
```

In `test/views/widget/use-multi-selection.test.ts`, import `WidgetDataSession` and construct the session without a broad assertion:

```ts
const session: WidgetDataSession = { data };
```

- [x] **Step 5: 直接声明 Widget 完整会话返回类型**

In `src/views/widget/hooks/useSession.ts`, import `FileSessionState` from `@/hooks/types`, remove `UseFileSessionReturn`, and replace the inherited interface with:

```ts
/**
 * Widget 文件操作。
 */
export interface WidgetSessionActions {
  /** 保存当前文件 */
  onSave: () => Promise<void>;
  /** 导出当前文件副本 */
  onSaveAs: () => Promise<void>;
  /** 处理不允许的重命名操作 */
  onRename: () => Promise<void>;
  /** 删除当前最近文件记录 */
  onDelete: () => Promise<void>;
  /** 在系统文件夹中显示 */
  onShowInFolder: () => Promise<void>;
  /** 复制绝对路径 */
  onCopyPath: () => Promise<void>;
  /** 复制相对路径 */
  onCopyRelativePath: () => Promise<void>;
  /** 失焦保存入口 */
  onBlur: () => Promise<void>;
}

/**
 * Widget 页面统一会话。
 */
export interface WidgetSessionReturn {
  /** 当前文件 ID */
  fileId: Ref<string>;
  /** 当前 KeepAlive 页面是否活跃 */
  isActive: Ref<boolean>;
  /** 文件会话是否正在加载 */
  isLoading: Ref<boolean>;
  /** 文件加载或解析失败信息 */
  loadError: Ref<string | null>;
  /** 当前文件状态 */
  fileState: Ref<FileSessionState>;
  /** 当前 Widget 数据 */
  data: Ref<WidgetData>;
  /** 当前文件标题 */
  currentTitle: Ref<string>;
  /** 重新加载当前 Widget 文件 */
  reload: () => Promise<void>;
  /** Widget 文件操作 */
  actions: WidgetSessionActions;
}
```

- [x] **Step 6: 运行受影响类型与单元测试**

Run:

```bash
pnpm exec vitest run test/hooks/use-file-auto-save.test.ts test/views/widget/use-multi-selection.test.ts test/views/widget/use-session.test.ts
```

Expected: all selected test files pass.

Run:

```bash
pnpm exec tsc --noEmit
```

Expected: exit code 0.

---

### Task 2: 删除旧实现并同步现行文档

**Files:**
- Delete: `src/hooks/useFileSession.ts`
- Delete: `test/hooks/use-file-session.test.ts`
- Modify: `CONTEXT.md`
- Modify: `changelog/2026-07-17.md`

**Interfaces:**
- Consumes: `FileSessionState` from `src/hooks/types.ts`.
- Removes: `useFileSession`, `UseFileSessionReturn`, `UseFileSessionOptions`, and `FileSessionKind`.

- [x] **Step 1: 删除无消费者实现和专属测试**

Delete `src/hooks/useFileSession.ts` and `test/hooks/use-file-session.test.ts` after all remaining imports have moved to the new type boundaries.

- [x] **Step 2: 更新现行架构说明**

Remove `useFileSession.ts` from the hooks tree and test inventory in `CONTEXT.md`. Change the cross-page lifecycle sentence to:

```md
全局 `src/hooks/useFileAutoSave.ts`、`useSavePolicy.ts`、`useFileDrop.ts` 提供跨页面复用的文件生命周期能力；Widget 页面由 `src/views/widget/hooks/useSession.ts` 编排专用文件会话。
```

Remove `useFileSession` from the compact hooks and test summaries in the same document.

- [x] **Step 3: 记录 changelog**

Append under `## Changed` in `changelog/2026-07-17.md`:

```md
- 移除已无运行时消费者的通用文件会话 Hook，将文件状态类型迁移为共享契约，并收窄 Widget 子 Hook 的会话依赖。
```

- [x] **Step 4: 检查残留引用与差异格式**

Run:

```bash
rg -n "useFileSession|UseFileSessionReturn|UseFileSessionOptions|FileSessionKind" src test CONTEXT.md
```

Expected: no matches.

Run:

```bash
git diff --check
```

Expected: exit code 0.

- [x] **Step 5: 完成项目级验证**

Run:

```bash
pnpm exec vitest run test/hooks/use-file-auto-save.test.ts test/views/widget/use-multi-selection.test.ts test/views/widget/use-session.test.ts test/views/widget/index.test.ts
pnpm exec tsc --noEmit
pnpm exec eslint src --ext .vue,.ts,.tsx,.js,.jsx
pnpm exec stylelint 'src/**/*.{vue,less,css}'
```

Expected: all commands exit with code 0.

- [x] **Step 6: 保留未提交工作区交给用户**

Run only read-only status inspection:

```bash
git status --short
git diff --stat
```

Expected: code, test, documentation, and changelog changes remain unstaged and uncommitted for the user to review and commit.
