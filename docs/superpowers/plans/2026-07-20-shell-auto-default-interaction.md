# Shell Auto-Default Interaction Phase 2 Implementation Plan

> **Implementation status (2026-07-20):** The code and current macOS arm64 development/packaged smoke gates are complete. Public rollout remains intentionally disabled until the checked-in release matrix passes on macOS x64, Windows, and Linux. The task checkboxes below preserve the original TDD execution script; authoritative completion and remaining release gates are recorded in `docs/superpowers/specs/2026-07-20-shell-auto-default-interaction-design.md` and `docs/release/shell-pty-release-gate.md`.

> **For agentic workers:** REQUIRED SUB-SKILLS: Use `test-driven-development` while implementing each task, `systematic-debugging` for unexpected failures, and `verification-before-completion` before reporting completion. Use `executing-plans` when implementing this plan inline.

**Goal:** Extend `run_shell_command` with an explicit PTY-backed `auto-default` mode that safely presses Enter for conservative default prompts, reports ordered terminal/auto-answer events, and returns structured termination metadata without changing the default pipe behavior.

**Architecture:** Keep the existing pipe execution path as the default and add a separate PTY path composed of a process adapter, headless terminal snapshot projector, prompt-region stabilizer, pure prompt detector, stateful auto-default controller, and platform termination strategy. A thin runner dispatches by `interactionMode`; Electron IPC forwards PTY screen events to the renderer, while the normal tool result remains authoritative for ChatRuntime continuation.

**Tech Stack:** TypeScript 5.9, Electron 41, Vue 3, Vitest 4, `node-pty@1.1.0`, `@xterm/headless@6.0.0`

## Global Constraints

- `interactionMode` defaults to `none`; existing callers must remain on the pipe path unless they explicitly request `auto-default`.
- Auto interaction may only send Enter for explicit boolean defaults or visible wizard defaults.
- Never answer free text, paths, file names, accounts, email, usernames, passwords, tokens, API keys, or secrets.
- Detector priority is fixed: `unsupported_input > active_output > auto_default > unknown`.
- The detector reports confidence; only the controller applies the fixed `0.85` threshold.
- `AutoDefaultController` emits intents and never owns or terminates a PTY.
- `TOOL_TIMEOUT` covers the complete command lifetime; `INTERACTION_TIMEOUT` only covers a live PTY stalled in an unresolved prompt-like state without active-output signals.
- Non-zero exit codes are successful tool executions with `termination: { kind: 'exit', exitCode }`.
- `terminal_update` carries a bounded current screen snapshot, not raw PTY bytes and not a text diff.
- `finished` is emitted exactly once and never replaces the normal `runShellCommand()` result.
- All production TypeScript functions, interfaces, types, and complex logic require accurate comments and explicit types. Do not use `any`.
- Update `changelog/2026-07-20.md` and the Shell section of `CONTEXT.md`.
- Do not stage, commit, or push. The user will review and commit all changes.

---

### Task 1: Lock the public tool contract and termination mapping

**Files:**
- Create: `test/ai/tools/builtin-shell-tool.test.ts`
- Modify: `src/ai/tools/builtin/ShellTool/index.ts`
- Modify: `types/ai.d.ts`
- Modify: `types/electron-api.d.ts`
- Modify: `electron/main/modules/shell/types.mts`

**Interfaces:**
- Produces: `ShellInteractionMode = 'none' | 'auto-default'`
- Produces: `ShellCommandTermination`
- Produces: optional `autoInteraction` metadata on `ShellCommandRunResult`
- Produces: tool error codes `INTERACTION_TIMEOUT`, `INTERACTION_LIMIT_EXCEEDED`, and `UNSUPPORTED_INTERACTION`

- [ ] **Step 1: Add failing ShellTool contract tests**

Mock `native.analyzeShellCommand`, `native.runShellCommand`, and `native.cancelShellCommand`. Add cases proving:

```ts
expect(native.runShellCommand).toHaveBeenCalledWith(
  expect.objectContaining({ interactionMode: 'none' })
);

expect(native.runShellCommand).toHaveBeenCalledWith(
  expect.objectContaining({ interactionMode: 'auto-default' })
);
```

Also assert invalid interaction modes return `INVALID_INPUT`, and that the model schema exposes only `none` and `auto-default`.

Add a table-driven termination test with these expected tool outcomes:

| `termination.kind` | Expected tool status/code |
|---|---|
| `exit` with 0 or non-zero code | `success` |
| `signal` | `success` |
| `cancelled` | `cancelled` |
| `tool_timeout` | `failure / TOOL_TIMEOUT` |
| `interaction_timeout` | `failure / INTERACTION_TIMEOUT` |
| `answer_limit` | `failure / INTERACTION_LIMIT_EXCEEDED` |
| `unsupported_prompt` | `failure / UNSUPPORTED_INTERACTION` |
| `spawn_error` | `failure / EXECUTION_FAILED` |

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
pnpm vitest run test/ai/tools/builtin-shell-tool.test.ts
```

Expected: FAIL because the schema, result union, and termination-to-tool-result mapping do not exist.

- [ ] **Step 3: Add the shared Electron and main-process types**

Use the approved result shape in both `types/electron-api.d.ts` and `electron/main/modules/shell/types.mts`:

```ts
export type ShellCommandTermination =
  | { kind: 'exit'; exitCode: number }
  | { kind: 'signal'; signal: string }
  | { kind: 'cancelled' }
  | { kind: 'tool_timeout' }
  | { kind: 'interaction_timeout' }
  | { kind: 'answer_limit' }
  | { kind: 'unsupported_prompt'; reason: 'text' | 'path' | 'account' | 'secret' }
  | { kind: 'spawn_error'; message: string };

export interface ShellCommandRunResult {
  commandId: string;
  shell: 'bash' | 'powershell';
  command: string;
  cwd: string;
  exitCode: number | null;
  signal: string | null;
  durationMs: number;
  timedOut: boolean;
  truncated: boolean;
  outputMode: 'pipes' | 'pty';
  stdout?: string;
  stderr?: string;
  terminalOutput?: string;
  termination: ShellCommandTermination;
  autoInteraction?: {
    enabled: boolean;
    answerCount: number;
    stopReason?:
      | 'completed'
      | 'tool_timeout'
      | 'interaction_timeout'
      | 'answer_limit'
      | 'process_exit'
      | 'unsupported_prompt'
      | 'cancelled';
  };
}
```

Add `interactionMode?: ShellInteractionMode` to the IPC run request so direct legacy callers still default to pipe mode. ShellTool must always send the normalized explicit value; the runner must also normalize a missing field to `none` defensively. Keep the renderer tool input as `unknown` until validated.

- [ ] **Step 4: Validate and map interaction results in ShellTool**

Add a commented `normalizeInteractionMode(value: unknown): ElectronShellInteractionMode` that defaults `undefined` to `none` and rejects other values. Add `interactionMode` to the model schema and update the tool description to explain that `auto-default` is only for default prompts.

Extract result mapping into a small commented function whose switch is exhaustive over `runResult.termination.kind`. Include at most 500 characters of `terminalOutput`, `stdout`, or `stderr` in failure messages.

Do not use `timedOut` as the authoritative branch; it remains compatibility metadata derived from `termination`.

Replace the existing asynchronous `native.runShellCommand()` `try/catch` with `asyncTo()` result handling while preserving the synchronous validation `try/catch` allowed by project rules.

- [ ] **Step 5: Run the focused test and verify GREEN**

Run:

```bash
pnpm vitest run test/ai/tools/builtin-shell-tool.test.ts
```

Expected: PASS, including the non-zero exit-code success case.

### Task 2: Add native dependencies and package boundaries

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `electron-builder.yml`
- Create: `test/electron/main/modules/shell/package-config.test.ts`

**Interfaces:**
- Produces: Electron-main-only access to `node-pty` and `@xterm/headless`
- Produces: build configuration that rebuilds and unpacks `node-pty`

- [ ] **Step 1: Add failing package-configuration assertions**

Read `package.json` and `electron-builder.yml` in a pure test and assert:

```ts
expect(packageJson.dependencies['node-pty']).toBe('1.1.0');
expect(packageJson.dependencies['@xterm/headless']).toBe('6.0.0');
expect(packageJson.pnpm.onlyBuiltDependencies).toContain('node-pty');
expect(packageJson.scripts.postinstall).toContain('better-sqlite3,node-pty');
expect(builderConfig.asarUnpack).toContain('node_modules/node-pty/**/*');
```

- [ ] **Step 2: Run the package test and verify RED**

Run:

```bash
pnpm vitest run test/electron/main/modules/shell/package-config.test.ts
```

Expected: FAIL because the dependencies and unpack rule are absent.

- [ ] **Step 3: Install the exact dependencies and update build configuration**

Run:

```bash
pnpm add --save-exact node-pty@1.1.0 @xterm/headless@6.0.0
```

Then set:

```json
"postinstall": "electron-rebuild --only better-sqlite3,node-pty"
```

Add `node-pty` to `pnpm.onlyBuiltDependencies`. Add `node_modules/node-pty/**/*` to `asarUnpack` in addition to the existing native-module and `better-sqlite3` rules.

Do not import either dependency from `src/` or the Web native adapter.

- [ ] **Step 4: Run the package test and main-process build**

Run:

```bash
pnpm vitest run test/electron/main/modules/shell/package-config.test.ts
pnpm electron:build-main
```

Expected: PASS and no renderer bundle reference to `node-pty` or `@xterm/headless`.

### Task 3: Project raw terminal data into bounded Screen Snapshots

**Files:**
- Create: `electron/main/modules/shell/interaction/types.mts`
- Create: `electron/main/modules/shell/interaction/screen-projector.mts`
- Create: `electron/main/modules/shell/interaction/prompt-region.mts`
- Create: `test/electron/main/modules/shell/screen-projector.test.ts`
- Create: `test/electron/main/modules/shell/prompt-region.test.ts`

**Interfaces:**
- Produces: `ShellScreenSnapshot`
- Produces: `StablePromptRegion`
- Produces: `TerminalSnapshotProjector`
- Produces: `PromptRegionStabilizer`

- [ ] **Step 1: Write failing snapshot projection tests**

Cover ANSI color removal, cursor movement, carriage-return redraw, clear-line behavior, hidden/visible cursor state, selected wizard row, and the 12,000-character tail limit. Assert that the projector returns the current terminal screen instead of concatenating raw writes.

Use deterministic terminal dimensions, for example `80 x 24`, so wrapping behavior is stable.

- [ ] **Step 2: Write failing prompt-region/hash tests**

Add cases proving the hash normalization rules:

- CRLF and LF are equivalent.
- Unicode is normalized with NFC.
- NBSP is normalized without destroying meaningful indentation.
- Trailing spaces and trailing empty rows are ignored.
- Option indentation, current selection, and cursor row/column/visibility are preserved.
- Logs before the current prompt do not change `screenHash`.
- Spinner/progress rows are excluded from a stable prompt region.
- Returning to the same normalized prompt produces the same hash; lifecycle generation is not encoded into the hash.

- [ ] **Step 3: Run both tests and verify RED**

Run:

```bash
pnpm vitest run \
  test/electron/main/modules/shell/screen-projector.test.ts \
  test/electron/main/modules/shell/prompt-region.test.ts
```

Expected: FAIL because the projector and stabilizer modules do not exist.

- [ ] **Step 4: Implement internal types and the headless projector**

Define:

```ts
export interface ShellScreenSnapshot {
  sequence: number;
  content: string;
  cursor: { row: number; column: number; visible: boolean };
  selectedIndex?: number;
  activity: {
    spinner: boolean;
    progress: boolean;
    compiling: boolean;
    streamingLogs: boolean;
  };
  createdAt: number;
}

export interface StablePromptRegion {
  content: string;
  cursor: { row: number; column: number; visible: boolean };
  selectedIndex?: number;
  screenHash: string;
}
```

Wrap `@xterm/headless` behind `TerminalSnapshotProjector`; expose only `write(data)`, `snapshot(now)`, `projectOutput(maxChars)`, and `dispose()`. `snapshot()` returns the visible current screen; `projectOutput()` returns a sanitized plain-text projection of terminal scrollback for the final bounded `terminalOutput`. Use Node `createHash('sha256')` in the stabilizer. Never expose the xterm buffer object or raw ANSI stream from the module.

- [ ] **Step 5: Implement prompt-region extraction and stabilization**

Extract only the bottom prompt-like boolean block or visible wizard option block. Return `null` when no stable prompt region can be formed. Keep prompt settling (`400ms`) outside the stabilizer; this module only canonicalizes and hashes.

- [ ] **Step 6: Run both tests and verify GREEN**

Run the command from Step 3.

Expected: PASS with stable hashes across equivalent screen redraws.

### Task 4: Implement the conservative pure PromptDetector

**Files:**
- Create: `electron/main/modules/shell/interaction/prompt-detector.mts`
- Create: `test/electron/main/modules/shell/prompt-detector.test.ts`

**Interfaces:**
- Produces: `PromptDecision`
- Produces: `detectPrompt(snapshot, region): PromptDecision`

- [ ] **Step 1: Add the full failing decision matrix**

Define test matrices for:

- `Y/n`, `[Y/n]`, `y/N`, and `[y/N]`.
- Single-layer and subsequent multi-layer wizard defaults using a selected row marker or projector-selected index.
- Unsupported free text, path/file name, account/email/username, token/API key/password/secret prompts.
- Spinner frames, percentages, byte counts, transfer speeds, ETA, compiling/building lines, watch/tail/dev logs.
- Ambiguous prompt-like text that must remain `unknown`.
- Mixed screens that prove `unsupported_input > active_output > auto_default > unknown`.

Assert confidence as data, but do not mention `0.85` in detector tests.

- [ ] **Step 2: Run the detector test and verify RED**

Run:

```bash
pnpm vitest run test/electron/main/modules/shell/prompt-detector.test.ts
```

Expected: FAIL because `PromptDecision` and `detectPrompt` do not exist.

- [ ] **Step 3: Implement the decision union and fixed-priority detector**

Use:

```ts
export type PromptDecision =
  | { type: 'auto_default'; promptKind: 'boolean_default' | 'wizard_default'; confidence: number }
  | { type: 'unsupported_input'; reason: 'text' | 'path' | 'account' | 'secret' }
  | { type: 'active_output' }
  | { type: 'unknown' };
```

Implement four independent candidate checks and compose them in the fixed order. Restrict all prompt classification to `StablePromptRegion`; activity may use `snapshot.activity`. Do not accept a threshold parameter and do not import PTY modules.

- [ ] **Step 4: Run the detector test and verify GREEN**

Run the command from Step 2.

Expected: PASS, including sensitive-input and active-output precedence cases.

### Task 5: Implement checkpoint history and AutoDefaultController state

**Files:**
- Create: `electron/main/modules/shell/interaction/auto-default-controller.mts`
- Create: `test/electron/main/modules/shell/auto-default-controller.test.ts`

**Interfaces:**
- Produces: `InteractionCheckpoint`
- Produces: `InteractionHistory`
- Produces: `AutoDefaultIntent`
- Produces: `AutoDefaultController`

- [ ] **Step 1: Add failing controller lifecycle tests with a fake clock**

Test all fixed policy values through behavior:

- A prompt must retain the same hash for `400ms` before it is eligible.
- Confidence below `0.85` never submits Enter.
- One checkpoint submits at most once.
- Cursor flicker or a single transient diff does not create a new answer.
- After an answered prompt, a valid transition barrier (`active_output`, different stable prompt, or settled non-prompt state for `250ms`) closes the generation.
- Returning to the same hash after a barrier creates a new history entry and may answer again.
- Returning to the same hash without a barrier does not answer again.
- History retains duplicate hashes with different generations and caps at 40 entries without evicting the current entry.
- Answer 20 emits `auto_answer.count === 20`; the next eligible prompt emits `request_stop / answer_limit` instead of Enter.
- `active_output` resets/pauses unresolved-interaction timing.
- An unresolved prompt-like `unknown` state emits `interaction_timeout` only after 8 seconds without active output.
- `dispose()` clears timers/state and subsequent observations emit no intents.

- [ ] **Step 2: Run the controller test and verify RED**

Run:

```bash
pnpm vitest run test/electron/main/modules/shell/auto-default-controller.test.ts
```

Expected: FAIL because controller state and checkpoint history are absent.

- [ ] **Step 3: Implement the controller as a PTY-independent state machine**

Define:

```ts
export interface InteractionCheckpoint {
  screenHash: string;
  answered: boolean;
}

export interface InteractionHistoryEntry {
  checkpoint: InteractionCheckpoint;
  generation: number;
  closed: boolean;
}

export interface InteractionHistory {
  entries: InteractionHistoryEntry[];
  currentIndex: number;
}

export type AutoDefaultIntent =
  | { type: 'submit_enter' }
  | { type: 'request_stop'; reason: 'interaction_timeout' | 'answer_limit' | 'unsupported_prompt' };
```

Use the exact policy object:

```ts
export interface AutoDefaultOptions {
  minConfidence: number;
  maxAnswers: number;
  interactionTimeoutMs: number;
  promptSettleMs: number;
  transitionSettleMs: number;
  activeOutputWindowMs: number;
}
```

The production constants are `0.85`, `20`, `8_000`, `400`, `250`, and `1_000` respectively. The constructor accepts this policy and a monotonic clock only for testability. `observe()` consumes a decision plus optional stable region and returns intents; the runner translates intents into PTY operations. Store no PTY handle and import no process adapter.

- [ ] **Step 4: Run the controller test and verify GREEN**

Run the command from Step 2.

Expected: PASS with duplicate hashes preserved only across valid interaction generations.

### Task 6: Isolate PTY lifecycle and platform termination

**Files:**
- Create: `electron/main/modules/shell/interaction/pty-process.mts`
- Create: `electron/main/modules/shell/interaction/termination.mts`
- Create: `test/electron/main/modules/shell/pty-process.test.ts`
- Create: `test/electron/main/modules/shell/termination.test.ts`

**Interfaces:**
- Produces: `PtyProcess`
- Produces: injectable `PtyProcessFactory`
- Produces: `PtyTerminationStrategy`

- [ ] **Step 1: Add failing adapter tests**

With an injected `node-pty`-compatible fake, verify spawn arguments, minimal environment, workspace cwd enforcement, data/exit subscriptions, Enter and Ctrl+C writes, and idempotent disposal. Confirm the adapter exposes no detector/controller concerns.

- [ ] **Step 2: Add failing platform-strategy tests**

Use fake timers and a fake `PtyProcess` to assert:

- Unix: interrupt write, wait 3 seconds, process-group `SIGTERM`, wait 3 seconds, process-group `SIGKILL`.
- Windows: ConPTY interrupt write, wait 3 seconds, PTY terminate, wait 3 seconds, process-tree force termination.
- Exit during either grace period cancels later escalation.
- Repeated stop requests share one termination state machine.

- [ ] **Step 3: Run both tests and verify RED**

Run:

```bash
pnpm vitest run \
  test/electron/main/modules/shell/pty-process.test.ts \
  test/electron/main/modules/shell/termination.test.ts
```

Expected: FAIL because the adapter and termination abstraction do not exist.

- [ ] **Step 4: Implement the process adapter and strategy port**

Use:

```ts
export interface PtyTerminationStrategy {
  requestInterrupt(process: PtyProcess): void;
  terminate(process: PtyProcess): void;
  forceTerminate(process: PtyProcess): void;
}
```

Keep platform-specific signal/process-tree logic inside `termination.mts`. The adapter owns native subscriptions and primitive PTY operations only. Ensure all returned disposables are idempotent and observable in tests.

- [ ] **Step 5: Run both tests and verify GREEN**

Run the command from Step 3.

Expected: PASS with no pending fake timers after every case.

### Task 7: Preserve pipe behavior while introducing the mode dispatcher

**Files:**
- Create: `electron/main/modules/shell/pipe-runner.mts`
- Create: `electron/main/modules/shell/result.mts`
- Modify: `electron/main/modules/shell/runner.mts`
- Create: `test/electron/main/modules/shell/pipe-runner.test.ts`
- Create: `test/electron/main/modules/shell/runner.test.ts`

**Interfaces:**
- Produces: `createPipeShellRunner()`
- Produces: termination-derived compatibility fields
- Produces: `createShellCommandRunner()` dispatcher with one active-command registry facade

- [ ] **Step 1: Add pipe regression tests before moving code**

Copy behavior assertions around the existing runner, not its implementation. Cover stdout/stderr separation, 20,000-character tail truncation per stream, exit 0, exit 1, signal exit, spawn error, cancellation, total timeout, workspace boundary rejection, and process-tree cleanup.

Require results such as:

```ts
expect(result).toMatchObject({
  outputMode: 'pipes',
  termination: { kind: 'exit', exitCode: 1 },
  exitCode: 1,
  signal: null,
  timedOut: false
});
```

- [ ] **Step 2: Run pipe tests and verify RED for the new result contract**

Run:

```bash
pnpm vitest run test/electron/main/modules/shell/pipe-runner.test.ts
```

Expected: FAIL because current results lack `outputMode` and `termination`.

- [ ] **Step 3: Extract the existing runner into the pipe implementation**

Move existing `child_process.spawn` behavior to `pipe-runner.mts` without changing shell arguments, environment filtering, timeout range, output limits, or process-group cleanup. Normalize all completion paths through `result.mts`, deriving:

```ts
exitCode = termination.kind === 'exit' ? termination.exitCode : null;
signal = termination.kind === 'signal' ? termination.signal : null;
timedOut = termination.kind === 'tool_timeout';
```

Represent spawn failures as result data (`spawn_error`) instead of rejected runner promises so ShellTool can map them consistently.

- [ ] **Step 4: Make `runner.mts` a thin mode dispatcher**

The dispatcher selects pipe for `none` and an injected PTY runner for `auto-default`. Its `cancel(commandId)` checks the owning runner and deletes ownership when the run settles. Do not fall back to pipe when PTY startup fails.

- [ ] **Step 5: Run pipe and dispatcher tests and verify GREEN**

Run:

```bash
pnpm vitest run \
  test/electron/main/modules/shell/pipe-runner.test.ts \
  test/electron/main/modules/shell/runner.test.ts
```

Expected: PASS, including legacy pipe output and non-zero exit semantics.

### Task 8: Orchestrate PTY execution, ordered events, and cleanup

**Files:**
- Create: `electron/main/modules/shell/pty-runner.mts`
- Create: `test/electron/main/modules/shell/pty-runner.test.ts`
- Create: `test/electron/main/modules/shell/pty-cleanup.test.ts`
- Create: `test/fixtures/shell/interactive-cli.mjs`
- Create: `test/electron/main/modules/shell/pty-fixture.integration.test.ts`

**Interfaces:**
- Produces: `ShellRunEvent` and `ShellRunEventEnvelope`
- Produces: `createPtyShellRunner()`
- Produces: exactly-once finalization and cleanup guarantees

- [ ] **Step 1: Add failing ordered-event tests with injected fakes**

Use an injected PTY factory, fake projector, fake detector, fake controller clock, and fake termination strategy. Assert:

```ts
expect(events.map((item) => item.event.type)).toEqual([
  'terminal_update',
  'auto_answer',
  'terminal_update',
  'finished'
]);
expect(events.map((item) => item.sequence)).toEqual([1, 2, 3, 4]);
```

Also assert terminal snapshots are deduplicated/throttled, limited to 12,000 characters, and never include raw ANSI bytes. `auto_answer` must bypass snapshot throttling and preserve event ordering.

- [ ] **Step 2: Add the cleanup termination matrix**

For each path below, require active registry size 0, every subscription disposed once, projector disposed once, controller disposed once, all timers cleared, `finished` emitted once, and the run promise settled once:

- exit 0;
- non-zero exit;
- signal exit;
- cancellation;
- tool timeout;
- interaction timeout;
- unsupported prompt;
- answer limit;
- PTY spawn error;
- event sink/renderer disconnect;
- graceful interrupt exit;
- force-termination fallback.

- [ ] **Step 3: Run fake-runner tests and verify RED**

Run:

```bash
pnpm vitest run \
  test/electron/main/modules/shell/pty-runner.test.ts \
  test/electron/main/modules/shell/pty-cleanup.test.ts
```

Expected: FAIL because the PTY orchestrator and event stream do not exist.

- [ ] **Step 4: Implement the PTY orchestrator**

Define:

```ts
export type ShellRunEvent =
  | { type: 'terminal_update'; content: string }
  | { type: 'auto_answer'; count: number }
  | { type: 'finished'; result: ShellCommandRunResult };

export interface ShellRunEventEnvelope {
  commandId: string;
  sequence: number;
  createdAt: string;
  event: ShellRunEvent;
}
```

The PTY runner must:

1. start the tool timeout at command creation;
2. apply PTY data to the projector;
3. create/dedupe bounded snapshots;
4. stabilize/extract the prompt region;
5. call the detector, then controller;
6. translate `submit_enter` to exactly one `\r` write and emit cumulative `auto_answer`;
7. translate stop intents into the shared graceful termination state machine;
8. obtain `terminalOutput` only from the projector's sanitized plain-text projection, bound it to `maxOutputChars`, and keep the tail;
9. finalize one result and one `finished` event;
10. cleanup all resources in one idempotent finalizer.

`unsupported_input` must request graceful stop; it must never call a force-kill primitive directly. The runner must retain the detector's unsupported reason beside the stop intent so the final termination preserves `text`, `path`, `account`, or `secret` without widening the controller intent type.

- [ ] **Step 5: Add a no-network interactive fixture**

Implement one scenario-driven Node script with explicit scenarios:

```text
boolean-default
multi-wizard
same-screen-reentry
path-input
account-input
secret-input
spinner
download-progress
compile-output
tail-output
unknown-prompt
child-process-tree
```

The script must require a TTY for interactive scenarios and expose child PIDs only to the integration test, never to user-visible tool output.

- [ ] **Step 6: Add real PTY fixture integration tests**

Run `node test/fixtures/shell/interactive-cli.mjs <scenario>` through the PTY runner. Assert boolean and multi-wizard completion, repeated-hash generation behavior, no Enter during active output, graceful failure for unsupported input, distinct interaction timeout, and no surviving child process tree.

- [ ] **Step 7: Run PTY unit and fixture tests and verify GREEN**

Run:

```bash
pnpm vitest run \
  test/electron/main/modules/shell/pty-runner.test.ts \
  test/electron/main/modules/shell/pty-cleanup.test.ts \
  test/electron/main/modules/shell/pty-fixture.integration.test.ts
```

Expected: PASS without network access, leaked handles, or leftover child processes.

### Task 9: Bridge Shell run events through Electron without replacing tool results

**Files:**
- Modify: `electron/main/modules/shell/ipc.mts`
- Modify: `electron/preload/index.mts`
- Modify: `types/electron-api.d.ts`
- Modify: `src/shared/platform/native/types.ts`
- Modify: `src/shared/platform/native/electron.ts`
- Create: `test/electron/main/modules/shell/ipc.test.ts`
- Create: `test/electron/preload/shell-events.test.ts`

**Interfaces:**
- Produces: `shell:run-event`
- Produces: `onShellRunEvent(callback): () => void`
- Preserves: `shell:output` / `onShellCommandOutput` for `interactionMode: 'none'`

- [ ] **Step 1: Add failing IPC tests**

Assert `shell:run` passes both the legacy pipe-output sink and the new run-event sink to the dispatcher. Assert event forwarding uses the invoking renderer's `event.sender`, and that a sender failure does not abort or alter the command result.

Assert one final result is returned from `ipcRenderer.invoke('shell:run')` even though an earlier `finished` event carries the same data.

- [ ] **Step 2: Add failing preload subscribe/unsubscribe tests**

Verify `onShellRunEvent` registers only `shell:run-event`, passes typed envelopes unchanged, and removes the exact listener on dispose. Preserve the existing pipe-output subscription for `none` mode compatibility.

- [ ] **Step 3: Run bridge tests and verify RED**

Run:

```bash
pnpm vitest run \
  test/electron/main/modules/shell/ipc.test.ts \
  test/electron/preload/shell-events.test.ts
```

Expected: FAIL because the run-event channel is absent.

- [ ] **Step 4: Implement the bridge**

Add `SHELL_RUN_EVENT = 'shell:run-event'`. Forward only bounded `ShellRunEventEnvelope` objects. Keep pipe chunks on the existing channel. Add `onShellRunEvent` to Electron API and Native types; Web remains unsupported and must not import PTY-related types at runtime.

- [ ] **Step 5: Run bridge tests and verify GREEN**

Run the command from Step 3.

Expected: PASS with invocation results and UI side-channel events both delivered once.

### Task 10: Route events to the active Shell tool and render system behavior

**Files:**
- Modify: `src/hooks/useChat/useRuntimeEvents.ts`
- Modify: `src/ai/chat/sessionEvents.ts`
- Modify: `src/components/BChat/hooks/useChatWorkflow.ts`
- Modify: `src/components/BChat/utils/messageHelper.ts`
- Modify: `types/chat.d.ts`
- Modify: `src/components/BChat/components/MessageBubble/BubblePartTool/index.vue`
- Modify: `src/components/BChat/utils/toolResultSummary.ts`
- Modify: `test/components/BChat/session-id-runtime.test.ts`
- Create: `test/components/BChat/shell-run-events.test.ts`
- Create: `test/components/BChat/bubble-part-tool-shell.test.ts`

**Interfaces:**
- Produces: ephemeral `ChatMessageShellRunState`
- Produces: `shellRunEvent` on the per-session UI event bus
- Produces: live terminal snapshot plus at most 20 auto-answer markers

- [ ] **Step 1: Add failing routing tests**

When a `run_shell_command` tool request begins, register a route from `toolCallId/commandId` to `runtimeId` and `sessionId`. Assert:

- matching events are emitted only to that session;
- unknown command IDs are dropped without creating a message;
- the route is removed on tool completion, cancellation, error, and scope disposal;
- `finished` updates UI state but does not submit a second tool result;
- `auto_answer` never invokes the confirmation controller.

- [ ] **Step 2: Add failing message-state tests**

Use:

```ts
export interface ChatMessageShellRunState {
  terminalContent: string;
  autoAnswers: number[];
  lastSequence: number;
  finished: boolean;
}
```

Assert `terminal_update` replaces `terminalContent`, duplicate/out-of-order sequences are ignored, `auto_answer` records cumulative counts up to 20 entries, and `finished` freezes later event mutation. Preserve the latest state when a normal `messageUpdated` replaces the tool part before final tool-result data arrives.

- [ ] **Step 3: Add failing component tests**

For an executing Shell part, assert rendered text contains the current snapshot, while internal `auto_answer` events do not produce visible rows. Assert no `ConfirmationSheet` is mounted. For a finished result, assert the summary distinguishes exit 1, signal, tool timeout, interaction timeout, answer limit, unsupported prompt, and spawn error.

- [ ] **Step 4: Run renderer tests and verify RED**

Run:

```bash
pnpm vitest run \
  test/components/BChat/shell-run-events.test.ts \
  test/components/BChat/bubble-part-tool-shell.test.ts \
  test/components/BChat/session-id-runtime.test.ts
```

Expected: FAIL because run-event routing and Shell terminal rendering are absent.

- [ ] **Step 5: Implement command routing and session event delivery**

Subscribe once in `useRuntimeEvents`. Maintain an internal route map only while renderer Shell tools are executing. Emit a typed `shellRunEvent` through `actorSystem.emitSessionEvent`; do not bypass the per-session event bus.

In `useChatWorkflow`, find the existing assistant tool part by `commandId` and apply the message helper. If not found, return immediately.

- [ ] **Step 6: Implement live Shell rendering**

Render the latest snapshot as preformatted terminal text. Render auto-answer markers as Tibis system rows separate from command output. Keep existing pipe-output UI behavior for `none`. On final tool result, prefer `terminalOutput`/`autoInteraction.answerCount` when ephemeral state is unavailable.

Do not add user controls or confirmation UI for auto answers.

- [ ] **Step 7: Run renderer tests and verify GREEN**

Run the command from Step 4.

Expected: PASS with one normal tool-result continuation and no confirmation request.

### Task 11: Add Electron ABI and packaged-artifact smoke modes

**Files:**
- Create: `electron/main/modules/shell/native-smoke.mts`
- Modify: `electron/main/index.mts`
- Modify: `package.json`
- Create: `test/electron/main/modules/shell/native-smoke.test.ts`
- Create: `docs/release/shell-pty-release-gate.md`

**Interfaces:**
- Produces: `--shell-pty-smoke`
- Produces: `pnpm shell:pty:smoke`
- Produces: a repeatable packaged-app smoke command for every released OS/arch

- [ ] **Step 1: Add failing smoke-mode unit tests**

Inject a PTY factory and assert the smoke routine:

1. loads `node-pty` in the Electron main process;
2. starts the local `boolean-default` fixture;
3. receives output;
4. writes one Enter;
5. observes exit 0;
6. disposes the PTY and exits with a non-zero smoke status on ABI/load/helper failure.

- [ ] **Step 2: Run the smoke unit test and verify RED**

Run:

```bash
pnpm vitest run test/electron/main/modules/shell/native-smoke.test.ts
```

Expected: FAIL because no Electron-native smoke entry exists.

- [ ] **Step 3: Implement an early application smoke mode**

Before normal database/window bootstrap, detect `--shell-pty-smoke`. After `app.whenReady()`, run the native smoke routine, print one sanitized PASS/FAIL line, set `process.exitCode`, and quit without creating a window or registering normal IPC handlers.

Add:

```json
"shell:pty:smoke": "pnpm electron:build-main && node ./node_modules/electron/cli.js . --shell-pty-smoke"
```

The same flag must work on a packaged executable so CI can launch the real artifact rather than importing `node-pty` from system Node.

- [ ] **Step 4: Document the platform release matrix**

In `docs/release/shell-pty-release-gate.md`, require each published OS/arch job to run:

1. dependency install and Electron rebuild;
2. `pnpm shell:pty:smoke` against the development Electron main process;
3. `pnpm electron:build`;
4. the packaged executable with `--shell-pty-smoke`;
5. artifact inspection confirming `node-pty` native modules and helpers are unpacked and executable.

State explicitly that direct system-Node import is not acceptance.

- [ ] **Step 5: Run the Electron-main ABI smoke**

Run:

```bash
pnpm shell:pty:smoke
```

Expected: a single PASS line after a real PTY output/write/exit cycle under Electron's ABI.

### Task 12: Update documentation and execute the release gate

**Files:**
- Modify: `CONTEXT.md`
- Modify: `changelog/2026-07-20.md`
- Verify: every file changed in Tasks 1-11

**Interfaces:**
- No new runtime interface.

- [ ] **Step 1: Update project documentation**

Update the Shell module entries in `CONTEXT.md` using repository-relative paths. Document pipe/PTY dispatch, Screen Snapshot detection, ordered UI events, and the explicit unsupported-input boundary.

Under `## Added` in `changelog/2026-07-20.md`, add a concise entry covering PTY auto-default interaction, structured termination reasons, live auto-answer events, cleanup guarantees, and native ABI verification.

- [ ] **Step 2: Run all focused Shell tests**

Run:

```bash
pnpm vitest run \
  test/ai/tools/builtin-shell-tool.test.ts \
  test/electron/main/modules/shell \
  test/electron/preload/shell-events.test.ts \
  test/components/BChat/shell-run-events.test.ts \
  test/components/BChat/bubble-part-tool-shell.test.ts \
  test/components/BChat/session-id-runtime.test.ts
```

Expected: all tests PASS with no leaked handles.

- [ ] **Step 3: Run full static and regression checks**

Run as separate commands:

```bash
pnpm exec tsc --noEmit
pnpm electron:build-main
pnpm lint
pnpm lint:style
pnpm test
```

Expected: every command exits with code `0`.

- [ ] **Step 4: Run native and packaged smoke checks**

Run:

```bash
pnpm shell:pty:smoke
pnpm electron:build
```

Then launch the generated executable for the current OS/arch with `--shell-pty-smoke` and verify PASS. The release matrix must repeat this on every actually published OS/arch.

- [ ] **Step 5: Audit cleanup and release blockers**

Do not declare Phase 2 releasable if any of the following is observed:

- native ABI or dynamic-library load failure;
- unpacked PTY helper missing or not executable;
- surviving process tree, timer, listener, terminal, controller, or active-command entry;
- duplicate Enter for one checkpoint generation;
- Enter sent while spinner/download/compile/tail signals are active;
- path/account/secret/free-text prompt answered;
- `TOOL_TIMEOUT` and `INTERACTION_TIMEOUT` collapsed into one result;
- duplicate `finished` or missing normal tool result.

- [ ] **Step 6: Review the unstaged worktree**

Run as separate read-only commands:

```bash
git diff --check
git status --short
git diff --stat
```

Expected: no whitespace errors. Leave every change unstaged and uncommitted for the user.

---

## v1 Safety Remediation Amendment

The first prototype proved the basic PTY path, but review found that capability exposure preceded a closed interaction and process-lifecycle proof. The tasks below supersede any conflicting release claims above. `auto-default` remains internal-only until every remediation gate passes.

### Task 13: Close output activity and checkpoint re-entry

**Files:**
- Modify: `electron/main/modules/shell/interaction/types.mts`
- Modify: `electron/main/modules/shell/interaction/auto-default-controller.mts`
- Modify: `electron/main/modules/shell/pty-runner.mts`
- Modify: `test/electron/main/modules/shell/auto-default-controller.test.ts`
- Modify: `test/electron/main/modules/shell/pty-runner.test.ts`
- Modify: `test/fixtures/shell/interactive-cli.mjs`

**Interfaces:**
- `AutoDefaultObservation` carries `outputActive` independently of prompt extraction.
- Every PTY `onData` callback updates `lastOutputAt`, including ANSI-only redraws and unchanged snapshots.
- A prompt is eligible only after `now - lastOutputAt >= activeOutputWindowMs` and the prompt hash remains stable for `promptSettleMs`.

- [ ] Add a controller regression test proving an answered hash can be answered again only after a settled active-output barrier.
- [ ] Add a real PTY `same-screen-reentry` fixture that prints the same prompt, emits progress for longer than the activity window, and prints the same prompt again.
- [ ] Run the focused tests and observe the re-entry test fail because the runner returns before observing active output.
- [ ] Pass every observation to the controller even when `createPromptRegion()` returns `null`; make byte activity a hard eligibility condition.
- [ ] Re-run the focused tests and require exactly two `auto_answer` events with no Enter during progress.

### Task 14: Tighten explicit-default grammar

**Files:**
- Modify: `electron/main/modules/shell/interaction/prompt-region.mts`
- Modify: `electron/main/modules/shell/interaction/prompt-detector.mts`
- Modify: `test/electron/main/modules/shell/prompt-region.test.ts`
- Modify: `test/electron/main/modules/shell/prompt-detector.test.ts`

**Interfaces:**
- Boolean auto-default accepts exact case-sensitive `Y/n` and `y/N` forms only.
- Wizard auto-default requires a question/header, at least two selectable option rows, and exactly one visible selected/default marker.

- [ ] Add failing matrices for ambiguous `[Y/N]`, `[y/n]`, bare `>`, input cursors, one-option lists, and multiple selected markers.
- [ ] Remove case-insensitive boolean matching and return `unknown` for ambiguous forms.
- [ ] Extract wizard metadata from the stable region and reject incomplete option blocks.
- [ ] Run detector and prompt-region tests and require the full safe/unsafe matrix to pass.

### Task 15: Add a double-layer capability gate and structured failures

**Files:**
- Modify: `electron/main/modules/shell/types.mts`
- Create: `electron/main/modules/shell/interaction/capability.mts`
- Modify: `electron/main/modules/shell/runner.mts`
- Modify: `src/ai/tools/results.ts`
- Modify: `src/ai/tools/builtin/ShellTool/index.ts`
- Modify: `types/ai.d.ts`
- Modify: `test/ai/tools/builtin-shell-tool.test.ts`
- Modify: `test/electron/main/modules/shell/runner.test.ts`

**Interfaces:**
- `getAutoDefaultCapability()` returns a versioned `{ enabled, reason, verificationVersion }` result.
- Tool schema omits `auto-default` when disabled; the executor and main-process runner also reject direct disabled requests.
- Failure results preserve bounded `ShellCommandRunResult` metadata as typed error details instead of flattening it into only a message.

- [ ] Add failing schema, stale-schema/direct-request, and structured failure assertions.
- [ ] Implement the internal experimental gate with dependency injection for tests; default packaged/public capability remains disabled until release verification is provided.
- [ ] Add runtime enforcement in both ShellTool and the main-process dispatcher.
- [ ] Extend failure factories/types with typed `details` and preserve structured termination metadata.
- [ ] Run ShellTool and runner tests and require both schema and executor defenses to pass.

### Task 16: Prove process-tree termination and event finalization

**Files:**
- Modify: `electron/main/modules/shell/interaction/pty-process.mts`
- Modify: `electron/main/modules/shell/interaction/termination.mts`
- Modify: `electron/main/modules/shell/pty-runner.mts`
- Modify: `test/electron/main/modules/shell/termination.test.ts`
- Modify: `test/electron/main/modules/shell/pty-runner.test.ts`
- Create: `test/electron/main/modules/shell/pty-cleanup.test.ts`

**Interfaces:**
- Platform termination is expressed as `interruptTree`, `terminateTree`, `forceTree`, and `isTreeAlive`; Controller never owns these operations.
- Unix targets a verified process group/session rather than assuming an arbitrary negative PID is safe.
- Windows uses a platform process-tree adapter; packaged release remains gated until its real cleanup smoke passes.

- [ ] Add failing strategy tests for interrupt, graceful terminate, force fallback, idempotency, and descendant liveness.
- [ ] Add finalization races proving `finished` is emitted exactly once and no event is emitted afterward.
- [ ] Implement the platform adapter and make all grace/finalization timers owned and cleared by the runner.
- [ ] Add a real child-process fixture and verify no descendant remains after cancellation, timeout, or unsupported input on the current platform.

### Task 17: Execute the amended release gate

- [ ] Run all focused Shell and UI event tests.
- [ ] Run `pnpm exec tsc --noEmit`, Electron main build, targeted ESLint, and `git diff --check`.
- [ ] Run the Electron ABI smoke and current-platform process-tree cleanup smoke.
- [ ] Keep `auto-default` hidden unless the capability verification version covers ABI, prompt safety, checkpoint re-entry, and process-tree cleanup.
- [ ] Update `CONTEXT.md` and `changelog/2026-07-20.md` with the internal-only status and exact remaining platform gates.
