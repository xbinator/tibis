# HeaderTabMenu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a single-instance `HeaderTabMenu` context menu for tab close actions plus file path and WebView address copy actions.

**Architecture:** `HeaderTabs.vue` owns one context-menu state and renders one `HeaderTabMenu`. `HeaderTab.vue` only emits right-click events. `src/layouts/default/utils/headerTabMenu.ts` keeps resource-copy resolution pure and testable.

**Tech Stack:** Vue 3 `<script setup>`, Pinia, Vue Router, Vitest, Vue Test Utils, existing `useClipboard`, existing `tabsStore.getClosePlan()` and `useTabCloseGuard()`.

## Global Constraints

- Do not wrap each tab with `BDropdown`; render exactly one `HeaderTabMenu`.
- `HeaderTabMenu` menu items are text-only and do not render icons.
- `HeaderTabMenu` may animate opacity/scale, but must not transition `left` or `top` coordinates.
- File copy uses recent document record `path`, not `/editor/:id` or `/widget/:id`.
- WebView copy uses recent WebView record `url`, falling back to decoded route query `url`.
- No `any` types.
- Async operations use `asyncTo()` in async contexts.
- All new files include file header comments and JSDoc comments for exported types/functions.
- Update `changelog/2026-07-23.md`.

---

## File Structure

- Create `src/layouts/default/utils/headerTabMenu.ts`: pure utilities for menu command keys, recent-record lookup, WebView URL parsing, and resource copy action resolution.
- Create `src/layouts/default/components/HeaderTabMenu.vue`: single floating context menu component.
- Modify `src/layouts/default/components/HeaderTab.vue`: emit `contextmenu` from the tab root.
- Modify `src/layouts/default/components/HeaderTabs.vue`: maintain single menu state, build menu entries, execute close/copy commands.
- Test `test/layouts/default/header-tab-menu-utils.test.ts`: pure utility behavior.
- Test `test/layouts/default/header-tab-menu.component.test.ts`: floating menu select/close behavior.
- Modify `test/layouts/default/header-tab-status.test.ts`: verify `HeaderTab` emits `contextmenu`.
- Test `test/layouts/default/header-tabs-menu.test.ts`: integration for single menu, close actions, and copy actions.
- Modify `test/layouts/default/header-tabs-structure.test.ts`: static guard against per-tab `BDropdown`.
- Modify `changelog/2026-07-23.md`: record the feature.

## Task 1: HeaderTab Menu Utilities

**Files:**
- Create: `src/layouts/default/utils/headerTabMenu.ts`
- Test: `test/layouts/default/header-tab-menu-utils.test.ts`

**Interfaces:**
- Produces:
  - `export type HeaderTabMenuCommand = 'close' | 'closeOthers' | 'closeRight' | 'closeAll' | 'copyPath' | 'copyAddress';`
  - `export interface HeaderTabCopyAction { command: 'copyPath' | 'copyAddress'; content: string; successMessage: string; }`
  - `export function getHeaderTabCopyAction(tab: Tab, records: RecentRecord[]): HeaderTabCopyAction | null`
  - `export function getWebviewUrlFromTabPath(path: string): string`

- [ ] **Step 1: Write failing utility tests**

Create `test/layouts/default/header-tab-menu-utils.test.ts` with cases for complex file paths, missing file paths, WebView recent records, WebView route fallback, and non-resource tabs.

- [ ] **Step 2: Run the failing utility tests**

Run: `pnpm exec vitest run test/layouts/default/header-tab-menu-utils.test.ts`

Expected: FAIL because `@/layouts/default/utils/headerTabMenu` does not exist.

- [ ] **Step 3: Implement utilities**

Create `src/layouts/default/utils/headerTabMenu.ts` with pure typed helpers. Use `createRecentKey()` and `isDocumentRecord()` from `@/shared/storage`.

- [ ] **Step 4: Run utility tests**

Run: `pnpm exec vitest run test/layouts/default/header-tab-menu-utils.test.ts`

Expected: PASS.

## Task 2: HeaderTab Right-Click Event

**Files:**
- Modify: `src/layouts/default/components/HeaderTab.vue`
- Modify test: `test/layouts/default/header-tab-status.test.ts`

**Interfaces:**
- Produces: `HeaderTab` emits `contextmenu` with the original `MouseEvent`.
- Consumes: Task 4 listens to `@contextmenu="handleTabContextMenu(item, $event)"`.

- [ ] **Step 1: Write failing component test**

Add a `HeaderTab` test that triggers `contextmenu` on `.header-tab` and expects a `contextmenu` emission with a `MouseEvent`.

- [ ] **Step 2: Run the failing test**

Run: `pnpm exec vitest run test/layouts/default/header-tab-status.test.ts`

Expected: FAIL because `HeaderTab` does not emit `contextmenu`.

- [ ] **Step 3: Implement event emit**

Extend `defineEmits` in `HeaderTab.vue` and add `@contextmenu.prevent="emit('contextmenu', $event)"` to the root element.

- [ ] **Step 4: Run the test**

Run: `pnpm exec vitest run test/layouts/default/header-tab-status.test.ts`

Expected: PASS.

## Task 3: HeaderTabMenu Component

**Files:**
- Create: `src/layouts/default/components/HeaderTabMenu.vue`
- Test: `test/layouts/default/header-tab-menu.component.test.ts`

**Interfaces:**
- Produces:
  - `HeaderTabMenuEntry`, `HeaderTabMenuItem`, and `HeaderTabMenuPosition` local interfaces.
  - Props: `open`, `position`, `items`.
  - Emits: `select`, `close`.
- Consumes: Task 4 passes generated menu entries and handles selected command keys.

- [ ] **Step 1: Write failing menu component tests**

Create tests that mount the component, click an enabled item, confirm disabled items do not emit `select`, confirm Escape emits `close`, and confirm menu items render without icons.

- [ ] **Step 2: Run the failing tests**

Run: `pnpm exec vitest run test/layouts/default/header-tab-menu.component.test.ts`

Expected: FAIL because `HeaderTabMenu.vue` does not exist.

- [ ] **Step 3: Implement HeaderTabMenu**

Implement a fixed-position menu modeled after `src/components/BWidget/components/ContextMenu.vue`, with `header-tab-menu` class names and viewport clamping.

- [ ] **Step 4: Run the menu tests**

Run: `pnpm exec vitest run test/layouts/default/header-tab-menu.component.test.ts`

Expected: PASS.

## Task 4: HeaderTabs Integration

**Files:**
- Modify: `src/layouts/default/components/HeaderTabs.vue`
- Test: `test/layouts/default/header-tabs-menu.test.ts`
- Modify test: `test/layouts/default/header-tabs-structure.test.ts`

**Interfaces:**
- Consumes:
  - `HeaderTab` emits `contextmenu`.
  - `HeaderTabMenu` props/events from Task 3.
  - `getHeaderTabCopyAction()` from Task 1.
- Produces:
  - `HeaderTabs` renders one `HeaderTabMenu`.
  - `HeaderTabs` executes close and copy commands from the menu.

- [ ] **Step 1: Write failing HeaderTabs integration tests**

Create `test/layouts/default/header-tabs-menu.test.ts` with stubs for `BDraggable`, `HeaderTabMenu`, `useClipboard`, route/router, and recent store. Cover:

- one menu instance rendered for multiple tabs
- right-click opens menu for the clicked tab
- `closeOthers`, `closeRight`, and `closeAll` go through `tabsStore.getClosePlan()`
- file copy calls `clipboard(path, { successMessage: '已复制路径', trim: false })`
- WebView copy calls `clipboard(url, { successMessage: '已复制地址', trim: false })`

- [ ] **Step 2: Run the failing integration tests**

Run: `pnpm exec vitest run test/layouts/default/header-tabs-menu.test.ts`

Expected: FAIL because `HeaderTabs` does not render `HeaderTabMenu`.

- [ ] **Step 3: Implement HeaderTabs integration**

Add single menu state, computed active menu tab, menu item generation, `handleTabContextMenu`, `closeTabMenu`, `handleTabMenuSelect`, `executeCloseAction`, and `executeCopyAction`.

- [ ] **Step 4: Update static structure guard**

Extend `test/layouts/default/header-tabs-structure.test.ts` to assert the source contains `HeaderTabMenu` and does not contain `trigger="contextmenu"` or a `BDropdown` wrapper around `HeaderTab`.

- [ ] **Step 5: Run integration and structure tests**

Run: `pnpm exec vitest run test/layouts/default/header-tabs-menu.test.ts test/layouts/default/header-tabs-structure.test.ts`

Expected: PASS.

## Task 5: Changelog and Verification

**Files:**
- Modify: `changelog/2026-07-23.md`

**Interfaces:**
- Consumes: completed implementation from Tasks 1-4.
- Produces: project changelog entry and verification evidence.

- [ ] **Step 1: Update changelog**

Add a `## Added` bullet for `HeaderTabMenu` right-click close/copy actions.

- [ ] **Step 2: Run focused tests**

Run:

```bash
pnpm exec vitest run test/layouts/default/header-tab-menu-utils.test.ts test/layouts/default/header-tab-menu.component.test.ts test/layouts/default/header-tab-status.test.ts test/layouts/default/header-tabs-menu.test.ts test/layouts/default/header-tabs-structure.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run type check**

Run: `pnpm exec tsc --noEmit`

Expected: PASS.

- [ ] **Step 4: Run lint**

Run: `pnpm lint`

Expected: PASS or only auto-fixed files related to this change.

- [ ] **Step 5: Review diff**

Run: `git diff --stat` and `git diff -- src/layouts/default test/layouts/default changelog/2026-07-23.md`

Expected: only planned files changed.
