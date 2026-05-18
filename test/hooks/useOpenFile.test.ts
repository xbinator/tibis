/**
 * @file useOpenFile.test.ts
 * @description 验证 useOpenFile 会优先复用已打开标签，并仅对有磁盘路径的文件执行磁盘重开。
 */

import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoredFile } from '@/shared/storage';

/**
 * 构造测试用最近文件记录。
 * @param overrides - 需要覆盖的字段
 * @returns 标准化的最近文件记录
 */
function createStoredFile(overrides: Partial<StoredFile> = {}): StoredFile {
  return {
    id: overrides.id ?? 'file_a',
    path: overrides.path === undefined ? '/demo.md' : overrides.path,
    name: overrides.name ?? 'demo',
    ext: overrides.ext ?? 'md',
    content: overrides.content ?? 'content',
    savedContent: overrides.savedContent ?? overrides.content ?? 'content',
    createdAt: overrides.createdAt ?? 1,
    openedAt: overrides.openedAt ?? 1,
    savedAt: overrides.savedAt ?? 1
  };
}

const routerPushMock = vi.hoisted(() => vi.fn(async () => undefined));
const getItemMock = vi.hoisted(() => vi.fn(() => null));
const setItemMock = vi.hoisted(() => vi.fn());
const recentFilesStorageMocks = vi.hoisted(() => ({
  getAllRecentFiles: vi.fn(async () => []),
  getRecentFile: vi.fn(async () => null),
  addRecentFile: vi.fn(async () => undefined),
  updateRecentFile: vi.fn(async () => null),
  touchRecentFile: vi.fn(async () => null),
  removeRecentFile: vi.fn(async () => undefined),
  clearRecentFiles: vi.fn(async () => undefined)
}));

const modalAlertMock = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: routerPushMock
  })
}));

vi.mock('@/shared/storage/base', () => ({
  local: {
    getItem: getItemMock,
    setItem: setItemMock
  }
}));

vi.mock('@/shared/storage', () => ({
  recentFilesStorage: recentFilesStorageMocks
}));

vi.mock('@/utils/modal', () => ({
  Modal: {
    alert: modalAlertMock
  }
}));

describe('useOpenFile', () => {
  beforeEach(() => {
    vi.resetModules();
    setActivePinia(createPinia());
    routerPushMock.mockReset();
    modalAlertMock.mockReset();
  });

  it('reuses an already-open tab for the same file path instead of reloading from disk', async () => {
    const { useFilesStore } = await import('@/stores/workspace/files');
    const { useTabsStore } = await import('@/stores/workspace/tabs');
    const { useOpenFile } = await import('@/hooks/useOpenFile');

    const filesStore = useFilesStore();
    const tabsStore = useTabsStore();
    const diskFile = createStoredFile({ id: 'stored_a', path: '/demo.md' });

    vi.spyOn(filesStore, 'getFileById').mockResolvedValue(diskFile);
    vi.spyOn(filesStore, 'getFileByPath').mockResolvedValue(diskFile);
    const refreshSpy = vi.spyOn(filesStore, 'openOrRefreshByPathFromDisk');

    tabsStore.addTab({ id: 'stored_a', path: '/editor/stored_a', title: 'demo' });

    const { openFileById } = useOpenFile();
    await openFileById('stored_a');

    expect(refreshSpy).not.toHaveBeenCalled();
    expect(routerPushMock).toHaveBeenCalledWith('/editor/stored_a');
  });

  it('shows an alert and removes the record when opening a file whose on-disk path no longer exists', async () => {
    const { useFilesStore } = await import('@/stores/workspace/files');
    const { useOpenFile } = await import('@/hooks/useOpenFile');

    const filesStore = useFilesStore();
    const diskFile = createStoredFile({ id: 'gone_a', path: '/tmp/gone.md' });

    vi.spyOn(filesStore, 'getFileById').mockResolvedValue(diskFile);
    vi.spyOn(filesStore, 'getFileByPath').mockResolvedValue(diskFile);
    vi.spyOn(filesStore, 'openOrRefreshByPathFromDisk').mockRejectedValue(new Error('ENOENT'));
    const removeFileSpy = vi.spyOn(filesStore, 'removeFile').mockResolvedValue(undefined);

    const { openFileById } = useOpenFile();
    const result = await openFileById('gone_a');

    expect(result).toBeNull();
    expect(modalAlertMock).toHaveBeenCalledWith('文件不存在', '路径不存在：/tmp/gone.md');
    expect(removeFileSpy).toHaveBeenCalledWith('gone_a');
  });

  it('openFile delegates to openFileByPath for path-based files and alerts on missing disk file', async () => {
    const { useFilesStore } = await import('@/stores/workspace/files');
    const { useOpenFile } = await import('@/hooks/useOpenFile');

    const filesStore = useFilesStore();
    const diskFile = createStoredFile({ id: 'direct_a', path: '/tmp/direct.md' });

    vi.spyOn(filesStore, 'getFileById').mockResolvedValue(diskFile);
    vi.spyOn(filesStore, 'getFileByPath').mockResolvedValue(diskFile);
    vi.spyOn(filesStore, 'openOrRefreshByPathFromDisk').mockRejectedValue(new Error('ENOENT'));
    const removeFileSpy = vi.spyOn(filesStore, 'removeFile').mockResolvedValue(undefined);

    const { openFile } = useOpenFile();
    const result = await openFile(diskFile);

    expect(result).toBeNull();
    expect(modalAlertMock).toHaveBeenCalledWith('文件不存在', expect.stringContaining('/tmp/direct.md'));
    expect(removeFileSpy).toHaveBeenCalledWith('direct_a');
  });

  it('returns null without alert when openOrRefreshByPathFromDisk throws but no stored record matches the path', async () => {
    const { useFilesStore } = await import('@/stores/workspace/files');
    const { useOpenFile } = await import('@/hooks/useOpenFile');

    const filesStore = useFilesStore();
    const diskFile = createStoredFile({ id: 'no_store', path: '/tmp/no_store.md' });

    vi.spyOn(filesStore, 'getFileById').mockResolvedValue(diskFile);
    vi.spyOn(filesStore, 'getFileByPath').mockResolvedValue(undefined);
    vi.spyOn(filesStore, 'openOrRefreshByPathFromDisk').mockRejectedValue(new Error('ENOENT'));
    const removeFileSpy = vi.spyOn(filesStore, 'removeFile').mockResolvedValue(undefined);

    const { openFileById } = useOpenFile();
    const result = await openFileById('no_store');

    expect(result).toBeNull();
    expect(modalAlertMock).not.toHaveBeenCalled();
    expect(removeFileSpy).not.toHaveBeenCalled();
  });

  it('keeps restoring unsaved pathless drafts by id', async () => {
    const { useFilesStore } = await import('@/stores/workspace/files');
    const { useOpenFile } = await import('@/hooks/useOpenFile');

    const filesStore = useFilesStore();
    const draftFile = createStoredFile({ id: 'draft_a', path: null, content: 'draft only', savedContent: 'draft only' });
    vi.spyOn(filesStore, 'getFileById').mockResolvedValue(draftFile);
    const openExistingSpy = vi.spyOn(filesStore, 'openExistingFile').mockResolvedValue(draftFile);

    const { openFileById } = useOpenFile();
    await openFileById('draft_a');

    expect(openExistingSpy).toHaveBeenCalledWith('draft_a');
  });
});
