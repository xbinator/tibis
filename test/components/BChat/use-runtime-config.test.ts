/**
 * @file use-runtime-config.test.ts
 * @description BChat runtime 请求配置解析测试。
 */
import type { MCPServerConfig } from 'types/ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useRuntimeConfig } from '@/components/BChat/hooks/useRuntimeConfig';

const memoryStoreMock = vi.hoisted(() => ({
  loaded: true,
  loadMemory: vi.fn(),
  buildSystemPromptContext: vi.fn(() => '')
}));

const toolSettingsStoreMock = vi.hoisted(() => ({
  tavily: {
    enabled: false,
    apiKey: ''
  },
  mcp: {
    servers: [] as MCPServerConfig[]
  }
}));

vi.mock('@/stores/ai/memory', () => ({
  useMemoryStore: vi.fn(() => memoryStoreMock)
}));

vi.mock('@/stores/ai/toolSettings', () => ({
  useToolSettingsStore: vi.fn(() => toolSettingsStoreMock)
}));

/**
 * 创建 MCP server 测试配置。
 * @param patch - 需要覆盖的字段。
 * @returns MCP server 配置。
 */
function createMcpServer(patch: Partial<MCPServerConfig> = {}): MCPServerConfig {
  return {
    id: 'server-1',
    name: 'Server 1',
    enabled: true,
    transport: 'stdio',
    url: undefined,
    command: 'node',
    args: [],
    env: {},
    headers: {},
    toolAllowlist: [],
    connectTimeoutMs: 30_000,
    toolCallTimeoutMs: 60_000,
    ...patch
  };
}

describe('useRuntimeConfig', (): void => {
  beforeEach((): void => {
    memoryStoreMock.loaded = true;
    memoryStoreMock.loadMemory.mockReset();
    memoryStoreMock.buildSystemPromptContext.mockReset();
    memoryStoreMock.buildSystemPromptContext.mockReturnValue('');
    toolSettingsStoreMock.tavily = { enabled: false, apiKey: '' };
    toolSettingsStoreMock.mcp = { servers: [] };
  });

  it('omits MCP request config when all configured servers are disabled', (): void => {
    toolSettingsStoreMock.mcp.servers = [createMcpServer({ enabled: false })];

    const { resolveRuntimeMcpRequestConfig } = useRuntimeConfig();

    expect(resolveRuntimeMcpRequestConfig()).toBeUndefined();
  });

  it('keeps only enabled runnable MCP servers in request config', (): void => {
    toolSettingsStoreMock.mcp.servers = [
      createMcpServer({ id: 'disabled-server', enabled: false }),
      createMcpServer({ id: 'empty-command-server', command: '' }),
      createMcpServer({ id: 'enabled-server', toolAllowlist: ['search'] })
    ];

    const { resolveRuntimeMcpRequestConfig } = useRuntimeConfig();

    expect(resolveRuntimeMcpRequestConfig()).toMatchObject({
      enabledServerIds: ['enabled-server'],
      servers: [{ id: 'enabled-server', toolAllowlist: ['search'] }]
    });
  });
});
