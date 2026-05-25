# Tibis Workspace Root Design

## Background

Tibis is positioned as a local-first Markdown editor. Users primarily think in terms of documents, recent files, generated Markdown, attachments, exports, and AI-assisted editing. They should not need to understand an IDE-style project workspace before using AI features.

The Shell command tool introduced in `docs/superpowers/specs/2026-05-24-shell-tool-design.md` needs a filesystem boundary for safety. Its first implementation uses `workspaceRoot`, but the chat sidebar currently does not provide one. This makes the tool fail with a workspace-root error even though the user is using Tibis correctly.

The long-term answer is not to special-case Shell execution. Tibis needs an application-level workspace root: a cross-platform directory that acts as the default safe area for AI side effects, generated files, command execution, attachments, exports, and future local automation.

## Goals

- Define a Tibis-managed workspace root that exists even when no Markdown file is open.
- Keep the user mental model simple: Tibis owns a local workspace directory for AI-generated and AI-modified artifacts.
- Use the workspace root as the default Shell execution boundary.
- Make the workspace root cross-platform and configurable in the future.
- Keep the first implementation small enough to unblock Shell execution without redesigning all file tools.
- Avoid hard-coding Shell-only paths so future features can share the same provider.

## Non-Goals

- Do not turn Tibis into an IDE project manager in this phase.
- Do not require users to create or select a workspace before using Tibis.
- Do not implement multi-workspace switching in the first phase.
- Do not move existing recent files into the Tibis workspace automatically.
- Do not allow Shell commands to execute outside the selected workspace root.

## Default Workspace Location

The first version should create one default workspace root per OS user.

Recommended default:

| Platform | Default |
|----------|---------|
| macOS | `~/Tibis` |
| Linux | `~/Tibis` |
| Windows | `%USERPROFILE%\Tibis` |

Rationale:

- The path is short and readable in confirmation dialogs.
- It is clearly owned by Tibis.
- It avoids mixing AI-generated files directly into `Documents`.
- It works even when the user has no active Markdown file.

The path must be resolved in the Electron main process, not by string concatenation in the renderer. The renderer should ask for the workspace root through a native capability.

## Workspace Provider

Introduce a focused workspace provider in the Electron main process.

Proposed module:

`electron/main/modules/workspace/root.mts`

Responsibilities:

- Resolve the default workspace root for the current platform.
- Ensure the directory exists before a feature uses it.
- Normalize and realpath the workspace root where practical.
- Provide path-boundary helpers shared by Shell and later file features.

Proposed interface:

```ts
/**
 * Tibis workspace root information.
 */
export interface TibisWorkspaceRoot {
  /** Absolute root directory used as the safe boundary. */
  rootPath: string;
  /** Whether the directory had to be created during this request. */
  created: boolean;
}

/**
 * Resolves and creates the Tibis workspace root when missing.
 * @returns Workspace root metadata
 */
export async function ensureTibisWorkspaceRoot(): Promise<TibisWorkspaceRoot>;
```

The first implementation can keep configuration out of scope and always return the platform default. The interface should still be named generically so settings-backed roots and multi-workspace roots can be added without changing Shell semantics.

## Native Bridge

Expose the workspace provider through the existing native platform layer.

Main process:

- Add an IPC handler such as `workspace:get-root`.
- The handler calls `ensureTibisWorkspaceRoot()`.
- Errors should be returned as user-readable execution failures.

Preload and renderer native bridge:

- Extend `types/electron-api` with `getTibisWorkspaceRoot()`.
- Extend `src/shared/platform/native/types.ts`.
- Implement Electron support in `src/shared/platform/native/electron.ts`.
- Implement a web fallback in `src/shared/platform/native/web.ts` that reports unsupported or returns `null`.

The Shell tool should depend on `native.getTibisWorkspaceRoot()` only through the shared native abstraction.

## Shell Tool Integration

The Shell tool should stop failing just because `getWorkspaceRoot()` is absent.

Resolution order:

1. If a tool caller explicitly provides `getWorkspaceRoot()`, use that value.
2. Otherwise call `native.getTibisWorkspaceRoot()` and use the returned root.
3. If the native workspace root cannot be created or resolved, return an execution failure with a Tibis workspace message.

Updated behavior:

- Default `cwd` becomes the Tibis workspace root.
- User-provided `cwd` must remain inside the Tibis workspace root.
- Safety analysis receives the Tibis workspace root as its boundary.
- Confirmation copy should say `Tibis 工作区` or `执行目录`, not ask the user to understand an IDE workspace.

Example failure copy:

```text
无法初始化 Tibis 工作区目录，拒绝执行 Shell 命令。
```

Example confirmation copy:

```text
AI 请求在 Tibis 工作区内执行 Shell 命令。
Shell: bash
执行目录: ~/Tibis
```

The internal field can remain `workspaceRoot` in this phase to minimize churn. A later cleanup can rename the Shell boundary type to `executionRoot`.

## User Experience

The user should not be blocked by a missing workspace concept.

First phase:

- Shell commands run in the Tibis workspace root by default.
- If the directory does not exist, Tibis creates it automatically.
- The confirmation card shows the resolved execution directory.
- Errors reference `Tibis 工作区目录`, not `工作区根目录`.

Future settings page:

- Add a `Tibis 工作区目录` setting.
- Show the resolved path.
- Provide a choose-directory action.
- Provide an open-directory action.
- Warn before switching if running tasks exist.

The settings UI is a follow-up, not required to unblock Shell execution.

## Safety Model

The Tibis workspace root becomes the safety boundary for local side effects.

Shell safety keeps the existing protections:

- Reject `cwd` outside the root.
- Reject `cd` outside the root.
- Reject output redirection outside the root.
- Reject dangerous process, permission, profile, and environment commands.
- Require user confirmation for every Shell run.

The workspace root should not imply trust. It only scopes where side effects may happen. Commands inside the root are still dangerous and still require confirmation.

## Future Extension

The provider should support these later additions without changing Shell contracts:

- User-selected workspace directory.
- Multiple named workspaces.
- Per-workspace `.tibis` settings.
- Generated Markdown output directories.
- Attachment and image asset directories.
- Export defaults for PDF and other formats.
- Local knowledge indexes scoped to a workspace.
- Per-workspace AI permission policy.

This is why the abstraction should be `TibisWorkspaceRoot`, not `ShellWorkspaceRoot`.

## Implementation Notes

Likely files for the first phase:

- `electron/main/modules/workspace/root.mts`
- `electron/main/modules/workspace/ipc.mts`
- `electron/main/index.mts`
- `electron/preload/index.mts`
- `src/shared/platform/native/types.ts`
- `src/shared/platform/native/electron.ts`
- `src/shared/platform/native/web.ts`
- `src/ai/tools/builtin/ShellTool/index.ts`
- `test/electron/workspace-root.test.ts`
- `test/ai/tools/builtin-shell.test.ts`

Testing should cover:

- macOS/Linux path resolution uses the user home directory.
- Windows path resolution uses the user profile directory.
- The workspace directory is created when missing.
- Shell tool falls back to the Tibis workspace root when no caller workspace exists.
- Shell tool still rejects `cwd` outside the Tibis workspace root.
- Web/native-unsupported mode keeps Shell unavailable or fails with a clear message.

## Rollout

Phase 1:

- Add the workspace provider and IPC.
- Let Shell use it as the fallback root.
- Update Shell failure and confirmation copy.
- Add focused tests.

Phase 2:

- Add a settings UI for changing the workspace root.
- Persist the chosen root.
- Add an open-directory action.

Phase 3:

- Add multi-workspace support and per-workspace policy.
- Share the provider with generated file, attachment, export, and local index features.
