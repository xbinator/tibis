# Chat Session Collection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the paginated chat-session collection into `useChatSessionStore` so sessions created or changed in the independent chat page immediately appear in `SessionHistory` without component refresh calls.

**Architecture:** Pinia owns the only session array and its pagination metadata. Store persistence actions update that array after database success; `SessionHistory` renders the Store and emits only a load-more request, while ChatSider and ChatPage share the same idempotent initialization action.

**Tech Stack:** Vue 3, Pinia, TypeScript strict mode, Vue Test Utils, Vitest, lodash-es, Electron chat IPC.

## Global Constraints

- Do not add a history UI to `src/views/chat/index.vue`.
- Do not change chat route, tab ownership, draft promotion, or Runtime behavior.
- `SessionHistory` must not own a session collection, fetch its first page, or expose `refreshSessions`.
- All functions, interfaces, types, and complex logic require current JSDoc comments.
- Do not use `any`; all parameters and return values require explicit types.
- Use `asyncTo` for new asynchronous error normalization.
- Do not stage or commit; the user will create the final commit.

---

### Task 1: Make the session Store own the collection

**Files:**
- Modify: `src/stores/chat/session.ts`
- Modify: `test/stores/chat/session.test.ts`

**Interfaces:**
- Consumes: `PaginatedSessionsResult`, `SessionCursor`, `ChatSession`, existing Electron chat IPC methods.
- Produces: `sessions`, `sessionsLoading`, `sessionsLoaded`, `sessionsHasMore`, `sessionsNextCursor`, `findSession(sessionId)`, `ensureSessions()`, and `loadMoreSessions()` on `useChatSessionStore`.

- [x] **Step 1: Add failing initialization and pagination tests**

Extend the Electron API mock with `chatSessionList`, then add tests equivalent to:

```ts
it('loads the session collection once and appends later pages without duplicates', async (): Promise<void> => {
  mockElectronAPI.chatSessionList
    .mockResolvedValueOnce({ ok: true, data: { items: [sessionA], hasMore: true, nextCursor } })
    .mockResolvedValueOnce({ ok: true, data: { items: [sessionA, sessionB], hasMore: false } });
  const store = useChatSessionStore();

  await store.ensureSessions();
  await store.ensureSessions();
  await store.loadMoreSessions();

  expect(mockElectronAPI.chatSessionList).toHaveBeenCalledTimes(2);
  expect(store.sessions.map((session: ChatSession): string => session.id)).toEqual(['session-a', 'session-b']);
  expect(store.sessionsHasMore).toBe(false);
});
```

Add a deferred first-page request test that calls `createSession` before resolving `chatSessionList`, then asserts both the created session and fetched sessions remain in `store.sessions`.

- [x] **Step 2: Run Store tests and verify RED**

Run:

```bash
pnpm exec vitest run test/stores/chat/session.test.ts
```

Expected: FAIL because the collection state and `ensureSessions` / `loadMoreSessions` do not exist.

- [x] **Step 3: Add collection state and loading actions**

Convert the options Store to include typed state and getters while retaining existing actions:

```ts
interface ChatSessionState {
  sessions: ChatSession[];
  sessionsLoading: boolean;
  sessionsLoaded: boolean;
  sessionsHasMore: boolean;
  sessionsNextCursor?: SessionCursor;
}

state: (): ChatSessionState => ({
  sessions: [],
  sessionsLoading: false,
  sessionsLoaded: false,
  sessionsHasMore: true,
  sessionsNextCursor: undefined
}),
getters: {
  findSession: (state: ChatSessionState): ((sessionId?: string | null) => ChatSession | undefined) =>
    (sessionId?: string | null): ChatSession | undefined => state.sessions.find((session: ChatSession): boolean => session.id === sessionId)
}
```

Implement `ensureSessions()` and `loadMoreSessions()` using one private Store action that:

- rejects duplicate work through `sessionsLoading`;
- calls the existing database retry boundary with `{ limit: 20, cursor }`;
- merges by ID with `uniqBy` and sorts by `lastMessageAt || updatedAt || createdAt` descending;
- preserves sessions created during an in-flight request;
- changes `sessionsLoaded` only after a successful first page;
- preserves collection and pagination state after failure.

- [x] **Step 4: Add failing persistence synchronization tests**

Add focused tests for each successful action:

```ts
expect((await store.createSession('assistant')).id).toBe(store.sessions[0]?.id);
expect(store.sessions).toContainEqual(branchedSession);
await store.updateSessionTitle('session-a', '新标题');
expect(store.findSession('session-a')?.title).toBe('新标题');
await store.deleteSession('session-a');
expect(store.findSession('session-a')).toBeUndefined();
```

Also reject each mocked IPC call and assert its failed action does not mutate `sessions`.

- [x] **Step 5: Run Store tests and verify synchronization RED**

Run:

```bash
pnpm exec vitest run test/stores/chat/session.test.ts
```

Expected: loading tests PASS; CRUD collection assertions FAIL because persistence actions do not update Store state yet.

- [x] **Step 6: Synchronize persistence actions after success**

Add private Store actions with exact responsibilities:

```ts
upsertSession(session: ChatSession): void
removeSession(sessionId: string): void
touchSession(sessionId: string, lastMessageAt: string): void
```

Call `upsertSession` after successful `createSession` and `branchSession`, patch the matching item after successful `updateSessionTitle`, call `removeSession` after successful `deleteSession`, and call `touchSession` after a successfully added persisted message. Never mutate the collection before `unwrap` succeeds.

- [x] **Step 7: Run Store tests and verify GREEN**

Run:

```bash
pnpm exec vitest run test/stores/chat/session.test.ts
```

Expected: all Store tests PASS with zero failures.

---

### Task 2: Make SessionHistory a Store-backed view

**Files:**
- Modify: `src/components/BChat/components/SessionHistory.vue`
- Modify: `test/components/BChat/session-history.test.ts`

**Interfaces:**
- Consumes: `chatStore.sessions`, `chatStore.sessionsLoading`, `chatStore.sessionsHasMore`, and `chatStore.deleteSession(sessionId)`.
- Produces: `switch-session`, `delete-session`, and `load-more` events; no `update:currentSession` event and no exposed instance API.

- [x] **Step 1: Rewrite component tests for Store-backed rendering**

Change the Store mock to contain reactive-compatible values and remove `getSessions`:

```ts
const chatStoreMock = vi.hoisted(() => ({
  sessions: [] as ChatSession[],
  sessionsLoading: false,
  sessionsHasMore: true,
  deleteSession: vi.fn<(sessionId: string) => Promise<void>>()
}));
```

Add tests that assert:

- a session assigned to `chatStoreMock.sessions` is rendered without calling a fetch method;
- the captured `useInfiniteScroll` callback emits `load-more` only when `sessionsHasMore` is true;
- `wrapper.vm` has no `refreshSessions` property;
- existing busy, idle, deletion success, and deletion error behavior remains.

- [x] **Step 2: Run SessionHistory tests and verify RED**

Run:

```bash
pnpm exec vitest run test/components/BChat/session-history.test.ts
```

Expected: FAIL because the component still calls `getSessions`, owns local state, and exposes `refreshSessions`.

- [x] **Step 3: Remove local loading and refresh responsibilities**

In `SessionHistory.vue`:

- render `chatStore.sessions` instead of `displayedSessions`;
- render `chatStore.sessionsLoading` instead of local `loading`;
- remove `SessionCursor`, `SessionPaginationParams`, `onMounted`, `watch`, `message`-based loading errors, local pagination refs, `loadSessions`, `refreshSessions`, current-session computation, and `defineExpose`;
- remove `update:currentSession` from `defineEmits`;
- keep grouping derived from `chatStore.sessions`;
- make the infinite-scroll callback emit `load-more` when `chatStore.sessionsHasMore` and not loading;
- rely on Store deletion to remove the item instead of manually mutating a component array.

The resulting event contract is:

```ts
const emit = defineEmits<{
  (e: 'switch-session', sessionId: string): void;
  (e: 'delete-session', sessionId: string): void;
  (e: 'load-more'): void;
}>();
```

- [x] **Step 4: Run SessionHistory tests and verify GREEN**

Run:

```bash
pnpm exec vitest run test/components/BChat/session-history.test.ts
```

Expected: all SessionHistory tests PASS with zero failures.

---

### Task 3: Remove ChatSider's duplicate current-session state

**Files:**
- Modify: `src/layouts/default/hooks/useChatSession.ts`
- Modify: `src/layouts/default/components/ChatSider.vue`
- Modify: `test/layouts/default/use-chat-session.test.ts`
- Modify: `test/layouts/default/chat-sider.test.ts`

**Interfaces:**
- Consumes: `chatStore.ensureSessions()`, `chatStore.loadMoreSessions()`, `chatStore.findSession(sessionId)`, and existing selection settings.
- Produces: a ChatSider with Store-derived title and no dependency on SessionHistory instance methods.

- [x] **Step 1: Change useChatSession tests to require selection-only state**

Remove `ChatSession` fixtures and assertions for `currentSession` / `setCurrentSession`. Keep the busy-switch test and change deletion coverage to assert only the active ID transition:

```ts
session.handleDeletedSession('session-deleted');
expect(settingStore.chatSidebarActiveSessionId).toBeNull();
expect('currentSession' in session).toBe(false);
```

- [x] **Step 2: Change ChatSider tests to require Store synchronization**

Update `chatStoreMock` to provide:

```ts
sessions: [] as ChatSession[],
sessionsLoading: false,
findSession: vi.fn<(sessionId?: string | null) => ChatSession | undefined>(),
ensureSessions: vi.fn<() => Promise<void>>(),
loadMoreSessions: vi.fn<() => Promise<void>>(),
updateSessionTitle: vi.fn<(sessionId: string, title: string) => Promise<void>>()
```

Remove the SessionHistory expose mock and all `sessionHistoryRefreshMock` expectations. Add assertions that mounting calls `ensureSessions`, `load-more` calls `loadMoreSessions`, and changing the Store-returned session title updates the header without an `update:currentSession` event.

- [x] **Step 3: Run hook and ChatSider tests and verify RED**

Run:

```bash
pnpm exec vitest run test/layouts/default/use-chat-session.test.ts test/layouts/default/chat-sider.test.ts
```

Expected: FAIL because the hook still exposes local current-session state and ChatSider still calls `refreshSessions`.

- [x] **Step 4: Simplify useChatSession and connect ChatSider**

Remove `currentSession` and `setCurrentSession` from `ChatSessionApi` and implementation. In ChatSider:

```ts
const currentSession = computed<ChatSession | undefined>(() => chatStore.findSession(settingStore.chatSidebarActiveSessionId));

onMounted((): void => {
  asyncTo(chatStore.ensureSessions());
});

function loadMoreSessions(): void {
  asyncTo(chatStore.loadMoreSessions());
}
```

Remove `sessionHistoryRef`, `v-model:current-session`, every manual refresh call, and manual object updates after creation or title persistence. Bind `@load-more="loadMoreSessions"` on `SessionHistory`. Keep side selection, tab cleanup, and title-edit persistence behavior unchanged.

- [x] **Step 5: Run hook and ChatSider tests and verify GREEN**

Run:

```bash
pnpm exec vitest run test/layouts/default/use-chat-session.test.ts test/layouts/default/chat-sider.test.ts
```

Expected: both test files PASS with zero failures.

---

### Task 4: Initialize the collection from ChatPage and verify integration

**Files:**
- Modify: `src/views/chat/index.vue`
- Modify: `test/views/chat/index.test.ts`
- Create: `changelog/2026-07-22.md`

**Interfaces:**
- Consumes: `chatStore.ensureSessions()` from Task 1.
- Produces: idempotent collection initialization from either chat host and documented user-visible synchronization.

- [x] **Step 1: Add a failing ChatPage initialization test**

Mock `useChatSessionStore` and assert the shared action runs on mount:

```ts
it('ensures the shared session collection on mount', async (): Promise<void> => {
  mountPage('session-a');
  await flushPromises();
  expect(ensureSessionsMock).toHaveBeenCalledTimes(1);
});
```

Keep all existing tab ownership, promotion, routing, and Runtime assertions.

- [x] **Step 2: Run ChatPage tests and verify RED**

Run:

```bash
pnpm exec vitest run test/views/chat/index.test.ts
```

Expected: the new initialization test FAILS because ChatPage does not use the session Store.

- [x] **Step 3: Initialize the shared collection from ChatPage**

Import `useChatSessionStore`, create `chatStore`, and extend the existing `onMounted` callback:

```ts
onMounted((): void => {
  runtimeStore.registerController(ownerTabId.value, runtimeController);
  asyncTo(chatStore.ensureSessions());
});
```

Do not add SessionHistory markup or alter any chat-page event behavior.

- [x] **Step 4: Run the focused regression suite**

Run:

```bash
pnpm exec vitest run \
  test/stores/chat/session.test.ts \
  test/components/BChat/session-history.test.ts \
  test/layouts/default/use-chat-session.test.ts \
  test/layouts/default/chat-sider.test.ts \
  test/views/chat/index.test.ts
```

Expected: all selected test files PASS with zero failures.

- [x] **Step 5: Record the change**

Create `changelog/2026-07-22.md` with:

```md
# 2026-07-22

## Changed

- 将聊天会话集合、分页状态和加载状态统一收敛到 `useChatSessionStore`，聊天页创建、分支、改名或删除会话后会实时同步侧栏历史列表，并移除 `SessionHistory` 的局部数据加载与 `refreshSessions` 暴露接口。
```

- [x] **Step 6: Run full verification without committing**

Run:

```bash
pnpm lint
pnpm lint:style
pnpm exec tsc --noEmit
pnpm exec vitest run
git diff --check
git status --short
```

Expected: lint, style, type check, all tests, and whitespace validation exit with code 0. Git status contains only unstaged or untracked work for this change; no files are staged or committed.

### Task 5: Remove duplicate host and view guards

**Files:**
- Modify: `src/views/chat/index.vue`
- Modify: `src/components/BChat/components/SessionHistory.vue`
- Modify: `src/layouts/default/hooks/useChatSession.ts`
- Modify: `src/layouts/default/components/ChatSider.vue`
- Modify: `test/views/chat/index.test.ts`
- Modify: `test/components/BChat/session-history.test.ts`
- Modify: `test/layouts/default/use-chat-session.test.ts`
- Modify: `changelog/2026-07-22.md`

**Interfaces:**
- Consumes: Store-owned `ensureSessions()`, guarded `loadMoreSessions()`, and `findSession(sessionId)`.
- Produces: silent ChatPage initialization, unconditional `load-more` events, and `currentSession: ComputedRef<ChatSession | undefined>` from `useChatSession`.

- [x] **Step 1: Write failing simplification tests**

Add these behavior contracts:

```ts
it('keeps shared session initialization silent when loading fails', async (): Promise<void> => {
  ensureSessionsMock.mockRejectedValue(new Error('load failed'));
  mountPage('session-a');
  await flushPromises();
  expect(messageErrorMock).not.toHaveBeenCalled();
});

it('always delegates infinite-scroll requests to the Store owner', (): void => {
  chatStoreMock.sessionsHasMore = false;
  chatStoreMock.sessionsLoading = true;
  const wrapper = mountHistory();
  infiniteScrollState.callback?.();
  expect(wrapper.emitted('load-more')).toEqual([[]]);
});

it('derives the current session from the shared Store', (): void => {
  const session = useChatSession({ isChatLoading: () => false });
  chatStore.sessions = [currentSession];
  settingStore.setChatSidebarActiveSessionId(currentSession.id);
  expect(session.currentSession.value).toEqual(currentSession);
});
```

- [x] **Step 2: Run tests and verify RED**

Run:

```bash
pnpm exec vitest run \
  test/views/chat/index.test.ts \
  test/components/BChat/session-history.test.ts \
  test/layouts/default/use-chat-session.test.ts
```

Expected: ChatPage calls `message.error`, SessionHistory suppresses the event, and `useChatSession.currentSession` is missing.

- [x] **Step 3: Implement the minimal simplification**

Apply the exact responsibility changes:

```ts
// ChatPage onMounted
asyncTo(chatStore.ensureSessions());

// SessionHistory infinite-scroll callback
emit('load-more');

// useChatSession
const currentSession = computed<ChatSession | undefined>(() => chatStore.findSession(settingStore.chatSidebarActiveSessionId));
return { currentSession, switchSession, createDraftSession, handleDeletedSession };
```

Remove ChatPage's `message` import and local `ensureSessions` wrapper. Remove the duplicate `currentSession` computation and unused `ChatSession` type import from ChatSider.

- [x] **Step 4: Run focused tests and verify GREEN**

Run:

```bash
pnpm exec vitest run \
  test/views/chat/index.test.ts \
  test/components/BChat/session-history.test.ts \
  test/layouts/default/use-chat-session.test.ts \
  test/layouts/default/chat-sider.test.ts
```

Expected: all four test files PASS with zero failures.

- [x] **Step 5: Update changelog and verify all checks**

Extend the existing Changed item to state that ChatPage initialization is silent, pagination guards live only in the Store, and `currentSession` is exposed by `useChatSession`. Then run:

```bash
pnpm lint
pnpm lint:style
pnpm exec tsc --noEmit
pnpm exec vitest run
git diff --check
git status --short
```

Expected: every verification command exits with code 0, no file is staged, and no commit is created.

## Plan Self-Review

- Spec coverage: Store ownership, pagination, in-flight merging, CRUD synchronization, SessionHistory responsibility removal, both-host initialization, silent ChatPage loading, Store-only pagination guards, derived `currentSession`, testing, changelog, and no-commit constraints each map to a task.
- Placeholder scan: every code-edit step contains concrete signatures, behavior, commands, and expected results.
- Type consistency: `ensureSessions`, `loadMoreSessions`, `findSession`, `currentSession`, `sessionsLoading`, `sessionsLoaded`, `sessionsHasMore`, and `sessionsNextCursor` use the same names in all tasks.
- Scope boundary: no task adds chat-page history UI or changes route, tab ownership, draft promotion, or Runtime behavior.
