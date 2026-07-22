# BChat Session Model CR Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the initial model-resolution race, execute the real SQLite metadata migration test in the standard test chain, and retire the contradictory temporary-model design document.

**Architecture:** `useModelSelection` owns a one-time initialization barrier for the global chat model and provider list, while the provider store coalesces concurrent storage reads. The regular Vitest suite remains Node-based, then a focused migration test runs through Electron's Node mode so `better-sqlite3` uses the matching ABI.

**Tech Stack:** Vue 3, Pinia, TypeScript, Vitest, Electron, better-sqlite3, pnpm.

## Global Constraints

- Do not stage or commit changes.
- Keep session metadata nullable and do not backfill legacy sessions.
- Use `asyncTo` for asynchronous error normalization in production code.
- Add JSDoc comments for new functions and interfaces.

---

### Task 1: Model Source Initialization Barrier

**Files:**
- Modify: `test/components/BChat/use-model-selection.test.ts`
- Modify: `src/components/BChat/hooks/useModelSelection.ts`
- Modify: `src/stores/ai/provider.ts`
- Create: `test/stores/ai/provider.test.ts`

**Interfaces:**
- Consumes: `serviceModelStore.loadChatModel(): Promise<void>` and `providerStore.loadProviders(): Promise<void>`.
- Produces: `resolveSelectedModel(): Promise<SelectedModel | undefined>` that waits for both sources and a coalesced provider load.

- [x] **Step 1: Add failing tests**

Add a deferred-source test proving `resolveSelectedModel` does not finish before both model sources load, plus a provider-store test proving concurrent `loadProviders` calls issue one storage read.

- [x] **Step 2: Verify RED**

Run:

```bash
pnpm exec vitest run test/components/BChat/use-model-selection.test.ts test/stores/ai/provider.test.ts
```

Expected: both new tests fail because Runtime resolution does not initialize sources and provider reads are not coalesced.

- [x] **Step 3: Implement the barrier**

Add a retryable one-time Promise inside `useModelSelection`, and route `loadSelectedModel` plus `resolveSelectedModel` through it. Add a module-level in-flight provider read that clears after settlement.

- [x] **Step 4: Verify GREEN**

Run the same focused Vitest command and expect both files to pass.

### Task 2: Executable SQLite Migration Test

**Files:**
- Modify: `package.json`

**Interfaces:**
- Produces: `pnpm run test:database`, executed through `ELECTRON_RUN_AS_NODE=1`, and chained after the normal `pnpm test` suite.

- [x] **Step 1: Add the Electron database test script**

Use Electron's Node mode to run only `test/electron/main/modules/database/session-metadata-migration.test.ts`, preserving the normal Node Vitest command for the rest of the suite.

- [x] **Step 2: Verify the migration executes**

Run:

```bash
pnpm run test:database
```

Expected: one migration test passes and none are skipped.

### Task 3: Documentation And Verification

**Files:**
- Modify: `docs/superpowers/specs/2026-07-22-bchat-session-model-override-design.md`
- Modify: `changelog/2026-07-22.md`

**Interfaces:**
- Produces: an explicit supersession notice pointing readers to `docs/superpowers/specs/2026-07-22-bchat-session-model-metadata-design.md`.

- [x] **Step 1: Mark the temporary design as superseded**

Add a note at the top without rewriting the historical proposal.

- [x] **Step 2: Record the CR fixes**

Document model initialization ordering and executable migration coverage in today's changelog.

- [x] **Step 3: Run verification**

Run focused tests, both TypeScript projects, ESLint without fixes, Stylelint without fixes, `git diff --check`, and the full `pnpm test` chain.
