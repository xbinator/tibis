# Shell Command Tool Design

## Background

Tibis already has a renderer-side AI tool system under `src/ai/tools` and a main-process IPC boundary for system capabilities. Current built-in tools can read files, write files, edit files, inspect settings, query logs, and call MCP tools. They do not yet provide a way for the model to run generated command-line code and use the result to continue the conversation.

The target workflow is:

1. The LLM generates a bash or PowerShell command.
2. Tibis parses the command with tree-sitter.
3. Tibis performs a safety check on the parsed command.
4. The user reviews and confirms the command.
5. The main process starts a child process through an Effect-based process runner.
6. stdout and stderr stream back to the chat UI while the process runs.
7. The final execution result is returned to the LLM so it can continue answering.

This feature is high risk because it bridges model output to local command execution. The design keeps the execution boundary in the Electron main process and treats every run as a dangerous operation.

## Goals

- Add a built-in AI tool named `run_shell_command`.
- Support bash and PowerShell command text as first-class inputs.
- Parse commands with tree-sitter before execution.
- Block commands that fail parsing or match explicitly dangerous patterns.
- Require explicit user confirmation for every command execution.
- Execute commands only from the Electron main process.
- Stream stdout and stderr to the renderer while the command is running.
- Return a bounded final result to the LLM for tool-loop continuation.
- Keep the first implementation testable without redesigning the whole chat stream system.

## Non-Goals

- Do not create a fully interactive terminal.
- Do not support stdin prompts in the first slice.
- Do not allow background jobs to outlive the tool call.
- Do not support arbitrary shell selection beyond `bash` and `powershell`.
- Do not add always-approve or session-approve behavior for this tool.
- Do not expose environment variables wholesale to the model.
- Do not use this feature to replace existing file tools or MCP tools.

## Tool Contract

The renderer registers one built-in tool:

```ts
run_shell_command({
  shell: 'bash' | 'powershell',
  command: string,
  cwd?: string,
  timeoutMs?: number
})
```

The tool definition uses:

- `riskLevel: 'dangerous'`
- `requiresActiveDocument: false`
- `permissionCategory: 'system'`
- `safeAutoApprove: false`

The returned result is:

```ts
interface RunShellCommandResult {
  commandId: string;
  shell: 'bash' | 'powershell';
  command: string;
  cwd: string;
  exitCode: number | null;
  signal: string | null;
  durationMs: number;
  timedOut: boolean;
  stdout: string;
  stderr: string;
  truncated: boolean;
  safety: ShellCommandSafetyReport;
}
```

`stdout` and `stderr` in the final result are capped. The UI may show more streamed output during execution, but the final tool-result sent back to the model must remain bounded.

## Safety Model

The safety check has three layers.

First, basic input validation rejects empty commands, unsupported shells, invalid timeouts, and cwd values outside the current workspace root. If no workspace root exists, the tool refuses to run.

Second, a parser adapter parses the command into an AST. Bash and PowerShell are separate adapters behind a common interface:

```ts
interface ShellCommandParser {
  parse(command: string): ShellCommandParseResult;
}
```

The command is rejected if parsing fails, if the parser reports syntax errors, or if the adapter cannot produce a stable AST.

Third, a policy analyzer walks the AST and produces findings. The first version should block:

- destructive file operations such as recursive deletion
- permission and ownership mutation
- shell profile mutation
- process control that starts detached or background processes
- network download piped directly to a shell
- command substitution that hides a second command in an unsafe context
- output redirection that overwrites files outside the workspace
- environment dumping commands likely to expose secrets
- attempts to change directory outside the workspace before running a command

### Remaining Gap: Parser Layer Not Yet Wired

**Current status (2026-05-24):** The tree-sitter-based AST parser described above is designed but NOT yet functional in the running implementation. The dependencies (`tree-sitter`, `tree-sitter-bash`, `tree-sitter-powershell`) have been added to `package.json`, but pnpm currently ignores their native build scripts during installation. Calling `require('tree-sitter')` at runtime throws a native build missing error.

As a result, the safety analyzer (`electron/main/modules/shell/safety.mts`) currently uses **conservative regex-based pattern matching** (`appendPolicyFindings`) instead of AST walking. The `ShellCommandParser` interface (parser adapter producing AST) is defined in the design but not yet implemented.

The current regex approach blocks the most critical patterns (destructive delete, network-pipe-to-shell, env dump, background process) but is inherently fragile:
- It cannot distinguish syntax errors from valid commands containing blocked substrings
- It cannot reason about command structure (pipelines, subshells, redirections)
- String literals and comments may trigger false positives
- Complex obfuscation patterns will bypass the checks

**Path to resolution (two options):**

1. **Approve native build scripts** — Allow pnpm to execute the `tree-sitter` native build scripts. This gives full native performance and the standard tree-sitter API, but requires trusting the build scripts of these packages.

2. **WASM parser route** — Use tree-sitter's WASM builds instead of native bindings. The WASM builds are pre-compiled and require no native build step, eliminating the trust issue. The tradeoff is slightly lower parse performance and a different API surface (`tree-sitter-wasm` or tree-sitter's own WASM bindings).

The parser adapter boundary (`ShellCommandParser` interface) is designed to abstract this choice — callers will not need to change regardless of which route is chosen.

The analyzer returns a structured report:

```ts
interface ShellCommandSafetyReport {
  status: 'allowed' | 'blocked';
  shell: 'bash' | 'powershell';
  findings: ShellCommandSafetyFinding[];
  normalizedCommandPreview: string;
}

interface ShellCommandSafetyFinding {
  severity: 'info' | 'warning' | 'blocker';
  code: string;
  message: string;
  nodeText?: string;
}
```

Only `status: 'allowed'` commands can reach user confirmation.

## Permission Flow

`run_shell_command` always requires confirmation, even when the global tool permission mode is `autoSafe`.

The confirmation request shows:

- shell
- cwd
- timeout
- command text
- safety findings

The confirmation request uses `riskLevel: 'dangerous'` and does not allow remember scopes. The existing `executeWithPermission` helper already prevents remember scopes for dangerous tools; the Shell tool should also avoid setting `allowRemember`.

If the user cancels, the tool returns the standard cancelled result. If the command fails safety checks, the tool returns a failure result with `PERMISSION_DENIED` or `INVALID_INPUT`, depending on whether the failure is policy or malformed input.

## Main-Process Runtime

The actual process execution lives under the Electron main process, not in the renderer. The main process exposes IPC methods for:

- preflight safety analysis
- starting a command
- cancelling a running command
- streaming command output events

The process runner should use an Effect-based wrapper around child process spawning. The wrapper owns:

- process lifecycle
- stdout and stderr subscriptions
- timeout cancellation
- process-tree cleanup where practical
- final result assembly

The concrete runner interface is:

```ts
interface ShellCommandRunner {
  run(input: ShellCommandRunRequest, sink: ShellCommandOutputSink): Promise<ShellCommandRunResult>;
}
```

The first implementation can keep the Effect runner small and local. It should not force the rest of the AI tool stack to become Effect-based.

### Remaining Gap: Process-Tree Cleanup

**Current status (2026-05-24):** The runner's `cancel()` method sends `SIGTERM` only to the direct child process (`child.kill('SIGTERM')`). It does not walk or kill descendant processes spawned by the command. This means:

- Commands that spawn sub-processes (e.g., `pnpm test` spawning worker processes) may leave orphaned children running after cancellation or timeout
- The design calls for "process-tree cleanup where practical" but this is not yet implemented

On Unix platforms, this can be addressed by using `process.kill(-child.pid, signal)` (negated PID = kill the process group) if the child is spawned with `detached: true` and becomes a process group leader. On Windows, process tree cleanup requires different tooling.

### Relationship To MCP Stdio

`electron/main/modules/mcp/local-stdio.mts` is the closest existing child-process pattern in the codebase, but it should be treated as a partial implementation reference rather than a complete blueprint for Shell execution.

The useful MCP pattern is the disposable lifecycle shape:

1. create a child-process-backed session
2. use it for one bounded operation
3. clean it up in `finally`

Shell execution should reuse that lifecycle discipline, but it differs in important ways:

| Area | MCP Stdio | Shell Runner |
|------|-----------|--------------|
| Output format | JSON-RPC lines | Raw text streams |
| stderr handling | Accumulated mostly for errors | Streamed live to UI |
| timeout scope | Per JSON-RPC request | Per process execution |
| cancellation | Kill child process | Kill child process and clean process tree where practical |
| concurrency | Typically one session per server | Multiple concurrent command runs by `commandId` |
| user visibility | No live user-facing output | Live stdout/stderr updates |

This means Shell execution needs a runner that understands multiple output streams and the AI tool execution lifecycle, not only request-response JSON-RPC framing.

## Streaming Output

The current local AI tool path appends a tool result after `executeToolCall()` resolves. Shell output needs a side channel because stdout and stderr can arrive before the final result exists.

The main process emits output chunks by `commandId`:

```ts
interface ShellCommandOutputChunk {
  commandId: string;
  stream: 'stdout' | 'stderr';
  text: string;
  sequence: number;
  createdAt: string;
}
```

The renderer listens to these chunks and updates the matching tool-call display while the tool is running. The final `RunShellCommandResult` is still returned through the normal tool-result path so the LLM can continue the conversation.

If the UI cannot find a matching visible tool call, it should drop the chunk instead of creating a new chat message.

## Chat Stream Integration

`src/components/BChatSidebar/hooks/useChatStream.ts` currently executes local tools through `handleToolCall()` -> `executeTrackedToolCall()` -> `executeToolCall()`. The tracked tool task is awaited, and `handleStreamComplete()` waits for all tracked tool calls before it advances to the next model round.

For `run_shell_command`, that means the tool executor promise should resolve only after the spawned process exits, times out, or is cancelled. This preserves the existing tool-loop contract: the model does not receive the final tool result until command execution has finished.

Live shell output is therefore a UI side channel, not a separate tool-loop result channel. stdout and stderr chunks can update the visible tool-call display while `execute()` is still pending, but the next LLM continuation waits for the final `RunShellCommandResult`.

This is acceptable for bounded development commands. The first implementation should explicitly optimize for short-lived, non-interactive commands such as tests, build checks, lint checks, version inspection, and small scripts. Long-running interactive commands remain out of scope because they would keep the tool loop waiting and can create a poor chat UX.

If the app later needs interactive or very long-running tasks, Shell execution should become a task/session abstraction with explicit detach, cancel, and resume controls instead of a single AI tool call promise.

## Data Flow

1. The model emits a `run_shell_command` tool call.
2. `useChatStream` receives the tool call and appends a visible tool-call part.
3. The Shell tool validates input and asks the main process for safety analysis.
4. If blocked, the tool returns a failure result.
5. If allowed, the Shell tool asks the user to confirm the exact command.
6. After approval, the Shell tool calls the main process to start execution.
7. The main process spawns the child process and emits output chunks.
8. The renderer updates the tool-call UI with live stdout and stderr.
9. The process exits, times out, or is cancelled.
10. The Shell tool returns the final bounded result.
11. The normal tool-loop continuation sends the result back to the model.

## Error Handling

- Unsupported shell: `INVALID_INPUT`
- Empty command: `INVALID_INPUT`
- Missing workspace root: `PERMISSION_DENIED`
- cwd outside workspace: `PERMISSION_DENIED`
- Parser unavailable or parser crash: `EXECUTION_FAILED`
- Syntax errors: `INVALID_INPUT`
- Blocked safety finding: `PERMISSION_DENIED`
- User cancellation before spawn: cancelled result
- Timeout: failure result with `TOOL_TIMEOUT`, including partial output
- Non-zero exit code: success result with `exitCode`, because the command executed and the model needs stderr to reason about the failure
- Spawn failure: `EXECUTION_FAILED`
- Renderer listener disconnect: process continues until timeout or explicit cancel; final result still resolves

## UI Behavior

The existing confirmation card remains the approval surface. It should show the command as code and surface safety findings before approval.

During execution, the chat tool-call display should show a compact live output area. The UI should distinguish stdout and stderr, preserve output ordering by sequence, and avoid unbounded DOM growth by retaining a reasonable rolling buffer.

The final tool result should summarize:

- exit code or signal
- duration
- timeout status
- whether output was truncated

The raw final JSON should remain hidden behind the existing tool-result presentation conventions.

## Testing

Add focused tests before implementation:

- `test/ai/tools/builtin-shell.test.ts`
  - rejects unsupported shell
  - rejects empty command
  - rejects missing workspace root
  - rejects blocked safety reports
  - asks for confirmation after an allowed safety report
  - returns cancelled when confirmation is denied
  - returns bounded stdout and stderr from a successful run
  - treats non-zero exit as an executed result

- `test/ai/tools/builtin-index.test.ts`
  - exports `RUN_SHELL_COMMAND_TOOL_NAME`
  - includes the tool only when a confirmation adapter is available

- `test/electron/shell-safety.test.ts`
  - parser adapters report syntax errors
  - policy analyzer blocks destructive commands
  - policy analyzer allows simple project commands
  - cwd validation stays inside workspace

- `test/electron/shell-runner.test.ts`
  - streams stdout chunks
  - streams stderr chunks
  - returns exit code and duration
  - times out long-running commands
  - kills the child process on cancellation

- `test/components/BChatSidebar/useChatStream.test.ts`
  - live shell output chunks update the matching tool-call display
  - final shell result still triggers normal tool-loop continuation

## Rollout

The first release should register the tool only when:

- a confirmation adapter is available
- a workspace root is available
- the Electron native bridge supports shell command execution

The tool is not part of read-only mode. It should be excluded when the app runs without Electron system capabilities.

## Follow-Up Opportunities

- Add explicit command presets for common project workflows.
- Add a richer terminal-like output panel.
- Add user-configurable command allowlists and blocklists.
- Add per-workspace shell policy files.
- Add stdin support for safe prompts.
- Add shell output compression before sending results back to the LLM.
