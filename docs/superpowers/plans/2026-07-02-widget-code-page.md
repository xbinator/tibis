# Widget Current-Page Code Editor Implementation Plan

> **For agentic workers:** Keep implementation scoped to the current-page editor. Do not add `/widget/:id/code`, a `widget-code` route, or an independent tab.

**Goal:** Move Widget interaction script editing from the PageSetter modal into an inline current-page `CodeEditor` with a close-only overlay.

**Architecture:** `PageSetter` emits an edit request, `PanelSettings` forwards it, and `src/views/widget/index.vue` displays `src/views/widget/components/CodeEditor.vue` in an overlay above the designer. The code editor owns a local Monaco draft, syncs script edits through `v-model:value`, and resets from the latest model when the overlay becomes active. The close button only hides the overlay.

**Tech Stack:** Vue 3 `<script setup>`, Pinia-backed `useFileSession`, BMonaco, Vitest, TypeScript.

---

### Task 1: Remove The Modal Editing Path

**Files:**
- Modify: `src/views/widget/components/PageSetter.vue`
- Modify: `src/views/widget/components/PanelSettings.vue`
- Delete if unused: `src/views/widget/components/PageSetter/MethodEditor.vue`
- Test: `test/views/widget/page-setter.test.ts`

- [x] Update PageSetter so the interaction script edit button emits `edit-code`.
- [x] Forward `edit-code` through PanelSettings.
- [x] Remove the unused MethodEditor modal.
- [x] Cover the emitted edit request in PageSetter tests.

### Task 2: Add Current-Page Editor Flow

**Files:**
- Create: `src/views/widget/components/CodeEditor.vue`
- Create: `src/views/widget/utils/widgetExecuteMethod.ts`
- Modify: `src/views/widget/index.vue`
- Test: `test/views/widget/code-editor.test.ts`
- Test: `test/views/widget/index.test.ts`

- [x] Add `CodeEditor` as a pure current-page editor component.
- [x] Render the “运行代码” title and close button at the top of `widget-code-page`.
- [x] Show `CodeEditor` through a page overlay while keeping the designer mounted.
- [x] Sync script edits through `v-model:value`.
- [x] Close hides the editor overlay without changing data by itself.
- [x] Cover type hints, live model sync, close behavior, and overlay behavior in tests.

### Task 3: Keep Save Behavior On Existing Session Path

**Files:**
- Modify: `src/hooks/useFileSession.ts`
- Test: `test/hooks/use-file-session.test.ts`

- [x] Keep dirty state tied to the existing widget file tab ID.
- [x] Serialize latest `data.value` into `fileState.content` before save.
- [x] Cover latest-data save behavior in hook tests.

### Task 4: Route And Verification Cleanup

**Files:**
- Modify: `src/router/routes/modules/widget.ts`
- Test: `test/router/widget-route.test.ts`
- Modify or create: `changelog/2026-07-02.md`

- [x] Confirm there is no separate `widget-code` route.
- [x] Update changelog for the current-page editor behavior.
- [ ] Run focused and full Vitest suites.
- [ ] Run ESLint, Stylelint, and TypeScript checks.
- [ ] Check worktree status without committing.
