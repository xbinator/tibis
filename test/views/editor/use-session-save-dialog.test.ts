/**
 * @file use-session-save-dialog.test.ts
 * @description 验证编辑器会话对公共文件控制器的事件适配与动作转发。
 * @vitest-environment jsdom
 */
import type { Ref } from 'vue';
import { defineComponent, nextTick, ref } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FileControllerOptions, FileControllerResult } from '@/hooks/useFileController/types';
import type { FileState } from '@/shared/platform/native/types';
import type { StoredFile, StoredWidget } from '@/shared/storage/files/types';
import { useSession } from '@/views/editor/hooks/useSession';

const getFileByIdMock = vi.hoisted(() => vi.fn());
const saveFileMock = vi.hoisted(() => vi.fn());
const readFileMock = vi.hoisted(() => vi.fn());
const getPathStatusMock = vi.hoisted(() => vi.fn());
const createFileMock = vi.hoisted(() => vi.fn());
const writeFileMock = vi.hoisted(() => vi.fn());
const confirmMock = vi.hoisted(() => vi.fn());
const routerPushMock = vi.hoisted(() => vi.fn());
const controllerHarness = vi.hoisted(() => ({
  options: null as FileControllerOptions<string> | null,
  fileState: null as Ref<FileState> | null,
  data: null as Ref<string> | null,
  onSave: vi.fn(),
  onSaveAs: vi.fn(),
  onRename: vi.fn(),
  onBlur: vi.fn(),
  onReload: vi.fn(),
  onDelete: vi.fn(),
  onFlush: vi.fn(),
  onDispose: vi.fn()
}));

vi.mock('vue-router', () => ({
  useRoute: () => ({
    fullPath: '/editor/file-1',
    path: '/editor/file-1',
    name: 'editor',
    params: { id: 'file-1' },
    meta: {}
  }),
  useRouter: () => ({ push: routerPushMock })
}));

vi.mock('@/hooks/useClipboard', () => ({
  useClipboard: () => ({ clipboard: vi.fn() })
}));

vi.mock('@/hooks/useFileController', async () => {
  const { computed: vueComputed, ref: vueRef } = await import('vue');

  return {
    useFileController: (options: FileControllerOptions<string>): FileControllerResult<string> => {
      controllerHarness.options = options;
      const initial = options.events.onCreate({ fileId: options.fileId.value });
      const fileState = vueRef<FileState>({ ...initial.fileState });
      const data = vueRef<string>(initial.data);
      controllerHarness.fileState = fileState;
      controllerHarness.data = data;

      return {
        fileState,
        data,
        savedContent: vueRef<string>(initial.savedContent),
        isSaved: vueComputed<boolean>((): boolean => true),
        isMissing: vueComputed<boolean>((): boolean => false),
        isLoading: vueRef<boolean>(false),
        loadError: vueRef<Error | null>(null),
        actions: {
          onSave: controllerHarness.onSave,
          onSaveAs: controllerHarness.onSaveAs,
          onRename: controllerHarness.onRename,
          onBlur: controllerHarness.onBlur,
          onReload: controllerHarness.onReload,
          onDelete: controllerHarness.onDelete,
          onFlush: controllerHarness.onFlush,
          onDispose: controllerHarness.onDispose
        }
      };
    }
  };
});

vi.mock('@/stores/workspace/recent', () => ({
  useRecentStore: () => ({
    getFileById: getFileByIdMock,
    addFile: vi.fn(),
    removeFile: vi.fn()
  })
}));

vi.mock('@/stores/workspace/tabs', () => ({
  useTabsStore: () => ({
    addTab: vi.fn(),
    removeTab: vi.fn(),
    isMissing: vi.fn().mockReturnValue(false)
  })
}));

vi.mock('@/shared/platform', () => ({
  native: {
    readFile: readFileMock,
    getPathStatus: getPathStatusMock,
    saveFile: saveFileMock,
    writeFile: writeFileMock,
    createFile: createFileMock,
    renameFile: vi.fn(),
    trashFile: vi.fn(),
    showItemInFolder: vi.fn(),
    getRelativePath: vi.fn()
  }
}));

vi.mock('@/utils/modal', () => ({
  Modal: {
    confirm: confirmMock,
    input: vi.fn().mockResolvedValue([true, '']),
    delete: vi.fn().mockResolvedValue([true, false])
  }
}));

/**
 * 编辑器会话宿主暴露值。
 */
interface SessionExpose {
  /** 编辑器会话。 */
  session: ReturnType<typeof useSession>;
}

const FILE_PATH = '/workspace/note.md';
const FILE_CONTENT = '# Draft';

/**
 * 创建普通最近文件记录。
 * @returns 普通最近文件记录
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
 * 创建 Widget 最近文件记录。
 * @returns Widget 最近文件记录
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
 * @returns 测试包装器
 */
function mountSessionHost(): ReturnType<typeof mount> {
  return mount(
    defineComponent({
      name: 'EditorSessionHost',
      setup(_, { expose }): () => null {
        const session = useSession(ref('file-1'));
        expose({ session });
        return (): null => null;
      }
    })
  );
}

describe('editor useSession adapter', (): void => {
  beforeEach((): void => {
    getFileByIdMock.mockReset();
    saveFileMock.mockReset();
    readFileMock.mockReset();
    getPathStatusMock.mockReset().mockResolvedValue({ exists: true, isFile: true, isDirectory: false });
    createFileMock.mockReset().mockResolvedValue(undefined);
    writeFileMock.mockReset().mockResolvedValue(undefined);
    confirmMock.mockReset().mockResolvedValue([true, false]);
    routerPushMock.mockReset();
    controllerHarness.options = null;
    controllerHarness.fileState = null;
    controllerHarness.data = null;
    controllerHarness.onSave.mockReset().mockResolvedValue(undefined);
    controllerHarness.onSaveAs.mockReset().mockResolvedValue(undefined);
    controllerHarness.onRename.mockReset().mockResolvedValue(undefined);
    controllerHarness.onBlur.mockReset().mockResolvedValue(undefined);
    controllerHarness.onReload.mockReset().mockResolvedValue(undefined);
    controllerHarness.onDelete.mockReset().mockResolvedValue(undefined);
    controllerHarness.onFlush.mockReset().mockResolvedValue(undefined);
    controllerHarness.onDispose.mockReset().mockResolvedValue(undefined);
    getFileByIdMock.mockResolvedValue(createStoredFile());
    readFileMock.mockResolvedValue({ content: FILE_CONTENT, name: 'note', ext: 'md' });
    saveFileMock.mockResolvedValue(FILE_PATH);
  });

  it('provides save-as and load behavior through controller events', async (): Promise<void> => {
    mountSessionHost();
    await flushPromises();
    const { options } = controllerHarness;
    expect(options).not.toBeNull();
    if (!options) return;

    const savedPath = await options.events.onSaveAs({ fileState: createStoredFile(), content: FILE_CONTENT });
    const candidates = await options.events.onLoad({ fileId: 'file-1', sessionVersion: 1 });

    expect(savedPath).toBe(FILE_PATH);
    expect(saveFileMock).toHaveBeenCalledWith(FILE_CONTENT, undefined, { defaultPath: FILE_PATH });
    expect(candidates.draft?.fileState.content).toBe(FILE_CONTENT);
    expect(candidates.disk?.fileState.content).toBe(FILE_CONTENT);
  });

  it('redirects Widget records from the load event without replacing them', async (): Promise<void> => {
    getFileByIdMock.mockResolvedValue(createStoredWidget());
    mountSessionHost();
    await flushPromises();
    const { options } = controllerHarness;
    expect(options).not.toBeNull();
    if (!options) return;

    const candidates = await options.events.onLoad({ fileId: 'file-1', sessionVersion: 1 });

    expect(routerPushMock).toHaveBeenCalledWith({ name: 'widget', params: { id: 'file-1' } });
    expect(candidates).toEqual({ draft: null, disk: null, error: null, aborted: true });
  });

  it('reports a disk read error when the existing path is still present', async (): Promise<void> => {
    readFileMock.mockRejectedValue(new Error('permission denied'));
    mountSessionHost();
    await flushPromises();
    const { options } = controllerHarness;
    expect(options).not.toBeNull();
    if (!options) return;

    const candidates = await options.events.onLoad({ fileId: 'file-1', sessionVersion: 1 });

    expect(candidates.error?.message).toBe('permission denied');
    expect(candidates.missing).not.toBe(true);
  });

  it('classifies an absent disk path as missing while preserving its draft', async (): Promise<void> => {
    readFileMock.mockRejectedValue(new Error('file not found'));
    getPathStatusMock.mockResolvedValue({ exists: false, isFile: false, isDirectory: false });
    mountSessionHost();
    await flushPromises();
    const { options } = controllerHarness;
    expect(options).not.toBeNull();
    if (!options) return;

    const candidates = await options.events.onLoad({ fileId: 'file-1', sessionVersion: 1 });

    expect(candidates.draft?.fileState.content).toBe(FILE_CONTENT);
    expect(candidates.disk).toBeNull();
    expect(candidates.error).toBeNull();
    expect(candidates.missing).toBe(true);
  });

  it('restores a missing path with atomic creation before allowing overwrite', async (): Promise<void> => {
    getPathStatusMock.mockResolvedValue({ exists: false, isFile: false, isDirectory: false });
    mountSessionHost();
    await flushPromises();
    const { options } = controllerHarness;
    expect(options).not.toBeNull();
    if (!options) return;
    const fileState = createStoredFile();

    const restored = await options.events.onRestoreFile({ fileState });

    expect(restored).toBe(true);
    expect(createFileMock).toHaveBeenCalledWith(FILE_PATH, FILE_CONTENT);
    expect(writeFileMock).not.toHaveBeenCalled();
    expect(confirmMock).not.toHaveBeenCalled();
  });

  it('asks before overwriting when a file appears during atomic restoration', async (): Promise<void> => {
    getPathStatusMock
      .mockResolvedValueOnce({ exists: false, isFile: false, isDirectory: false })
      .mockResolvedValueOnce({ exists: true, isFile: true, isDirectory: false });
    createFileMock.mockRejectedValueOnce(new Error('path exists'));
    confirmMock.mockResolvedValueOnce([false, true]);
    mountSessionHost();
    await flushPromises();
    const { options } = controllerHarness;
    expect(options).not.toBeNull();
    if (!options) return;

    const restored = await options.events.onRestoreFile({ fileState: createStoredFile() });

    expect(restored).toBe(true);
    expect(confirmMock).toHaveBeenCalledTimes(1);
    expect(writeFileMock).toHaveBeenCalledWith(FILE_PATH, FILE_CONTENT);
  });

  it('forwards common actions and bridges editor content into controller data', async (): Promise<void> => {
    const wrapper = mountSessionHost();
    await flushPromises();
    const exposed = wrapper.vm as unknown as SessionExpose;

    await exposed.session.actions.onSave();
    await exposed.session.actions.onEditorBlur();
    expect(controllerHarness.onSave).toHaveBeenCalledTimes(1);
    expect(controllerHarness.onBlur).toHaveBeenCalledTimes(1);

    if (!controllerHarness.fileState || !controllerHarness.data) return;
    controllerHarness.fileState.value.content = 'changed in editor';
    await nextTick();
    expect(controllerHarness.data.value).toBe('changed in editor');
  });
});
