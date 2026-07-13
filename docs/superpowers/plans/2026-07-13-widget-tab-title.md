# Widget 保存后同步标签标题 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Widget 标签始终显示最近一次实际保存成功的业务名称，空名称回退文件标题。

**Architecture:** 暴露通用文件会话已有的 `savedContent` 保存基线，并用写盘前快照修复并发编辑时的基线更新。Widget 页面从保存基线解析标题，再通过独立 hook 同步 `tabsStore`，不依赖当前草稿或 dirty 状态推断。

**Tech Stack:** Vue 3 Composition API、Pinia、TypeScript、Vitest

**Execution constraint:** 直接在当前 `main` 工作区执行，不创建分支或 worktree，不运行 `git add`、`git commit` 或推送命令。

---

## 文件结构

- Modify: `src/hooks/useFileSession.ts` — 暴露实际保存基线，并用写盘快照处理并发编辑。
- Create: `src/views/widget/hooks/useWidgetTabTitle.ts` — 解析保存内容并同步标签标题。
- Modify: `src/views/widget/hooks/usePageSession.ts` — 使用 `savedContent` 计算 Widget 标签标题。
- Modify: `test/hooks/use-file-session.test.ts` — 验证写盘期间继续编辑的保存基线和 dirty 状态。
- Create: `test/views/widget/use-widget-tab-title.test.ts` — 验证保存标题同步与文件名兜底。
- Modify: `test/views/widget/index.test.ts` — 验证 Widget 页面从保存内容更新标签。
- Modify: `changelog/2026-07-13.md` — 记录行为变更。

### Task 1: 锁定实际写盘内容

- [x] **Step 1: 编写并发编辑失败测试**

在 `test/hooks/use-file-session.test.ts` 中让 `native.writeFile` 保持 pending：名称 B 开始写盘后将当前名称改为 C，再完成写盘。断言写入和 `session.savedContent` 都是 B、当前内容是 C，并继续调用 `setDirty`。

- [x] **Step 2: 确认 RED**

Run: `pnpm exec vitest run test/hooks/use-file-session.test.ts`

Expected: FAIL，旧实现未暴露 `savedContent` 且会把当前 C 误设为保存基线。

- [x] **Step 3: 用内容快照更新保存基线**

在 `UseFileSessionReturn<TData>` 中增加：

```typescript
/** 最近一次实际保存成功的文件内容 */
savedContent: Ref<string>;
```

保存前捕获 `contentToSave`，并将 `markCurrentContentSaved` 改为接收该快照。只有当前内容仍等于快照时清除 dirty，否则继续 `setDirty`。

- [x] **Step 4: 确认 GREEN**

Run: `pnpm exec vitest run test/hooks/use-file-session.test.ts`

Expected: 全部 PASS。

- [x] **Step 5: 覆盖外部等值写入**

当外部文件内容等于当前 dirty 草稿但不同于 `savedContent` 时，仍将该内容更新为保存基线并清除 dirty；外部事件去重改为与 `savedContent` 比较。

### Task 2: 从保存基线同步 Widget 标签

- [x] **Step 1: 编写标题解析与同步失败测试**

在 `test/views/widget/use-widget-tab-title.test.ts` 验证：保存 JSON 名称变化会调用 `updateTabTitle`；空名称或无效 JSON 回退文件标题。

- [x] **Step 2: 确认 RED**

Run: `pnpm exec vitest run test/views/widget/use-widget-tab-title.test.ts`

Expected: FAIL，解析函数和新 hook API 尚不存在。

- [x] **Step 3: 实现保存标题解析与同步 hook**

`resolveSavedWidgetTabTitle(savedContent, fileTitle)` 安全解析 JSON，读取字符串 `name` 并 trim；失败时返回文件标题。`useWidgetTabTitle` immediate 监听解析后的标题并调用：

```typescript
tabsStore.updateTabTitle({ id: tabId, title });
```

- [x] **Step 4: 接入 Widget 页面会话**

在 `usePageSession.ts` 中计算：

```typescript
const widgetTabTitle = computed<string>(() => resolveSavedWidgetTabTitle(session.savedContent.value, session.currentTitle.value));
```

初始 `addTab` 和后续 `useWidgetTabTitle` 共用该 computed。

- [x] **Step 5: 补齐页面测试替身与断言**

为 `test/views/widget/index.test.ts` 的文件会话 mock 增加响应式 `savedContent`，并验证保存内容名称变化后更新 `widget-1` 标签。

- [x] **Step 6: 确认 GREEN**

Run: `pnpm exec vitest run test/views/widget/use-widget-tab-title.test.ts test/hooks/use-file-session.test.ts test/views/widget/index.test.ts`

Expected: 三个测试文件全部 PASS。

### Task 3: 文档与最终验证

- [x] **Step 1: 更新设计文档与 changelog**

记录保存基线标题同步、空名称兜底和并发写盘语义。

- [x] **Step 2: 运行目标测试**

Run: `pnpm exec vitest run test/views/widget/use-widget-tab-title.test.ts test/hooks/use-file-session.test.ts test/views/widget/index.test.ts`

Expected: 所有目标测试 PASS。

- [x] **Step 3: 运行 ESLint**

Run: `pnpm exec eslint src/hooks/useFileSession.ts src/views/widget/hooks/useWidgetTabTitle.ts src/views/widget/hooks/usePageSession.ts test/hooks/use-file-session.test.ts test/views/widget/use-widget-tab-title.test.ts test/views/widget/index.test.ts`

Expected: exit code 0。

- [x] **Step 4: 运行 Stylelint**

Run: `pnpm exec stylelint 'src/views/widget/**/*.vue'`

Expected: exit code 0。

- [x] **Step 5: 运行 TypeScript 类型检查**

Run: `pnpm exec tsc --noEmit`

Expected: exit code 0。

- [x] **Step 6: 检查工作区差异**

Run: `git diff --check && git status --short`

Expected: 无空白错误，不暂存或提交任何文件。

### Task 4: 修复 Code Review 发现的保存事务与同步所有权问题

**Files:**
- Modify: `src/hooks/useFileSession.ts`
- Modify: `src/views/widget/hooks/useWidgetTabTitle.ts`
- Modify: `src/views/widget/hooks/usePageSession.ts`
- Modify: `test/hooks/use-file-session.test.ts`
- Modify: `test/views/widget/use-widget-tab-title.test.ts`
- Modify: `test/views/widget/index.test.ts`
- Modify: `changelog/2026-07-13.md`

- [x] **Step 1: 为并发另存事务编写失败测试**

让两次 `onSaveAs()` 共享同一个原生保存 Promise：第一次捕获名称 B，第二次发生在内容变成 C 后。断言原生保存只调用一次、保存基线为 B、当前内容为 C 且保持 dirty。

- [x] **Step 2: 保持保存基线更新异常由调用链处理**

按用户决策，`markCurrentContentSaved()` 不捕获 `filesStore.updateFile` 异常，由上层保存调用链统一处理。

- [x] **Step 3: 为标题同步所有权编写失败测试**

断言页面初始 `addTab` 使用 `{ preserveTitle: true }` 且不额外调用 `updateTabTitle`；断言 `useWidgetTabTitle` 在 `tabId` 改变时同步当前标题，并且不在 hook 初始化时重复更新。

- [x] **Step 4: 运行测试并确认 RED**

Run: `pnpm exec vitest run test/hooks/use-file-session.test.ts test/views/widget/use-widget-tab-title.test.ts test/views/widget/index.test.ts`

Expected: FAIL，分别暴露并发另存发布 C、初始化重复同步和 tabId 未监听。

- [x] **Step 5: 将保存对话框收敛为完整事务 single-flight**

在 `useFileSession` 内维护 `saveDialogPromise: Promise<boolean> | null`。把单次对话框保存放入 `performSaveWithDialog()`；`saveWithDialog()` 在已有 pending 事务时直接返回同一个完整事务 Promise，禁止后续调用用自己的快照再次标记保存。

- [x] **Step 6: 提供运行时只读保存基线**

`markCurrentContentSaved()` 仍以磁盘快照发布 `savedContent` 和 dirty，并让存储异常交由调用链处理；返回值使用 `readonly(savedContent)` 提供运行时只读保护。

- [x] **Step 7: 分离标签创建与后续标题同步**

`syncWidgetTab()` 调用 `addTab(tab, { preserveTitle: true })`，只维护标签身份、路径和缓存；`useWidgetTabTitle` 非 immediate 监听 `[tabId, title, savedContent]`，负责后续标题、ID 和保存基线变化。监听原始保存基线可保证派生标题文本相同时仍执行权威同步。

- [x] **Step 8: 运行目标测试并确认 GREEN**

Run: `pnpm exec vitest run test/hooks/use-file-session.test.ts test/views/widget/use-widget-tab-title.test.ts test/views/widget/index.test.ts`

Expected: 所有目标测试 PASS。

- [x] **Step 9: 更新 changelog 并执行最终检查**

Run: `pnpm exec eslint src/hooks/useFileSession.ts src/views/widget/hooks/useWidgetTabTitle.ts src/views/widget/hooks/usePageSession.ts test/hooks/use-file-session.test.ts test/views/widget/use-widget-tab-title.test.ts test/views/widget/index.test.ts`

Run: `pnpm exec stylelint 'src/views/widget/**/*.vue'`

Run: `pnpm exec tsc --noEmit`

Run: `git diff --check`

Expected: 所有命令 exit code 0。
