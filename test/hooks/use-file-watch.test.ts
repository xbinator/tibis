/**
 * @file use-file-watch.test.ts
 * @description 验证公共文件监听的路径隔离、自写入抑制与重复写入者保护。
 */
import { ref } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useFileWatch } from '@/hooks/file-controller/useFileWatch';
import type { FileOperationSnapshot } from '@/hooks/useFileController';
import type { FileChangeEvent } from '@/shared/platform/native/types';

const watchMocks = vi.hoisted(() => ({
  callback: null as ((event: FileChangeEvent) => void) | null,
  unsubscribe: vi.fn(),
  register: vi.fn(),
  updatePath: vi.fn(),
  unregister: vi.fn(),
  markMissing: vi.fn(),
  clearMissing: vi.fn(),
  pathToFileIds: new Map<string, Set<string>>(),
  pathToRegistrations: new Map<string, Map<string, string>>(),
  registrationToPath: new Map<string, string>()
}));
const createdWatchers: Array<ReturnType<typeof useFileWatch>> = [];

vi.mock('@/shared/platform', () => ({
  native: {
    onFileChanged: (callback: (event: FileChangeEvent) => void): (() => void) => {
      watchMocks.callback = callback;
      return watchMocks.unsubscribe;
    }
  }
}));

vi.mock('@/stores/editor/fileWatch', () => ({
  useEditorFileWatchStore: () => ({
    pathToFileIds: watchMocks.pathToFileIds,
    pathToRegistrations: watchMocks.pathToRegistrations,
    registrationToPath: watchMocks.registrationToPath,
    register: watchMocks.register,
    updatePath: watchMocks.updatePath,
    unregister: watchMocks.unregister
  })
}));

vi.mock('@/stores/workspace/tabs', () => ({
  useTabsStore: () => ({
    markMissing: watchMocks.markMissing,
    clearMissing: watchMocks.clearMissing
  })
}));

/**
 * 创建当前会话的写盘快照。
 * @param content - 快照内容
 * @returns 文件操作快照
 */
function createSnapshot(content: string): FileOperationSnapshot {
  return {
    fileId: 'file-1',
    sessionVersion: 1,
    contentRevision: 1,
    path: '/tmp/document.md',
    content
  };
}

/**
 * 发出一次模拟 native 文件事件。
 * @param event - 文件变化事件
 */
function emitFileChange(event: FileChangeEvent): void {
  watchMocks.callback?.(event);
}

/**
 * 创建并登记需要在测试后释放的文件监听器。
 * @param fileId - 当前文件 ID
 * @param onExternalChange - 外部变化回调
 * @param onError - 可选监听错误回调
 * @returns 文件监听控制器
 */
function createWatcher(fileId: string, onExternalChange: (event: FileChangeEvent) => void, onError?: (error: Error) => void): ReturnType<typeof useFileWatch> {
  const watcher = useFileWatch({ fileId: ref(fileId), sessionVersion: ref(1), onExternalChange, onError });
  createdWatchers.push(watcher);
  return watcher;
}

describe('useFileWatch', (): void => {
  beforeEach((): void => {
    watchMocks.callback = null;
    watchMocks.unsubscribe.mockReset();
    watchMocks.register.mockReset();
    watchMocks.updatePath.mockReset();
    watchMocks.unregister.mockReset();
    watchMocks.markMissing.mockReset();
    watchMocks.clearMissing.mockReset();
    watchMocks.pathToFileIds.clear();
    watchMocks.pathToRegistrations.clear();
    watchMocks.registrationToPath.clear();
    watchMocks.register.mockImplementation(async (fileId: string, filePath: string, registrationId: string = fileId): Promise<void> => {
      const registrations = watchMocks.pathToRegistrations.get(filePath) ?? new Map<string, string>();
      registrations.set(registrationId, fileId);
      watchMocks.pathToRegistrations.set(filePath, registrations);
      const fileIds = watchMocks.pathToFileIds.get(filePath) ?? new Set<string>();
      fileIds.add(fileId);
      watchMocks.pathToFileIds.set(filePath, fileIds);
      watchMocks.registrationToPath.set(registrationId, filePath);
    });
    watchMocks.updatePath.mockImplementation(async (fileId: string, filePath: string, registrationId: string = fileId): Promise<void> => {
      const previousPath = watchMocks.registrationToPath.get(registrationId);
      if (previousPath) {
        const previousRegistrations = watchMocks.pathToRegistrations.get(previousPath);
        previousRegistrations?.delete(registrationId);
        const hasSameFile = previousRegistrations
          ? [...previousRegistrations.values()].some((registeredFileId: string): boolean => registeredFileId === fileId)
          : false;
        if (!hasSameFile) watchMocks.pathToFileIds.get(previousPath)?.delete(fileId);
        if (previousRegistrations?.size === 0) {
          watchMocks.pathToRegistrations.delete(previousPath);
          watchMocks.pathToFileIds.delete(previousPath);
        }
      }
      const registrations = watchMocks.pathToRegistrations.get(filePath) ?? new Map<string, string>();
      registrations.set(registrationId, fileId);
      watchMocks.pathToRegistrations.set(filePath, registrations);
      const fileIds = watchMocks.pathToFileIds.get(filePath) ?? new Set<string>();
      fileIds.add(fileId);
      watchMocks.pathToFileIds.set(filePath, fileIds);
      watchMocks.registrationToPath.set(registrationId, filePath);
    });
    watchMocks.unregister.mockImplementation(async (fileId: string, registrationId: string = fileId): Promise<void> => {
      const previousPath = watchMocks.registrationToPath.get(registrationId);
      if (previousPath) {
        const registrations = watchMocks.pathToRegistrations.get(previousPath);
        registrations?.delete(registrationId);
        const fileIds = watchMocks.pathToFileIds.get(previousPath);
        const hasSameFile = registrations ? [...registrations.values()].some((registeredFileId: string): boolean => registeredFileId === fileId) : false;
        if (!hasSameFile) fileIds?.delete(fileId);
        if (!registrations || registrations.size === 0) {
          watchMocks.pathToRegistrations.delete(previousPath);
          watchMocks.pathToFileIds.delete(previousPath);
        }
      }
      watchMocks.registrationToPath.delete(registrationId);
    });
  });

  afterEach(async (): Promise<void> => {
    await Promise.all(createdWatchers.splice(0).map((watcher) => watcher.onDisposeWatch()));
  });

  it('suppresses matching self-write content but forwards different external content', async (): Promise<void> => {
    const onExternalChange = vi.fn();
    const watcher = createWatcher('file-1', onExternalChange);
    await watcher.onSwitchPath('/tmp/document.md');
    watcher.onSuppressWrite(createSnapshot('self-write'));

    emitFileChange({ type: 'change', filePath: '/tmp/document.md', content: 'self-write' });
    expect(onExternalChange).not.toHaveBeenCalled();

    emitFileChange({ type: 'change', filePath: '/tmp/document.md', content: 'external' });
    expect(onExternalChange).toHaveBeenCalledWith({ type: 'change', filePath: '/tmp/document.md', content: 'external' });
  });

  it('keeps overlapping self-write signatures until each matching event arrives', async (): Promise<void> => {
    const onExternalChange = vi.fn();
    const watcher = createWatcher('file-1', onExternalChange);
    await watcher.onSwitchPath('/tmp/document.md');
    watcher.onSuppressWrite(createSnapshot('first write'));
    watcher.onSuppressWrite({ ...createSnapshot('second write'), contentRevision: 2 });

    emitFileChange({ type: 'change', filePath: '/tmp/document.md', content: 'first write' });
    emitFileChange({ type: 'change', filePath: '/tmp/document.md', content: 'second write' });

    expect(onExternalChange).not.toHaveBeenCalled();
  });

  it('ignores old paths and marks an unlinked current path missing', async (): Promise<void> => {
    const onExternalChange = vi.fn();
    const watcher = createWatcher('file-1', onExternalChange);
    await watcher.onSwitchPath('/tmp/current.md');

    emitFileChange({ type: 'change', filePath: '/tmp/old.md', content: 'old' });
    emitFileChange({ type: 'unlink', filePath: '/tmp/current.md' });

    expect(onExternalChange).toHaveBeenCalledWith({ type: 'unlink', filePath: '/tmp/current.md' });
    expect(watchMocks.markMissing).toHaveBeenCalledWith('file-1');
  });

  it('forwards a reappeared file for content reconciliation before clearing missing', async (): Promise<void> => {
    const onExternalChange = vi.fn();
    const watcher = createWatcher('file-1', onExternalChange);
    await watcher.onSwitchPath('/tmp/current.md');

    emitFileChange({ type: 'add', filePath: '/tmp/current.md' });

    expect(onExternalChange).toHaveBeenCalledWith({ type: 'add', filePath: '/tmp/current.md' });
    expect(watchMocks.clearMissing).not.toHaveBeenCalled();
  });

  it('blocks automatic writes when another file id already owns the path', async (): Promise<void> => {
    watchMocks.pathToFileIds.set('/tmp/document.md', new Set<string>(['other-file']));
    const watcher = createWatcher('file-1', vi.fn());

    await watcher.onSwitchPath('/tmp/document.md');

    expect(watcher.isAutoWriteAllowed.value).toBe(false);
  });

  it('releases the write lease and reports an error when watch registration fails', async (): Promise<void> => {
    const onError = vi.fn();
    watchMocks.register.mockRejectedValueOnce(new Error('watch failed'));
    const failedWatcher = createWatcher('file-a', vi.fn(), onError);

    await failedWatcher.onSwitchPath('/tmp/document.md');

    expect(failedWatcher.isAutoWriteAllowed.value).toBe(false);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'watch failed' }));

    const nextWatcher = createWatcher('file-b', vi.fn());
    await nextWatcher.onSwitchPath('/tmp/document.md');
    expect(nextWatcher.isAutoWriteAllowed.value).toBe(true);
  });

  it('transfers automatic write ownership when the first controller leaves', async (): Promise<void> => {
    const firstWatcher = createWatcher('file-a', vi.fn());
    const secondWatcher = createWatcher('file-b', vi.fn());
    await firstWatcher.onSwitchPath('/tmp/shared.md');
    await secondWatcher.onSwitchPath('/tmp/shared.md');

    expect(firstWatcher.isAutoWriteAllowed.value).toBe(true);
    expect(secondWatcher.isAutoWriteAllowed.value).toBe(false);

    await firstWatcher.onDisposeWatch();
    expect(secondWatcher.isAutoWriteAllowed.value).toBe(true);
  });

  it('allows only one automatic writer for duplicate controllers with the same file id', async (): Promise<void> => {
    const firstWatcher = createWatcher('file-1', vi.fn());
    const secondWatcher = createWatcher('file-1', vi.fn());
    await firstWatcher.onSwitchPath('/tmp/shared.md');
    await secondWatcher.onSwitchPath('/tmp/shared.md');

    expect(firstWatcher.isAutoWriteAllowed.value).toBe(true);
    expect(secondWatcher.isAutoWriteAllowed.value).toBe(false);
  });

  it('keeps duplicate file-id registrations independent after their paths diverge', async (): Promise<void> => {
    const firstWatcher = createWatcher('file-1', vi.fn());
    const secondWatcher = createWatcher('file-1', vi.fn());
    await firstWatcher.onSwitchPath('/tmp/original.md');
    await secondWatcher.onSwitchPath('/tmp/original.md');

    await secondWatcher.onSwitchPath('/tmp/copy.md');
    expect(watchMocks.pathToFileIds.get('/tmp/original.md')).toEqual(new Set<string>(['file-1']));
    expect(watchMocks.pathToFileIds.get('/tmp/copy.md')).toEqual(new Set<string>(['file-1']));
    expect(firstWatcher.isAutoWriteAllowed.value).toBe(true);
    expect(secondWatcher.isAutoWriteAllowed.value).toBe(true);

    await firstWatcher.onDisposeWatch();
    expect(watchMocks.pathToFileIds.has('/tmp/original.md')).toBe(false);
    expect(watchMocks.pathToFileIds.get('/tmp/copy.md')).toEqual(new Set<string>(['file-1']));
  });

  it('unsubscribes page events and unregisters the path on dispose', async (): Promise<void> => {
    const watcher = createWatcher('file-1', vi.fn());
    await watcher.onSwitchPath('/tmp/document.md');

    await watcher.onDisposeWatch();

    expect(watchMocks.unsubscribe).toHaveBeenCalledTimes(1);
    expect(watchMocks.unregister).toHaveBeenCalledWith('file-1', expect.stringMatching(/^file-controller:/));
  });
});
