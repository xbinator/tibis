/**
 * @file use-file-controller.test.ts
 * @description 验证公共文件控制器的保存状态与标签脏状态契约。
 */
import { effectScope, nextTick, ref } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useFileController } from '@/hooks/useFileController';
import type {
  FileControllerEvents,
  FileControllerSnapshot,
  FileCreateContext,
  FileParseContext,
  FileRecordContext,
  FileSerializeContext
} from '@/hooks/useFileController/types';
import type { FileState, FileChangeEvent } from '@/shared/platform/native/types';
import type { StoredDocumentRecord } from '@/shared/storage/files/types';
import type { EditorSaveStrategy } from '@/stores/editor/preferences';

const setDirtyMock = vi.hoisted(() => vi.fn());
const clearDirtyMock = vi.hoisted(() => vi.fn());
const getFileByIdMock = vi.hoisted(() => vi.fn());
const updateFileMock = vi.hoisted(() => vi.fn());
const addFileMock = vi.hoisted(() => vi.fn());
const removeFileMock = vi.hoisted(() => vi.fn());
const markMissingMock = vi.hoisted(() => vi.fn());
const clearMissingMock = vi.hoisted(() => vi.fn());
const missingFileIds = vi.hoisted(() => new Set<string>());
const preferencesMock = vi.hoisted((): { saveStrategy: EditorSaveStrategy } => ({ saveStrategy: 'off' }));
const fileWatchMock = vi.hoisted(() => ({
  callback: null as ((event: FileChangeEvent) => void) | null,
  unsubscribe: vi.fn(),
  register: vi.fn(),
  updatePath: vi.fn(),
  unregister: vi.fn(),
  pathToFileIds: new Map<string, Set<string>>(),
  fileIdToPath: new Map<string, string>()
}));

/**
 * 可由测试控制完成时机的 Promise。
 */
interface Deferred<T> {
  /** 待完成 Promise。 */
  promise: Promise<T>;
  /** 完成 Promise。 */
  resolve: (value: T | PromiseLike<T>) => void;
}

/**
 * 创建可控 Promise。
 * @returns 可控 Promise
 */
function createDeferred<T>(): Deferred<T> {
  let onResolve: (value: T | PromiseLike<T>) => void = (): void => undefined;
  const promise = new Promise<T>((resolve) => {
    onResolve = resolve;
  });
  return { promise, resolve: onResolve };
}

/**
 * 创建指定内容的文件状态。
 * @param id - 文件 ID
 * @param content - 文件内容
 * @returns 文件状态
 */
function createFileState(id: string, content: string): FileState {
  return {
    id,
    name: 'Document',
    ext: 'md',
    path: `/tmp/${id}.md`,
    content
  };
}

vi.mock('@/stores/workspace/tabs', () => ({
  useTabsStore: () => ({
    setDirty: setDirtyMock,
    clearDirty: clearDirtyMock,
    isMissing: (fileId: string): boolean => missingFileIds.has(fileId),
    markMissing: (fileId: string): void => {
      markMissingMock(fileId);
      missingFileIds.add(fileId);
    },
    clearMissing: (fileId: string): void => {
      clearMissingMock(fileId);
      missingFileIds.delete(fileId);
    }
  })
}));

vi.mock('@/shared/platform', () => ({
  native: {
    onFileChanged: (callback: (event: FileChangeEvent) => void): (() => void) => {
      fileWatchMock.callback = callback;
      return fileWatchMock.unsubscribe;
    }
  }
}));

vi.mock('@/stores/editor/fileWatch', () => ({
  useEditorFileWatchStore: () => ({
    pathToFileIds: fileWatchMock.pathToFileIds,
    fileIdToPath: fileWatchMock.fileIdToPath,
    register: fileWatchMock.register,
    updatePath: fileWatchMock.updatePath,
    unregister: fileWatchMock.unregister
  })
}));

vi.mock('@/stores/workspace/recent', () => ({
  useRecentStore: () => ({
    getFileById: getFileByIdMock,
    updateFile: updateFileMock,
    addFile: addFileMock,
    removeFile: removeFileMock
  })
}));

vi.mock('@/stores/editor/preferences', () => ({
  useEditorPreferencesStore: () => preferencesMock
}));

/**
 * 创建字符串文件控制器事件。
 * @param overrides - 需要覆盖的事件
 * @returns 完整控制器事件
 */
function createEvents(overrides: Partial<FileControllerEvents<string>> = {}): FileControllerEvents<string> {
  return {
    onCreate: ({ fileId }: FileCreateContext): FileControllerSnapshot<string> => ({
      fileState: {
        id: fileId,
        name: 'Untitled',
        ext: 'md',
        path: null,
        content: ''
      },
      data: '',
      savedContent: ''
    }),
    onLoad: vi.fn().mockResolvedValue({ draft: null, disk: null, error: null }),
    onParse: ({ content }: FileParseContext): string => content,
    onSerialize: ({ data }: FileSerializeContext<string>): string => data,
    onBuildRecord: ({ fileState, savedContent }: FileRecordContext<string>): StoredDocumentRecord => ({
      ...fileState,
      type: 'file',
      savedContent
    }),
    onWriteFile: vi.fn().mockResolvedValue(undefined),
    onSaveAs: vi.fn().mockResolvedValue(null),
    onRename: vi.fn().mockResolvedValue(null),
    onResolveConflict: vi.fn().mockResolvedValue(true),
    onRestoreFile: vi.fn().mockResolvedValue(false),
    ...overrides
  };
}

describe('useFileController', (): void => {
  beforeEach((): void => {
    setDirtyMock.mockReset();
    clearDirtyMock.mockReset();
    getFileByIdMock.mockReset();
    updateFileMock.mockReset();
    addFileMock.mockReset();
    removeFileMock.mockReset();
    markMissingMock.mockReset();
    clearMissingMock.mockReset();
    missingFileIds.clear();
    getFileByIdMock.mockResolvedValue({ id: 'file-1', type: 'file' });
    preferencesMock.saveStrategy = 'off';
    fileWatchMock.callback = null;
    fileWatchMock.unsubscribe.mockReset();
    fileWatchMock.register.mockReset();
    fileWatchMock.updatePath.mockReset();
    fileWatchMock.unregister.mockReset();
    fileWatchMock.pathToFileIds.clear();
    fileWatchMock.fileIdToPath.clear();
    fileWatchMock.register.mockImplementation(async (fileId: string, filePath: string): Promise<void> => {
      const owners = fileWatchMock.pathToFileIds.get(filePath) ?? new Set<string>();
      owners.add(fileId);
      fileWatchMock.pathToFileIds.set(filePath, owners);
      fileWatchMock.fileIdToPath.set(fileId, filePath);
    });
    fileWatchMock.updatePath.mockResolvedValue(undefined);
    fileWatchMock.unregister.mockResolvedValue(undefined);
  });

  afterEach((): void => {
    vi.useRealTimers();
  });

  it('exposes saved state and mirrors edits to the tab dirty state', async (): Promise<void> => {
    const scope = effectScope();

    await scope.run(async (): Promise<void> => {
      const controller = useFileController({ fileId: ref('file-1'), events: createEvents() });
      await controller.actions.onReload();

      expect(controller.isSaved.value).toBe(true);
      controller.data.value = 'changed';
      await nextTick();

      expect(controller.fileState.value.content).toBe('changed');
      expect(controller.isSaved.value).toBe(false);
      expect(setDirtyMock).toHaveBeenCalledWith('file-1');
    });

    scope.stop();
  });

  it('clears the tab dirty state when content returns to the saved baseline', async (): Promise<void> => {
    const scope = effectScope();

    await scope.run(async (): Promise<void> => {
      const controller = useFileController({ fileId: ref('file-1'), events: createEvents() });
      controller.data.value = 'changed';
      await nextTick();
      controller.data.value = '';
      await nextTick();

      expect(controller.isSaved.value).toBe(true);
      expect(clearDirtyMock).toHaveBeenCalledWith('file-1');
    });

    scope.stop();
  });

  it('flushes a recent draft but does not write disk when strategy is off', async (): Promise<void> => {
    const scope = effectScope();
    const onWriteFile = vi.fn().mockResolvedValue(undefined);

    await scope.run(async (): Promise<void> => {
      const controller = useFileController({ fileId: ref('file-1'), events: createEvents({ onWriteFile }) });
      controller.data.value = 'local draft';
      await nextTick();
      await controller.actions.onFlush();

      expect(updateFileMock).toHaveBeenCalledWith('file-1', expect.objectContaining({ content: 'local draft' }));
      expect(onWriteFile).not.toHaveBeenCalled();
    });

    scope.stop();
  });

  it('writes an existing path on blur when strategy is onBlur', async (): Promise<void> => {
    const scope = effectScope();
    const onWriteFile = vi.fn().mockResolvedValue(undefined);
    preferencesMock.saveStrategy = 'onBlur';

    await scope.run(async (): Promise<void> => {
      const events = createEvents({
        onCreate: ({ fileId }: FileCreateContext): FileControllerSnapshot<string> => ({
          fileState: { id: fileId, name: 'Document', ext: 'md', path: '/tmp/document.md', content: 'saved' },
          data: 'saved',
          savedContent: 'saved'
        }),
        onWriteFile
      });
      const controller = useFileController({ fileId: ref('file-1'), events });
      controller.data.value = 'changed';
      await nextTick();
      await controller.actions.onBlur();

      expect(onWriteFile).toHaveBeenCalledWith({ path: '/tmp/document.md', content: 'changed' });
      expect(controller.isSaved.value).toBe(true);
    });

    scope.stop();
  });

  it('suppresses its onChange write event and applies a different external change', async (): Promise<void> => {
    vi.useFakeTimers();
    preferencesMock.saveStrategy = 'onChange';
    const scope = effectScope();
    const onWriteFile = vi.fn().mockResolvedValue(undefined);

    await scope.run(async (): Promise<void> => {
      const events = createEvents({
        onCreate: ({ fileId }: FileCreateContext): FileControllerSnapshot<string> => ({
          fileState: { id: fileId, name: 'Document', ext: 'md', path: '/tmp/document.md', content: 'saved' },
          data: 'saved',
          savedContent: 'saved'
        }),
        onWriteFile
      });
      const controller = useFileController({ fileId: ref('file-1'), events });
      await controller.actions.onReload();
      controller.data.value = 'changed';
      await nextTick();
      await vi.advanceTimersByTimeAsync(800);

      fileWatchMock.callback?.({ type: 'change', filePath: '/tmp/document.md', content: 'changed' });
      await Promise.resolve();
      expect(controller.data.value).toBe('changed');

      fileWatchMock.callback?.({ type: 'change', filePath: '/tmp/document.md', content: 'external' });
      await vi.waitFor((): void => expect(controller.data.value).toBe('external'));
      expect(controller.isSaved.value).toBe(true);
    });

    scope.stop();
  });

  it('applies burst external changes in arrival order so the latest content wins', async (): Promise<void> => {
    const scope = effectScope();

    await scope.run(async (): Promise<void> => {
      const events = createEvents({
        onCreate: ({ fileId }: FileCreateContext): FileControllerSnapshot<string> => ({
          fileState: createFileState(fileId, 'saved'),
          data: 'saved',
          savedContent: 'saved'
        })
      });
      const controller = useFileController({ fileId: ref('file-1'), events });
      await controller.actions.onReload();

      fileWatchMock.callback?.({ type: 'change', filePath: '/tmp/file-1.md', content: 'older external' });
      fileWatchMock.callback?.({ type: 'change', filePath: '/tmp/file-1.md', content: 'latest external' });

      await vi.waitFor((): void => expect(controller.data.value).toBe('latest external'));
      expect(controller.savedContent.value).toBe('latest external');
    });

    scope.stop();
  });

  it('asks the adapter before replacing a dirty draft changed on disk', async (): Promise<void> => {
    const scope = effectScope();
    const onResolveConflict = vi.fn().mockResolvedValue(true);

    await scope.run(async (): Promise<void> => {
      const events = createEvents({
        onLoad: vi.fn().mockResolvedValue({
          draft: { fileState: createFileState('file-1', 'local draft'), savedContent: 'baseline' },
          disk: { fileState: createFileState('file-1', 'external') },
          error: null
        }),
        onResolveConflict
      });
      const controller = useFileController({ fileId: ref('file-1'), events });

      await controller.actions.onReload();

      expect(onResolveConflict).toHaveBeenCalledTimes(1);
      expect(controller.data.value).toBe('local draft');
      expect(controller.savedContent.value).toBe('baseline');
      expect(controller.isSaved.value).toBe(false);
    });

    scope.stop();
  });

  it('discards an old load after the reactive file id changes', async (): Promise<void> => {
    const scope = effectScope();
    const firstLoad = createDeferred<Awaited<ReturnType<FileControllerEvents<string>['onLoad']>>>();
    const fileId = ref<string>('file-a');

    await scope.run(async (): Promise<void> => {
      const events = createEvents({
        onLoad: vi.fn(({ fileId: loadingId }: { fileId: string }) => {
          if (loadingId === 'file-a') {
            return firstLoad.promise;
          }
          return Promise.resolve({ draft: null, disk: null, error: null });
        })
      });
      const controller = useFileController({ fileId, events });
      const oldReload = controller.actions.onReload();

      fileId.value = 'file-b';
      await nextTick();
      firstLoad.resolve({ draft: null, disk: { fileState: createFileState('file-a', 'old') }, error: null });
      await oldReload;
      await vi.waitFor((): void => {
        expect(controller.fileState.value.id).toBe('file-b');
      });

      expect(controller.fileState.value.content).not.toBe('old');
    });

    scope.stop();
  });

  it('lets a newer reload release an obsolete pending reload pause', async (): Promise<void> => {
    vi.useFakeTimers();
    preferencesMock.saveStrategy = 'onChange';
    const scope = effectScope();
    const firstLoad = createDeferred<Awaited<ReturnType<FileControllerEvents<string>['onLoad']>>>();
    const onWriteFile = vi.fn().mockResolvedValue(undefined);
    const onLoad = vi
      .fn()
      .mockReturnValueOnce(firstLoad.promise)
      .mockResolvedValueOnce({ draft: null, disk: { fileState: createFileState('file-1', 'latest') }, error: null });

    await scope.run(async (): Promise<void> => {
      const events = createEvents({ onLoad, onWriteFile });
      const controller = useFileController({ fileId: ref('file-1'), events });
      const oldReload = controller.actions.onReload();
      await vi.waitFor((): void => expect(onLoad).toHaveBeenCalledTimes(1));

      await controller.actions.onReload();
      controller.data.value = 'edit after latest reload';
      await vi.runAllTimersAsync();

      expect(onWriteFile).toHaveBeenCalledWith({ path: '/tmp/file-1.md', content: 'edit after latest reload' });

      firstLoad.resolve({ draft: null, disk: { fileState: createFileState('file-1', 'obsolete') }, error: null });
      await oldReload;
    });

    scope.stop();
  });

  it('keeps an edit made while a reload is waiting for disk candidates', async (): Promise<void> => {
    const scope = effectScope();
    const loadTask = createDeferred<Awaited<ReturnType<FileControllerEvents<string>['onLoad']>>>();

    await scope.run(async (): Promise<void> => {
      const events = createEvents({
        onCreate: ({ fileId }: FileCreateContext): FileControllerSnapshot<string> => ({
          fileState: createFileState(fileId, 'initial'),
          data: 'initial',
          savedContent: 'initial'
        }),
        onLoad: vi.fn().mockReturnValue(loadTask.promise)
      });
      const controller = useFileController({ fileId: ref('file-1'), events });
      const reloadTask = controller.actions.onReload();

      controller.data.value = 'edited while loading';
      await nextTick();
      loadTask.resolve({ draft: null, disk: { fileState: createFileState('file-1', 'disk content') }, error: null });
      await reloadTask;

      expect(controller.data.value).toBe('edited while loading');
      expect(controller.fileState.value.content).toBe('edited while loading');
      expect(controller.isLoading.value).toBe(false);
    });

    scope.stop();
  });

  it('keeps a load read error blocking disk writes when an edit occurs during loading', async (): Promise<void> => {
    vi.useFakeTimers();
    preferencesMock.saveStrategy = 'onChange';
    const scope = effectScope();
    const loadTask = createDeferred<Awaited<ReturnType<FileControllerEvents<string>['onLoad']>>>();
    const onWriteFile = vi.fn().mockResolvedValue(undefined);

    await scope.run(async (): Promise<void> => {
      const events = createEvents({
        onCreate: ({ fileId }: FileCreateContext): FileControllerSnapshot<string> => ({
          fileState: createFileState(fileId, 'saved'),
          data: 'saved',
          savedContent: 'saved'
        }),
        onLoad: vi.fn().mockReturnValue(loadTask.promise),
        onWriteFile
      });
      const controller = useFileController({ fileId: ref('file-1'), events });
      const reloadTask = controller.actions.onReload();

      controller.data.value = 'edit during failed load';
      loadTask.resolve({ draft: null, disk: null, error: new Error('permission denied') });
      await reloadTask;
      await vi.runAllTimersAsync();

      expect(controller.loadError.value?.message).toBe('permission denied');
      expect(controller.data.value).toBe('edit during failed load');
      expect(onWriteFile).not.toHaveBeenCalled();
    });

    scope.stop();
  });

  it('adopts loaded file identity while preserving an edit made during the initial load', async (): Promise<void> => {
    const scope = effectScope();
    const loadTask = createDeferred<Awaited<ReturnType<FileControllerEvents<string>['onLoad']>>>();

    await scope.run(async (): Promise<void> => {
      const events = createEvents({ onLoad: vi.fn().mockReturnValue(loadTask.promise) });
      const controller = useFileController({ fileId: ref('file-1'), events });
      const reloadTask = controller.actions.onReload();

      controller.data.value = 'typed during initial load';
      loadTask.resolve({ draft: null, disk: { fileState: createFileState('file-1', 'disk content') }, error: null });
      await reloadTask;

      expect(controller.fileState.value).toEqual(expect.objectContaining({ path: '/tmp/file-1.md', name: 'Document', content: 'typed during initial load' }));
      expect(controller.savedContent.value).toBe('disk content');
      expect(controller.isSaved.value).toBe(false);
    });

    scope.stop();
  });

  it('persists a loaded snapshot without scheduling it as an automatic disk edit', async (): Promise<void> => {
    vi.useFakeTimers();
    preferencesMock.saveStrategy = 'onChange';
    const scope = effectScope();
    const onWriteFile = vi.fn().mockResolvedValue(undefined);

    await scope.run(async (): Promise<void> => {
      const events = createEvents({
        onLoad: vi.fn().mockResolvedValue({
          draft: null,
          disk: { fileState: createFileState('file-1', 'loaded from disk') },
          error: null
        }),
        onWriteFile
      });
      const controller = useFileController({ fileId: ref('file-1'), events });

      await controller.actions.onReload();
      await nextTick();
      await vi.runAllTimersAsync();

      expect(updateFileMock).toHaveBeenCalledWith('file-1', expect.objectContaining({ content: 'loaded from disk' }));
      expect(onWriteFile).not.toHaveBeenCalled();
    });

    scope.stop();
  });

  it('does not create or persist a replacement snapshot for an aborted load', async (): Promise<void> => {
    const scope = effectScope();

    await scope.run(async (): Promise<void> => {
      const events = createEvents({
        onLoad: vi.fn().mockResolvedValue({ draft: null, disk: null, error: null, aborted: true })
      });
      const controller = useFileController({ fileId: ref('file-1'), events });

      await controller.actions.onReload();

      expect(controller.fileState.value).toEqual(expect.objectContaining({ path: null, content: '' }));
      expect(addFileMock).not.toHaveBeenCalled();
      expect(updateFileMock).not.toHaveBeenCalled();
    });

    scope.stop();
  });

  it('blocks a pending automatic write after an external parse failure', async (): Promise<void> => {
    vi.useFakeTimers();
    preferencesMock.saveStrategy = 'onChange';
    const scope = effectScope();
    const onWriteFile = vi.fn().mockResolvedValue(undefined);

    await scope.run(async (): Promise<void> => {
      const events = createEvents({
        onCreate: ({ fileId }: FileCreateContext): FileControllerSnapshot<string> => ({
          fileState: createFileState(fileId, 'saved'),
          data: 'saved',
          savedContent: 'saved'
        }),
        onParse: ({ content }: FileParseContext): string => {
          if (content === 'invalid external') {
            throw new Error('invalid external file');
          }
          return content;
        },
        onResolveConflict: vi.fn().mockResolvedValue(false),
        onWriteFile
      });
      const controller = useFileController({ fileId: ref('file-1'), events });
      await controller.actions.onReload();
      controller.data.value = 'local edit';
      await nextTick();

      fileWatchMock.callback?.({ type: 'change', filePath: '/tmp/file-1.md', content: 'invalid external' });
      await vi.waitFor((): void => {
        expect(controller.loadError.value?.message).toBe('invalid external file');
      });
      await vi.runAllTimersAsync();

      expect(onWriteFile).not.toHaveBeenCalled();
      expect(controller.data.value).toBe('local edit');
    });

    scope.stop();
  });

  it('manually saves an existing path even when automatic disk writes are off', async (): Promise<void> => {
    const scope = effectScope();
    const onWriteFile = vi.fn().mockResolvedValue(undefined);

    await scope.run(async (): Promise<void> => {
      const events = createEvents({
        onCreate: ({ fileId }: FileCreateContext): FileControllerSnapshot<string> => ({
          fileState: createFileState(fileId, 'saved'),
          data: 'saved',
          savedContent: 'saved'
        }),
        onWriteFile
      });
      const controller = useFileController({ fileId: ref('file-1'), events });
      controller.data.value = 'manual';
      await nextTick();

      await controller.actions.onSave();

      expect(onWriteFile).toHaveBeenCalledWith({ path: '/tmp/file-1.md', content: 'manual' });
      expect(controller.isSaved.value).toBe(true);
    });

    scope.stop();
  });

  it('reports disk and draft persistence failures through the controller event boundary', async (): Promise<void> => {
    const scope = effectScope();
    const onError = vi.fn();
    const onWriteFile = vi.fn().mockRejectedValue(new Error('disk unavailable'));

    await scope.run(async (): Promise<void> => {
      updateFileMock.mockRejectedValueOnce(new Error('draft unavailable'));
      const events = createEvents({
        onCreate: ({ fileId }: FileCreateContext): FileControllerSnapshot<string> => ({
          fileState: createFileState(fileId, 'saved'),
          data: 'saved',
          savedContent: 'saved'
        }),
        onWriteFile,
        onError
      });
      const controller = useFileController({ fileId: ref('file-1'), events });
      controller.data.value = 'changed';

      await controller.actions.onSave();
      await controller.actions.onFlush();

      expect(onError).toHaveBeenCalledWith(expect.objectContaining({ source: 'save', error: expect.any(Error) }));
      expect(onError).toHaveBeenCalledWith(expect.objectContaining({ source: 'draft', error: expect.any(Error) }));
    });

    scope.stop();
  });

  it('uses save-as for the first manual save and applies the returned path', async (): Promise<void> => {
    const scope = effectScope();
    const onSaveAs = vi.fn().mockResolvedValue('/tmp/first-note.md');

    await scope.run(async (): Promise<void> => {
      const controller = useFileController({ fileId: ref('file-1'), events: createEvents({ onSaveAs }) });
      controller.data.value = 'first content';
      await nextTick();

      await controller.actions.onSave();

      expect(onSaveAs).toHaveBeenCalledWith(expect.objectContaining({ content: 'first content' }));
      expect(controller.fileState.value).toEqual(
        expect.objectContaining({ path: '/tmp/first-note.md', name: 'first-note', ext: 'md', content: 'first content' })
      );
      expect(controller.isSaved.value).toBe(true);
    });

    scope.stop();
  });

  it('adopts a completed save-as path while keeping a newer edit unsaved', async (): Promise<void> => {
    const scope = effectScope();
    const saveAsTask = createDeferred<string | null>();

    await scope.run(async (): Promise<void> => {
      const controller = useFileController({
        fileId: ref('file-1'),
        events: createEvents({ onSaveAs: vi.fn().mockReturnValue(saveAsTask.promise) })
      });
      controller.data.value = 'saved snapshot';
      const saveTask = controller.actions.onSaveAs();

      controller.data.value = 'newer edit';
      saveAsTask.resolve('/tmp/saved-copy.md');
      await saveTask;

      expect(controller.fileState.value.path).toBe('/tmp/saved-copy.md');
      expect(controller.fileState.value.content).toBe('newer edit');
      expect(controller.savedContent.value).toBe('saved snapshot');
      expect(controller.isSaved.value).toBe(false);
    });

    scope.stop();
  });

  it('resumes the existing onChange save after save-as is cancelled', async (): Promise<void> => {
    vi.useFakeTimers();
    preferencesMock.saveStrategy = 'onChange';
    const scope = effectScope();
    const onWriteFile = vi.fn().mockResolvedValue(undefined);

    await scope.run(async (): Promise<void> => {
      const events = createEvents({
        onCreate: ({ fileId }: FileCreateContext): FileControllerSnapshot<string> => ({
          fileState: createFileState(fileId, 'saved'),
          data: 'saved',
          savedContent: 'saved'
        }),
        onSaveAs: vi.fn().mockResolvedValue(null),
        onWriteFile
      });
      const controller = useFileController({ fileId: ref('file-1'), events });
      controller.data.value = 'changed';

      await controller.actions.onSaveAs();
      await vi.runAllTimersAsync();

      expect(onWriteFile).toHaveBeenCalledWith({ path: '/tmp/file-1.md', content: 'changed' });
    });

    scope.stop();
  });

  it('adopts a completed rename path while keeping a newer edit attached to it', async (): Promise<void> => {
    const scope = effectScope();
    const renameTask = createDeferred<Awaited<ReturnType<FileControllerEvents<string>['onRename']>>>();

    await scope.run(async (): Promise<void> => {
      const events = createEvents({
        onCreate: ({ fileId }: FileCreateContext): FileControllerSnapshot<string> => ({
          fileState: createFileState(fileId, 'saved'),
          data: 'saved',
          savedContent: 'saved'
        }),
        onRename: vi.fn().mockReturnValue(renameTask.promise)
      });
      const controller = useFileController({ fileId: ref('file-1'), events });
      const renameAction = controller.actions.onRename();

      controller.data.value = 'newer edit';
      renameTask.resolve({ name: 'renamed', ext: 'md', path: '/tmp/renamed.md' });
      await renameAction;

      expect(controller.fileState.value).toEqual(expect.objectContaining({ path: '/tmp/renamed.md', name: 'renamed', content: 'newer edit' }));
      expect(controller.isSaved.value).toBe(false);
    });

    scope.stop();
  });

  it('clears an old-path unlink emitted by a successful rename', async (): Promise<void> => {
    vi.useFakeTimers();
    preferencesMock.saveStrategy = 'onChange';
    const scope = effectScope();
    const onWriteFile = vi.fn().mockResolvedValue(undefined);

    await scope.run(async (): Promise<void> => {
      const onRename = vi.fn(async (): Promise<Awaited<ReturnType<FileControllerEvents<string>['onRename']>>> => {
        fileWatchMock.callback?.({ type: 'unlink', filePath: '/tmp/file-1.md' });
        return { name: 'renamed', ext: 'md', path: '/tmp/renamed.md' };
      });
      const events = createEvents({
        onLoad: vi.fn().mockResolvedValue({
          draft: null,
          disk: { fileState: createFileState('file-1', 'saved') },
          error: null
        }),
        onRename,
        onWriteFile
      });
      const controller = useFileController({ fileId: ref('file-1'), events });
      await controller.actions.onReload();

      await controller.actions.onRename();
      controller.data.value = 'edit after rename';
      await vi.runAllTimersAsync();

      expect(controller.isMissing.value).toBe(false);
      expect(onWriteFile).toHaveBeenCalledWith({ path: '/tmp/renamed.md', content: 'edit after rename' });
    });

    scope.stop();
  });

  it('suppresses a matching native change emitted during save-as', async (): Promise<void> => {
    const scope = effectScope();
    const onResolveConflict = vi.fn().mockResolvedValue(false);
    const onSaveAs = vi.fn(async (): Promise<string> => {
      fileWatchMock.callback?.({ type: 'change', filePath: '/tmp/file-1.md', content: 'local draft' });
      return '/tmp/file-1.md';
    });

    await scope.run(async (): Promise<void> => {
      const events = createEvents({
        onCreate: ({ fileId }: FileCreateContext): FileControllerSnapshot<string> => ({
          fileState: createFileState(fileId, 'saved'),
          data: 'saved',
          savedContent: 'saved'
        }),
        onSaveAs,
        onResolveConflict
      });
      const controller = useFileController({ fileId: ref('file-1'), events });
      await controller.actions.onReload();
      controller.data.value = 'local draft';
      await nextTick();

      await controller.actions.onSaveAs();
      await Promise.resolve();

      expect(onResolveConflict).not.toHaveBeenCalled();
      expect(controller.data.value).toBe('local draft');
      expect(controller.isSaved.value).toBe(true);
    });

    scope.stop();
  });

  it('applies rename results and deletes the recent record through common actions', async (): Promise<void> => {
    const scope = effectScope();
    const onRename = vi.fn().mockResolvedValue({ name: 'renamed', ext: 'md', path: '/tmp/renamed.md' });

    await scope.run(async (): Promise<void> => {
      const events = createEvents({
        onCreate: ({ fileId }: FileCreateContext): FileControllerSnapshot<string> => ({
          fileState: createFileState(fileId, 'saved'),
          data: 'saved',
          savedContent: 'saved'
        }),
        onRename
      });
      const controller = useFileController({ fileId: ref('file-1'), events });

      await controller.actions.onRename();
      await controller.actions.onDelete();

      expect(controller.fileState.value).toEqual(expect.objectContaining({ name: 'renamed', ext: 'md', path: '/tmp/renamed.md' }));
      expect(removeFileMock).toHaveBeenCalledWith('file-1');
    });

    scope.stop();
  });

  it('keeps serialization failures unsaved without persisting invalid content', async (): Promise<void> => {
    const scope = effectScope();

    await scope.run(async (): Promise<void> => {
      const events = createEvents({
        onSerialize: ({ data }: FileSerializeContext<string>): string => {
          if (data === 'invalid') {
            throw new Error('cannot serialize');
          }
          return data;
        }
      });
      const controller = useFileController({ fileId: ref('file-1'), events });

      controller.data.value = 'invalid';
      await nextTick();
      await controller.actions.onFlush();

      expect(controller.fileState.value.content).toBe('');
      expect(controller.isSaved.value).toBe(false);
      expect(setDirtyMock).toHaveBeenCalledWith('file-1');
      expect(updateFileMock).not.toHaveBeenCalled();

      controller.data.value = '';
      await nextTick();
      expect(controller.isSaved.value).toBe(true);
    });

    scope.stop();
  });

  it('keeps the safe snapshot and exposes loadError when parsing fails', async (): Promise<void> => {
    const scope = effectScope();

    await scope.run(async (): Promise<void> => {
      const events = createEvents({
        onLoad: vi.fn().mockResolvedValue({
          draft: null,
          disk: { fileState: createFileState('file-1', 'invalid') },
          error: null
        }),
        onParse: (): string => {
          throw new Error('invalid file');
        }
      });
      const controller = useFileController({ fileId: ref('file-1'), events });

      await controller.actions.onReload();

      expect(controller.loadError.value?.message).toBe('invalid file');
      expect(controller.fileState.value.content).toBe('');
      expect(updateFileMock).not.toHaveBeenCalled();
    });

    scope.stop();
  });

  it('discards a save-as result after switching to another file', async (): Promise<void> => {
    const scope = effectScope();
    const saveAsTask = createDeferred<string | null>();
    const fileId = ref<string>('file-a');

    await scope.run(async (): Promise<void> => {
      const controller = useFileController({
        fileId,
        events: createEvents({ onSaveAs: vi.fn().mockReturnValue(saveAsTask.promise) })
      });
      const oldSaveAs = controller.actions.onSaveAs();

      fileId.value = 'file-b';
      await nextTick();
      saveAsTask.resolve('/tmp/old.md');
      await oldSaveAs;
      await vi.waitFor((): void => {
        expect(controller.fileState.value.id).toBe('file-b');
      });

      expect(controller.fileState.value.path).toBeNull();
    });

    scope.stop();
  });

  it('marks an unlinked file missing and clears it after manual restoration', async (): Promise<void> => {
    const scope = effectScope();
    const onRestoreFile = vi.fn().mockResolvedValue(true);

    await scope.run(async (): Promise<void> => {
      const events = createEvents({
        onCreate: ({ fileId }: FileCreateContext): FileControllerSnapshot<string> => ({
          fileState: createFileState(fileId, 'saved'),
          data: 'saved',
          savedContent: 'saved'
        }),
        onRestoreFile
      });
      const controller = useFileController({ fileId: ref('file-1'), events });
      await controller.actions.onReload();

      fileWatchMock.callback?.({ type: 'unlink', filePath: '/tmp/file-1.md' });
      expect(controller.isMissing.value).toBe(true);
      expect(controller.data.value).toBe('saved');

      await controller.actions.onSave();
      expect(onRestoreFile).toHaveBeenCalledWith({ fileState: expect.objectContaining({ path: '/tmp/file-1.md', content: 'saved' }) });
      expect(clearMissingMock).toHaveBeenCalledWith('file-1');
    });

    scope.stop();
  });

  it('cancels a pending automatic write as soon as the file is unlinked', async (): Promise<void> => {
    vi.useFakeTimers();
    preferencesMock.saveStrategy = 'onChange';
    const scope = effectScope();
    const onWriteFile = vi.fn().mockResolvedValue(undefined);

    await scope.run(async (): Promise<void> => {
      const events = createEvents({
        onCreate: ({ fileId }: FileCreateContext): FileControllerSnapshot<string> => ({
          fileState: createFileState(fileId, 'saved'),
          data: 'saved',
          savedContent: 'saved'
        }),
        onWriteFile
      });
      const controller = useFileController({ fileId: ref('file-1'), events });
      await controller.actions.onReload();
      controller.data.value = 'pending edit';

      fileWatchMock.callback?.({ type: 'unlink', filePath: '/tmp/file-1.md' });
      await vi.runAllTimersAsync();

      expect(onWriteFile).not.toHaveBeenCalled();
      expect(controller.isMissing.value).toBe(true);
    });

    scope.stop();
  });

  it('keeps automatic disk writes paused when the initial load is already missing', async (): Promise<void> => {
    vi.useFakeTimers();
    preferencesMock.saveStrategy = 'onChange';
    const scope = effectScope();
    const onWriteFile = vi.fn().mockResolvedValue(undefined);

    await scope.run(async (): Promise<void> => {
      const events = createEvents({
        onLoad: vi.fn().mockResolvedValue({
          draft: { fileState: createFileState('file-1', 'saved'), savedContent: 'saved' },
          disk: null,
          error: null,
          missing: true
        }),
        onWriteFile
      });
      const controller = useFileController({ fileId: ref('file-1'), events });
      await controller.actions.onReload();
      controller.data.value = 'local edit';
      await vi.runAllTimersAsync();

      expect(onWriteFile).not.toHaveBeenCalled();
      expect(controller.isMissing.value).toBe(true);
    });

    scope.stop();
  });

  it('falls back to save-as when restoring a missing path fails', async (): Promise<void> => {
    const scope = effectScope();
    const onSaveAs = vi.fn().mockResolvedValue('/tmp/file-1-recovered.md');
    const onRestoreFile = vi.fn().mockRejectedValue(new Error('cannot restore path'));

    await scope.run(async (): Promise<void> => {
      const events = createEvents({
        onCreate: ({ fileId }: FileCreateContext): FileControllerSnapshot<string> => ({
          fileState: createFileState(fileId, 'saved'),
          data: 'saved',
          savedContent: 'saved'
        }),
        onSaveAs,
        onRestoreFile
      });
      const controller = useFileController({ fileId: ref('file-1'), events });
      await controller.actions.onReload();
      fileWatchMock.callback?.({ type: 'unlink', filePath: '/tmp/file-1.md' });

      await controller.actions.onSave();

      expect(onRestoreFile).toHaveBeenCalledTimes(1);
      expect(onSaveAs).toHaveBeenCalledWith(expect.objectContaining({ suggestedPath: '/tmp/file-1-recovered.md' }));
      expect(controller.fileState.value.path).toBe('/tmp/file-1-recovered.md');
      expect(clearMissingMock).toHaveBeenCalledWith('file-1');
    });

    scope.stop();
  });

  it('cancels pending disk writes before deleting the platform file', async (): Promise<void> => {
    vi.useFakeTimers();
    preferencesMock.saveStrategy = 'onChange';
    const scope = effectScope();
    const onWriteFile = vi.fn().mockResolvedValue(undefined);
    const onConfirmDelete = vi.fn().mockResolvedValue(true);
    const onDeleteFile = vi.fn().mockResolvedValue(undefined);

    await scope.run(async (): Promise<void> => {
      const events = createEvents({
        onCreate: ({ fileId }: FileCreateContext): FileControllerSnapshot<string> => ({
          fileState: createFileState(fileId, 'saved'),
          data: 'saved',
          savedContent: 'saved'
        }),
        onWriteFile,
        onConfirmDelete,
        onDeleteFile
      });
      const controller = useFileController({ fileId: ref('file-1'), events });
      controller.data.value = 'pending edit';

      await controller.actions.onDelete();
      await vi.runAllTimersAsync();

      expect(onConfirmDelete).toHaveBeenCalledTimes(1);
      expect(onDeleteFile).toHaveBeenCalledTimes(1);
      expect(onWriteFile).not.toHaveBeenCalled();
      expect(removeFileMock).toHaveBeenCalledWith('file-1');
    });

    scope.stop();
  });

  it('keeps a failed recent-record deletion retryable after the disk file was removed', async (): Promise<void> => {
    const scope = effectScope();
    const onConfirmDelete = vi.fn().mockResolvedValue(true);
    const onDeleteFile = vi.fn().mockResolvedValue(undefined);
    const onDeleted = vi.fn().mockResolvedValue(undefined);
    removeFileMock.mockRejectedValueOnce(new Error('storage unavailable')).mockResolvedValueOnce(undefined);

    await scope.run(async (): Promise<void> => {
      const events = createEvents({
        onCreate: ({ fileId }: FileCreateContext): FileControllerSnapshot<string> => ({
          fileState: createFileState(fileId, 'saved'),
          data: 'saved',
          savedContent: 'saved'
        }),
        onConfirmDelete,
        onDeleteFile,
        onDeleted
      });
      const controller = useFileController({ fileId: ref('file-1'), events });

      await controller.actions.onDelete();
      expect(markMissingMock).toHaveBeenCalledWith('file-1');
      expect(onDeleted).not.toHaveBeenCalled();

      await controller.actions.onDelete();
      expect(onDeleteFile).toHaveBeenCalledTimes(1);
      expect(removeFileMock).toHaveBeenCalledTimes(2);
      expect(onDeleted).toHaveBeenCalledTimes(1);
    });

    scope.stop();
  });

  it('makes dispose terminal for later edits and reload actions', async (): Promise<void> => {
    vi.useFakeTimers();
    preferencesMock.saveStrategy = 'onChange';
    const scope = effectScope();
    const onLoad = vi.fn().mockResolvedValue({ draft: null, disk: null, error: null });
    const onWriteFile = vi.fn().mockResolvedValue(undefined);

    await scope.run(async (): Promise<void> => {
      const events = createEvents({
        onCreate: ({ fileId }: FileCreateContext): FileControllerSnapshot<string> => ({
          fileState: createFileState(fileId, 'saved'),
          data: 'saved',
          savedContent: 'saved'
        }),
        onLoad,
        onWriteFile
      });
      const controller = useFileController({ fileId: ref('file-1'), events });
      await controller.actions.onDispose();
      onLoad.mockClear();
      updateFileMock.mockClear();

      controller.data.value = 'edit after dispose';
      await controller.actions.onReload();
      await vi.runAllTimersAsync();

      expect(onLoad).not.toHaveBeenCalled();
      expect(updateFileMock).not.toHaveBeenCalled();
      expect(onWriteFile).not.toHaveBeenCalled();
    });

    scope.stop();
  });

  it('rejects an in-flight reload as soon as dispose starts flushing', async (): Promise<void> => {
    const scope = effectScope();
    const loadTask = createDeferred<Awaited<ReturnType<FileControllerEvents<string>['onLoad']>>>();
    const draftTask = createDeferred<void>();
    updateFileMock.mockReturnValue(draftTask.promise);

    await scope.run(async (): Promise<void> => {
      const events = createEvents({
        onCreate: ({ fileId }: FileCreateContext): FileControllerSnapshot<string> => ({
          fileState: createFileState(fileId, 'saved'),
          data: 'saved',
          savedContent: 'saved'
        }),
        onLoad: vi.fn().mockReturnValue(loadTask.promise)
      });
      const controller = useFileController({ fileId: ref('file-1'), events });
      controller.data.value = 'local edit';
      const reloadTask = controller.actions.onReload();
      const disposeTask = controller.actions.onDispose();

      loadTask.resolve({ draft: null, disk: { fileState: createFileState('file-1', 'stale disk') }, error: null });
      await reloadTask;
      expect(controller.data.value).toBe('local edit');

      draftTask.resolve(undefined);
      await disposeTask;
    });

    scope.stop();
  });

  it('rejects a reload conflict result while dispose is flushing a draft', async (): Promise<void> => {
    const scope = effectScope();
    const conflictTask = createDeferred<boolean>();
    const draftTask = createDeferred<void>();
    updateFileMock.mockReturnValue(draftTask.promise);

    await scope.run(async (): Promise<void> => {
      const events = createEvents({
        onCreate: ({ fileId }: FileCreateContext): FileControllerSnapshot<string> => ({
          fileState: createFileState(fileId, 'baseline'),
          data: 'baseline',
          savedContent: 'baseline'
        }),
        onLoad: vi.fn().mockResolvedValue({
          draft: { fileState: createFileState('file-1', 'local edit'), savedContent: 'baseline' },
          disk: { fileState: createFileState('file-1', 'disk edit') },
          error: null
        }),
        onResolveConflict: vi.fn().mockReturnValue(conflictTask.promise)
      });
      const controller = useFileController({ fileId: ref('file-1'), events });
      controller.data.value = 'local edit';
      const reloadTask = controller.actions.onReload();
      await vi.waitFor((): void => expect(events.onResolveConflict).toHaveBeenCalledTimes(1));

      const disposeTask = controller.actions.onDispose();
      conflictTask.resolve(false);
      await Promise.resolve();
      await Promise.resolve();

      expect(controller.data.value).toBe('local edit');

      draftTask.resolve(undefined);
      await Promise.all([reloadTask, disposeTask]);
    });

    scope.stop();
  });

  it('asks before replacing a dirty draft from an external change event', async (): Promise<void> => {
    const scope = effectScope();
    const onResolveConflict = vi.fn().mockResolvedValue(false);

    await scope.run(async (): Promise<void> => {
      const events = createEvents({
        onCreate: ({ fileId }: FileCreateContext): FileControllerSnapshot<string> => ({
          fileState: createFileState(fileId, 'saved'),
          data: 'saved',
          savedContent: 'saved'
        }),
        onResolveConflict
      });
      const controller = useFileController({ fileId: ref('file-1'), events });
      await controller.actions.onReload();
      controller.data.value = 'local draft';
      await nextTick();

      fileWatchMock.callback?.({ type: 'change', filePath: '/tmp/file-1.md', content: 'external' });
      await vi.waitFor((): void => {
        expect(onResolveConflict).toHaveBeenCalledTimes(1);
      });

      expect(controller.data.value).toBe('external');
      expect(controller.savedContent.value).toBe('external');
      expect(controller.isSaved.value).toBe(true);
    });

    scope.stop();
  });

  it('releases external write suspension after conflict resolution rejects', async (): Promise<void> => {
    vi.useFakeTimers();
    preferencesMock.saveStrategy = 'onChange';
    const scope = effectScope();
    const onWriteFile = vi.fn().mockResolvedValue(undefined);

    await scope.run(async (): Promise<void> => {
      const events = createEvents({
        onCreate: ({ fileId }: FileCreateContext): FileControllerSnapshot<string> => ({
          fileState: createFileState(fileId, 'saved'),
          data: 'saved',
          savedContent: 'saved'
        }),
        onLoad: vi.fn().mockResolvedValue({
          draft: null,
          disk: { fileState: createFileState('file-1', 'reloaded') },
          error: null
        }),
        onResolveConflict: vi.fn().mockRejectedValue(new Error('dialog failed')),
        onWriteFile
      });
      const controller = useFileController({ fileId: ref('file-1'), events });
      await controller.actions.onReload();
      controller.data.value = 'local edit';

      fileWatchMock.callback?.({ type: 'change', filePath: '/tmp/file-1.md', content: 'external edit' });
      await vi.waitFor((): void => expect(controller.loadError.value?.message).toBe('dialog failed'));

      await controller.actions.onReload();
      controller.data.value = 'edit after recovery';
      await vi.runAllTimersAsync();

      expect(onWriteFile).toHaveBeenCalledWith({ path: '/tmp/file-1.md', content: 'edit after recovery' });
    });

    scope.stop();
  });

  it('reloads a reappeared file before clearing its missing state', async (): Promise<void> => {
    const scope = effectScope();
    const onLoad = vi
      .fn()
      .mockResolvedValueOnce({ draft: null, disk: { fileState: createFileState('file-1', 'saved') }, error: null })
      .mockResolvedValueOnce({ draft: null, disk: { fileState: createFileState('file-1', 'reappeared') }, error: null });

    await scope.run(async (): Promise<void> => {
      const controller = useFileController({ fileId: ref('file-1'), events: createEvents({ onLoad }) });
      await controller.actions.onReload();
      fileWatchMock.callback?.({ type: 'unlink', filePath: '/tmp/file-1.md' });
      expect(controller.isMissing.value).toBe(true);
      clearMissingMock.mockClear();

      fileWatchMock.callback?.({ type: 'add', filePath: '/tmp/file-1.md' });
      await vi.waitFor((): void => {
        expect(controller.data.value).toBe('reappeared');
      });

      expect(onLoad).toHaveBeenCalledTimes(2);
      expect(clearMissingMock).toHaveBeenCalledWith('file-1');
    });

    scope.stop();
  });
});
