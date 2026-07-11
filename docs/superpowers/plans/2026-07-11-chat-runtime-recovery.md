# Chat Runtime Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow a rebuilt Electron renderer to discover active main-process ChatRuntime tasks, reconstruct the XState actor tree, and replay pending renderer interactions without restarting or duplicating those tasks.

**Architecture:** The main process remains the execution source of truth and exposes cloneable recovery snapshots for active runtimes and pending renderer requests. The application-level renderer listener hydrates Supervisor/Session/Turn/Agent actors before routing replayed requests; BChat upgrades recovered runtimes from degraded capabilities to the current matching renderer tools when the session UI becomes available.

**Tech Stack:** Electron IPC, TypeScript, Vue 3, XState 5, Vitest

---

### Task 1: Define Recovery Contracts

**Files:**
- Modify: `types/chat-runtime.d.ts`
- Modify: `types/electron-api.d.ts`
- Modify: `electron/main/modules/chat/runtime/types.mts`
- Modify: `electron/main/modules/chat/runtime/runners/factory.mts`
- Test: `test/electron/main/modules/chat/runtime/shared-types.test.ts`

- [ ] Add `ChatRuntimeCapabilityDescriptor`, `ChatRuntimeRecoverySnapshot`, and a pending renderer request union covering tool, confirmation, and bridge events.
- [ ] Add an optional capability descriptor to send, continue, and user-choice inputs.
- [ ] Store the cloneable descriptor on `ActiveChatRuntime`; never expose `AbortController`, provider config secrets, or executable closures.
- [ ] Run `pnpm exec vitest run test/electron/main/modules/chat/runtime/shared-types.test.ts` and confirm the new request shapes remain cloneable.

### Task 2: Project Main-Process Runtime State

**Files:**
- Modify: `electron/main/modules/chat/runtime/controllers/renderer-tool.mts`
- Modify: `electron/main/modules/chat/runtime/controllers/confirmation.mts`
- Modify: `electron/main/modules/chat/runtime/controllers/bridge.mts`
- Modify: `electron/main/modules/chat/runtime/service.mts`
- Test: `test/electron/main/modules/chat/runtime/service.test.ts`
- Test: `test/electron/main/modules/chat/runtime/renderer-tool-requests.test.ts`

- [ ] Write failing tests proving pending tool, confirmation, and bridge request payloads can be listed without exposing resolver functions.
- [ ] Retain each emitted request event beside its resolver and add read-only `listPending` methods to the controllers.
- [ ] Add `listRecoverySnapshots()` to the service, sorted by creation time and filtered to active runtimes.
- [ ] Verify completed and aborted runtimes disappear and submitted interactions no longer appear in snapshots.

### Task 3: Expose Recovery IPC

**Files:**
- Modify: `electron/main/modules/chat/runtime/ipc.mts`
- Modify: `electron/preload/index.mts`
- Modify: `types/electron-api.d.ts`
- Test: `test/electron/main/modules/chat/runtime/ipc.test.ts`

- [ ] Add `chat:runtime:list-active` and `chatRuntimeListActive()` with the existing `ChatRuntimeHandlerResult` envelope.
- [ ] Test success and stable error wrapping through the IPC handler.
- [ ] Run the IPC and preload type checks with `pnpm exec tsc --noEmit`.

### Task 4: Hydrate the Actor Tree

**Files:**
- Modify: `src/ai/chat/types.ts`
- Modify: `src/ai/chat/machine/sessionMachine.ts`
- Modify: `src/ai/chat/machine/turnMachine.ts`
- Modify: `src/ai/chat/machine/agentMachine.ts`
- Modify: `src/ai/chat/actorSystem.ts`
- Test: `test/ai/chat/session-machine.test.ts`
- Test: `test/ai/chat/actor-system.test.ts`

- [ ] Add a recovery intent/event that creates a Turn and primary Agent directly in running or waiting state using the existing runtime ID.
- [ ] Make hydration idempotent so repeated snapshot queries cannot create duplicate turns or routes.
- [ ] Register degraded capabilities for recovered runtimes and route pending confirmation state into Session and Agent waiting states.
- [ ] Verify completion, cancellation, and failure events behave identically after hydration.

### Task 5: Recover at Application Startup

**Files:**
- Create: `src/hooks/useChatRuntimeRecovery.ts`
- Modify: `src/hooks/useChatRuntimeEvents.ts`
- Modify: `src/App.vue`
- Test: `test/hooks/use-chat-runtime-recovery.test.ts`
- Test: `test/hooks/use-chat-runtime-events.test.ts`

- [ ] Register global listeners first, query active snapshots second, and reconcile events that arrive during hydration.
- [ ] Rebuild runtime routes with degraded tool and bridge capabilities so missing renderer context returns a stable failure instead of timing out.
- [ ] Replay pending tool and bridge requests through the global handler and cache pending confirmation requests for their Session UI.
- [ ] Ensure repeated startup recovery is idempotent and a runtime that completed during the query is ignored safely.

### Task 6: Upgrade Recovered Capabilities in BChat

**Files:**
- Modify: `src/components/BChat/hooks/useRuntimeRequestConfig.ts`
- Modify: `src/components/BChat/hooks/useChatWorkflow.ts`
- Modify: `src/components/BChat/index.vue`
- Test: `test/components/BChat/use-runtime-request-config.test.ts`
- Test: `test/components/BChat/session-id-runtime.test.ts`

- [ ] Include renderer tool names and the captured document ID in new Runtime capability descriptors.
- [ ] When BChat attaches to a Session, match descriptor tool names against current tool executors and replace degraded capabilities without restarting the runtime.
- [ ] Preserve the captured document boundary; if its context no longer exists, return `STALE_CONTEXT` rather than using another active document.
- [ ] Verify switching between two active sessions upgrades and aborts the addressed runtime only.

### Task 7: Remove Compatibility Ownership

**Files:**
- Modify: `src/components/BChat/hooks/useChatRuntime.ts`
- Modify: `src/components/BChat/hooks/useChatWorkflow.ts`
- Remove: `src/components/BChat/hooks/useChatTaskRuntime.ts`
- Modify: `src/hooks/useChatRuntimeEvents.ts`
- Test: `test/components/BChat/use-chat-runtime.test.ts`
- Test: `test/components/BChat/session-id-runtime.test.ts`
- Test: `test/hooks/use-chat-runtime-events.test.ts`

- [ ] Move all Runtime event consumption to the application-level listener and expose session-scoped UI events to BChat.
- [ ] Replace the renderer task lock with Session actor tags and a small preflight state represented by the Session machine.
- [ ] Delete `shouldDeferRendererRequest`, duplicate ChatRuntime event listeners, and `useChatTaskRuntime` after parity tests pass.
- [ ] Verify send, continue, regenerate, cancel, compact, rollback, confirmation, background completion, and renderer recovery.

### Task 8: Verification and Documentation

**Files:**
- Modify: `changelog/2026-07-11.md`
- Modify: `docs/superpowers/specs/2026-07-11-bchat-state-machine-design.md`

- [ ] Document that recovery covers renderer rebuilds while the Electron main process remains alive.
- [ ] Run `pnpm exec eslint src --ext .vue,.ts,.tsx,.js,.jsx,.mts`.
- [ ] Run `pnpm exec stylelint 'src/**/*.{vue,less,css}'`.
- [ ] Run `pnpm exec tsc --noEmit`.
- [ ] Run `pnpm test` and record the final test count.
- [ ] Run `git diff --check` and confirm no commit was created.
