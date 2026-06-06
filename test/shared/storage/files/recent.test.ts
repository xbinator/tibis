/**
 * @file recent.test.ts
 * @description 验证最近记录存储对历史文件数据的迁移兼容行为。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { recentFilesStorage } from '@/shared/storage/files/recent';

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
});
