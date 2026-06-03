/**
 * @file files-opened-at-actions.test.ts
 * @description 验证 files store 的统一打开动作会刷新 openedAt，并始终从 storage 派生 recentFiles 顺序。
 */

import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoredFile } from '@/shared/storage';

const storageState = vi.hoisted(() => {
  return {
    files: [
      {
        type: 'file' as const,
        id: 'a',
        path: '/a.md',
        name: 'a',
        ext: 'md',
        content: 'A',
        openedAt: 1
      },
      {
        type: 'file' as const,
        id: 'b',
        path: '/b.md',
        name: 'b',
        ext: 'md',
        content: 'B',
        openedAt: 2
      }
    ] as StoredFile[]
  };
});

/**
 * 返回当前 mock storage 的派生排序视图。
 * @returns 已按 openedAt 降序排列的文件数组
 */
function getSortedFiles(): StoredFile[] {
  return storageState.files
    .slice()
    .sort((left, right) => (right.openedAt ?? 0) - (left.openedAt ?? 0))
    .map((file) => ({ ...file, type: 'file' as const }));
}

const storageMocks = vi.hoisted(() => {
  return {
    getAllRecentFiles: vi.fn(async () => getSortedFiles()),
    getRecentFile: vi.fn(async (id: string) => storageState.files.find((file) => file.id === id) ?? null),
    addRecentFile: vi.fn(async (file: StoredFile) => {
      storageState.files = storageState.files.filter((item) => item.id !== file.id);
      storageState.files.push({ ...file, type: 'file' as const });
    }),
    updateRecentFile: vi.fn(async (id: string, updates: Partial<StoredFile>) => {
      const index = storageState.files.findIndex((file) => file.id === id);
      if (index === -1) throw new Error('File not found');
      storageState.files[index] = { ...storageState.files[index], ...updates, type: 'file' as const } as StoredFile;
      return { ...storageState.files[index], type: 'file' as const } as StoredFile;
    }),
    touchRecentFile: vi.fn(async (id: string) => {
      const index = storageState.files.findIndex((file) => file.id === id);
      if (index === -1) throw new Error('File not found');
      storageState.files[index] = { ...storageState.files[index], openedAt: Date.now(), type: 'file' as const } as StoredFile;
      return { ...storageState.files[index], type: 'file' as const } as StoredFile;
    }),
    removeRecentFile: vi.fn(async (...ids: string[]) => {
      storageState.files = storageState.files.filter((file) => !ids.includes(file.id));
    }),
    clearRecentFiles: vi.fn(async () => {
      storageState.files = [];
    })
  };
});

const nativeMocks = vi.hoisted(() => {
  return {
    readFile: vi.fn(async (path: string) => ({
      content: `content:${path}`,
      name: path.split('/').pop()?.replace('.md', '') ?? 'unknown',
      ext: 'md'
    })),
    syncRecentFiles: vi.fn(async () => undefined)
  };
});

vi.mock('@/shared/storage', () => ({
  recentFilesStorage: storageMocks,
  sortRecentFiles: vi.fn((files: StoredFile[]) => [...files].sort((a, b) => (b.openedAt ?? 0) - (a.openedAt ?? 0)))
}));

vi.mock('@/shared/platform', () => ({
  native: nativeMocks
}));

vi.mock('nanoid', () => ({
  customAlphabet: () => () => 'generated_id'
}));

describe('useFilesStore openedAt actions', () => {
  beforeEach(() => {
    vi.resetModules();
    setActivePinia(createPinia());
    vi.restoreAllMocks();

    storageState.files = [
      {
        type: 'file' as const,
        id: 'a',
        path: '/a.md',
        name: 'a',
        ext: 'md',
        content: 'A',
        openedAt: 1
      },
      {
        type: 'file' as const,
        id: 'b',
        path: '/b.md',
        name: 'b',
        ext: 'md',
        content: 'B',
        openedAt: 2
      }
    ];

    Object.values(storageMocks).forEach((mock) => mock.mockClear());
    nativeMocks.readFile.mockClear();
    nativeMocks.syncRecentFiles.mockClear();
  });

  it('openExistingFile touches openedAt and refreshes recentFiles from storage order', async () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(100);
    const { useFilesStore } = await import('@/stores/workspace/files');
    const store = useFilesStore();

    await store.ensureLoaded();
    expect(store.recentFiles?.map((file) => file.id)).toEqual(['b', 'a']);

    const opened = await store.openExistingFile('a');

    expect(storageMocks.touchRecentFile).toHaveBeenCalledWith('a');
    expect(opened.id).toBe('a');
    expect(store.recentFiles?.map((file) => file.id)).toEqual(['a', 'b']);

    nowSpy.mockRestore();
  });

  it('openOrCreateByPath creates a missing disk file and returns the derived record', async () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(300);
    const { useFilesStore } = await import('@/stores/workspace/files');
    const store = useFilesStore();

    const opened = await store.openOrCreateByPath('/c.md');

    expect(nativeMocks.readFile).toHaveBeenCalledWith('/c.md');
    expect(storageMocks.addRecentFile).toHaveBeenCalledTimes(1);
    expect(opened?.id).toBe('generated_id');
    expect(opened?.path).toBe('/c.md');
    expect(opened?.createdAt).toBe(300);
    expect(opened?.openedAt).toBe(300);
    expect(opened?.savedAt).toBe(300);
    expect(opened?.savedContent).toBe('content:/c.md');
    expect(store.recentFiles?.[0]?.id).toBe('generated_id');

    nowSpy.mockRestore();
  });

  it('openOrRefreshByPathFromDisk refreshes an existing stored file from disk while preserving its id', async () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(350);
    const { useFilesStore } = await import('@/stores/workspace/files');
    const store = useFilesStore();

    await store.ensureLoaded();

    const reopened = await store.openOrRefreshByPathFromDisk('/a.md');

    expect(nativeMocks.readFile).toHaveBeenCalledWith('/a.md');
    expect(storageMocks.updateRecentFile).toHaveBeenCalledWith('a', {
      path: '/a.md',
      name: 'a',
      ext: 'md',
      content: 'content:/a.md',
      savedContent: 'content:/a.md',
      openedAt: 350,
      savedAt: 350
    });
    expect(reopened?.id).toBe('a');
    expect(reopened?.content).toBe('content:/a.md');
    expect(reopened?.savedContent).toBe('content:/a.md');

    nowSpy.mockRestore();
  });

  it('createAndOpen fills missing timestamps and refreshes recentFiles from storage', async () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(500);
    const { useFilesStore } = await import('@/stores/workspace/files');
    const store = useFilesStore();

    await store.ensureLoaded();

    const created = await store.createAndOpen({
      type: 'file' as const,
      id: 'draft',
      path: null,
      name: 'draft',
      ext: 'md',
      content: 'draft'
    });

    expect(storageMocks.addRecentFile).toHaveBeenCalledTimes(1);
    expect(created.createdAt).toBe(500);
    expect(created.openedAt).toBe(500);
    expect(store.recentFiles?.[0]?.id).toBe('draft');

    nowSpy.mockRestore();
  });
});
