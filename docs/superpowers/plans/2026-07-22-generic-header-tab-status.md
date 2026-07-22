# Generic HeaderTab Status Write-Through Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store generic visual status on each in-memory tab when the source status changes, so `HeaderTabs` renders `item.status` without reading the chat Runtime Store.

**Architecture:** `TabsStore` owns transient `Tab.status` and strips it from every persistence snapshot. `ChatTabRuntimeStore` remains the owner of chat Runtime state and controllers, but its existing state-changing actions write through to `TabsStore`. `HeaderTabs` becomes Runtime-agnostic; Runtime cleanup after a confirmed close is exposed by the existing close-guard boundary.

**Tech Stack:** Vue 3, Pinia, TypeScript strict mode, Vue Test Utils, Vitest, Less, lodash-es.

## Global Constraints

- Do not remove `useChatTabRuntimeStore`; it still owns chat session ownership, controllers, and abort behavior.
- Do not add another Runtime Store or status event bus.
- Do not persist `Tab.status` in `app_tabs` or restore it after restart.
- Preserve chat routing, draft promotion, close confirmation, abort failure, drag, title, and icon behavior.
- All new types and functions require JSDoc and explicit signatures; do not use `any`.
- Use `asyncTo` for asynchronous error normalization.
- Do not stage or commit; the user will commit later.

---

### Task 1: Add transient status to the generic Tab model

**Files:**
- Modify: `src/stores/workspace/tabs.ts`
- Modify: `src/layouts/default/components/HeaderTab.vue`
- Modify: `test/stores/workspace/tabs.test.ts`
- Modify: `test/layouts/default/header-tab-status.test.ts`

**Interfaces:**
- Produces: `TabStatus = 'loading' | 'attention' | 'error' | 'completed'`.
- Produces: `Tab.status?: TabStatus`.
- Produces: `useTabsStore().setTabStatus(tabId: string, status?: TabStatus): void`.
- Consumes later: chat Runtime actions and `HeaderTabs` rendering.

- [x] **Step 1: Write failing Tabs Store tests**

Extend `test/stores/workspace/tabs.test.ts` with tests that set an in-memory status, preserve it across router-style `addTab`, migrate it through `replaceTab`, and omit it from persistence:

```ts
it('keeps transient status in memory without persisting it', (): void => {
  const store = useTabsStore();
  store.addTab(createTab('chat:session-a', '/chat/session-a'));

  store.setTabStatus('chat:session-a', 'loading');
  store.addTab(createTab('chat:session-a', '/chat/session-a'));

  expect(store.tabs[0]?.status).toBe('loading');
  store.updateTabTitle({ id: 'chat:session-a', title: 'A' });
  expect(JSON.parse(localStorage.getItem('app_tabs') ?? '{}').tabs[0]).not.toHaveProperty('status');
});

it('migrates transient status when replacing a tab', (): void => {
  const store = useTabsStore();
  store.tabs = [createTab('chat:new', '/chat')];
  store.setTabStatus('chat:new', 'attention');

  store.replaceTab({ sourceId: 'chat:new', tab: createTab('chat:session-a', '/chat/session-a') });

  expect(store.tabs[0]?.status).toBe('attention');
});
```

- [x] **Step 2: Run the Tabs Store test and verify RED**

Run:

```bash
pnpm exec vitest run test/stores/workspace/tabs.test.ts
```

Expected: FAIL because `Tab.status` and `setTabStatus` do not exist.

- [x] **Step 3: Implement the transient Tab status and persistence snapshot**

In `src/stores/workspace/tabs.ts`:

```ts
import { omit } from 'lodash-es';

/** 标签页通用视觉状态。 */
export type TabStatus = 'loading' | 'attention' | 'error' | 'completed';

export interface Tab {
  // Existing fields remain unchanged.
  /** 标签页瞬时视觉状态，不进入持久化。 */
  status?: TabStatus;
}

/**
 * 创建不含瞬时标签状态的持久化快照。
 * @param state - 当前标签状态
 * @returns 可安全持久化的标签状态
 */
function createPersistedState(state: TabsState): TabsState {
  return {
    ...state,
    tabs: state.tabs.map((tab: Tab): Tab => omit(tab, ['status']))
  };
}

/**
 * 持久化标签状态并排除瞬时字段。
 * @param state - 当前标签状态
 */
function persistTabsState(state: TabsState): void {
  persistState(TABS_STORAGE_KEY, createPersistedState(state));
}
```

Replace every `persistState(TABS_STORAGE_KEY, this.$state)` call in the store with `persistTabsState(this.$state)`.

Preserve existing status in `addTab`, migrate source status in `replaceTab`, and add the action:

```ts
setTabStatus(tabId: string, status?: TabStatus): void {
  const index = this.tabs.findIndex((tab: Tab): boolean => tab.id === tabId);
  if (index === -1) return;

  const current = this.tabs[index];
  this.tabs[index] = status ? { ...current, status } : omit(current, ['status']);
}
```

`normalizeTab` must continue to omit `status`, so persisted historical data cannot restore Runtime visuals.

Move the `TabStatus` import in `HeaderTab.vue` and its test from `@/layouts/default/types` to `@/stores/workspace/tabs`. Remove the obsolete `TabStatus` declaration from `src/layouts/default/types.ts`.

- [x] **Step 4: Run focused tests and verify GREEN**

Run:

```bash
pnpm exec vitest run test/stores/workspace/tabs.test.ts test/layouts/default/header-tab-status.test.ts
```

Expected: both files PASS with zero failures.

---

### Task 2: Write chat Runtime status through to Tabs Store

**Files:**
- Modify: `src/stores/chat/tabRuntime.ts`
- Modify: `test/stores/chat/tab-runtime.test.ts`

**Interfaces:**
- Consumes: `useTabsStore().setTabStatus(tabId: string, status?: TabStatus): void`.
- Preserves: all existing `ChatTabRuntimeStore` public actions.
- Produces: exhaustive chat-to-generic state mapping at the mutation boundary.

- [x] **Step 1: Write failing Runtime write-through tests**

Add the jsdom environment marker, clear local storage in `beforeEach`, create matching tabs, and assert all mappings:

```ts
/**
 * @vitest-environment jsdom
 */

it('writes chat runtime states through to generic tab status', (): void => {
  const tabsStore = useTabsStore();
  tabsStore.tabs = [
    createTab('chat:running'),
    createTab('chat:waiting'),
    createTab('chat:error'),
    createTab('chat:completed')
  ];
  const runtimeStore = useChatTabRuntimeStore();

  runtimeStore.setStatus('chat:running', 'running');
  runtimeStore.setStatus('chat:waiting', 'waiting');
  runtimeStore.setStatus('chat:error', 'error');
  runtimeStore.markCompleted('chat:completed', false);

  expect(tabsStore.tabs.map((tab: Tab) => tab.status)).toEqual(['loading', 'attention', 'error', 'completed']);
});
```

Extend the completed/viewed and promotion tests to assert `Tab.status` clears or migrates together with the Runtime record.

- [x] **Step 2: Run Runtime tests and verify RED**

Run:

```bash
pnpm exec vitest run test/stores/chat/tab-runtime.test.ts
```

Expected: FAIL because Runtime actions do not update the generic tab status.

- [x] **Step 3: Implement exhaustive write-through**

In `src/stores/chat/tabRuntime.ts`, import `TabStatus` and `useTabsStore`, then define:

```ts
/** 聊天运行状态到通用标签视觉状态的完整映射。 */
const TAB_STATUS_MAP: Record<ChatTabRuntimeStatus, TabStatus | undefined> = {
  idle: undefined,
  running: 'loading',
  waiting: 'attention',
  error: 'error',
  completed: 'completed'
};

/**
 * 将聊天运行状态写入通用标签状态。
 * @param tabId - 标签 ID
 * @param status - 聊天运行状态
 */
function syncTabStatus(tabId: string, status: ChatTabRuntimeStatus): void {
  useTabsStore().setTabStatus(tabId, TAB_STATUS_MAP[status]);
}
```

Call `syncTabStatus` after the final state is known in `setStatus`, `markCompleted`, `markViewed`, and `promoteTab`. In `removeTab`, clear the generic status before deleting the Runtime record.

- [x] **Step 4: Run Runtime and Tabs Store tests and verify GREEN**

Run:

```bash
pnpm exec vitest run test/stores/chat/tab-runtime.test.ts test/stores/workspace/tabs.test.ts
```

Expected: both files PASS with zero failures.

---

### Task 3: Move Runtime cleanup behind the close guard

**Files:**
- Modify: `src/layouts/default/hooks/useTabCloseGuard.ts`
- Modify: `test/layouts/default/use-tab-close-guard.test.ts`

**Interfaces:**
- Produces: `cleanupClosedTabs(tabIds: string[]): void` on `TabCloseGuardApi`.
- Consumes later: `HeaderTabs` after `tabsStore.applyClosePlan(plan)`.

- [x] **Step 1: Write the failing cleanup test**

```ts
it('cleans runtime records after tabs have closed', (): void => {
  const runtimeStore = useChatTabRuntimeStore();
  runtimeStore.ensureTab('chat:session-a', 'session-a');
  runtimeStore.registerController('chat:session-a', { abort: vi.fn<() => Promise<void>>().mockResolvedValue() });

  useTabCloseGuard().cleanupClosedTabs(['chat:session-a', 'editor-a']);

  expect(runtimeStore.records['chat:session-a']).toBeUndefined();
  expect(runtimeStore.controllers.has('chat:session-a')).toBe(false);
});
```

- [x] **Step 2: Run the close-guard test and verify RED**

Run:

```bash
pnpm exec vitest run test/layouts/default/use-tab-close-guard.test.ts
```

Expected: FAIL because `cleanupClosedTabs` is not exposed.

- [x] **Step 3: Implement cleanup at the integration boundary**

Add the API member and implementation:

```ts
interface TabCloseGuardApi {
  canClose: (plan: TabClosePlan) => Promise<boolean>;
  cleanupClosedTabs: (tabIds: string[]) => void;
}

function cleanupClosedTabs(tabIds: string[]): void {
  tabIds
    .filter((tabId: string): boolean => tabId.startsWith('chat:'))
    .forEach((tabId: string): void => runtimeStore.removeTab(tabId));
}

return { canClose, cleanupClosedTabs };
```

- [x] **Step 4: Run the close-guard test and verify GREEN**

Run:

```bash
pnpm exec vitest run test/layouts/default/use-tab-close-guard.test.ts
```

Expected: PASS with zero failures.

---

### Task 4: Remove chat Runtime access from HeaderTabs

**Files:**
- Modify: `src/layouts/default/components/HeaderTabs.vue`
- Modify: `test/layouts/default/header-tabs-chat-status.test.ts`
- Modify: `test/layouts/default/header-tabs-structure.test.ts`

**Interfaces:**
- Consumes: `Tab.status?: TabStatus`.
- Consumes: `cleanupClosedTabs(tabIds: string[]): void`.
- Removes: `useChatTabRuntimeStore`, `ChatTabRuntimeStatus`, `CHAT_STATUS_MAP`, and `resolveTabStatus` from `HeaderTabs.vue`.

- [x] **Step 1: Rewrite HeaderTabs tests for the generic boundary**

Prepare statuses directly on test tabs instead of mutating the Runtime Store:

```ts
tabsStore.tabs = [
  { ...createTab('chat:running', '/chat/running'), status: 'loading' },
  { ...createTab('chat:waiting', '/chat/waiting'), status: 'attention' },
  { ...createTab('chat:error', '/chat/error'), status: 'error' },
  { ...createTab('chat:completed', '/chat/completed'), status: 'completed' },
  createTab('welcome', '/welcome')
];
```

Remove the HeaderTabs-specific completed/viewed test because `src/views/chat/index.vue` already owns and tests that behavior. Change the global title test to use `chat:session-a`, which can be resolved without Runtime ownership. Add source isolation:

```ts
const headerTabsSource = readFileSync('src/layouts/default/components/HeaderTabs.vue', 'utf8');

it('does not access the chat runtime store', (): void => {
  expect(headerTabsSource).not.toContain('useChatTabRuntimeStore');
  expect(headerTabsSource).not.toContain('ChatTabRuntimeStatus');
  expect(headerTabsSource).not.toContain('resolveTabStatus');
});
```

- [x] **Step 2: Run HeaderTabs tests and verify RED**

Run:

```bash
pnpm exec vitest run test/layouts/default/header-tabs-chat-status.test.ts test/layouts/default/header-tabs-structure.test.ts
```

Expected: FAIL because `HeaderTabs` still imports and reads the chat Runtime Store.

- [x] **Step 3: Make HeaderTabs consume only generic tab state**

Change the template to:

```vue
<HeaderTab :tab="item" :dragging="dragging" :status="item.status" @click="handleClickTab(item.path)" @close="handleCloseButton(item)" />
```

Delete the Runtime Store import, instance, mapping, resolver, and route watcher that calls `markViewed`. Update the title event handler to:

```ts
function handleChatTitleUpdated(payload: ChatSessionTitlePayload): void {
  tabsStore.updateTabTitle({ id: createChatTabId(payload.sessionId), title: payload.title });
}
```

Use the close-guard cleanup API after applying the plan:

```ts
const { canClose, cleanupClosedTabs } = useTabCloseGuard();

tabsStore.applyClosePlan(plan);
cleanupClosedTabs(plan.targetTabIds);
```

- [x] **Step 4: Run all HeaderTabs and chat page tests and verify GREEN**

Run:

```bash
pnpm exec vitest run \
  test/layouts/default/header-tab-status.test.ts \
  test/layouts/default/header-tabs-chat-status.test.ts \
  test/layouts/default/header-tabs-icon.test.ts \
  test/layouts/default/header-tabs-structure.test.ts \
  test/views/chat/index.test.ts
```

Expected: all five files PASS with zero failures.

---

### Task 5: Document and verify the complete change

**Files:**
- Modify: `changelog/2026-07-22.md`
- Modify: `docs/superpowers/plans/2026-07-22-generic-header-tab-status.md`

**Interfaces:**
- Verifies all preceding tasks as one feature.

- [x] **Step 1: Update the changelog**

Replace the existing generic status entry with:

```markdown
- 将顶部标签状态改为瞬时 `Tab.status` 写穿模型：状态来源在变化时同步通用 `TabStatus`，`HeaderTabs` 直接渲染标签状态且不再依赖聊天 Runtime Store；持久化快照会排除运行状态，并由关闭守卫统一清理已关闭聊天的 Runtime。
```

- [x] **Step 2: Run formatting and type verification**

Run:

```bash
pnpm lint
pnpm lint:style
pnpm exec tsc --noEmit
```

Expected: all commands exit with code 0 and ESLint reports no warnings.

- [x] **Step 3: Run focused and full tests**

Run:

```bash
pnpm exec vitest run \
  test/stores/workspace/tabs.test.ts \
  test/stores/chat/tab-runtime.test.ts \
  test/layouts/default/use-tab-close-guard.test.ts \
  test/layouts/default/header-tab-status.test.ts \
  test/layouts/default/header-tabs-chat-status.test.ts \
  test/layouts/default/header-tabs-icon.test.ts \
  test/layouts/default/header-tabs-structure.test.ts \
  test/views/chat/index.test.ts
pnpm exec vitest run --reporter=dot --silent=passed-only
```

Expected: focused tests and the full suite finish with zero failures.

- [x] **Step 4: Verify dependency and diff boundaries**

Run:

```bash
rg -n "useChatTabRuntimeStore|ChatTabRuntimeStatus|resolveTabStatus" src/layouts/default/components/HeaderTabs.vue
git diff --check
git status --short
```

Expected: the source scan returns no matches, `git diff --check` exits 0, files remain unstaged, and no commit is created.

## Plan Self-Review

- Spec coverage: transient generic status, mutation-time mapping, persistence exclusion, route-update preservation, draft migration, viewed clearing, close cleanup, HeaderTabs isolation, title behavior, tests, changelog, and no-commit requirements each have a concrete step.
- Placeholder scan: every implementation step includes exact types, signatures, code shape, commands, and expected outcomes; no deferred work remains.
- Type consistency: `TabStatus`, `Tab.status`, `setTabStatus`, `TAB_STATUS_MAP`, and `cleanupClosedTabs` use the same signatures throughout all tasks.
- Scope boundary: Runtime ownership and abort behavior stay in the chat Store; only presentation status ownership moves to the generic Tab model.

---

### Task 6: Resolve code-review findings at the status boundary

**Files:**
- Modify: `src/stores/workspace/tabs.ts`
- Modify: `src/stores/chat/tabRuntime.ts`
- Modify: `src/views/chat/index.vue`
- Modify: `test/stores/workspace/tabs.test.ts`
- Modify: `test/stores/chat/tab-runtime.test.ts`
- Modify: `test/views/chat/index.test.ts`
- Modify: `changelog/2026-07-22.md`

**Interfaces:**
- Produces: runtime `normalizeTab(tab: Tab): Tab`, which preserves a supplied `status`.
- Produces: persisted `normalizePersistedTab(tab: Tab): Tab`, which always removes `status`.
- Produces: `useChatTabRuntimeStore().syncStatus(tabId: string): void` for explicit page hydration.
- Preserves: `ensureTab(tabId: string, sessionId?: string): ChatTabRuntimeRecord` as a Runtime-record-only action.

- [x] **Step 1: Write failing Tabs Store tests**

Add one test that supplies `status: 'loading'` to a new `addTab` call and verifies the in-memory tab keeps it while persisted `app_tabs` does not. Add another test that replaces an `attention` source tab with a target carrying `status: 'error'` and verifies the explicit target status wins. Add a fresh-Pinia test proving Tabs Store default collections are not shared between instances.

- [x] **Step 2: Run the Tabs Store test and verify RED**

Run:

```bash
pnpm exec vitest run test/stores/workspace/tabs.test.ts
```

Expected: the new add test receives `undefined`, and the replacement test receives `attention`.

- [x] **Step 3: Split runtime and persisted normalization**

Make `normalizeTab` retain `tab.status`, add `normalizePersistedTab` that omits it, and use only the persisted variant from `normalizeTabsState`. In `addTab`, prefer the incoming status before the existing status. In `replaceTab`, prefer incoming, source, then duplicate-target status. Load copied arrays and maps for every Tabs Store instance.

- [x] **Step 4: Run the Tabs Store test and verify GREEN**

Run the Step 2 command again. Expected: all tests PASS and persisted data still excludes `status`.

- [x] **Step 5: Write failing Runtime purity and hydration tests**

Add one test proving `ensureTab`, `bindSession`, and `registerController` do not replace an existing generic status. Add another test proving `syncStatus` restores an existing Runtime status after its tab is created. Add a chat-page test proving the page calls this explicit hydration boundary during setup.

- [x] **Step 6: Run focused Runtime tests and verify RED**

Run:

```bash
pnpm exec vitest run test/stores/chat/tab-runtime.test.ts test/views/chat/index.test.ts
```

Expected: the purity test loses the prepared generic status and the hydration test fails because `syncStatus` does not exist.

- [x] **Step 7: Make record creation pure and hydration explicit**

Remove generic status writes from `ensureTab`, add guarded `syncStatus(tabId: string): void`, and call it from `src/views/chat/index.vue` immediately after the initial `ensureTab`. Keep all existing explicit status mutations writing through.

- [x] **Step 8: Verify, document, and inspect the diff**

Correct stale HeaderTabs-specific Runtime comments, update the changelog, run focused tests, `pnpm lint`, `pnpm lint:style`, `pnpm exec tsc --noEmit`, the full Vitest suite, and `git diff --check`. Expected: zero failures and no commit or staging operation.

## Remediation Self-Review

- Spec coverage: explicit incoming status, persisted status exclusion, replacement precedence, default-state isolation, Runtime setup purity, explicit hydration, page integration, comments, changelog, and verification all have concrete steps.
- Placeholder scan: Task 6 names every changed interface, expected failure, command, and success condition; no deferred implementation remains.
- Type consistency: `syncStatus(tabId: string): void`, `normalizeTab(tab: Tab): Tab`, and `normalizePersistedTab(tab: Tab): Tab` match the implemented public and private boundaries.
