/**
 * @file builtin-mcp.test.ts
 * @description 内置 MCP 工具测试。
 */
import type { AIToolContext } from 'types/ai';
import type { ElectronAPI } from 'types/electron-api';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createBuiltinMCPTools } from '@/ai/tools/builtin/MCPTool';
import { useToolSettingsStore } from '@/stores/ai/toolSettings';
import { useToolPermissionStore } from '@/stores/chat/toolPermission';
import { useSettingStore } from '@/stores/ui/setting';

const storage = new Map<string, string>();

const electronMocks = vi.hoisted(() => ({
  hasElectronAPI: vi.fn((): boolean => true),
  refreshMcpDiscovery: vi.fn()
}));

vi.mock('@/shared/platform/electron-api', () => ({
  hasElectronAPI: electronMocks.hasElectronAPI,
  getElectronAPI: (): ElectronAPI =>
    ({
      refreshMcpDiscovery: electronMocks.refreshMcpDiscovery
    } as unknown as ElectronAPI)
}));

vi.mock('nanoid', () => ({
  nanoid: (): string => 'generated-server-id'
}));

vi.stubGlobal('localStorage', {
  getItem(key: string): string | null {
    return storage.get(key) ?? null;
  },
  setItem(key: string, value: string): void {
    storage.set(key, value);
  },
  removeItem(key: string): void {
    storage.delete(key);
  },
  clear(): void {
    storage.clear();
  }
});

/**
 * 创建工具执行上下文。
 * @returns 测试用工具上下文
 */
function createToolContext(): AIToolContext {
  return {
    document: {
      id: 'doc-1',
      title: 'Doc',
      path: null,
      getContent: () => ''
    },
    editor: {
      getSelection: () => null,
      insertAtCursor: async () => undefined,
      replaceSelection: async () => undefined,
      replaceDocument: async () => undefined
    }
  };
}

describe('built-in MCP tools', () => {
  beforeEach(() => {
    localStorage.clear();
    electronMocks.hasElectronAPI.mockReturnValue(true);
    electronMocks.refreshMcpDiscovery.mockReset();
    electronMocks.refreshMcpDiscovery.mockResolvedValue({
      serverId: 'server-1',
      tools: [],
      discoveredAt: 1
    });
    setActivePinia(createPinia());
  });

  it('returns MCP server settings without secrets redaction so the model can inspect config exactly', async () => {
    const tools = createBuiltinMCPTools({ confirm: vi.fn(async () => ({ approved: true })) });
    const toolSettingsStore = useToolSettingsStore();

    toolSettingsStore.addMcpServer({
      id: 'server-1',
      name: 'Filesystem',
      enabled: true,
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem'],
      env: { API_KEY: 'secret' },
      toolAllowlist: ['read_file'],
      connectTimeoutMs: 20000,
      toolCallTimeoutMs: 30000
    });

    const result = await tools.getMcpSettings.execute({}, createToolContext());

    expect(result.status).toBe('success');
    expect(result.data?.settings.servers[0]).toMatchObject({
      id: 'server-1',
      command: 'npx',
      env: { API_KEY: 'secret' }
    });
  });

  it('adds an MCP server after confirmation', async () => {
    const confirm = vi.fn(async () => ({ approved: true }));
    const tools = createBuiltinMCPTools({ confirm });
    const toolSettingsStore = useToolSettingsStore();

    const result = await tools.addMcpServer.execute(
      {
        name: 'Filesystem',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem'],
        enabled: true,
        env: { ROOT: '/tmp' },
        toolAllowlist: ['read_file'],
        connectTimeoutMs: 15000,
        toolCallTimeoutMs: 25000
      },
      createToolContext()
    );

    expect(result.status).toBe('success');
    expect(result.data?.server.id).toBe('generated-server-id');
    expect(toolSettingsStore.mcp.servers).toHaveLength(1);
    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        toolName: 'add_mcp_server',
        riskLevel: 'write',
        allowRemember: false
      })
    );
  });

  it('updates an MCP server after confirmation', async () => {
    const confirm = vi.fn(async () => ({ approved: true }));
    const tools = createBuiltinMCPTools({ confirm });
    const toolSettingsStore = useToolSettingsStore();

    toolSettingsStore.addMcpServer({
      id: 'server-1',
      name: 'Filesystem',
      enabled: true,
      transport: 'stdio',
      command: 'npx',
      args: ['-y'],
      env: {},
      toolAllowlist: [],
      connectTimeoutMs: 20000,
      toolCallTimeoutMs: 30000
    });

    const result = await tools.updateMcpServer.execute(
      {
        serverId: 'server-1',
        patch: {
          enabled: false,
          command: 'node',
          args: ['server.js'],
          toolAllowlist: ['list_directory']
        }
      },
      createToolContext()
    );

    expect(result.status).toBe('success');
    expect(toolSettingsStore.getMcpServerById('server-1')).toMatchObject({
      enabled: false,
      command: 'node',
      args: ['server.js'],
      toolAllowlist: ['list_directory']
    });
  });

  it('removes an MCP server after confirmation', async () => {
    const confirm = vi.fn(async () => ({ approved: true }));
    const tools = createBuiltinMCPTools({ confirm });
    const toolSettingsStore = useToolSettingsStore();

    toolSettingsStore.addMcpServer({
      id: 'server-1',
      name: 'Filesystem',
      enabled: true,
      transport: 'stdio',
      command: 'npx',
      args: [],
      env: {},
      toolAllowlist: [],
      connectTimeoutMs: 20000,
      toolCallTimeoutMs: 30000
    });

    const result = await tools.removeMcpServer.execute({ serverId: 'server-1' }, createToolContext());

    expect(result.status).toBe('success');
    expect(toolSettingsStore.mcp.servers).toEqual([]);
  });

  it('refreshes MCP discovery through Electron after confirmation', async () => {
    const confirm = vi.fn(async () => ({ approved: true }));
    const tools = createBuiltinMCPTools({ confirm });
    const toolSettingsStore = useToolSettingsStore();

    toolSettingsStore.addMcpServer({
      id: 'server-1',
      name: 'Filesystem',
      enabled: true,
      transport: 'stdio',
      command: 'npx',
      args: ['-y'],
      env: {},
      toolAllowlist: [],
      connectTimeoutMs: 20000,
      toolCallTimeoutMs: 30000
    });

    const result = await tools.refreshMcpDiscovery.execute({ serverId: 'server-1' }, createToolContext());

    expect(result.status).toBe('success');
    expect(electronMocks.refreshMcpDiscovery).toHaveBeenCalledWith(expect.objectContaining({ id: 'server-1', command: 'npx' }));
  });

  it('blocks MCP settings writes in readonly permission mode', async () => {
    const confirm = vi.fn(async () => ({ approved: true }));
    const tools = createBuiltinMCPTools({ confirm });
    const toolPermissionStore = useToolPermissionStore();

    toolPermissionStore.setToolPermissionMode('readonly');
    const result = await tools.addMcpServer.execute({ name: 'Blocked', command: 'npx' }, createToolContext());

    expect(result.status).toBe('failure');
    expect(result.error?.code).toBe('PERMISSION_DENIED');
    expect(confirm).not.toHaveBeenCalled();
  });
});
