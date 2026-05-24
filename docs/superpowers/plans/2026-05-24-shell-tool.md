# Shell Command Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dangerous built-in AI tool that runs confirmed bash or PowerShell commands from the workspace, streams stdout/stderr to the chat UI, and returns a bounded final result to the LLM.

**Architecture:** Keep command execution in Electron main process behind preload/native APIs. The renderer built-in tool performs input validation, asks main process for safety analysis, requires user confirmation, then starts the command and waits for the final result while live output arrives through an IPC side channel keyed by `commandId`.

**Tech Stack:** Electron IPC, Vue chat stream hook, TypeScript, Vitest, Node `child_process.spawn`, focused parser/policy adapters with a tree-sitter-ready interface.

---

### Task 1: Shell Command Types And Safety Analyzer

**Files:**
- Create: `electron/main/modules/shell/types.mts`
- Create: `electron/main/modules/shell/safety.mts`
- Test: `test/electron/shell-safety.test.ts`

- [ ] **Step 1: Write failing safety tests**

Create tests for allowed simple commands, unsupported shell rejection, empty command rejection, destructive command blocking, network-pipe-shell blocking, and cwd escaping.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test test/electron/shell-safety.test.ts`

Expected: FAIL because `electron/main/modules/shell/safety.mts` does not exist.

- [ ] **Step 3: Implement minimal analyzer**

Add shared request/result types and a conservative policy analyzer. Use a parser adapter boundary so tree-sitter packages can be wired without changing callers. The first implementation must reject syntax markers and high-risk token patterns before returning `allowed`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test test/electron/shell-safety.test.ts`

Expected: PASS.

### Task 2: Main Process Runner And IPC

**Files:**
- Create: `electron/main/modules/shell/runner.mts`
- Create: `electron/main/modules/shell/ipc.mts`
- Modify: `electron/main/modules/index.mts`
- Test: `test/electron/shell-runner.test.ts`

- [ ] **Step 1: Write failing runner tests**

Cover stdout chunks, stderr chunks, exit code, timeout, and cancellation. Mock `node:child_process` where needed to avoid fragile platform commands.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test test/electron/shell-runner.test.ts`

Expected: FAIL because the runner module does not exist.

- [ ] **Step 3: Implement runner and IPC handlers**

Use `spawn` with shell-specific executable selection, workspace cwd validation, process timeout, output truncation, and `commandId`-keyed output events. Register IPC handlers for safety analysis, start command, cancel command, and output event subscription.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test test/electron/shell-runner.test.ts`

Expected: PASS.

### Task 3: Preload And Native Bridge

**Files:**
- Modify: `types/electron-api.d.ts`
- Modify: `electron/preload/index.mts`
- Modify: `src/shared/platform/native/types.ts`
- Modify: `src/shared/platform/native/electron.ts`
- Modify: `src/shared/platform/native/web.ts`

- [ ] **Step 1: Add failing type-level usage through tool tests**

The builtin Shell tool test in Task 4 should compile against the new native methods before implementation exists.

- [ ] **Step 2: Implement bridge methods**

Expose `analyzeShellCommand`, `runShellCommand`, `cancelShellCommand`, and `onShellCommandOutput` through Electron preload and `native`. Web native must throw `UNSUPPORTED_PROVIDER` errors for execution capabilities.

### Task 4: Built-In AI Tool Registration

**Files:**
- Create: `src/ai/tools/builtin/ShellTool/index.ts`
- Modify: `src/ai/tools/builtin/index.ts`
- Test: `test/ai/tools/builtin-shell.test.ts`
- Test: `test/ai/tools/builtin-index.test.ts`
- Test: `test/ai/tools/builtin-catalog.test.ts`

- [ ] **Step 1: Write failing built-in tool tests**

Cover invalid input, missing workspace root, blocked safety report, confirmation cancellation, successful execution result, non-zero exit as executed result, and default registration when a confirmation adapter exists.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test test/ai/tools/builtin-shell.test.ts test/ai/tools/builtin-index.test.ts test/ai/tools/builtin-catalog.test.ts`

Expected: FAIL because `ShellTool` is not registered.

- [ ] **Step 3: Implement Shell tool**

Create `RUN_SHELL_COMMAND_TOOL_NAME`, mark it dangerous, require confirmation, call native safety analysis, show command/cwd/safety findings in the confirmation request, then call native command execution and return a bounded result.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test test/ai/tools/builtin-shell.test.ts test/ai/tools/builtin-index.test.ts test/ai/tools/builtin-catalog.test.ts`

Expected: PASS.

### Task 5: Chat UI Output Side Channel

**Files:**
- Modify: `types/chat.d.ts`
- Modify: `src/components/BChatSidebar/hooks/useChatStream.ts`
- Modify: `src/components/BChatSidebar/utils/messageHelper.ts`
- Modify: `src/components/BChatSidebar/components/MessageBubble/BubblePartToolActivity.vue`
- Test: `test/useChatStream.test.ts`

- [ ] **Step 1: Write failing stream/UI tests**

Cover shell output chunks updating the matching tool-call part while the tool execution promise is pending, and final tool result still triggering normal continuation.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test test/useChatStream.test.ts`

Expected: FAIL because shell output chunks are not tracked.

- [ ] **Step 3: Implement output buffer**

Add a small rolling output buffer to the matching tool-call part. Subscribe to `native.onShellCommandOutput` in `useChatStream`, append chunks by `commandId`/`toolCallId`, and render compact stdout/stderr text in the existing tool activity component.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test test/useChatStream.test.ts`

Expected: PASS.

### Task 6: Changelog And Verification

**Files:**
- Modify: `changelog/2026-05-24.md`

- [ ] **Step 1: Update changelog**

Add an `Added` entry describing the Shell command tool, safety analyzer, confirmation flow, main-process runner, and live output UI.

- [ ] **Step 2: Run focused verification**

Run:

```bash
pnpm test test/electron/shell-safety.test.ts test/electron/shell-runner.test.ts test/ai/tools/builtin-shell.test.ts test/ai/tools/builtin-index.test.ts test/ai/tools/builtin-catalog.test.ts test/useChatStream.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run type/build verification**

Run:

```bash
pnpm electron:build-main
pnpm build
```

Expected: both commands exit 0.
