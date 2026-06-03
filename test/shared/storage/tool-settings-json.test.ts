/* @vitest-environment jsdom */
/**
 * @file tool-settings-json.test.ts
 * @description 验证工具设置中的 MCP 配置持久化到 ~/.tibis/settings.json。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SettingsFileContent } from '@/shared/storage/providers/types';

/** 模拟的文件系统内容。 */
let fileStore: Record<string, string> = {};

/** 模拟的 Electron API。 */
const mockElectronAPI = {
  getTibisWorkspaceRoot: vi.fn(),
  getPathStatus: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn()
};

beforeEach(() => {
  fileStore = {};
  vi.resetModules();
  vi.clearAllMocks();

  mockElectronAPI.getTibisWorkspaceRoot.mockResolvedValue({ rootPath: '/home/user/.tibis', created: false });
  mockElectronAPI.getPathStatus.mockImplementation(async (path: string) => ({
    exists: path in fileStore,
    isFile: path in fileStore,
    isDirectory: false
  }));
  mockElectronAPI.readFile.mockImplementation(async (path: string) => ({
    content: fileStore[path] ?? '',
    name: path.split('/').pop() ?? '',
    ext: 'json'
  }));
  mockElectronAPI.writeFile.mockImplementation(async (path: string, content: string) => {
    fileStore[path] = content;
  });

  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    value: mockElectronAPI
  });
});

/**
 * 写入 settings.json 到模拟文件系统。
 * @param data - 设置文件内容
 */
function setSettingsFile(data: SettingsFileContent): void {
  fileStore['/home/user/.tibis/settings.json'] = JSON.stringify(data, null, 2);
}

/**
 * 读取 settings.json。
 * @returns 设置文件内容
 */
function getSettingsFile(): SettingsFileContent | null {
  const content = fileStore['/home/user/.tibis/settings.json'];
  return content ? (JSON.parse(content) as SettingsFileContent) : null;
}

describe('toolSettingsStorage settings.json persistence', () => {
  it('loads MCP servers from ~/.tibis/settings.json', async () => {
    setSettingsFile({
      version: 1,
      providers: [],
      mcp: {
        servers: [
          {
            id: 'server-1',
            name: 'Filesystem',
            enabled: true,
            transport: 'stdio',
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-filesystem'],
            env: { ROOT: '/home/user' },
            toolAllowlist: ['read_file'],
            connectTimeoutMs: 20000,
            toolCallTimeoutMs: 30000
          }
        ]
      }
    });

    const { toolSettingsStorage } = await import('@/shared/storage/tool-settings');
    const settings = await toolSettingsStorage.loadSettings();

    expect(settings.mcp.servers).toHaveLength(1);
    expect(settings.mcp.servers[0]).toMatchObject({
      id: 'server-1',
      name: 'Filesystem',
      command: 'npx',
      toolAllowlist: ['read_file']
    });
  });

  it('saves MCP servers into settings.json without removing providers', async () => {
    setSettingsFile({
      version: 1,
      providers: [{ id: 'openai', isEnabled: true, apiKey: 'sk-test' }],
      mcp: { servers: [] }
    });

    const { toolSettingsStorage } = await import('@/shared/storage/tool-settings');
    await toolSettingsStorage.saveSettings({
      tavily: { enabled: false, apiKey: '' },
      mcp: {
        servers: [
          {
            id: 'server-1',
            name: 'Filesystem',
            enabled: true,
            transport: 'stdio',
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-filesystem'],
            env: {},
            toolAllowlist: ['read_file'],
            connectTimeoutMs: 20000,
            toolCallTimeoutMs: 30000
          }
        ]
      }
    });

    const settingsFile = getSettingsFile();
    expect(settingsFile?.providers).toEqual([{ id: 'openai', isEnabled: true, apiKey: 'sk-test' }]);
    expect(settingsFile?.mcp?.servers).toHaveLength(1);
    expect(settingsFile?.mcp?.servers[0].id).toBe('server-1');
  });
});
