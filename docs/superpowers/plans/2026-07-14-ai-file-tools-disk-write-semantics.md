# AI File Tools Disk Write Semantics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development and superpowers:verification-before-completion. 所有改动保持未提交。

**Goal:** Make `write_file` and `edit_file` persist every real filesystem target directly and atomically in the main process, while retaining renderer bridge behavior only for `unsaved://` drafts.

**Architecture:** Shared registry files own model-facing schemas and descriptions. `FileTool/index.mts` distinguishes draft targets from real paths before any bridge call. Real paths read only from disk and write through a small `atomically.writeFile()` wrapper; drafts retain the existing renderer bridge. Editor state is outside the file tools' success contract.

**Tech Stack:** TypeScript, Electron main process, Vitest, Node `fs/promises`, direct `atomically` dependency.

---

### Task 1: Registry Contracts

**Files:**
- Modify: `shared/ai/tools/FileReadTool/index.ts`
- Modify: `shared/ai/tools/FileWriteTool/index.ts`
- Modify: `shared/ai/tools/FileEditTool/index.ts`
- Test: `test/ai/tools/tool-registry.test.ts`

- [x] **Step 1: Add failing tests for required `read_file.path` and the four tool selection descriptions**
- [x] **Step 2: Run the focused registry test and verify expected failures**
- [x] **Step 3: Rewrite descriptions and mark `read_file.path` required**
- [x] **Step 4: Run the focused registry test and verify it passes**

### Task 2: Real Disk Semantics

**Files:**
- Modify: `electron/main/modules/chat/runtime/tools/FileTool/index.mts`
- Test: `test/electron/main/modules/chat/runtime/main-tools.test.ts`

- [x] **Step 1: Add failing tests for nested file creation and complete overwrite**
- [x] **Step 2: Add failing tests proving real `write_file` and `edit_file` never call renderer bridge**
- [x] **Step 3: Add failing tests for disk-based exact replacement, missing edit targets, and cancelled writes**
- [x] **Step 4: Run focused main-process tests and verify expected failures**
- [x] **Step 5: Add direct `atomically` dependency**
- [x] **Step 6: Add a typed, documented atomic text writer wrapper**
- [x] **Step 7: Refactor real `write_file` to confirm and write directly to disk**
- [x] **Step 8: Refactor real `edit_file` to read, replace, confirm, and write directly to disk**
- [x] **Step 9: Run focused main-process tests and verify they pass**

### Task 3: Draft Regression Coverage

**Files:**
- Modify: `test/electron/main/modules/chat/runtime/main-tools.test.ts`
- Modify only if required: `electron/main/modules/chat/runtime/tools/FileTool/index.mts`

- [x] **Step 1: Add tests for `write_file` and `edit_file` `unsaved://` bridge behavior**
- [x] **Step 2: Add a test for no-workspace relative `write_file` draft fallback**
- [x] **Step 3: Run focused tests and verify draft behavior remains green**

### Task 4: Documentation And Verification

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `docs/ai-tools/tool-development-guide.md`
- Modify: `changelog/2026-07-14.md`

- [x] **Step 1: Update the tool development guide with real-path disk success semantics**
- [x] **Step 2: Add the changelog entry**
- [x] **Step 3: Run registry and main-process file tool tests**
- [x] **Step 4: Run `pnpm exec tsc --noEmit`**
- [x] **Step 5: Run `pnpm exec eslint` on changed source and test files**
- [x] **Step 6: Run `pnpm lint:style` only if style files changed**
- [x] **Step 7: Review the final diff and leave all changes unstaged and uncommitted**

### Task 5: Confirmation-Time Conflict Protection

**Files:**
- Modify: `electron/main/modules/chat/runtime/tools/FileTool/index.mts`
- Test: `test/electron/main/modules/chat/runtime/main-tools.test.ts`

- [x] **Step 1: Add failing tests that create or modify a `write_file` target during confirmation**
- [x] **Step 2: Add failing tests that modify or delete an `edit_file` target during confirmation**
- [x] **Step 3: Run the focused tests and verify stale full-content writes still occur**
- [x] **Step 4: Add a canonical-path queue around post-confirmation revalidation and atomic writing**
- [x] **Step 5: Return `STALE_CONTEXT` when existence or content differs from the confirmed snapshot**
- [x] **Step 6: Run the focused tests and verify no stale state is overwritten or recreated**

### Task 6: Real Write Destination Boundary

**Files:**
- Modify: `electron/main/modules/chat/runtime/tools/FileTool/index.mts`
- Test: `test/electron/main/modules/chat/runtime/main-tools.test.ts`

- [x] **Step 1: Add failing tests for an existing file symlink and a new file below a directory symlink**
- [x] **Step 2: Verify confirmation currently reports both targets as workspace-internal paths**
- [x] **Step 3: Resolve the existing target or nearest existing ancestor with `realpath`**
- [x] **Step 4: Classify, display, write, and report the canonical destination**
- [x] **Step 5: Run the focused tests and verify both symlink cases require `dangerous` confirmation**

### Task 7: Platform And Failure Coverage

**Files:**
- Modify: `electron/main/modules/chat/runtime/tools/FileTool/index.mts`
- Modify: `test/electron/main/modules/chat/runtime/main-tools.test.ts`
- Create: `test/electron/main/modules/chat/runtime/file-paths.test.ts`
- Create: `test/electron/main/modules/chat/runtime/atomic-write.test.ts`

- [x] **Step 1: Add Windows drive and UNC absolute-path classification tests**
- [x] **Step 2: Add a direct `atomically` failure test that verifies temporary-file cleanup**
- [x] **Step 3: Assert full `unsaved://` bridge write payloads**
- [x] **Step 4: Mention parent-directory creation in new-file confirmation text**
- [x] **Step 5: Complete JSDoc and update documentation/changelog**
- [x] **Step 6: Run focused and full verification without staging or committing changes**
