/**
 * @file mcp-runtime.test.ts
 * @description 验证 MCP runtime 状态与 discovery cache 管理。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MCPDiscoveredToolSnapshot, MCPServerConfig } from '@/shared/storage/tool-settings';

/**
 * 创建 MCP server 配置。
 * @param patch - 覆盖字段
 * @returns MCP server 配置
 */
function createServer(patch: Partial<MCPServerConfig> = {}): MCPServerConfig {
  return {
    id: 'server-1',
    name: 'Filesystem',
    enabled: true,
    transport: 'stdio',
    command: 'npx',
    args: [],
    env: {},
    toolAllowlist: [],
    connectTimeoutMs: 20000,
    toolCallTimeoutMs: 30000,
    ...patch
  };
}

describe('mcp runtime', () => {
  beforeEach(async () => {
    const { resetMcpRuntimeState } = await import('../../electron/main/modules/mcp/runtime.mjs');
    resetMcpRuntimeState();
  });

  it('returns idle status before a server is refreshed', async () => {
    const { getMcpStatus } = await import('../../electron/main/modules/mcp/runtime.mjs');

    expect(getMcpStatus(['server-1'])).toEqual([
      {
        serverId: 'server-1',
        runtimeStatus: 'idle',
        sandboxStatus: 'idle',
        discoveryStatus: 'idle'
      }
    ]);
  });

  it('refreshes discovery and stores a cache when provider succeeds', async () => {
    const { getMcpDiscoveryCache, getMcpStatus, refreshMcpDiscovery } = await import('../../electron/main/modules/mcp/runtime.mjs');
    const tools: MCPDiscoveredToolSnapshot[] = [{ serverId: 'server-1', toolName: 'read_file', description: 'Read file' }];
    const discoverTools = vi.fn(async () => tools);

    const result = await refreshMcpDiscovery(createServer(), { discoverTools, now: () => 1710000000000 });

    expect(result).toEqual({
      ok: true,
      serverId: 'server-1',
      cache: {
        serverId: 'server-1',
        tools,
        discoveredAt: 1710000000000
      }
    });
    expect(getMcpDiscoveryCache('server-1')).toEqual(result.cache);
    expect(getMcpStatus(['server-1'])[0]).toMatchObject({
      sandboxStatus: 'running',
      discoveryStatus: 'ready'
    });
  });

  it('connects a server, stores discovery cache and reports connected runtime status', async () => {
    const { connectMcpServer, getMcpDiscoveryCache, getMcpStatus } = await import('../../electron/main/modules/mcp/runtime.mjs');
    const tools: MCPDiscoveredToolSnapshot[] = [{ serverId: 'server-1', toolName: 'read_file', description: 'Read file' }];
    const session = {
      listTools: vi.fn(async () => tools),
      callTool: vi.fn(),
      close: vi.fn()
    };

    const result = await connectMcpServer(createServer(), {
      createSession: vi.fn(async () => session),
      now: () => 1710000000000
    });

    expect(result).toEqual({
      ok: true,
      serverId: 'server-1',
      cache: {
        serverId: 'server-1',
        tools,
        discoveredAt: 1710000000000
      }
    });
    expect(getMcpDiscoveryCache('server-1')).toEqual(result.cache);
    expect(getMcpStatus(['server-1'])[0]).toMatchObject({
      runtimeStatus: 'connected',
      sandboxStatus: 'running',
      discoveryStatus: 'ready'
    });
  });

  it('reuses an already connected session when executing MCP tools', async () => {
    const { connectMcpServer, executeMcpTool } = await import('../../electron/main/modules/mcp/runtime.mjs');
    const session = {
      listTools: vi.fn(async () => [{ serverId: 'server-1', toolName: 'read_file' }]),
      callTool: vi.fn(async () => ({ content: [{ type: 'text', text: 'ok' }] })),
      close: vi.fn()
    };
    const createSession = vi.fn(async () => session);

    await connectMcpServer(createServer(), { createSession });
    const result = await executeMcpTool(createServer(), 'read_file', { path: 'README.md' }, { createSession });

    expect(createSession).toHaveBeenCalledTimes(1);
    expect(session.callTool).toHaveBeenCalledWith('read_file', { path: 'README.md' });
    expect(result).toEqual({ content: [{ type: 'text', text: 'ok' }] });
  });

  it('reconnects instead of reusing a session when the server launch config changes', async () => {
    const { connectMcpServer, executeMcpTool } = await import('../../electron/main/modules/mcp/runtime.mjs');
    const firstSession = {
      listTools: vi.fn(async () => [{ serverId: 'server-1', toolName: 'read_file' }]),
      callTool: vi.fn(async () => ({ content: [{ type: 'text', text: 'old' }] })),
      close: vi.fn()
    };
    const secondSession = {
      listTools: vi.fn(async () => [{ serverId: 'server-1', toolName: 'read_file' }]),
      callTool: vi.fn(async () => ({ content: [{ type: 'text', text: 'new' }] })),
      close: vi.fn()
    };
    const createSession = vi.fn(async () => (createSession.mock.calls.length === 1 ? firstSession : secondSession));

    await connectMcpServer(createServer({ command: 'npx' }), { createSession });
    const result = await executeMcpTool(createServer({ command: 'uvx' }), 'read_file', { path: 'README.md' }, { createSession });

    expect(firstSession.close).toHaveBeenCalledTimes(1);
    expect(createSession).toHaveBeenCalledTimes(2);
    expect(secondSession.callTool).toHaveBeenCalledWith('read_file', { path: 'README.md' });
    expect(result).toEqual({ content: [{ type: 'text', text: 'new' }] });
  });

  it('connects on demand when executing MCP tools without a live session', async () => {
    const { executeMcpTool, getMcpStatus } = await import('../../electron/main/modules/mcp/runtime.mjs');
    const session = {
      listTools: vi.fn(async () => [{ serverId: 'server-1', toolName: 'read_file' }]),
      callTool: vi.fn(async () => ({ content: [{ type: 'text', text: 'ok' }] })),
      close: vi.fn()
    };
    const createSession = vi.fn(async () => session);

    const result = await executeMcpTool(createServer(), 'read_file', { path: 'README.md' }, { createSession });

    expect(createSession).toHaveBeenCalledTimes(1);
    expect(session.listTools).toHaveBeenCalledTimes(1);
    expect(session.callTool).toHaveBeenCalledWith('read_file', { path: 'README.md' });
    expect(result).toEqual({ content: [{ type: 'text', text: 'ok' }] });
    expect(getMcpStatus(['server-1'])[0]).toMatchObject({
      runtimeStatus: 'connected',
      discoveryStatus: 'ready'
    });
  });

  it('disconnects an MCP server session idempotently', async () => {
    const { connectMcpServer, disconnectMcpServer, getMcpStatus } = await import('../../electron/main/modules/mcp/runtime.mjs');
    const session = {
      listTools: vi.fn(async () => [{ serverId: 'server-1', toolName: 'read_file' }]),
      callTool: vi.fn(),
      close: vi.fn()
    };

    await connectMcpServer(createServer(), { createSession: vi.fn(async () => session) });
    disconnectMcpServer('server-1');
    disconnectMcpServer('server-1');

    expect(session.close).toHaveBeenCalledTimes(1);
    expect(getMcpStatus(['server-1'])[0]).toMatchObject({
      runtimeStatus: 'idle',
      sandboxStatus: 'idle'
    });
  });

  it('restarts a server by closing the old session before creating a new one', async () => {
    const { connectMcpServer, restartMcpServer } = await import('../../electron/main/modules/mcp/runtime.mjs');
    const firstSession = {
      listTools: vi.fn(async () => [{ serverId: 'server-1', toolName: 'read_file' }]),
      callTool: vi.fn(),
      close: vi.fn()
    };
    const secondSession = {
      listTools: vi.fn(async () => [{ serverId: 'server-1', toolName: 'write_file' }]),
      callTool: vi.fn(),
      close: vi.fn()
    };
    const createSession = vi.fn(async () => (createSession.mock.calls.length === 1 ? firstSession : secondSession));

    await connectMcpServer(createServer(), { createSession });
    const result = await restartMcpServer(createServer(), { createSession });

    expect(firstSession.close).toHaveBeenCalledTimes(1);
    expect(createSession).toHaveBeenCalledTimes(2);
    expect(result.cache?.tools).toEqual([{ serverId: 'server-1', toolName: 'write_file' }]);
  });

  it('does not replace an existing discovery cache when reconnect fails', async () => {
    const { connectMcpServer, getMcpDiscoveryCache, restartMcpServer } = await import('../../electron/main/modules/mcp/runtime.mjs');
    const firstSession = {
      listTools: vi.fn(async () => [{ serverId: 'server-1', toolName: 'read_file' }]),
      callTool: vi.fn(),
      close: vi.fn()
    };
    const createSession = vi
      .fn()
      .mockResolvedValueOnce(firstSession)
      .mockRejectedValueOnce(new Error('local spawn failed'));

    const firstResult = await connectMcpServer(createServer(), { createSession, now: () => 1710000000000 });
    const failedResult = await restartMcpServer(createServer(), { createSession });

    expect(failedResult.ok).toBe(false);
    expect(getMcpDiscoveryCache('server-1')).toEqual(firstResult.cache);
  });

  it('marks status as failed when local discovery fails', async () => {
    const { getMcpStatus, refreshMcpDiscovery } = await import('../../electron/main/modules/mcp/runtime.mjs');

    const result = await refreshMcpDiscovery(createServer(), {
      discoverTools: vi.fn(async () => {
        throw new Error('local spawn failed');
      })
    });

    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe('LOCAL_EXEC_FAILED');
    expect(getMcpStatus(['server-1'])[0]).toMatchObject({
      sandboxStatus: 'failed',
      discoveryStatus: 'failed',
      message: 'local spawn failed'
    });
  });

  it('executes MCP tools with the matching local server config', async () => {
    const { executeMcpTool } = await import('../../electron/main/modules/mcp/runtime.mjs');
    const executeTool = vi.fn(async () => ({ content: [{ type: 'text', text: 'ok' }] }));

    const result = await executeMcpTool(createServer(), 'read_file', { path: 'README.md' }, { executeTool });

    expect(executeTool).toHaveBeenCalledWith(createServer(), 'read_file', { path: 'README.md' });
    expect(result).toEqual({ content: [{ type: 'text', text: 'ok' }] });
  });
});
