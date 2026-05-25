/**
 * @file mcp-tools.test.ts
 * @description 验证主进程 MCP 工具过滤边界。
 */
import type { ToolExecutionOptions } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AIMCPRequestConfig, MCPDiscoveredToolSnapshot, MCPServerConfig, MCPToolSettings } from '@/shared/storage/tool-settings';

const jsonSchemaMock = vi.fn();
const toolMock = vi.fn();

vi.mock('ai', () => ({
  jsonSchema: jsonSchemaMock,
  tool: toolMock
}));

/**
 * 创建基础 MCP server 配置。
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

/**
 * 创建 MCP 设置。
 * @param servers - server 列表
 * @returns MCP 设置
 */
function createSettings(servers: MCPServerConfig[]): MCPToolSettings {
  return {
    servers
  };
}

/**
 * 创建 MCP 请求配置。
 * @param patch - 覆盖字段
 * @returns MCP 请求配置
 */
function createRequest(patch: Partial<AIMCPRequestConfig> = {}): AIMCPRequestConfig {
  return {
    servers: [createServer()],
    enabledServerIds: ['server-1'],
    enabledTools: [],
    toolInstructions: '',
    ...patch
  };
}

/**
 * 创建 discovery 工具快照。
 * @param serverId - server ID
 * @param toolName - tool 名称
 * @returns discovery 工具快照
 */
function createTool(serverId: string, toolName: string): MCPDiscoveredToolSnapshot {
  return { serverId, toolName, description: `${serverId}:${toolName}` };
}

describe('resolveMcpExposedTools', () => {
  beforeEach(() => {
    jsonSchemaMock.mockReset();
    toolMock.mockReset();
    jsonSchemaMock.mockImplementation((schema) => schema);
    toolMock.mockImplementation((definition) => definition);
  });

  it('returns no tools when the server is disabled or incomplete', async () => {
    const { resolveMcpExposedTools } = await import('../../electron/main/modules/mcp/tools.mjs');
    const tools = [createTool('server-1', 'read_file')];

    expect(resolveMcpExposedTools(createSettings([createServer({ enabled: false })]), createRequest(), tools)).toEqual([]);
    expect(resolveMcpExposedTools(createSettings([createServer({ command: '' })]), createRequest(), tools)).toEqual([]);
  });

  it('uses server allowlist as the static upper bound', async () => {
    const { resolveMcpExposedTools } = await import('../../electron/main/modules/mcp/tools.mjs');
    const settings = createSettings([createServer({ toolAllowlist: ['read_file'] })]);
    const tools = [createTool('server-1', 'read_file'), createTool('server-1', 'write_file')];

    expect(resolveMcpExposedTools(settings, createRequest(), tools)).toEqual([createTool('server-1', 'read_file')]);
  });

  it('intersects request enabledTools with server allowlist', async () => {
    const { resolveMcpExposedTools } = await import('../../electron/main/modules/mcp/tools.mjs');
    const settings = createSettings([createServer({ toolAllowlist: ['read_file', 'write_file'] })]);
    const request = createRequest({
      enabledTools: [{ serverId: 'server-1', toolName: 'write_file' }]
    });
    const tools = [createTool('server-1', 'read_file'), createTool('server-1', 'write_file')];

    expect(resolveMcpExposedTools(settings, request, tools)).toEqual([createTool('server-1', 'write_file')]);
  });

  it('keeps same-name tools scoped to their server id', async () => {
    const { resolveMcpExposedTools } = await import('../../electron/main/modules/mcp/tools.mjs');
    const settings = createSettings([createServer({ id: 'server-1' }), createServer({ id: 'server-2', name: 'Git' })]);
    const request = createRequest({
      enabledServerIds: ['server-2'],
      enabledTools: [{ serverId: 'server-2', toolName: 'status' }]
    });
    const tools = [createTool('server-1', 'status'), createTool('server-2', 'status')];

    expect(resolveMcpExposedTools(settings, request, tools)).toEqual([createTool('server-2', 'status')]);
  });

  it('creates server-scoped AI SDK tools that execute original MCP tool names', async () => {
    const { createMcpSdkTools, toMcpSdkToolName } = await import('../../electron/main/modules/mcp/tools.mjs');
    const executeTool = vi.fn(async () => ({ ok: true }));
    const exposedTools: MCPDiscoveredToolSnapshot[] = [createTool('filesystem', 'status'), createTool('git', 'status')];

    const sdkTools = createMcpSdkTools(exposedTools, executeTool);
    const filesystemToolName = toMcpSdkToolName('filesystem', 'status');
    const gitToolName = toMcpSdkToolName('git', 'status');

    expect(filesystemToolName).not.toBe(gitToolName);
    expect(Object.keys(sdkTools)).toEqual([filesystemToolName, gitToolName]);

    await sdkTools[filesystemToolName].execute?.({ path: 'README.md' }, { toolCallId: 'test-call' } as ToolExecutionOptions);

    expect(executeTool).toHaveBeenCalledWith(
      {
        serverId: 'filesystem',
        toolName: 'status',
        input: { path: 'README.md' }
      },
      { toolCallId: 'test-call' }
    );
  });
});
