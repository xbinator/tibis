/**
 * @file use-file-session.test.ts
 * @description 验证通用文件会话与 Widget JSON 会话。
 */
import { effectScope, nextTick, ref } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WidgetData } from '@/components/BWidget/types';
import { createDefaultWidgetData } from '@/components/BWidget/utils/widgetData';
import { useFileSession } from '@/hooks/useFileSession';
import type { FileChangeEvent } from '@/shared/platform/native/types';

const getFileByIdMock = vi.hoisted(() => vi.fn());
const addFileMock = vi.hoisted(() => vi.fn());
const updateFileMock = vi.hoisted(() => vi.fn());
const clearDirtyMock = vi.hoisted(() => vi.fn());
const setDirtyMock = vi.hoisted(() => vi.fn());
const isDirtyMock = vi.hoisted(() => vi.fn());
const writeFileMock = vi.hoisted(() => vi.fn());
const saveFileMock = vi.hoisted(() => vi.fn());
const readFileMock = vi.hoisted(() => vi.fn());
const onFileChangedMock = vi.hoisted(() => vi.fn());
const registerWatchMock = vi.hoisted(() => vi.fn());
const unregisterWatchMock = vi.hoisted(() => vi.fn());
const updateWatchPathMock = vi.hoisted(() => vi.fn());
const routerPushMock = vi.hoisted(() => vi.fn());

vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: routerPushMock
  })
}));

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
    clearDirty: clearDirtyMock,
    setDirty: setDirtyMock,
    isDirty: isDirtyMock,
    clearMissing: vi.fn(),
    isMissing: () => false
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

vi.mock('@/hooks/useClipboard', () => ({
  useClipboard: () => ({
    clipboard: vi.fn()
  })
}));

vi.mock('@/utils/modal', () => ({
  Modal: {
    confirm: vi.fn().mockResolvedValue([true, false]),
    input: vi.fn().mockResolvedValue([true, ''])
  }
}));

vi.mock('@/shared/platform', () => ({
  native: {
    writeFile: writeFileMock,
    saveFile: saveFileMock,
    readFile: readFileMock,
    renameFile: vi.fn(),
    showItemInFolder: vi.fn(),
    getRelativePath: vi.fn(),
    onFileChanged: onFileChangedMock
  }
}));

/**
 * 创建测试小组件数据。
 * @returns 小组件数据
 */
function createWidgetData(): WidgetData {
  return createDefaultWidgetData();
}

/**
 * 等待挂起的 Promise 任务完成。
 * @returns Promise
 */
function flushPromises(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

describe('useFileSession', (): void => {
  beforeEach((): void => {
    getFileByIdMock.mockReset();
    addFileMock.mockReset();
    updateFileMock.mockReset();
    clearDirtyMock.mockReset();
    setDirtyMock.mockReset();
    isDirtyMock.mockReset();
    isDirtyMock.mockReturnValue(false);
    writeFileMock.mockReset();
    saveFileMock.mockReset();
    readFileMock.mockReset();
    onFileChangedMock.mockReset();
    registerWatchMock.mockReset();
    unregisterWatchMock.mockReset();
    updateWatchPathMock.mockReset();
    routerPushMock.mockReset();
    onFileChangedMock.mockReturnValue(vi.fn());
  });

  it('creates default widget JSON content when no stored file exists', async (): Promise<void> => {
    getFileByIdMock.mockResolvedValue(undefined);
    addFileMock.mockResolvedValue(undefined);
    const scope = effectScope();
    const fileId = ref('widget-1');
    let content = '';

    await scope.run(async (): Promise<void> => {
      const session = useFileSession<WidgetData>({
        fileId,
        kind: 'widget',
        recordType: 'widget',
        defaultName: 'Untitled',
        defaultExt: 'json',
        defaultData: createWidgetData(),
        routeName: 'widget',
        fallbackRouteName: 'editor'
      });

      await flushPromises();
      content = session.fileState.value.content;
    });
    scope.stop();

    expect(JSON.parse(content)).toEqual(createWidgetData());
    expect(JSON.parse(content)).not.toHaveProperty('type');
    expect(JSON.parse(content)).not.toHaveProperty('version');
    expect(addFileMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'widget',
        ext: 'json'
      })
    );
  });

  it('writes to existing disk path on save', async (): Promise<void> => {
    const content = JSON.stringify(createWidgetData(), null, 2);
    getFileByIdMock.mockResolvedValue({
      type: 'widget',
      id: 'widget-1',
      path: '/tmp/widget.json',
      name: 'board',
      ext: 'json',
      content,
      savedContent: content
    });
    writeFileMock.mockResolvedValue(undefined);
    const scope = effectScope();

    await scope.run(async (): Promise<void> => {
      const session = useFileSession<WidgetData>({
        fileId: ref('widget-1'),
        kind: 'widget',
        recordType: 'widget',
        defaultName: 'Untitled',
        defaultExt: 'json',
        defaultData: createWidgetData(),
        routeName: 'widget',
        fallbackRouteName: 'editor'
      });

      await flushPromises();
      await session.actions.onSave();
    });
    scope.stop();

    expect(writeFileMock).toHaveBeenCalledWith('/tmp/widget.json', content);
    expect(updateFileMock).toHaveBeenCalledWith(
      'widget-1',
      expect.objectContaining({
        type: 'widget',
        content
      })
    );
  });

  it('keeps edits made during disk writing dirty and exposes the written content as the saved baseline', async (): Promise<void> => {
    const initialData = { ...createWidgetData(), name: '初始名称' };
    const writtenData = { ...createWidgetData(), name: '写盘名称' };
    const pendingData = { ...createWidgetData(), name: '后续名称' };
    const initialContent = JSON.stringify(initialData, null, 2);
    const writtenContent = JSON.stringify(writtenData, null, 2);
    const pendingContent = JSON.stringify(pendingData, null, 2);
    let resolveWrite: (() => void) | null = null;

    getFileByIdMock.mockResolvedValue({
      type: 'widget',
      id: 'widget-1',
      path: '/tmp/widget.json',
      name: 'board',
      ext: 'json',
      content: initialContent,
      savedContent: initialContent
    });
    writeFileMock.mockImplementation(
      (): Promise<void> =>
        new Promise<void>((resolve) => {
          resolveWrite = resolve;
        })
    );
    const scope = effectScope();

    await scope.run(async (): Promise<void> => {
      const session = useFileSession<WidgetData>({
        fileId: ref('widget-1'),
        kind: 'widget',
        recordType: 'widget',
        defaultName: 'Untitled',
        defaultExt: 'json',
        defaultData: createWidgetData(),
        routeName: 'widget',
        fallbackRouteName: 'editor'
      });

      await flushPromises();
      session.data.value = writtenData;
      await nextTick();
      clearDirtyMock.mockClear();
      setDirtyMock.mockClear();

      const savePromise = session.actions.onSave();
      session.data.value = pendingData;
      await nextTick();
      resolveWrite?.();
      await savePromise;

      expect(writeFileMock).toHaveBeenCalledWith('/tmp/widget.json', writtenContent);
      expect(session.savedContent.value).toBe(writtenContent);
      expect(session.fileState.value.content).toBe(pendingContent);
      expect(setDirtyMock).toHaveBeenCalledWith('widget-1');
      expect(clearDirtyMock).not.toHaveBeenCalled();
    });
    scope.stop();
  });

  it('does not mark stored widget JSON content dirty while loading', async (): Promise<void> => {
    const content = JSON.stringify(createWidgetData(), null, 2);
    getFileByIdMock.mockResolvedValue({
      type: 'widget',
      id: 'widget-1',
      path: '/tmp/widget.json',
      name: 'board',
      ext: 'json',
      content,
      savedContent: content
    });
    const scope = effectScope();

    await scope.run(async (): Promise<void> => {
      useFileSession<WidgetData>({
        fileId: ref('widget-1'),
        kind: 'widget',
        recordType: 'widget',
        defaultName: 'Untitled',
        defaultExt: 'json',
        defaultData: createWidgetData(),
        routeName: 'widget',
        fallbackRouteName: 'editor'
      });

      await flushPromises();
      await flushPromises();
    });
    scope.stop();

    expect(setDirtyMock).not.toHaveBeenCalled();
    expect(writeFileMock).not.toHaveBeenCalled();
  });

  it('marks unsaved widget drafts dirty when stored content differs from the saved baseline', async (): Promise<void> => {
    const content = JSON.stringify(createWidgetData(), null, 2);
    getFileByIdMock.mockResolvedValue({
      type: 'widget',
      id: 'widget-1',
      path: null,
      name: 'board',
      ext: 'json',
      content,
      savedContent: ''
    });
    const scope = effectScope();

    await scope.run(async (): Promise<void> => {
      useFileSession<WidgetData>({
        fileId: ref('widget-1'),
        kind: 'widget',
        recordType: 'widget',
        defaultName: 'Untitled',
        defaultExt: 'json',
        defaultData: createWidgetData(),
        routeName: 'widget',
        fallbackRouteName: 'editor'
      });

      await flushPromises();
      await flushPromises();
    });
    scope.stop();

    expect(setDirtyMock).toHaveBeenCalledWith('widget-1');
    expect(clearDirtyMock).not.toHaveBeenCalledWith('widget-1');
  });

  it('marks disk-backed widget drafts dirty when stored content differs from the saved baseline', async (): Promise<void> => {
    const savedContent = JSON.stringify(createWidgetData(), null, 2);
    const draftContent = savedContent.replace('"elements": []', '"elements": [{"id":"node-1"}]');
    getFileByIdMock.mockResolvedValue({
      type: 'widget',
      id: 'widget-1',
      path: '/tmp/widget.json',
      name: 'board',
      ext: 'json',
      content: draftContent,
      savedContent
    });
    const scope = effectScope();

    await scope.run(async (): Promise<void> => {
      useFileSession<WidgetData>({
        fileId: ref('widget-1'),
        kind: 'widget',
        recordType: 'widget',
        defaultName: 'Untitled',
        defaultExt: 'json',
        defaultData: createWidgetData(),
        routeName: 'widget',
        fallbackRouteName: 'editor'
      });

      await flushPromises();
      await flushPromises();
    });
    scope.stop();

    expect(setDirtyMock).toHaveBeenCalledWith('widget-1');
    expect(clearDirtyMock).not.toHaveBeenCalledWith('widget-1');
  });

  it('uses JSON default path when saving a widget with dialog', async (): Promise<void> => {
    getFileByIdMock.mockResolvedValue(undefined);
    addFileMock.mockResolvedValue(undefined);
    saveFileMock.mockResolvedValue('/tmp/widget.json');
    const scope = effectScope();

    await scope.run(async (): Promise<void> => {
      const session = useFileSession<WidgetData>({
        fileId: ref('widget-1'),
        kind: 'widget',
        recordType: 'widget',
        defaultName: 'Untitled',
        defaultExt: 'json',
        defaultData: createWidgetData(),
        routeName: 'widget',
        fallbackRouteName: 'editor'
      });

      await flushPromises();
      await session.actions.onSaveAs();
    });
    scope.stop();

    expect(saveFileMock).toHaveBeenCalledWith(
      expect.any(String),
      undefined,
      expect.objectContaining({
        defaultPath: 'Untitled.json'
      })
    );
    expect(saveFileMock.mock.calls[0]?.[2]).not.toHaveProperty('filters');
  });

  it('reuses the pending save dialog transaction without publishing a later snapshot', async (): Promise<void> => {
    const initialData = { ...createWidgetData(), name: '初始名称' };
    const writtenData = { ...createWidgetData(), name: '写盘名称' };
    const pendingData = { ...createWidgetData(), name: '后续名称' };
    const initialContent = JSON.stringify(initialData, null, 2);
    const writtenContent = JSON.stringify(writtenData, null, 2);
    const pendingContent = JSON.stringify(pendingData, null, 2);
    let resolveDialog: ((path: string | null) => void) | null = null;
    const dialogPromise = new Promise<string | null>((resolve) => {
      resolveDialog = resolve;
    });

    getFileByIdMock.mockResolvedValue({
      type: 'widget',
      id: 'widget-1',
      path: null,
      name: 'board',
      ext: 'json',
      content: initialContent,
      savedContent: initialContent
    });
    saveFileMock.mockReturnValue(dialogPromise);
    const scope = effectScope();

    await scope.run(async (): Promise<void> => {
      const session = useFileSession<WidgetData>({
        fileId: ref('widget-1'),
        kind: 'widget',
        recordType: 'widget',
        defaultName: 'Untitled',
        defaultExt: 'json',
        defaultData: createWidgetData(),
        routeName: 'widget',
        fallbackRouteName: 'editor'
      });

      await flushPromises();
      session.data.value = writtenData;
      await nextTick();

      const firstSave = session.actions.onSaveAs();
      session.data.value = pendingData;
      await nextTick();
      const secondSave = session.actions.onSaveAs();
      resolveDialog?.('/tmp/widget.json');
      await Promise.all([firstSave, secondSave]);

      expect(saveFileMock).toHaveBeenCalledTimes(1);
      expect(saveFileMock).toHaveBeenCalledWith(writtenContent, undefined, expect.any(Object));
      expect(session.savedContent.value).toBe(writtenContent);
      expect(session.fileState.value.content).toBe(pendingContent);
      expect(setDirtyMock).toHaveBeenCalledWith('widget-1');
    });
    scope.stop();
  });

  it('syncs text mode data changes into file content', async (): Promise<void> => {
    getFileByIdMock.mockResolvedValue(undefined);
    addFileMock.mockResolvedValue(undefined);
    const scope = effectScope();
    let content = '';

    await scope.run(async (): Promise<void> => {
      const session = useFileSession<string>({
        fileId: ref('text-1'),
        kind: 'text',
        defaultName: 'Untitled',
        defaultExt: 'md',
        defaultData: '',
        routeName: 'editor',
        fallbackRouteName: 'editor'
      });

      await flushPromises();
      session.data.value = 'hello';
      await nextTick();
      content = session.fileState.value.content;
    });
    scope.stop();

    expect(content).toBe('hello');
  });

  it('registers disk paths for missing file tracking', async (): Promise<void> => {
    const content = JSON.stringify(createWidgetData(), null, 2);
    getFileByIdMock.mockResolvedValue({
      type: 'widget',
      id: 'widget-1',
      path: '/tmp/widget.json',
      name: 'board',
      ext: 'json',
      content,
      savedContent: content
    });
    const scope = effectScope();

    await scope.run(async (): Promise<void> => {
      useFileSession<WidgetData>({
        fileId: ref('widget-1'),
        kind: 'widget',
        recordType: 'widget',
        defaultName: 'Untitled',
        defaultExt: 'json',
        defaultData: createWidgetData(),
        routeName: 'widget',
        fallbackRouteName: 'editor'
      });

      await flushPromises();
    });
    scope.stop();

    expect(registerWatchMock).toHaveBeenCalledWith('widget-1', '/tmp/widget.json');
  });

  it('updates widget data when an external change writes valid widget JSON', async (): Promise<void> => {
    const content = JSON.stringify(createWidgetData(), null, 2);
    const nextData = {
      ...createWidgetData(),
      name: '天气新版'
    };
    let fileChangedHandler: ((event: FileChangeEvent) => void) | null = null;
    onFileChangedMock.mockImplementation((handler: (event: FileChangeEvent) => void): (() => void) => {
      fileChangedHandler = handler;
      return vi.fn();
    });
    getFileByIdMock.mockResolvedValue({
      type: 'widget',
      id: 'widget-1',
      path: '/tmp/widget.json',
      name: 'board',
      ext: 'json',
      content,
      savedContent: content
    });
    const scope = effectScope();

    await scope.run(async (): Promise<void> => {
      useFileSession<WidgetData>({
        fileId: ref('widget-1'),
        kind: 'widget',
        recordType: 'widget',
        defaultName: 'Untitled',
        defaultExt: 'json',
        defaultData: createWidgetData(),
        routeName: 'widget',
        fallbackRouteName: 'editor'
      });

      await flushPromises();
      fileChangedHandler?.({
        type: 'change',
        filePath: '/tmp/widget.json',
        content: JSON.stringify(nextData, null, 2)
      });
      await flushPromises();
    });
    scope.stop();

    expect(updateFileMock).toHaveBeenCalledWith(
      'widget-1',
      expect.objectContaining({
        type: 'widget',
        content: JSON.stringify(nextData, null, 2)
      })
    );
    expect(routerPushMock).not.toHaveBeenCalled();
  });

  it('marks a matching local draft saved when the same content is written externally', async (): Promise<void> => {
    const initialContent = JSON.stringify({ ...createWidgetData(), name: '初始名称' }, null, 2);
    const draftData = { ...createWidgetData(), name: '外部保存名称' };
    const draftContent = JSON.stringify(draftData, null, 2);
    let fileChangedHandler: ((event: FileChangeEvent) => void) | null = null;
    onFileChangedMock.mockImplementation((handler: (event: FileChangeEvent) => void): (() => void) => {
      fileChangedHandler = handler;
      return vi.fn();
    });
    getFileByIdMock.mockResolvedValue({
      type: 'widget',
      id: 'widget-1',
      path: '/tmp/widget.json',
      name: 'board',
      ext: 'json',
      content: initialContent,
      savedContent: initialContent
    });
    const scope = effectScope();

    await scope.run(async (): Promise<void> => {
      const session = useFileSession<WidgetData>({
        fileId: ref('widget-1'),
        kind: 'widget',
        recordType: 'widget',
        defaultName: 'Untitled',
        defaultExt: 'json',
        defaultData: createWidgetData(),
        routeName: 'widget',
        fallbackRouteName: 'editor'
      });

      await flushPromises();
      session.data.value = draftData;
      await nextTick();
      clearDirtyMock.mockClear();

      fileChangedHandler?.({
        type: 'change',
        filePath: '/tmp/widget.json',
        content: draftContent
      });
      await flushPromises();

      expect(session.savedContent.value).toBe(draftContent);
      expect(clearDirtyMock).toHaveBeenCalledWith('widget-1');
    });
    scope.stop();
  });

  it('does not write disk when widget serialization fails', async (): Promise<void> => {
    const content = JSON.stringify(createWidgetData(), null, 2);
    getFileByIdMock.mockResolvedValue({
      type: 'widget',
      id: 'widget-1',
      path: '/tmp/widget.json',
      name: 'board',
      ext: 'json',
      content,
      savedContent: content
    });
    const scope = effectScope();
    const circular = createWidgetData() as WidgetData & { self?: unknown };
    circular.self = circular;

    await scope.run(async (): Promise<void> => {
      const session = useFileSession<WidgetData>({
        fileId: ref('widget-1'),
        kind: 'widget',
        recordType: 'widget',
        defaultName: 'Untitled',
        defaultExt: 'json',
        defaultData: createWidgetData(),
        routeName: 'widget',
        fallbackRouteName: 'editor'
      });

      await flushPromises();
      session.data.value = circular;
      await nextTick();
      await session.actions.onSave();
    });
    scope.stop();

    expect(writeFileMock).not.toHaveBeenCalled();
  });
});
