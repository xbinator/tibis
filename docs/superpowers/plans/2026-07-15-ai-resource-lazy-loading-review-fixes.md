# AI Resource Lazy Loading Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 AI 资源懒加载代码审查中发现的缓存同步、同名 Skill、并发读取、初始化和 watcher 生命周期问题。

**Architecture:** 保持现有 Skill/Widget Store 边界和首次加载缓存模型。应用确认的磁盘内容直接写回 Store；聊天使用唯一且确定的 Skill 视图；Entry 替换和 watcher 错误由所属基础设施层处理。

**Tech Stack:** TypeScript、Vue 3、Pinia、Electron、Chokidar、Vitest。

## Global Constraints

- 不新增 `loaded` 状态，继续以 `sourceContent !== undefined` 判断已加载。
- Store 继续使用 `asyncTo()` 隔离首次读取错误。
- 不恢复入口文件级全局资源监听。
- 所有修复先写失败测试，再写最小实现。
- 不创建 Git 提交，由用户最后统一提交。

---

### Task 1: 外部内容同步

**Files:**
- Modify: `src/views/editor/hooks/useFileState.ts`
- Modify: `src/views/widget/hooks/useSession.ts`
- Test: `test/views/editor/use-session-save-dialog.test.ts`
- Test: `test/views/widget/use-session.test.ts`

**Interfaces:**
- Consumes: `storeEvents.emitFileSaved(filePath, content)`、`widgetStore.updateWidgetContent(id, content)`
- Produces: 接受外部 Skill/Widget 内容后立即更新 Store 的行为

- [ ] **Step 1: Write failing tests**

```ts
it('publishes accepted external file content to resource stores', async () => {
  fileChangedHandler?.({ type: 'change', filePath: SKILL_FILE_PATH, content: EXTERNAL_CONTENT });
  expect(fileSavedHandler).toHaveBeenCalledWith({ filePath: SKILL_FILE_PATH, content: EXTERNAL_CONTENT });
});

it('stores invalid externally accepted Widget content', async () => {
  fileChangedHandler?.({ type: 'change', filePath: WIDGET_FILE_PATH, content: '{ invalid' });
  expect(updateWidgetContentMock).toHaveBeenCalledWith('weather', '{ invalid');
});
```

- [ ] **Step 2: Run tests and confirm expected failures**

Run: `pnpm vitest run test/views/editor/use-session-save-dialog.test.ts test/views/widget/use-session.test.ts`

- [ ] **Step 3: Implement minimal synchronization**

在通用编辑器接受外部 change 后发布已确认磁盘内容；Widget 在解析分支判断前先更新 Store。

- [ ] **Step 4: Run tests and confirm pass**

Run: `pnpm vitest run test/views/editor/use-session-save-dialog.test.ts test/views/widget/use-session.test.ts`

### Task 2: Skill 选择和 Entry 替换竞态

**Files:**
- Modify: `src/stores/ai/skill.ts`
- Modify: `src/stores/ai/widget.ts`
- Test: `test/stores/ai/skill.test.ts`
- Test: `test/stores/ai/widget.test.ts`
- Test: `test/ai/tools/builtin-skill-tool.test.ts`

**Interfaces:**
- Consumes: `getEnabledSkills()`、`getSkillByName(name)`、`getSkill(id)`、`getWidget(id)`
- Produces: 按名称去重的启用 Skill 视图和替换 Entry 自动重读

- [ ] **Step 1: Write failing tests**

```ts
it('selects one enabled valid Skill for duplicate frontmatter names', async () => {
  expect(store.getEnabledSkills().map((entry) => entry.definition?.name)).toEqual(['weather']);
  expect(store.getSkillByName('weather')?.enabled).toBe(true);
});

it('loads a replacement Entry when the stale read rejects', async () => {
  const loading = store.getSkill('weather');
  replaceDirectoryWithSameId();
  staleRead.reject(new Error('removed'));
  expect((await loading)?.sourceContent).toContain('replacement');
});
```

- [ ] **Step 2: Run tests and confirm expected failures**

Run: `pnpm vitest run test/stores/ai/skill.test.ts test/stores/ai/widget.test.ts test/ai/tools/builtin-skill-tool.test.ts`

- [ ] **Step 3: Implement canonical selection and replacement retry**

`getEnabledSkills()` 按解析名称保留第一个启用且有效的条目；`getSkillByName()` 使用同一视图。读取失败时若 Entry 身份已变化且当前 Entry 未加载，继续读取当前 Entry。

- [ ] **Step 4: Run tests and confirm pass**

Run: `pnpm vitest run test/stores/ai/skill.test.ts test/stores/ai/widget.test.ts test/ai/tools/builtin-skill-tool.test.ts`

### Task 3: 设置列表初始化屏障

**Files:**
- Modify: `src/views/settings/tools/skill/index.vue`
- Modify: `src/views/settings/tools/widget/index.vue`
- Test: `test/views/settings/tools/skill/index.test.ts`
- Test: `test/views/settings/tools/widget/index.test.ts`

**Interfaces:**
- Consumes: `waitForInit()`、`getSkills()`、`getWidgets()`
- Produces: 初始化完成后才开始批量加载的设置列表

- [ ] **Step 1: Write failing tests**

断言 `getSkills/getWidgets` 在初始化 Promise 完成前不调用，完成后调用一次。

- [ ] **Step 2: Run tests and confirm expected failures**

Run: `pnpm vitest run test/views/settings/tools/skill/index.test.ts test/views/settings/tools/widget/index.test.ts`

- [ ] **Step 3: Await Store initialization before bulk getters**

列表 watcher 先 `await store.waitForInit()`，再调用批量 getter。

- [ ] **Step 4: Run tests and confirm pass**

Run: `pnpm vitest run test/views/settings/tools/skill/index.test.ts test/views/settings/tools/widget/index.test.ts`

### Task 4: Watcher 错误生命周期和遗留类型

**Files:**
- Modify: `electron/main/modules/workspace/watch.mts`
- Modify: `src/ai/skill/types.ts`
- Modify: `src/ai/skill/index.ts`
- Test: `test/electron/main/modules/workspace/watch.test.ts`

**Interfaces:**
- Consumes: Chokidar `ready`、`error` 事件
- Produces: ready 后仍可安全处理错误的资源 watcher

- [ ] **Step 1: Write failing watcher test**

```ts
it('keeps an error listener after resource watcher readiness', async () => {
  watcher.emit('ready');
  await registration;
  expect(() => watcher.emit('error', new Error('runtime'))).not.toThrow();
});
```

- [ ] **Step 2: Run test and confirm expected failure**

Run: `pnpm vitest run test/electron/main/modules/workspace/watch.test.ts`

- [ ] **Step 3: Add permanent error handler and remove obsolete types**

资源 watcher 注册永久 `error` 日志处理器；删除 `SkillChangeEventType`、`SkillChangeEvent` 及出口。

- [ ] **Step 4: Run test and confirm pass**

Run: `pnpm vitest run test/electron/main/modules/workspace/watch.test.ts`

### Task 5: Full verification

**Files:**
- Verify: all modified files

- [ ] **Step 1: Run focused regression tests**

Run all tests changed by Tasks 1–4.

- [ ] **Step 2: Run static checks**

Run: `pnpm exec tsc --noEmit`

Run: `pnpm exec eslint src electron test --ext .vue,.ts,.tsx,.js,.jsx,.mts`

Run: `pnpm lint:style`

- [ ] **Step 3: Run build and diff checks**

Run: `pnpm build`

Run: `git diff --check`
