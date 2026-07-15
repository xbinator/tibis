# AI Resource Freshness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure Skill, Widget, and document tools use the latest authoritative content without requiring a page refresh.

**Architecture:** Skill and Widget stores remain discovery caches, but expose full disk synchronization and execution-time resolution APIs. Chat synchronizes catalogs before building tool schemas, tools resolve their target file again before execution, stale Skill history is invalidated in the main-process runtime projection, and editor contexts read state through live getters.

**Tech Stack:** Vue 3, Pinia, TypeScript, Electron IPC, Vitest

**Commit Policy:** Do not create commits. The user will review and commit the final workspace changes.

---

### Task 1: Live editor document context

**Files:**
- Modify: `src/components/BEditor/hooks/useEditorToolContext.ts`
- Modify: `src/components/BEditor/index.vue`
- Create: `test/components/BEditor/use-editor-tool-context.test.ts`

- [ ] **Step 1: Write a failing test for state and controller replacement**

```ts
it('reads the latest editor state and controller after registration', async (): Promise<void> => {
  let state = createEditorState('old');
  let controller = createController('old selection');
  const context = createEditorToolContext({
    getFileState: () => state,
    getEditorInstance: () => controller
  });
  state = createEditorState('new');
  controller = createController('new selection');
  expect(context.document.getContent()).toBe('new');
  expect(context.editor.getSelection()?.text).toBe('new selection');
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm exec vitest run test/components/BEditor/use-editor-tool-context.test.ts`

Expected: FAIL because `getFileState` and `getEditorInstance` are not accepted.

- [ ] **Step 3: Replace captured objects with getters**

```ts
export interface CreateEditorToolContextInput {
  getFileState: () => EditorState;
  getEditorInstance: () => Pick<EditorController, 'getSelection' | 'insertAtCursor' | 'replaceSelection' | 'replaceDocument'> | null;
}
```

Use TypeScript property getters for document metadata and call both input getters inside every read/write operation. Register the context with `getFileState: () => editorState.value` and `getEditorInstance: getEditorController`.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `pnpm exec vitest run test/components/BEditor/use-editor-tool-context.test.ts`

Expected: PASS.

### Task 2: Versioned Skill and Widget definitions

**Files:**
- Modify: `src/ai/skill/types.ts`
- Modify: `src/ai/skill/parser.ts`
- Modify: `src/ai/widget/types.ts`
- Modify: `src/ai/widget/parser.ts`
- Modify: `test/ai/skill/parser.test.ts`
- Modify: `test/ai/widget/parser.test.ts`

- [ ] **Step 1: Add failing parser assertions**

```ts
expect(parseSkillMarkdown(source, filePath).contentHash).toBe(hashString(source));
expect(parseWidgetJson(source, filePath).contentHash).toBe(hashString(source));
```

Also assert that changing one source character changes the hash.

- [ ] **Step 2: Run parser tests and verify RED**

Run: `pnpm exec vitest run test/ai/skill/parser.test.ts test/ai/widget/parser.test.ts`

Expected: FAIL because `contentHash` is missing.

- [ ] **Step 3: Add required `contentHash` fields and populate every parser branch**

Import `hashString` from `src/shared/utils/hash.ts`, compute it once from the complete source text, and include it in successful and failed definitions.

- [ ] **Step 4: Run parser tests and verify GREEN**

Run: `pnpm exec vitest run test/ai/skill/parser.test.ts test/ai/widget/parser.test.ts`

Expected: PASS.

### Task 3: Disk-authoritative stores

**Files:**
- Modify: `src/stores/ai/skill.ts`
- Modify: `src/stores/ai/widget.ts`
- Modify: `test/stores/ai/skill.test.ts`
- Modify: `test/stores/ai/widget.test.ts`

- [ ] **Step 1: Add failing store tests**

```ts
await store.syncFromDisk();
expect(store.getSkillByName('weather')?.content).toBe('new content');

api.readFile.mockResolvedValueOnce({ content: latestWidgetJson });
expect((await store.resolveLatestEnabledWidget('weather'))?.description).toBe('new description');
```

Cover disabled-state preservation, deletion, parse errors, and concurrent refreshes where an older operation completes last.

- [ ] **Step 2: Run store tests and verify RED**

Run: `pnpm exec vitest run test/stores/ai/skill.test.ts test/stores/ai/widget.test.ts`

Expected: FAIL because the synchronization and resolver APIs do not exist.

- [ ] **Step 3: Implement synchronization and latest-resource resolution**

Expose these methods:

```ts
syncFromDisk(): Promise<void>;
resolveLatestEnabledSkill(name: string): Promise<SkillDefinition | undefined>;
resolveLatestEnabledWidget(id: string): Promise<WidgetDefinition | undefined>;
```

Reuse cached scanner APIs, preserve persisted disabled state, retain parse-error definitions for diagnostics, deduplicate in-flight reads, and guard writes with per-path monotonic operation sequence numbers.

- [ ] **Step 4: Run store tests and verify GREEN**

Run: `pnpm exec vitest run test/stores/ai/skill.test.ts test/stores/ai/widget.test.ts`

Expected: PASS.

### Task 4: Execution-time Skill and Widget reads

**Files:**
- Modify: `src/ai/tools/builtin/SkillTool/index.ts`
- Modify: `src/ai/tools/builtin/WidgetTool/index.ts`
- Modify: `test/ai/tools/builtin-skill-tool.test.ts`
- Modify: `test/ai/tools/builtin-widget-tool.test.ts`

- [ ] **Step 1: Add failing execution-time freshness tests**

Create tools while stores contain old definitions, make async resolvers return new definitions, then assert the tool results contain the new Skill content, Widget contract, and `open_widget` snapshot. Assert parse errors fail instead of falling back.

- [ ] **Step 2: Run tool tests and verify RED**

Run: `pnpm exec vitest run test/ai/tools/builtin-skill-tool.test.ts test/ai/tools/builtin-widget-tool.test.ts`

Expected: FAIL because tool execution only reads synchronous Store snapshots.

- [ ] **Step 3: Make tool store contracts asynchronous at execution**

```ts
resolveLatestEnabledSkill: (name: string) => Promise<SkillDefinition | undefined>;
resolveLatestEnabledWidget: (id: string) => Promise<WidgetDefinition | undefined>;
```

Add `<content_hash>` to Skill metadata. Reject missing, renamed, deleted, or parse-invalid resources and never execute the stale definition.

- [ ] **Step 4: Run tool tests and verify GREEN**

Run: `pnpm exec vitest run test/ai/tools/builtin-skill-tool.test.ts test/ai/tools/builtin-widget-tool.test.ts`

Expected: PASS.

### Task 5: Pre-send catalog synchronization

**Files:**
- Modify: `src/components/BChat/hooks/useRuntimeTools.ts`
- Modify: `src/components/BChat/index.vue`
- Modify: `test/components/BChat/use-runtime-tools.test.ts`
- Modify: `test/components/BChat/session-id-runtime.test.ts`

- [ ] **Step 1: Add a failing test that synchronization precedes tool schema construction**

Assert both stores synchronize before `getActiveTools()` is converted to transport schemas and that the current Skill hash map is included in runtime requests.

- [ ] **Step 2: Run BChat tests and verify RED**

Run: `pnpm exec vitest run test/components/BChat/use-runtime-tools.test.ts test/components/BChat/session-id-runtime.test.ts`

Expected: FAIL because `syncAIResources()` and Skill version transport do not exist.

- [ ] **Step 3: Add runtime synchronization APIs**

```ts
async function syncAIResources(): Promise<void> {
  await Promise.all([skillStore.waitForInit(), widgetStore.waitForInit()]);
  await Promise.all([skillStore.syncFromDisk(), widgetStore.syncFromDisk()]);
}
```

Call it in `resolveChatRuntimeRequestConfig()` before `getActiveTools()`. Build `skillContentHashes` from enabled, parse-valid Skill definitions and attach it to send/continue requests.

- [ ] **Step 4: Run BChat tests and verify GREEN**

Run: `pnpm exec vitest run test/components/BChat/use-runtime-tools.test.ts test/components/BChat/session-id-runtime.test.ts`

Expected: PASS.

### Task 6: Invalidate stale Skill instructions in runtime history

**Files:**
- Modify: `types/chat-runtime.d.ts`
- Modify: `electron/main/modules/chat/runtime/types.mts`
- Modify: `electron/main/modules/chat/runtime/runners/factory.mts`
- Modify: `electron/main/modules/chat/runtime/context/model-message.mts`
- Modify: `electron/main/modules/chat/runtime/service.mts`
- Modify: `test/electron/main/modules/chat/runtime/model-message-context.test.ts`
- Modify: `test/electron/main/modules/chat/runtime/service.test.ts`

- [ ] **Step 1: Add failing invalidation tests**

Given a historical successful `skill` result containing `<content_hash>old</content_hash>`, assert runtime source projection replaces its data with `<skill_invalidated>` when the request map contains `new`, retains it when hashes match, and invalidates legacy results without a hash.

- [ ] **Step 2: Run main-process runtime tests and verify RED**

Run: `pnpm exec vitest run test/electron/main/modules/chat/runtime/model-message-context.test.ts test/electron/main/modules/chat/runtime/service.test.ts`

Expected: FAIL because runtime inputs do not carry Skill hashes and history is not projected.

- [ ] **Step 3: Transport versions and project stale results**

Add `skillContentHashes?: Record<string, string>` to runtime request and active runtime types. Implement a pure `invalidateStaleSkillToolResults(messages, hashes)` helper that clones only affected messages and tool parts. Apply it immediately after loading or receiving source message snapshots, before usage estimation, compaction, and streaming; never persist the projection.

- [ ] **Step 4: Run runtime tests and verify GREEN**

Run: `pnpm exec vitest run test/electron/main/modules/chat/runtime/model-message-context.test.ts test/electron/main/modules/chat/runtime/service.test.ts`

Expected: PASS.

### Task 7: Application-owned watcher lifecycle

**Files:**
- Modify: `src/layouts/default/index.vue`
- Modify: `src/components/BChat/index.vue`
- Modify: `src/layouts/default/hooks/useSkillInit.ts`
- Modify: `src/layouts/default/hooks/useWidgetInit.ts`
- Modify: `test/components/BChat/session-id-runtime.test.ts`

- [ ] **Step 1: Add failing lifecycle assertions**

Assert BChat no longer owns watcher initialization and that watcher listeners are subscribed before directory registration and initial scanning.

- [ ] **Step 2: Run lifecycle tests and verify RED**

Run: `pnpm exec vitest run test/components/BChat/session-id-runtime.test.ts`

Expected: FAIL with the old BChat-owned initialization order.

- [ ] **Step 3: Move lifecycle ownership to the default layout**

Call both initialization hooks from `src/layouts/default/index.vue`, remove their calls/imports from BChat, and register event callbacks before awaiting directory watch and Store initialization.

- [ ] **Step 4: Run lifecycle tests and verify GREEN**

Run: `pnpm exec vitest run test/components/BChat/session-id-runtime.test.ts`

Expected: PASS.

### Task 8: Changelog and full verification

**Files:**
- Modify: `changelog/2026-07-11.md`

- [ ] **Step 1: Add a Changed entry**

```md
- Skill、Widget 与文档工具统一采用事实源实时读取，修复源文件更新后聊天继续使用旧数据的问题。
```

- [ ] **Step 2: Run related tests**

Run all focused tests from Tasks 1-7 in one Vitest command. Expected: PASS.

- [ ] **Step 3: Run repository checks**

Run: `pnpm lint`

Run: `pnpm lint:style`

Run: `pnpm exec tsc --noEmit`

Expected: all commands exit 0.

- [ ] **Step 4: Review the final diff without committing**

Run: `git diff --check` and `git status --short`. Confirm unrelated sandbox changes remain untouched and do not run `git commit`.
