/**
 * @file mcp-session.test.ts
 * @description 验证 MCP session 状态与 discovery cache 管理。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MCPDiscoveredToolSnapshot, MCPServerConfig } from '@/shared/storage/tool-settings';

vi.mock('../../electron/main/modules/logger/service.mjs', () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() }
}));

vi.mock('../../electron/main/modules/store/service.mjs', () => ({
  getStore: vi.fn(() => ({
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn()
  }))
}));

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

describe('mcp session', () => {
  beforeEach(async () => {
    const { resetMcpState } = await import('../../electron/main/modules/mcp/session.mjs');
    await resetMcpState();
  });

  it('returns idle status before a server is refreshed', async () => {
    const { getMcpStatus } = await import('../../electron/main/modules/mcp/session.mjs');

    expect(getMcpStatus(['server-1'])).toEqual([
      {
        serverId: 'server-1',
        runtimeStatus: 'idle',
        sandboxStatus: 'idle',
        discoveryStatus: 'idle'
      }
    ]);
  });

  it('reports failed status when server config is invalid', async () => {
    const { connectMcpServer, getMcpStatus } = await import('../../electron/main/modules/mcp/session.mjs');

    const result = await connectMcpServer(createServer({ command: '' }));

    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe('LOCAL_EXEC_FAILED');
    expect(getMcpStatus(['server-1'])[0]).toMatchObject({
      sandboxStatus: 'failed',
      discoveryStatus: 'failed'
    });
  });

  it('reports failed status when remote server has no URL', async () => {
    const { connectMcpServer, getMcpStatus } = await import('../../electron/main/modules/mcp/session.mjs');

    const result = await connectMcpServer(createServer({ transport: 'streamableHTTP', url: '' }));

    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe('LOCAL_EXEC_FAILED');
    expect(getMcpStatus(['server-1'])[0]).toMatchObject({
      sandboxStatus: 'failed',
      discoveryStatus: 'failed'
    });
  });

  it('reports disabled status when server is not enabled', async () => {
    const { connectMcpServer, getMcpStatus } = await import('../../electron/main/modules/mcp/session.mjs');

    const result = await connectMcpServer(createServer({ enabled: false }));

    expect(result.ok).toBe(false);
    expect(getMcpStatus(['server-1'])[0]).toMatchObject({
      runtimeStatus: 'disabled',
      sandboxStatus: 'idle'
    });
  });

  it('disconnects an MCP server session idempotently', async () => {
    const { disconnectMcpServer, getMcpStatus } = await import('../../electron/main/modules/mcp/session.mjs');

    disconnectMcpServer('server-1');
    disconnectMcpServer('server-1');

    expect(getMcpStatus(['server-1'])[0]).toMatchObject({
      runtimeStatus: 'idle',
      sandboxStatus: 'idle'
    });
  });

  it('returns discovery cache after setting it', async () => {
    const { getDiscoveryCache } = await import('../../electron/main/modules/mcp/discovery.mjs');
    const { createDiscoverySuccessResult } = await import('../../electron/main/modules/mcp/discovery.mjs');

    const tools: MCPDiscoveredToolSnapshot[] = [{ serverId: 'server-1', toolName: 'read_file', description: 'Read file' }];
    createDiscoverySuccessResult('server-1', tools, 1710000000000);

    const cache = getDiscoveryCache('server-1');
    expect(cache).not.toBeUndefined();
    expect(Array.isArray(cache) ? cache[0]?.tools : cache?.tools).toEqual(tools);
  });

  it('clears discovery cache when disconnecting', async () => {
    const { getDiscoveryCache } = await import('../../electron/main/modules/mcp/discovery.mjs');
    const { createDiscoverySuccessResult, deleteDiscoveryCache } = await import('../../electron/main/modules/mcp/discovery.mjs');

    const tools: MCPDiscoveredToolSnapshot[] = [{ serverId: 'server-1', toolName: 'read_file', description: 'Read file' }];
    createDiscoverySuccessResult('server-1', tools, 1710000000000);

    deleteDiscoveryCache('server-1');
    expect(getDiscoveryCache('server-1')).toBeUndefined();
  });
});
