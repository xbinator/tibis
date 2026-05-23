# MCP Stdio Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reuse local stdio MCP sessions across discovery and tool calls while preserving the current settings, cache, and AI SDK registration boundaries.

**Architecture:** Add a reusable local stdio session abstraction, then let the main-process MCP runtime own server-keyed live sessions. Renderer IPC gains connect, disconnect, and restart operations, while existing discovery cache and AI service tool exposure stay compatible.

**Tech Stack:** Electron main process, Vue 3, TypeScript, Pinia, Vitest, existing hand-written MCP JSON-RPC stdio runner.

---

## File Structure

- Modify: `types/ai.d.ts`
  - Add `MCPRuntimeStatus`.
  - Add `runtimeStatus` to `MCPStatusResponse` while keeping `sandboxStatus`.
- Modify: `types/electron-api.d.ts`
  - Add preload API signatures for connect, disconnect, and restart.
- Modify: `electron/preload/index.mts`
  - Expose new MCP lifecycle IPC calls.
- Modify: `electron/main/modules/mcp/local-stdio.mts`
  - Export reusable session interface and factory.
  - Keep one-shot helper functions backed by the reusable session.
- Modify: `electron/main/modules/mcp/runtime.mts`
  - Add live session registry and lifecycle functions.
  - Make discovery and execution lifecycle-aware.
- Modify: `electron/main/modules/mcp/ipc.mts`
  - Register new lifecycle IPC channels.
- Modify: `src/views/settings/tools/mcp/index.vue`
  - Use `runtimeStatus` for status text when available.
  - Make restart call new restart IPC.
- Modify: `test/electron/mcp-local-stdio.test.ts`
  - Cover reusable session behavior.
- Modify: `test/electron/mcp-runtime.test.ts`
  - Cover connect, reuse, on-demand connect, disconnect, restart, and cache preservation.
- Modify: `test/electron/mcp-ipc.test.ts`
  - Cover new IPC channels.
- Modify: `test/views/settings/tools-mcp/index.test.ts`
  - Cover restart IPC from the settings page.
- Modify: `changelog/2026-05-24.md`
  - Add a `Changed` entry for MCP lifecycle reuse.

## Task 1: Reusable Local Stdio Session

**Files:**
- Test: `test/electron/mcp-local-stdio.test.ts`
- Modify: `electron/main/modules/mcp/local-stdio.mts`

- [ ] **Step 1: Write the failing reusable-session test**

Add this test to `test/electron/mcp-local-stdio.test.ts`:

```ts
  it('keeps a reusable stdio session open across discovery and tool calls', async () => {
    const { createMcpStdioSession } = await import('../../electron/main/modules/mcp/local-stdio.mjs');
    const { child, requests, killMock } = createMockProcess();
    const spawnProcess = vi.fn(() => child);

    const session = await createMcpStdioSession(createServer(), spawnProcess);
    const tools = await session.listTools();
    const result = await session.callTool('read_file', { path: 'README.md' });

    expect(spawnProcess).toHaveBeenCalledTimes(1);
    expect(tools).toHaveLength(1);
    expect(result).toEqual({ content: [{ type: 'text', text: 'hello' }] });
    expect(requests.map((request) => request.method)).toEqual(['initialize', 'notifications/initialized', 'tools/list', 'tools/call']);

    session.close();

    expect(killMock).toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test test/electron/mcp-local-stdio.test.ts -t "keeps a reusable stdio session open"`

Expected: FAIL because `createMcpStdioSession` is not exported.

- [ ] **Step 3: Implement the reusable session export**

In `electron/main/modules/mcp/local-stdio.mts`:

- Export an `MCPLocalSession` interface with `listTools()`, `callTool()`, and `close()`.
- Keep `LocalMcpStdioSession` as the implementation.
- Add `createMcpStdioSession(server, spawnProcess = spawn)` that constructs the session, calls `initialize()`, and returns it.
- Update `discoverMcpToolsLocally()` and `executeMcpToolLocally()` to use `createMcpStdioSession()`.

- [ ] **Step 4: Run the local stdio tests**

Run: `pnpm test test/electron/mcp-local-stdio.test.ts`

Expected: PASS.

## Task 2: Runtime Lifecycle Registry

**Files:**
- Test: `test/electron/mcp-runtime.test.ts`
- Modify: `types/ai.d.ts`
- Modify: `electron/main/modules/mcp/runtime.mts`

- [ ] **Step 1: Write failing runtime lifecycle tests**

Add tests covering:

```ts
  it('connects a server, stores discovery cache and reports connected runtime status', async () => {
    const { connectMcpServer, getMcpDiscoveryCache, getMcpStatus } = await import('../../electron/main/modules/mcp/runtime.mjs');
    const tools: MCPDiscoveredToolSnapshot[] = [{ serverId: 'server-1', toolName: 'read_file' }];
    const session = {
      listTools: vi.fn(async () => tools),
      callTool: vi.fn(),
      close: vi.fn()
    };

    const result = await connectMcpServer(createServer(), {
      createSession: vi.fn(async () => session),
      now: () => 1710000000000
    });

    expect(result.ok).toBe(true);
    expect(getMcpDiscoveryCache('server-1')).toEqual(result.cache);
    expect(getMcpStatus(['server-1'])[0]).toMatchObject({
      runtimeStatus: 'connected',
      sandboxStatus: 'running',
      discoveryStatus: 'ready'
    });
  });
```

Also add tests for:

- `executeMcpTool()` reuses a connected session.
- `executeMcpTool()` connects on demand when no session exists.
- `disconnectMcpServer()` closes the session and is idempotent.
- `restartMcpServer()` closes the old session before creating the new one.
- failed connect does not replace an existing successful discovery cache.

- [ ] **Step 2: Run the runtime tests to verify failure**

Run: `pnpm test test/electron/mcp-runtime.test.ts`

Expected: FAIL because lifecycle functions and dependencies do not exist.

- [ ] **Step 3: Add runtime status type**

In `types/ai.d.ts`, add:

```ts
export type MCPRuntimeStatus = 'idle' | 'connecting' | 'connected' | 'failed' | 'disabled';
```

Add `runtimeStatus: MCPRuntimeStatus` to `MCPStatusResponse`.

- [ ] **Step 4: Implement runtime lifecycle registry**

In `electron/main/modules/mcp/runtime.mts`:

- Import `createMcpStdioSession` and `MCPLocalSession`.
- Add `sessionsByServerId = new Map<string, MCPLocalSession>()`.
- Add `connectMcpServer()`, `disconnectMcpServer()`, and `restartMcpServer()`.
- Update `refreshMcpDiscovery()` to call `connectMcpServer()`.
- Update `executeMcpTool()` to use an existing session or connect on demand.
- Update `resetMcpRuntimeState()` to close and clear sessions.
- Keep old dependency injection fields working for existing tests.

- [ ] **Step 5: Run runtime tests**

Run: `pnpm test test/electron/mcp-runtime.test.ts`

Expected: PASS.

## Task 3: IPC and Preload API

**Files:**
- Test: `test/electron/mcp-ipc.test.ts`
- Modify: `electron/main/modules/mcp/ipc.mts`
- Modify: `electron/preload/index.mts`
- Modify: `types/electron-api.d.ts`

- [ ] **Step 1: Write failing IPC registration test**

Update `test/electron/mcp-ipc.test.ts` to expect:

```ts
    expect(handleMock).toHaveBeenCalledWith('tools:mcp:connect', expect.any(Function));
    expect(handleMock).toHaveBeenCalledWith('tools:mcp:disconnect', expect.any(Function));
    expect(handleMock).toHaveBeenCalledWith('tools:mcp:restart', expect.any(Function));
```

- [ ] **Step 2: Run the IPC test to verify failure**

Run: `pnpm test test/electron/mcp-ipc.test.ts`

Expected: FAIL because the new channels are not registered.

- [ ] **Step 3: Register IPC channels and preload methods**

In `electron/main/modules/mcp/ipc.mts`, add handlers:

- `tools:mcp:connect`
- `tools:mcp:disconnect`
- `tools:mcp:restart`

In `electron/preload/index.mts`, expose:

- `connectMcpServer(server)`
- `disconnectMcpServer(serverId)`
- `restartMcpServer(server)`

In `types/electron-api.d.ts`, add matching signatures.

- [ ] **Step 4: Run IPC test**

Run: `pnpm test test/electron/mcp-ipc.test.ts`

Expected: PASS.

## Task 4: Settings Page Restart Wiring

**Files:**
- Test: `test/views/settings/tools-mcp/index.test.ts`
- Modify: `src/views/settings/tools/mcp/index.vue`

- [ ] **Step 1: Write failing settings page test**

Update the Electron API mock in `test/views/settings/tools-mcp/index.test.ts` to include `restartMcpServer`. Add a test that clicks `重启` and asserts `restartMcpServer` receives the server config.

- [ ] **Step 2: Run the settings page test to verify failure**

Run: `pnpm test test/views/settings/tools-mcp/index.test.ts -t "restart"`

Expected: FAIL because the page still calls `refreshMcpDiscovery`.

- [ ] **Step 3: Update page restart behavior and status text**

In `src/views/settings/tools/mcp/index.vue`:

- Change `handleRefreshDiscovery()` to call `restartMcpServer(server)` when available.
- Keep fallback error handling for missing Electron API.
- Update status summary to prefer `runtimeStatus` and still show `sandboxStatus` if runtime status is absent.

- [ ] **Step 4: Run settings tests**

Run: `pnpm test test/views/settings/tools-mcp/index.test.ts`

Expected: PASS.

## Task 5: Changelog and Focused Verification

**Files:**
- Modify: `changelog/2026-05-24.md`

- [ ] **Step 1: Add changelog entry**

Under `## Changed`, add:

```md
- MCP 本地 stdio runtime 改为可复用会话生命周期，支持主进程连接、断开与重启并复用已连接 server 执行工具。
```

If `## Changed` does not exist, insert it after the title.

- [ ] **Step 2: Run focused verification**

Run:

```bash
pnpm test test/electron/mcp-local-stdio.test.ts test/electron/mcp-runtime.test.ts test/electron/mcp-ipc.test.ts test/views/settings/tools-mcp/index.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run typecheck if available**

Run: `pnpm typecheck`

Expected: PASS, or report if the project does not define this script.
