# Glob Grep Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add main-process `glob` and `grep` AI tools backed by Node file walking, `picomatch`, and system `grep`.

**Architecture:** Shared tool schemas live in `shared/ai/tools/FileReadTool/index.ts`; `FileTool/index.mts` validates and routes execution; `file-search.mts` owns walking, glob filtering, grep batching, and parsing; `subprocess-runner.mts` owns bounded subprocess lifecycle.

**Tech Stack:** TypeScript, Electron main process modules, Vitest, `picomatch`, Node `child_process`, Node `fs/promises`.

---

### Task 1: Registry And Schema

**Files:**
- Modify: `shared/ai/tools/FileReadTool/index.ts`
- Modify: `shared/ai/tools/index.ts`
- Modify: `src/ai/tools/catalog/runtimeTools.ts`
- Test: `test/ai/tools/tool-registry.test.ts`
- Test: `test/ai/tools/builtin-main-process-tool.test.ts`

- [ ] **Step 1: Write failing registry tests**
- [ ] **Step 2: Run focused registry tests and verify failure**
- [ ] **Step 3: Add shared registry entries and exports**
- [ ] **Step 4: Add catalog convenience exports**
- [ ] **Step 5: Run focused registry tests and verify pass**

### Task 2: Search Helpers

**Files:**
- Create: `electron/main/modules/chat/runtime/tools/subprocess-runner.mts`
- Create: `electron/main/modules/chat/runtime/tools/file-search.mts`
- Test: `test/electron/main/modules/chat/runtime/file-search.test.ts`

- [ ] **Step 1: Write failing helper tests for glob, parser, timeout, and caps**
- [ ] **Step 2: Run focused helper tests and verify failure**
- [ ] **Step 3: Implement bounded subprocess runner**
- [ ] **Step 4: Implement file walking, picomatch filtering, grep batching, and parser**
- [ ] **Step 5: Run focused helper tests and verify pass**

### Task 3: FileTool Integration

**Files:**
- Modify: `electron/main/modules/chat/runtime/tools/constants.mts`
- Modify: `electron/main/modules/chat/runtime/tools/types.mts`
- Modify: `electron/main/modules/chat/runtime/tools/FileTool/index.mts`
- Test: `test/electron/main/modules/chat/runtime/main-tools.test.ts`

- [ ] **Step 1: Write failing main tool tests for glob/grep behavior and permissions**
- [ ] **Step 2: Run focused main tool tests and verify failure**
- [ ] **Step 3: Normalize inputs and route tools through file search helpers**
- [ ] **Step 4: Run focused main tool tests and verify pass**

### Task 4: Dependency, Changelog, Verification

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `changelog/2026-07-08.md`

- [ ] **Step 1: Add direct `picomatch` dependency**
- [ ] **Step 2: Record changelog entry**
- [ ] **Step 3: Run focused tests**
- [ ] **Step 4: Run TypeScript check**
- [ ] **Step 5: Run lint if time permits**
