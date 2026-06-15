# ChatSider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split default-layout chat sidebar shell responsibilities into `ChatSider`, while `BChat` becomes a `sessionId`-driven chat runtime that can create a session on first send.

**Architecture:** `src/layouts/default/components/ChatSider.vue` owns `BPanelSplitter`, header controls, `SessionHistory`, expanded/visible state, and active session title. `src/components/BChat/index.vue` receives `sessionId`, loads messages for it, emits `session-created` and `loading-change`, and internally creates a new session when the first message is sent from draft mode.

**Tech Stack:** Vue 3 Composition API, TypeScript strict mode, Pinia, Vitest, Vue Test Utils, Less.

---

### Task 1: ChatSider Session Hook

**Files:**
- Create: `src/layouts/default/hooks/useChatSiderSession.ts`
- Test: `test/layouts/default/use-chat-sider-session.test.ts`

- [ ] **Step 1: Write failing tests**

Create tests for:
- initializes latest assistant session when no active ID exists
- keeps current active ID and waits for `setCurrentSession`
- refuses switching while chat is loading
- clears active/current session when current session is deleted

- [ ] **Step 2: Run red test**

Run: `pnpm test test/layouts/default/use-chat-sider-session.test.ts`

Expected: fail because `useChatSiderSession` does not exist.

- [ ] **Step 3: Implement hook**

Implement `initialized`, `currentSession`, `loading`, `initializeActiveSession`, `switchSession`, `createDraftSession`, `handleDeletedSession`, and `setCurrentSession`.

- [ ] **Step 4: Run green test**

Run: `pnpm test test/layouts/default/use-chat-sider-session.test.ts`

Expected: pass.

### Task 2: ChatSider Component Shell

**Files:**
- Create: `src/layouts/default/components/ChatSider.vue`
- Test: `test/layouts/default/chat-sider.test.ts`

- [ ] **Step 1: Write failing tests**

Create tests for:
- renders `BChat` only after session hook initialization
- toggles expanded state from the header button
- closes sidebar through close button and resets expanded state when hidden
- passes active `sessionId` to `BChat`
- handles `session-created` by updating active session/current title and refreshing `SessionHistory`
- disables new session and history controls while chat loading

- [ ] **Step 2: Run red test**

Run: `pnpm test test/layouts/default/chat-sider.test.ts`

Expected: fail because `ChatSider.vue` does not exist.

- [ ] **Step 3: Implement component**

Move `BPanelSplitter`, header controls, `SessionHistory`, expanded behavior, close behavior, and shell styles from `BChat`.

- [ ] **Step 4: Run green test**

Run: `pnpm test test/layouts/default/chat-sider.test.ts`

Expected: pass.

### Task 3: BChat SessionId Runtime

**Files:**
- Modify: `src/components/BChat/index.vue`
- Modify: `src/components/BChat/utils/types.ts`
- Test: `test/components/BChat/session-id-runtime.test.ts`
- Delete: `test/components/BChat/sidebar-expand.test.ts`

- [ ] **Step 1: Write failing tests**

Create tests for:
- `sessionId = null` resets draft session state
- first submit with `sessionId = null` creates a session, emits `session-created`, and persists user message with the new ID
- prop回写同一个 `createdSessionId` 不重新加载历史
- `loading-change` reflects chat/compact/stream loading

- [ ] **Step 2: Run red test**

Run: `pnpm test test/components/BChat/session-id-runtime.test.ts`

Expected: fail because `BChat` does not yet expose this contract.

- [ ] **Step 3: Refactor BChat**

Remove sidebar shell/header/session-history responsibilities, add props/emits, replace direct `settingStore.chatSidebarActiveSessionId` reads with `activeSessionId`, and implement `ensureActiveSession`.

- [ ] **Step 4: Run green test**

Run: `pnpm test test/components/BChat/session-id-runtime.test.ts test/layouts/default/chat-sider.test.ts`

Expected: pass; expand coverage lives in `test/layouts/default/chat-sider.test.ts`.

### Task 4: Layout Integration

**Files:**
- Modify: `src/layouts/default/index.vue`
- Update: `test/layouts/default/header-tabs-structure.test.ts`

- [ ] **Step 1: Write/adjust failing assertion**

Ensure default layout imports and renders `ChatSider`, not `BChat`.

- [ ] **Step 2: Implement integration**

Replace `<BChat />` with `<ChatSider />` and update imports.

- [ ] **Step 3: Run focused layout tests**

Run: `pnpm test test/layouts/default/header-tabs-structure.test.ts test/layouts/default/chat-sider.test.ts`

Expected: pass.

### Task 5: Changelog and Verification

**Files:**
- Create or modify: `changelog/2026-06-15.md`

- [ ] **Step 1: Add changelog entry**

Record the refactor under `Changed`.

- [ ] **Step 2: Run focused tests**

Run:
- `pnpm test test/layouts/default/use-chat-sider-session.test.ts test/layouts/default/chat-sider.test.ts test/components/BChat/session-id-runtime.test.ts`
- `pnpm test test/components/BChat/use-chat-stream-persistence.test.ts test/layouts/default/header-tabs-structure.test.ts`

- [ ] **Step 3: Run project checks**

Run:
- `pnpm lint`
- `pnpm lint:style`
- `pnpm exec tsc --noEmit`

- [ ] **Step 4: Stop before commit**

Do not commit. Leave changes staged or unstaged for the final unified commit requested by the user.
