/**
 * @file recent.test.ts
 * @description 验证最近记录存储对历史文件数据的迁移兼容行为。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { recentFilesStorage } from '@/shared/storage/files/recent';
import { hashString } from '@/shared/utils/hash';

/** Electron Store 测试替身。 */
const mockElectronAPI = vi.hoisted(() => ({
  storeGet: vi.fn<(_key: string) => Promise<unknown>>(),
  storeSet: vi.fn<(_key: string, _value: unknown) => Promise<void>>()
}));

vi.mock('@/shared/platform/electron-api', () => ({
  getElectronAPI: () => mockElectronAPI
}));

describe('recentFilesStorage.getAllRecentFiles', () => {
  beforeEach((): void => {
    mockElectronAPI.storeGet.mockReset();
    mockElectronAPI.storeSet.mockReset();
    mockElectronAPI.storeSet.mockResolvedValue(undefined);
  });

  it('normalizes legacy file records that miss text fields', async (): Promise<void> => {
    mockElectronAPI.storeGet.mockResolvedValue([
      {
        id: 'legacy-file',
        path: '/Users/demo/Documents/Legacy.md',
        openedAt: 100
      }
    ]);

    const records = await recentFilesStorage.getAllRecentFiles();

    expect(records).toEqual([
      {
        type: 'file',
        id: 'legacy-file',
        path: '/Users/demo/Documents/Legacy.md',
        content: '',
        name: 'Legacy',
        ext: 'md',
        openedAt: 100
      }
    ]);
    expect(mockElectronAPI.storeSet).toHaveBeenCalledWith('recent_files', records);
  });

  it('preserves widget records during normalization', async (): Promise<void> => {
    mockElectronAPI.storeGet.mockResolvedValue([
      {
        type: 'widget',
        id: 'widget-weather',
        path: '/Users/demo/.tibis/widgets/weather/widget.json',
        content: '{"name":"天气"}',
        name: 'weather',
        ext: 'json',
        openedAt: 200
      }
    ]);

    const records = await recentFilesStorage.getAllRecentFiles();

    expect(records[0]).toMatchObject({
      type: 'widget',
      id: 'widget-weather',
      path: '/Users/demo/.tibis/widgets/weather/widget.json',
      content: '{"name":"天气"}',
      name: 'weather',
      ext: 'json',
      openedAt: 200
    });
    expect(mockElectronAPI.storeSet).not.toHaveBeenCalled();
  });

  it('migrates unknown record types to files', async (): Promise<void> => {
    mockElectronAPI.storeGet.mockResolvedValue([
      {
        type: 'unknown',
        id: 'legacy-record',
        path: '/Users/demo/Legacy.md',
        content: '# Legacy',
        openedAt: 100
      }
    ]);

    const records = await recentFilesStorage.getAllRecentFiles();

    expect(records[0]).toMatchObject({
      type: 'file',
      id: 'legacy-record',
      path: '/Users/demo/Legacy.md',
      content: '# Legacy',
      name: 'Legacy',
      ext: 'md'
    });
    expect(mockElectronAPI.storeSet).toHaveBeenCalledWith('recent_files', records);
  });
});

describe('recentFilesStorage.addWebviewRecord', () => {
  beforeEach((): void => {
    mockElectronAPI.storeGet.mockReset();
    mockElectronAPI.storeSet.mockReset();
    mockElectronAPI.storeSet.mockResolvedValue(undefined);
  });

  it('persists favicon when creating a webview record', async (): Promise<void> => {
    mockElectronAPI.storeGet.mockResolvedValue([]);

    const record = await recentFilesStorage.addWebviewRecord('https://example.com', 'Example Domain', {
      favicon: 'https://example.com/favicon.ico'
    });

    expect(record).toMatchObject({
      type: 'webview',
      url: 'https://example.com',
      title: 'Example Domain',
      favicon: 'https://example.com/favicon.ico'
    });
    expect(mockElectronAPI.storeSet).toHaveBeenCalledWith('recent_files', [record]);
  });

  it('preserves an existing favicon when a later update has no favicon', async (): Promise<void> => {
    mockElectronAPI.storeGet.mockResolvedValue([
      {
        type: 'webview',
        id: hashString('https://example.com'),
        url: 'https://example.com',
        title: 'Example Domain',
        favicon: 'https://example.com/favicon.ico',
        createdAt: 1,
        openedAt: 2
      }
    ]);

    const record = await recentFilesStorage.addWebviewRecord('https://example.com', 'Example Domain Updated');

    expect(record.favicon).toBe('https://example.com/favicon.ico');
  });
});
