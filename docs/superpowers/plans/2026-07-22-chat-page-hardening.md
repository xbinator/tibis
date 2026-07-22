# Chat Page Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate ghost tabs, duplicate chat ownership, late Runtime resurrection, draft-promotion close races, incorrect recovery unread state, and corrupt tab-cache startup failures.

**Architecture:** Keep the existing Router, Chat page, ChatTab Store, close guard, and Tabs Store ownership boundaries. Add only narrow lifecycle signals and validation at mutation boundaries; every behavioral fix starts with a focused failing Vitest.

**Tech Stack:** Vue 3, Vue Router 4, Pinia, TypeScript strict mode, Vitest, Vue Test Utils, lodash-es.

## Global Constraints

- Preserve the existing `/chat` and `/chat/:sessionId` product behavior and unique top draft.
- Do not add a second Runtime or ownership Store.
- Do not persist Runtime, closing, or visual status.
- Use `asyncTo` for new asynchronous error normalization; do not add asynchronous `try/catch`.
- All functions, interfaces, and non-trivial logic require current JSDoc and explicit types.
- Do not stage or commit; the user will commit later.

---

### Task 1: Prevent failed navigation from creating tabs

**Files:**
- Modify: `src/router/index.ts`
- Create: `test/router/tab-navigation.test.ts`

**Interfaces:**
- Consumes: Vue Router `afterEach((to, from, failure) => void)`.
- Produces: tabs only for successful navigation.

- [x] **Step 1: Write the failing real-router test**

Create a jsdom test that activates Pinia, reaches `/welcome`, clears Tabs Store state, installs a guard that returns `false` for `/chat/session-a`, and asserts the aborted `router.push` leaves both the current route and tab list unchanged:

```ts
const removeGuard = router.beforeEach((to): boolean => to.path !== '/chat/session-a');
const result = await router.push('/chat/session-a');
removeGuard();

expect(isNavigationFailure(result)).toBe(true);
expect(router.currentRoute.value.path).toBe('/welcome');
expect(useTabsStore().tabs).toEqual([]);
```

- [x] **Step 2: Verify RED**

Run `pnpm exec vitest run test/router/tab-navigation.test.ts`. Expected: the aborted target appears as `chat:session-a`.

- [x] **Step 3: Ignore failed afterEach callbacks**

Change the router hook to return before resolving tab metadata:

```ts
router.afterEach((to, _from, failure): void => {
  if (failure || to.meta?.hideTab) return;
  // Existing successful-navigation tab synchronization.
});
```

- [x] **Step 4: Verify GREEN**

Run Task 1 test plus `test/router/navigation.test.ts` and `test/router/chat-route.test.ts`; expect zero failures.

---

### Task 2: Enforce page ownership and exact active-route matching

**Files:**
- Modify: `src/views/chat/index.vue`
- Modify: `test/views/chat/index.test.ts`

**Interfaces:**
- Consumes: `useSettingStore().chatSidebarActiveSessionId`.
- Produces: direct page navigation releases only the matching sidebar session.

- [x] **Step 1: Write failing page tests**

Add one test with sidebar A and route `/chat/A` expecting the sidebar ID to become null, one with sidebar B expecting B to remain, and one with `route.fullPath = '/chat/session-a?source=history'` plus a matching tab path expecting a visible completion to resolve to `idle` rather than `completed`.

- [x] **Step 2: Verify RED**

Run `pnpm exec vitest run test/views/chat/index.test.ts`. Expected: matching sidebar ownership remains and query-route completion is marked unread.

- [x] **Step 3: Claim ownership and compare fullPath**

During page setup, clear the sidebar only when `initialSessionId` equals its active session. Change the owner-tab comparison from `route.path` to `route.fullPath`:

```ts
if (initialSessionId && settingStore.chatSidebarActiveSessionId === initialSessionId) {
  settingStore.setChatSidebarActiveSessionId(null);
}

if (owner) return route.fullPath === owner.path;
```

- [x] **Step 4: Verify GREEN**

Run page, ChatSider, and `useChatRoute` tests; expect zero failures.

---

### Task 3: Make Runtime record lifetime fail closed

**Files:**
- Modify: `src/stores/chat/tab.ts`
- Modify: `test/stores/chat/tab-runtime.test.ts`
- Modify: `test/hooks/use-runtime-events.test.ts`

**Interfaces:**
- Preserves: `ensureTab` as the explicit record creation boundary.
- Changes: `setStatus`, `markCompleted`, `registerController`, and `promoteTab` ignore missing records.

- [x] **Step 1: Write failing late-callback tests**

Create a registered record, remove it, then invoke status, completion, controller registration, and promotion callbacks. Assert no record, controller, or generic tab status is recreated. Add a Runtime-events test proving a managed ChatSider session without a top-tab record does not populate ChatTab Store.

- [x] **Step 2: Verify RED**

Run the two test files. Expected: missing-record actions recreate one or more records.

- [x] **Step 3: Guard mutation actions**

Use existing records without calling `ensureTab` from ordinary mutation actions:

```ts
const record = this.records[tabId];
if (!record) return;
```

Apply the same fail-closed rule to controller registration and source-tab promotion. Update tests that intend to model a top tab so they call `ensureTab` first.

- [x] **Step 4: Verify GREEN**

Run ChatTab Store, Runtime events, recovery, close guard, and chat-page tests; expect zero failures.

---

### Task 4: Make close confirmation atomic with draft promotion

**Files:**
- Modify: `src/stores/chat/tab.ts`
- Modify: `src/layouts/default/hooks/useTabCloseGuard.ts`
- Modify: `src/layouts/default/components/HeaderTabs.vue`
- Modify: `src/views/chat/index.vue`
- Modify: `test/stores/chat/tab-runtime.test.ts`
- Modify: `test/layouts/default/use-tab-close-guard.test.ts`
- Modify: `test/layouts/default/header-tabs-chat-status.test.ts`
- Modify: `test/views/chat/index.test.ts`

**Interfaces:**
- Produces: `closingTabIds: Set<string>`.
- Produces: `markClosing(tabIds: string[]): void`, `clearClosing(tabIds: string[]): void`, and `isClosing(tabId: string): boolean`.
- Produces: `cancelClose(tabIds: string[]): void` from `useTabCloseGuard` for post-guard navigation failure.

- [x] **Step 1: Write failing close-intent and all-settled tests**

Cover these behaviors independently:

```ts
runtimeStore.markClosing(['chat:new']);
emitIdleForPendingDraft();
expect(tabsStore.tabs[0]?.id).toBe('chat:new');
runtimeStore.clearClosing(['chat:new']);
await flushPromises();
expect(tabsStore.tabs[0]?.id).toBe('chat:session-a');
```

Add a deferred controller test where one abort rejects immediately and another remains pending; assert `abortTabs` does not reject until the pending controller settles. Add guard tests proving cancel/failure clears closing IDs. Add a HeaderTabs test where next-route navigation rejects and assert the active tab remains.

- [x] **Step 2: Verify RED**

Run the four affected test files. Expected: draft promotes while closing, `Promise.all` rejects early, and navigation failure removes the active tab.

- [x] **Step 3: Implement close intent and settled aborts**

Add the transient Set and actions to ChatTab Store. Block promotion while the source is closing and clear the intent in `removeTab`. Replace `Promise.all` with `Promise.allSettled`, throwing the first rejection after every controller settles.

In `useTabCloseGuard`, mark all target chat IDs before confirmations and clear them on every false result. Return `cancelClose` so callers can release intent after a later navigation failure.

In Chat page, suppress `promoteDraft` while the owner is closing and watch a true-to-false close transition to resume an idle pending promotion.

- [x] **Step 4: Navigate before removing the active tab**

After `canClose(plan)` succeeds, navigate first when `plan.requiresNavigation`. On thrown or blocking failure call `cancelClose(plan.targetTabIds)` and return. Only then apply the plan and clean Runtime records. Wrap ordinary tab clicks with `asyncTo`.

- [x] **Step 5: Verify GREEN**

Run all four affected test files plus Tabs Store tests; expect zero failures.

---

### Task 5: Preserve active state during Runtime recovery completion

**Files:**
- Modify: `src/hooks/useChat/useRuntimeRecovery.ts`
- Modify: `test/hooks/use-runtime-recovery.test.ts`

**Interfaces:**
- Produces: optional `RuntimeRecoveryOptions.isTabActive(tabId: string): boolean`.
- Preserves: direct tests and callers that omit options default to background behavior.

- [x] **Step 1: Write the failing active-recovery test**

Model a Runtime present in the first snapshot and absent in the second, pass `isTabActive: () => true`, and expect ChatTab status `idle` with no generic `completed` status.

- [x] **Step 2: Verify RED**

Run `pnpm exec vitest run test/hooks/use-runtime-recovery.test.ts`. Expected: status remains `completed`.

- [x] **Step 3: Inject live activity**

Add the options interface and use it when handling vanished first-snapshot bindings:

```ts
runtimeStore.markCompleted(binding.tabId, options.isTabActive?.(binding.tabId) === true);
```

In `useRuntimeRecovery`, build the predicate from `useRoute().fullPath` and the current Tabs Store.

- [x] **Step 4: Verify GREEN**

Run recovery, Runtime events, and chat-page tests; expect zero failures.

---

### Task 6: Sanitize persisted tab state

**Files:**
- Modify: `src/stores/workspace/tabs.ts`
- Modify: `test/stores/workspace/tabs.test.ts`

**Interfaces:**
- Produces: `normalizePersistedTab(value: unknown): Tab | undefined`.
- Produces: validation helpers for boolean maps and string cache keys.

- [x] **Step 1: Write the failing corrupt-cache test**

Persist `app_tabs` containing null, primitive, missing-ID, wrong cache-key/icon types, historical status, invalid cache keys, and non-boolean dirty/missing entries. Create Tabs Store and assert only the valid sanitized tab remains without `status`; app initialization must not throw.

- [x] **Step 2: Verify RED**

Run `pnpm exec vitest run test/stores/workspace/tabs.test.ts`. Expected: Store construction throws while normalizing null.

- [x] **Step 3: Validate unknown data**

Use `isPlainObject` from `lodash-es`, construct a fresh `Tab` only from validated fields, filter undefined results with a type predicate, accept only non-empty string cache keys, and copy only boolean dirty/missing values.

- [x] **Step 4: Verify GREEN**

Run Tabs Store and router tests; expect zero failures.

---

### Task 7: Repeat the audit and verify the repository

**Files:**
- Modify: `changelog/2026-07-22.md`
- Modify: `docs/superpowers/specs/2026-07-22-chat-page-hardening-design.md`
- Modify: `docs/superpowers/plans/2026-07-22-chat-page-hardening.md`

**Interfaces:**
- Verifies all preceding tasks without staging or committing.

- [x] **Step 1: Run the second adversarial audit**

Re-read every changed call site, search all `setStatus`, `markCompleted`, `registerController`, `promoteTab`, `applyClosePlan`, and router navigation uses, and compare every design invariant to a test. Add a new RED-GREEN task before proceeding if a new reproducible gap appears.

- [x] **Step 2: Run static checks**

Run:

```bash
pnpm lint
pnpm lint:style
pnpm exec tsc --noEmit
```

Expected: exit code 0 with no warnings in changed tests.

- [x] **Step 3: Run focused and full tests**

Run all changed test files, then:

```bash
pnpm exec vitest run --reporter=dot --silent=passed-only
```

Expected: zero failures; existing intentional skips may remain.

- [x] **Step 4: Verify the final diff**

Run `git diff --check`, inspect `git diff`, and run `git status --short`. Expected: no whitespace errors, no unrelated files, and no staged or committed changes.

## Plan Self-Review

- Spec coverage: all eight audit risks map to Tasks 1-6; repeated audit, documentation, and full verification map to Task 7.
- Placeholder scan: every task names exact files, API signatures, failure evidence, implementation shape, and verification commands.
- Type consistency: closing actions use `string[]`; recovery receives a single options object; persisted normalization accepts `unknown` and returns `Tab | undefined`.
- Scope: no new product feature, ownership Store, migration, or persisted Runtime field is introduced.

## Repeated Audit Findings Resolved

- 第二次 Runtime 快照不再复用已关闭标签的首轮绑定。
- 删除活动会话标签改为回退导航成功后再清理标签与 Runtime。
- 草稿晋升导航期间保留活动路径并通过瞬时 promotion 锁阻止并发关闭或删除。
- 侧栏持久化会话 ID 增加运行时输入归一化。
