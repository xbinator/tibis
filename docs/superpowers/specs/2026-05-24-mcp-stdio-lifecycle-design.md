# MCP Stdio Lifecycle Design

## Background

Tibis already supports MCP tools through local `stdio` servers. The current implementation treats discovery and tool execution as one-shot operations:

- `electron/main/modules/mcp/local-stdio.mts` starts a child process, initializes MCP, performs `tools/list` or `tools/call`, then closes the process.
- `electron/main/modules/mcp/runtime.mts` stores in-memory status and discovery cache, but does not keep a live MCP session.
- `electron/main/modules/mcp/tools.mts` converts cached discovery snapshots into AI SDK tools.
- `src/components/BChatSidebar/hooks/useChatStream.ts` sends the current global MCP server snapshot to the main process for each chat request.

This is simple and testable, but repeated tool calls pay process startup cost every time. It also prevents stateful MCP servers, server-side tool-change notifications, and cleaner connect/disconnect controls.

## Goals

- Keep the first slice focused on local `stdio` MCP servers.
- Add main-process server lifecycle management so a connected server session can be reused for multiple tool calls.
- Preserve the existing discovery cache and AI SDK tool exposure boundary.
- Add explicit runtime operations for connect, disconnect, and restart.
- Improve status semantics without breaking existing renderer code in the same change.
- Keep test coverage centered on runtime behavior, session reuse, and UI IPC wiring.

## Non-Goals

- Do not add HTTP, SSE, or OAuth support in this slice.
- Do not migrate to `@modelcontextprotocol/sdk` in this slice.
- Do not add MCP prompt or resource support.
- Do not redesign the MCP settings page layout.
- Do not persist discovery cache across app restarts.
- Do not add per-chat MCP overrides.

## Proposed Approach

The runtime becomes the owner of live MCP server sessions. A session is keyed by `server.id` and wraps the existing local stdio JSON-RPC session. Discovery and tool execution both go through this session when it exists.

`local-stdio.mts` will expose a reusable session factory while keeping the current one-shot helpers for compatibility and focused tests. The reusable session will support:

- initialize once
- list tools repeatedly
- call tools repeatedly
- close with pending request rejection

`runtime.mts` will add a small session registry:

- `connectMcpServer(server)` creates or reuses a session, initializes it, refreshes discovery, stores cache, and marks the server connected.
- `disconnectMcpServer(serverId)` closes and removes a live session.
- `restartMcpServer(server)` disconnects then connects.
- `executeMcpTool(server, toolName, input)` reuses a live session when available, otherwise connects on demand before calling the tool.
- `refreshMcpDiscovery(server)` becomes a lifecycle-aware operation that uses the live session path.

The settings page can keep its current UI shape. Its existing "restart" action should call the new restart/connect behavior through preload IPC, then refresh status.

## Status Model

The current type exposes `sandboxStatus`, although the implementation is no longer sandbox-based. To reduce breakage, this slice should add a clearer runtime field while keeping the old field populated:

```ts
type MCPRuntimeStatus = 'idle' | 'connecting' | 'connected' | 'failed' | 'disabled';

interface MCPStatusResponse {
  serverId: string;
  runtimeStatus: MCPRuntimeStatus;
  sandboxStatus: MCPSandboxStatus;
  discoveryStatus: MCPDiscoveryStatus;
  message?: string;
}
```

Compatibility mapping:

- `idle` -> `sandboxStatus: 'idle'`
- `connecting` -> `sandboxStatus: 'starting'`
- `connected` -> `sandboxStatus: 'running'`
- `failed` -> `sandboxStatus: 'failed'`
- `disabled` -> `sandboxStatus: 'idle'`

After downstream code uses `runtimeStatus`, a later cleanup can remove or rename `sandboxStatus`.

## Data Flow

1. The user configures MCP servers in `src/views/settings/tools/mcp/index.vue`.
2. The renderer calls preload IPC to connect, restart, or disconnect a server.
3. `electron/main/modules/mcp/runtime.mts` owns the live session registry and discovery cache.
4. `electron/main/modules/ai/service.mts` still reads discovery cache and registers AI SDK tools through `electron/main/modules/mcp/tools.mts`.
5. When the model calls an MCP SDK tool, `executeMcpTool()` reuses the connected session or connects on demand.
6. If a session fails, the runtime marks the server failed and rejects the active operation without clearing the previous successful cache unless a successful refresh replaces it.

## Error Handling

- Disabled or commandless servers should fail before spawning.
- Connect failure should set `runtimeStatus: 'failed'` and `discoveryStatus: 'failed'`.
- Tool execution failure should preserve the live session only if the child process is still alive and pending handling remains valid; process exit should close the session and mark status failed.
- Disconnect should be idempotent.
- Restart should always attempt cleanup before creating the new session.
- Existing discovery cache should only be replaced after successful discovery.

## Testing

Add or update tests in the existing MCP test files:

- `test/electron/mcp-local-stdio.test.ts`
  - reusable session initializes once and can list tools then call tools without a second spawn
  - closing the session kills the child process and rejects pending requests

- `test/electron/mcp-runtime.test.ts`
  - connect stores a live session and discovery cache
  - execute reuses an already connected session
  - execute connects on demand when no session exists
  - disconnect closes the session and is idempotent
  - restart disconnects before reconnecting
  - failed discovery does not overwrite the previous successful cache

- `test/electron/mcp-ipc.test.ts`
  - new connect, disconnect, and restart channels are registered

- `test/views/settings/tools-mcp/index.test.ts`
  - restart action calls the new runtime IPC and refreshes status

## Rollout

This change should be shipped behind the existing MCP settings flow. Users should not need to migrate configuration. Existing servers continue to use the same persisted shape:

- `id`
- `name`
- `enabled`
- `transport: 'stdio'`
- `command`
- `args`
- `env`
- `toolAllowlist`
- `connectTimeoutMs`
- `toolCallTimeoutMs`

The implementation should not introduce remote MCP configuration fields yet.

## Follow-Up Opportunities

- Replace the hand-written JSON-RPC stdio runner with `@modelcontextprotocol/sdk`.
- Listen for MCP tool list change notifications and refresh cache automatically.
- Add process-tree cleanup for child descendants started by wrappers such as `npx`.
- Add remote Streamable HTTP and SSE transport support.
- Add OAuth support for remote MCP servers.
