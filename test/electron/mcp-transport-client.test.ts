/**
 * @file mcp-transport-client.test.ts
 * @description 验证 MCP transport 工厂与 client 包装器的基础行为。
 */
import { describe, expect, it } from 'vitest';
import type { MCPServerConfig } from '@/shared/storage/tool-settings';

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
    command: 'node',
    args: ['server.mjs'],
    env: { SAFE_ROOT: '/workspace' },
    toolAllowlist: [],
    connectTimeoutMs: 20000,
    toolCallTimeoutMs: 30000,
    ...patch
  };
}

describe('mcp transport factory', () => {
  it('creates stdio transport for stdio server', async () => {
    const { createTransport } = await import('../../electron/main/modules/mcp/transport.mjs');

    const transport = createTransport(createServer());
    expect(transport).toBeDefined();
    expect(typeof transport.start).toBe('function');
    expect(typeof transport.close).toBe('function');
  });

  it('throws when stdio command is empty', async () => {
    const { createTransport } = await import('../../electron/main/modules/mcp/transport.mjs');

    expect(() => createTransport(createServer({ command: '' }))).toThrow('Command is required');
  });

  it('throws when streamableHTTP URL is empty', async () => {
    const { createTransport } = await import('../../electron/main/modules/mcp/transport.mjs');

    expect(() => createTransport(createServer({ transport: 'streamableHTTP', url: '' }))).toThrow('URL is required');
  });

  it('throws when SSE URL is empty', async () => {
    const { createTransport } = await import('../../electron/main/modules/mcp/transport.mjs');

    expect(() => createTransport(createServer({ transport: 'sse', url: '' }))).toThrow('URL is required');
  });

  it('creates streamableHTTP transport for remote server', async () => {
    const { createTransport } = await import('../../electron/main/modules/mcp/transport.mjs');

    const transport = createTransport(createServer({ transport: 'streamableHTTP', url: 'http://localhost:8080/mcp' }));
    expect(transport).toBeDefined();
    expect(typeof transport.start).toBe('function');
  });

  it('creates SSE transport for SSE server', async () => {
    const { createTransport } = await import('../../electron/main/modules/mcp/transport.mjs');

    const transport = createTransport(createServer({ transport: 'sse', url: 'http://localhost:8080/sse' }));
    expect(transport).toBeDefined();
    expect(typeof transport.start).toBe('function');
  });
});

describe('mcp error classification', () => {
  it('classifies 401 as auth required', async () => {
    const { classifyMcpError } = await import('../../electron/main/modules/mcp/errors.mjs');

    const result = classifyMcpError(new Error('401 Unauthorized'));
    expect(result.code).toBe('AUTH_REQUIRED');
    expect(result.status).toBe('needs_auth');
  });

  it('classifies registration errors', async () => {
    const { classifyMcpError } = await import('../../electron/main/modules/mcp/errors.mjs');

    const result = classifyMcpError(new Error('401 Unauthorized: client registration required'));
    expect(result.code).toBe('CLIENT_REGISTRATION_REQUIRED');
    expect(result.status).toBe('needs_client_registration');
  });

  it('classifies generic registration without 401 as connection failed', async () => {
    const { classifyMcpError } = await import('../../electron/main/modules/mcp/errors.mjs');

    const result = classifyMcpError(new Error('registration required'));
    expect(result.code).toBe('CONNECTION_FAILED');
    expect(result.status).toBe('failed');
  });

  it('classifies spawn errors as connection failed', async () => {
    const { classifyMcpError } = await import('../../electron/main/modules/mcp/errors.mjs');

    const result = classifyMcpError(new Error('spawn failed'));
    expect(result.code).toBe('CONNECTION_FAILED');
    expect(result.status).toBe('failed');
  });

  it('classifies timeout errors', async () => {
    const { classifyMcpError } = await import('../../electron/main/modules/mcp/errors.mjs');

    const result = classifyMcpError(new Error('Connection timeout'));
    expect(result.code).toBe('TIMEOUT');
    expect(result.status).toBe('failed');
  });
});

describe('mcp status management', () => {
  it('validates legal state transitions', async () => {
    const { canTransition } = await import('../../electron/main/modules/mcp/status.mjs');

    expect(canTransition('idle', 'connecting')).toBe(true);
    expect(canTransition('connecting', 'connected')).toBe(true);
    expect(canTransition('connecting', 'needs_auth')).toBe(true);
    expect(canTransition('connected', 'idle')).toBe(true);
    expect(canTransition('failed', 'connecting')).toBe(true);
  });

  it('rejects illegal state transitions', async () => {
    const { canTransition } = await import('../../electron/main/modules/mcp/status.mjs');

    expect(canTransition('idle', 'connected')).toBe(false);
    expect(canTransition('connected', 'connecting')).toBe(false);
    expect(canTransition('idle', 'needs_auth')).toBe(false);
  });

  it('sets and retrieves status', async () => {
    const { setStatus, getStatus } = await import('../../electron/main/modules/mcp/status.mjs');

    setStatus('server-1', 'connected', 'ready');
    const status = getStatus('server-1');
    expect(status.runtimeStatus).toBe('connected');
    expect(status.sandboxStatus).toBe('running');
    expect(status.discoveryStatus).toBe('ready');
  });
});
