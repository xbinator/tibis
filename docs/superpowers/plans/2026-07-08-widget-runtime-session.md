# Widget Runtime Session Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give display-time widgets one live runtime session so `onMounted` and user methods run on the same instance.

**Architecture:** Add a reusable sandbox session, then build `createWidgetRuntimeSession(state, host)` on top of it. Keep one-shot compatibility helpers by creating a short-lived session internally, while `BWidgetRuntime` owns a long-lived session for its component lifetime.

**Tech Stack:** TypeScript, Vue 3, Vitest, existing BWidget sandbox runtime.

---

## File Structure

- Modify `src/utils/sandbox/core.ts`: allow sandbox execution to reuse one shadow-global context.
- Modify `src/utils/sandbox/types.ts`: add `SandboxSession` and execution context types.
- Modify `src/utils/sandbox/index.ts`: export `createSandboxSession` while keeping `runSandboxCode` one-shot.
- Modify `src/utils/sandbox/worker.ts`: reuse one worker-side execution context for session runs.
- Modify `src/components/BWidget/utils/widgetRuntime/index.ts`: add `WidgetRuntimeSession`, `createWidgetRuntimeSession`, and method-name command support.
- Modify `src/components/BWidget/Runtime.vue`: hold one display session and expose `run(methodName, ...args)` through `useWidgetRuntime`.
- Modify `src/components/BWidget/hooks/useWidgetRuntime.ts`: add the method-call controller API.
- Modify `src/components/BChat/hooks/useRuntimeTools.ts`: use `executeWidgetRuntime` with host capabilities for `open_widget`.
- Modify tests under `test/utils`, `test/components/BChat`, and `test/components/BWidget`.
- Modify `changelog/2026-07-08.md`.

## Tasks

- [x] Add failing sandbox session tests for shared `globalThis` state and dispose behavior.
- [x] Implement shared sandbox execution context and `createSandboxSession`.
- [x] Add failing widget session tests for `mounted()` to `run(methodName)` instance continuity.
- [x] Implement `createWidgetRuntimeSession` and keep compatibility wrappers.
- [x] Update `BWidgetRuntime` to own/dispose one session and expose method-call controller API.
- [x] Update `useRuntimeTools` and logger tests away from the runner mental model.
- [x] Update changelog.
- [x] Run focused tests, lint, stylelint, and TypeScript checks.
