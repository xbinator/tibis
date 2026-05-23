/**
 * @file mcp-local-stdio.test.ts
 * @description 验证 MCP 本地 stdio runner 的 JSON-RPC discovery 与 tool 调用。
 */
import { PassThrough } from 'node:stream';
import type { ChildProcessWithoutNullStreams, SpawnOptionsWithoutStdio } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';
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

/**
 * 创建可驱动的 mock 子进程。
 * @returns mock 子进程与请求记录
 */
function createMockProcess(): {
  child: ChildProcessWithoutNullStreams;
  requests: Array<Record<string, unknown>>;
  killMock: ReturnType<typeof vi.fn>;
} {
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const stdin = new PassThrough();
  const requests: Array<Record<string, unknown>> = [];
  const listeners = new Map<string, Array<(...args: unknown[]) => void>>();
  const killMock = vi.fn();

  stdin.on('data', (chunk: Buffer) => {
    for (const line of chunk
      .toString('utf8')
      .split(/\r?\n/)
      .filter((item) => item.trim().length > 0)) {
      const message = JSON.parse(line) as Record<string, unknown>;
      requests.push(message);
      if (message.method === 'initialize') {
        stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { capabilities: {} } })}\n`);
      }
      if (message.method === 'tools/list') {
        stdout.write(
          `${JSON.stringify({
            jsonrpc: '2.0',
            id: message.id,
            result: {
              tools: [{ name: 'read_file', description: 'Read file', inputSchema: { type: 'object' } }]
            }
          })}\n`
        );
      }
      if (message.method === 'tools/call') {
        stdout.write(
          `${JSON.stringify({
            jsonrpc: '2.0',
            id: message.id,
            result: { content: [{ type: 'text', text: 'hello' }] }
          })}\n`
        );
      }
    }
  });

  const child = {
    stdin,
    stdout,
    stderr,
    killed: false,
    kill: killMock,
    on: (event: string, listener: (...args: unknown[]) => void) => {
      listeners.set(event, [...(listeners.get(event) ?? []), listener]);
      return child;
    }
  } as unknown as ChildProcessWithoutNullStreams;

  return { child, requests, killMock };
}

describe('mcp local stdio runner', () => {
  it('discovers tools by spawning the configured local command without shell', async () => {
    const { discoverMcpToolsLocally } = await import('../../electron/main/modules/mcp/local-stdio.mjs');
    const { child, requests, killMock } = createMockProcess();
    const spawnProcess = vi.fn((command: string, args: string[], options: SpawnOptionsWithoutStdio) => {
      expect(command).toBe('node');
      expect(args).toEqual(['server.mjs']);
      expect(options.shell).toBe(false);
      expect(options.env).toMatchObject({ SAFE_ROOT: '/workspace' });
      return child;
    });

    const tools = await discoverMcpToolsLocally(createServer(), spawnProcess);

    expect(tools).toEqual([
      {
        serverId: 'server-1',
        toolName: 'read_file',
        description: 'Read file',
        inputSchema: { type: 'object' }
      }
    ]);
    expect(requests.map((request) => request.method)).toEqual(['initialize', 'notifications/initialized', 'tools/list']);
    expect(killMock).toHaveBeenCalled();
  });

  it('executes a tool over the local stdio session', async () => {
    const { executeMcpToolLocally } = await import('../../electron/main/modules/mcp/local-stdio.mjs');
    const { child, requests } = createMockProcess();

    const result = await executeMcpToolLocally(
      createServer(),
      'read_file',
      { path: 'README.md' },
      vi.fn(() => child)
    );

    expect(result).toEqual({ content: [{ type: 'text', text: 'hello' }] });
    expect(requests.at(-1)).toMatchObject({
      method: 'tools/call',
      params: {
        name: 'read_file',
        arguments: { path: 'README.md' }
      }
    });
  });

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

  it('rejects disabled servers before spawning a process', async () => {
    const { discoverMcpToolsLocally } = await import('../../electron/main/modules/mcp/local-stdio.mjs');
    const spawnProcess = vi.fn();

    await expect(discoverMcpToolsLocally(createServer({ enabled: false }), spawnProcess)).rejects.toThrow('MCP server is disabled: server-1');
    expect(spawnProcess).not.toHaveBeenCalled();
  });
});
