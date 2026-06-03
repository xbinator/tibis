/* @vitest-environment jsdom */
/**
 * @file index.test.ts
 * @description 验证统一 settings.json 存储层的读写、备份与字段保留行为。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
function setSettingsFile(data: unknown): void {
  fileStore['/home/user/.tibis/settings.json'] = JSON.stringify(data, null, 2);
}

/**
 * 读取 settings.json。
 * @returns 设置文件内容
 */
function getSettingsFile(): Record<string, unknown> | null {
  const content = fileStore['/home/user/.tibis/settings.json'];
  return content ? (JSON.parse(content) as Record<string, unknown>) : null;
}

describe('settingsFileStorage', () => {
  it('updates one section while preserving other settings.json sections', async () => {
    setSettingsFile({
      version: 1,
      providers: [{ id: 'openai', isEnabled: true }],
      mcp: { servers: [] }
    });

    const { settingsFileStorage } = await import('@/shared/storage/settings');
    await settingsFileStorage.update((current) => ({
      ...current,
      mcp: {
        servers: [
          {
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
          }
        ]
      }
    }));

    const settingsFile = getSettingsFile();
    expect(settingsFile?.providers).toEqual([{ id: 'openai', isEnabled: true }]);
    expect((settingsFile?.mcp as { servers: unknown[] }).servers).toHaveLength(1);
    expect(fileStore['/home/user/.tibis/settings.json.bak']).toContain('"providers"');
  });

  it('returns a default settings shape when settings.json is unavailable', async () => {
    mockElectronAPI.getTibisWorkspaceRoot.mockResolvedValue(null);

    const { settingsFileStorage } = await import('@/shared/storage/settings');
    const settings = await settingsFileStorage.read();

    expect(settings).toEqual({ version: 1, providers: [], mcp: { servers: [] } });
  });

  it('returns transformed settings and keeps the write queue usable when writing fails', async () => {
    mockElectronAPI.writeFile.mockRejectedValueOnce(new Error('disk full'));

    const { settingsFileStorage } = await import('@/shared/storage/settings');
    const failedWriteResult = await settingsFileStorage.update((current) => ({
      ...current,
      mcp: {
        servers: [
          {
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
          }
        ]
      }
    }));

    expect(failedWriteResult.mcp?.servers).toHaveLength(1);

    await settingsFileStorage.update((current) => ({
      ...current,
      providers: [{ id: 'openai', isEnabled: true }]
    }));

    expect(getSettingsFile()?.providers).toEqual([{ id: 'openai', isEnabled: true }]);
  });
});
