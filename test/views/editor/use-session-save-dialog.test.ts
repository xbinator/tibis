/**
 * @file use-session-save-dialog.test.ts
 * @description 验证编辑器会话对保存对话框写盘事件的自写入抑制。
 * @vitest-environment jsdom
 */
import { defineComponent, ref } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FileChangeEvent } from '@/shared/platform/native/types';
import type { StoredFile, StoredWidget } from '@/shared/storage/files/types';
import { type FileSavedPayload, storeEvents } from '@/stores/helpers/events';
import { useSession } from '@/views/editor/hooks/useSession';

const getFileByIdMock = vi.hoisted(() => vi.fn());
const addFileMock = vi.hoisted(() => vi.fn());
const updateFileMock = vi.hoisted(() => vi.fn());
const addTabMock = vi.hoisted(() => vi.fn());
const clearDirtyMock = vi.hoisted(() => vi.fn());
const clearMissingMock = vi.hoisted(() => vi.fn());
const isDirtyMock = vi.hoisted(() => vi.fn());
const isMissingMock = vi.hoisted(() => vi.fn());
const saveFileMock = vi.hoisted(() => vi.fn());
const writeFileMock = vi.hoisted(() => vi.fn());
const readFileMock = vi.hoisted(() => vi.fn());
const registerWatchMock = vi.hoisted(() => vi.fn());
const unregisterWatchMock = vi.hoisted(() => vi.fn());
const updateWatchPathMock = vi.hoisted(() => vi.fn());
const switchWatchedFileMock = vi.hoisted(() => vi.fn());
const clearWatchedFileMock = vi.hoisted(() => vi.fn());
const setOnFileChangedMock = vi.hoisted(() => vi.fn());
const setIsDirtyMock = vi.hoisted(() => vi.fn());
const finishReloadMock = vi.hoisted(() => vi.fn());
const suppressNextChangeMock = vi.hoisted(() => vi.fn());
const clearSuppressedChangeMock = vi.hoisted(() => vi.fn());
const routerPushMock = vi.hoisted(() => vi.fn());
/** 通用编辑器当前注册的外部文件变化回调。 */
let externalFileChangedHandler: ((event: FileChangeEvent) => void) | null = null;

vi.mock('vue-router', () => ({
  useRoute: () => ({
    fullPath: '/editor/file-1',
    path: '/editor/file-1',
    name: 'editor',
    params: { id: 'file-1' },
    meta: {}
  }),
  useRouter: () => ({
    push: routerPushMock
  })
}));

vi.mock('@/hooks/useClipboard', () => ({
  useClipboard: () => ({
    clipboard: vi.fn()
  })
}));

vi.mock('@/hooks/useFileAutoSave', async () => {
  const { ref: vueRef } = await import('vue');

  return {
    useFileAutoSave: () => ({
      save: vi.fn().mockResolvedValue(undefined),
      debouncedSave: vi.fn(),
      isPaused: vueRef(false),
      pause: vi.fn(),
      resume: vi.fn()
    })
  };
});

vi.mock('@/stores/workspace/files', () => ({
  useFilesStore: () => ({
    getFileById: getFileByIdMock,
    addFile: addFileMock,
    updateFile: updateFileMock,
    removeFile: vi.fn()
  })
}));

vi.mock('@/stores/workspace/tabs', () => ({
  useTabsStore: () => ({
    addTab: addTabMock,
    clearDirty: clearDirtyMock,
    clearMissing: clearMissingMock,
    isDirty: isDirtyMock,
    isMissing: isMissingMock,
    setDirty: vi.fn(),
    removeTab: vi.fn()
  })
}));

vi.mock('@/stores/editor/fileWatch', () => ({
  useEditorFileWatchStore: () => ({
    register: registerWatchMock,
    unregister: unregisterWatchMock,
    updatePath: updateWatchPathMock
  })
}));

vi.mock('@/stores/editor/preferences', () => ({
  useEditorPreferencesStore: () => ({
    saveStrategy: 'off'
  })
}));

vi.mock('@/shared/platform', () => ({
  native: {
    readFile: readFileMock,
    saveFile: saveFileMock,
    writeFile: writeFileMock,
    renameFile: vi.fn(),
    showItemInFolder: vi.fn(),
    getRelativePath: vi.fn()
  }
}));

vi.mock('@/utils/modal', () => ({
  Modal: {
    confirm: vi.fn().mockResolvedValue([true, false]),
    input: vi.fn().mockResolvedValue([true, ''])
  }
}));

vi.mock('@/views/editor/hooks/useFileWatcher', () => ({
  useFileWatcher: () => ({
    switchWatchedFile: switchWatchedFileMock,
    clearWatchedFile: clearWatchedFileMock,
    getWatchedPath: vi.fn(),
    setOnFileChanged: setOnFileChangedMock,
    setIsDirty: setIsDirtyMock,
    setOnFileDeleted: vi.fn(),
    finishReload: finishReloadMock,
    suppressNextChange: suppressNextChangeMock,
    clearSuppressedChange: clearSuppressedChangeMock
  })
}));

interface SessionExpose {
  /** 编辑器会话控制器 */
  session: ReturnType<typeof useSession>;
}

const FILE_PATH = '/workspace/note.md';
const FILE_CONTENT = '# Draft';

/**
 * 创建最近文件存储记录。
 * @returns 最近文件存储记录
 */
function createStoredFile(): StoredFile {
  return {
    type: 'file',
    id: 'file-1',
    path: FILE_PATH,
    name: 'note',
    ext: 'md',
    content: FILE_CONTENT,
    savedContent: FILE_CONTENT
  };
}

/**
 * 创建 Widget 最近文件存储记录。
 * @returns Widget 最近文件存储记录
 */
function createStoredWidget(): StoredWidget {
  return {
    type: 'widget',
    id: 'file-1',
    path: '/workspace/widget.json',
    name: 'widget',
    ext: 'json',
    content: '{}',
    savedContent: '{}'
  };
}

/**
 * 挂载编辑器会话宿主组件。
 * @returns 暴露编辑器会话的测试包装器
 */
function mountSessionHost(): ReturnType<typeof mount> {
  return mount(
    defineComponent({
      name: 'UseSessionSaveDialogHost',
      setup(_, { expose }): () => null {
        const session = useSession(ref('file-1'));
        expose({ session });

        return (): null => null;
      }
    })
  );
}

/**
 * 监听应用内文件保存事件。
 * @returns 事件处理 mock 与清理函数
 */
function observeFileSaved(): { handler: ReturnType<typeof vi.fn<(payload: FileSavedPayload) => void>>; cleanup: () => void } {
  const handler = vi.fn<(payload: FileSavedPayload) => void>();
  return {
    handler,
    cleanup: storeEvents.onFileSaved(handler)
  };
}

describe('useSession save dialog', (): void => {
  beforeEach((): void => {
    getFileByIdMock.mockReset();
    addFileMock.mockReset();
    updateFileMock.mockReset();
    addTabMock.mockReset();
    clearDirtyMock.mockReset();
    clearMissingMock.mockReset();
    isDirtyMock.mockReset();
    isMissingMock.mockReset();
    saveFileMock.mockReset();
    writeFileMock.mockReset().mockResolvedValue(undefined);
    readFileMock.mockReset();
    registerWatchMock.mockReset();
    unregisterWatchMock.mockReset();
    updateWatchPathMock.mockReset();
    switchWatchedFileMock.mockReset();
    clearWatchedFileMock.mockReset();
    setOnFileChangedMock.mockReset();
    externalFileChangedHandler = null;
    setOnFileChangedMock.mockImplementation((handler: (event: FileChangeEvent) => void): void => {
      externalFileChangedHandler = handler;
    });
    setIsDirtyMock.mockReset();
    finishReloadMock.mockReset();
    suppressNextChangeMock.mockReset();
    clearSuppressedChangeMock.mockReset();
    routerPushMock.mockReset();

    const storedFile = createStoredFile();
    getFileByIdMock.mockResolvedValue(storedFile);
    readFileMock.mockResolvedValue({ content: FILE_CONTENT, name: 'note', ext: 'md' });
    saveFileMock.mockResolvedValue(FILE_PATH);
    isDirtyMock.mockReturnValue(false);
    isMissingMock.mockReturnValue(false);
  });

  it('registers self-write suppression before switching watcher after save-as overwrites the watched path', async (): Promise<void> => {
    const observer = observeFileSaved();
    const wrapper = mountSessionHost();

    await flushPromises();
    switchWatchedFileMock.mockClear();
    suppressNextChangeMock.mockClear();

    await (wrapper.vm as unknown as SessionExpose).session.actions.onSaveAs();

    expect(suppressNextChangeMock).toHaveBeenCalledWith(FILE_PATH, FILE_CONTENT);
    expect(suppressNextChangeMock.mock.invocationCallOrder[0]).toBeLessThan(saveFileMock.mock.invocationCallOrder[0]);
    expect(observer.handler).toHaveBeenCalledWith({ filePath: FILE_PATH, content: FILE_CONTENT });
    observer.cleanup();
  });

  it('clears pre-registered self-write suppression when save-as dialog is cancelled', async (): Promise<void> => {
    const observer = observeFileSaved();
    saveFileMock.mockResolvedValue(null);
    const wrapper = mountSessionHost();

    await flushPromises();
    suppressNextChangeMock.mockClear();
    clearSuppressedChangeMock.mockClear();

    await (wrapper.vm as unknown as SessionExpose).session.actions.onSaveAs();

    expect(suppressNextChangeMock).toHaveBeenCalledWith(FILE_PATH, FILE_CONTENT);
    expect(clearSuppressedChangeMock).toHaveBeenCalledWith(FILE_PATH);
    expect(observer.handler).not.toHaveBeenCalled();
    observer.cleanup();
  });

  it('emits the saved content after writing an existing file path', async (): Promise<void> => {
    const observer = observeFileSaved();
    const wrapper = mountSessionHost();
    await flushPromises();

    await (wrapper.vm as unknown as SessionExpose).session.actions.onSave();

    expect(writeFileMock).toHaveBeenCalledWith(FILE_PATH, FILE_CONTENT);
    expect(observer.handler).toHaveBeenCalledWith({ filePath: FILE_PATH, content: FILE_CONTENT });
    observer.cleanup();
  });

  it('emits the restored content after recreating a missing file', async (): Promise<void> => {
    const observer = observeFileSaved();
    isMissingMock.mockReturnValue(true);
    readFileMock.mockRejectedValue(new Error('missing'));
    const wrapper = mountSessionHost();
    await flushPromises();

    await (wrapper.vm as unknown as SessionExpose).session.actions.onSave();

    expect(writeFileMock).toHaveBeenCalledWith(FILE_PATH, FILE_CONTENT);
    expect(observer.handler).toHaveBeenCalledWith({ filePath: FILE_PATH, content: FILE_CONTENT });
    observer.cleanup();
  });

  it('emits accepted external content for resource Store synchronization', async (): Promise<void> => {
    const observer = observeFileSaved();
    const wrapper = mountSessionHost();
    const externalContent = '# Externally updated';
    await flushPromises();

    externalFileChangedHandler?.({ type: 'change', filePath: FILE_PATH, content: externalContent });
    await flushPromises();

    expect(observer.handler).toHaveBeenCalledWith({ filePath: FILE_PATH, content: externalContent });
    expect((wrapper.vm as unknown as SessionExpose).session.fileState.value.content).toBe(externalContent);
    observer.cleanup();
  });

  it('redirects widget records away from the editor without replacing the stored record', async (): Promise<void> => {
    getFileByIdMock.mockResolvedValue(createStoredWidget());

    mountSessionHost();
    await flushPromises();

    expect(routerPushMock).toHaveBeenCalledWith({ name: 'widget', params: { id: 'file-1' } });
    expect(addFileMock).not.toHaveBeenCalled();
    expect(switchWatchedFileMock).not.toHaveBeenCalled();
  });
});
