/**
 * @file use-session.test.ts
 * @description 验证 Widget 页面专用文件会话的磁盘加载与草稿协调。
 * @vitest-environment jsdom
 */
import { defineComponent, effectScope, nextTick } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultWidgetData } from '@/components/BWidget/utils/widgetData';
import type { FileChangeEvent } from '@/shared/platform/native/types';
import { emitter } from '@/utils/emitter';
import { useSession } from '@/views/widget/hooks/useSession';

const getFileByIdMock = vi.hoisted(() => vi.fn());
const addFileMock = vi.hoisted(() => vi.fn());
const updateFileMock = vi.hoisted(() => vi.fn());
const clearDirtyMock = vi.hoisted(() => vi.fn());
const setDirtyMock = vi.hoisted(() => vi.fn());
const getWidgetByIdMock = vi.hoisted(() => vi.fn());
const waitForInitMock = vi.hoisted(() => vi.fn());
const readFileMock = vi.hoisted(() => vi.fn());
const writeFileMock = vi.hoisted(() => vi.fn());
const saveFileMock = vi.hoisted(() => vi.fn());
const renameFileMock = vi.hoisted(() => vi.fn());
const confirmMock = vi.hoisted(() => vi.fn());
const alertMock = vi.hoisted(() => vi.fn());
const onFileChangedMock = vi.hoisted(() => vi.fn());
const registerWatchMock = vi.hoisted(() => vi.fn());
const unregisterWatchMock = vi.hoisted(() => vi.fn());
const updateWatchPathMock = vi.hoisted(() => vi.fn());
const addTabMock = vi.hoisted(() => vi.fn());
const routeMock = vi.hoisted(() => ({
  fullPath: '/widget/widget-weather',
  params: {
    id: 'widget-weather'
  }
}));
const autoSaveMock = vi.hoisted(() => ({
  pause: vi.fn(),
  resume: vi.fn(),
  save: vi.fn()
}));
const savePolicyMock = vi.hoisted(() => ({
  handleEditorBlur: vi.fn(),
  notifyContentChanged: vi.fn()
}));
let fileChangedHandler: ((event: FileChangeEvent) => void) | null = null;
let dirtyEvents: string[] = [];

vi.mock('@/hooks/useClipboard', () => ({
  useClipboard: () => ({
    clipboard: vi.fn()
  })
}));

vi.mock('@/hooks/useFileAutoSave', () => ({
  useFileAutoSave: () => autoSaveMock
}));

vi.mock('@/hooks/useSavePolicy', () => ({
  useSavePolicy: () => savePolicyMock
}));

vi.mock('vue-router', () => ({
  useRoute: () => routeMock
}));

vi.mock('@/shared/platform', () => ({
  native: {
    readFile: readFileMock,
    writeFile: writeFileMock,
    saveFile: saveFileMock,
    renameFile: renameFileMock,
    showItemInFolder: vi.fn(),
    getRelativePath: vi.fn(),
    onFileChanged: onFileChangedMock
  }
}));

vi.mock('@/stores/ai/widget', () => ({
  useWidgetStore: () => ({
    getWidgetById: getWidgetByIdMock,
    waitForInit: waitForInitMock
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
    setDirty: setDirtyMock,
    clearMissing: vi.fn()
  })
}));

vi.mock('@/utils/modal', () => ({
  Modal: {
    alert: alertMock,
    confirm: confirmMock,
    input: vi.fn().mockResolvedValue([true, ''])
  }
}));

/**
 * 可手动完成的 Promise。
 */
interface DeferredPromise<T> {
  /** 等待外部完成的 Promise */
  promise: Promise<T>;
  /** 完成 Promise */
  resolve: (value: T) => void;
}

/**
 * 创建可手动完成的 Promise。
 * @returns Promise 与完成函数
 */
function createDeferred<T>(): DeferredPromise<T> {
  let resolvePromise: (value: T) => void = (): void => undefined;
  const promise = new Promise<T>((resolve: (value: T) => void): void => {
    resolvePromise = resolve;
  });

  return {
    promise,
    resolve: resolvePromise
  };
}

/**
 * 等待异步文件加载完成。
 * @returns 下一轮宏任务 Promise
 */
function flushPromises(): Promise<void> {
  return new Promise<void>((resolve: () => void): void => {
    setTimeout(resolve, 0);
  });
}

/**
 * 挂载调用统一 Widget 会话的测试组件。
 * @returns 测试组件包装器
 */
function mountSession(): VueWrapper {
  return mount(
    defineComponent({
      name: 'WidgetSessionHost',
      setup(): Record<string, never> {
        useSession();
        return {};
      },
      template: '<div />'
    })
  );
}

describe('Widget useSession', (): void => {
  beforeEach((): void => {
    getFileByIdMock.mockReset();
    addFileMock.mockReset();
    updateFileMock.mockReset();
    dirtyEvents = [];
    clearDirtyMock.mockReset().mockImplementation((): void => {
      dirtyEvents.push('clear');
    });
    setDirtyMock.mockReset().mockImplementation((): void => {
      dirtyEvents.push('dirty');
    });
    getWidgetByIdMock.mockReset();
    waitForInitMock.mockReset().mockResolvedValue(undefined);
    readFileMock.mockReset();
    writeFileMock.mockReset().mockResolvedValue(undefined);
    saveFileMock.mockReset();
    renameFileMock.mockReset();
    confirmMock.mockReset().mockResolvedValue([true, false]);
    alertMock.mockReset().mockResolvedValue(undefined);
    fileChangedHandler = null;
    onFileChangedMock.mockReset().mockImplementation((handler: (event: FileChangeEvent) => void): (() => void) => {
      fileChangedHandler = handler;
      return vi.fn();
    });
    registerWatchMock.mockReset();
    unregisterWatchMock.mockReset();
    updateWatchPathMock.mockReset();
    addTabMock.mockReset();
    routeMock.fullPath = '/widget/widget-weather';
    autoSaveMock.pause.mockReset();
    autoSaveMock.resume.mockReset();
    autoSaveMock.save.mockReset();
    savePolicyMock.handleEditorBlur.mockReset();
    savePolicyMock.notifyContentChanged.mockReset();
  });

  it('syncs the Widget tab and handles file menu events through the unified session', async (): Promise<void> => {
    const diskContent = JSON.stringify({ ...createDefaultWidgetData('weather'), name: '磁盘天气' }, null, 2);
    getFileByIdMock.mockResolvedValue(undefined);
    getWidgetByIdMock.mockReturnValue({
      id: 'weather',
      filePath: '/tmp/widgets/weather/widget.json'
    });
    readFileMock.mockResolvedValue({
      name: 'widget',
      ext: 'json',
      content: diskContent
    });
    const wrapper = mountSession();

    await flushPromises();
    await flushPromises();
    emitter.emit('file:save');
    await flushPromises();

    expect(addTabMock).toHaveBeenLastCalledWith({
      id: 'widget-weather',
      path: '/widget/widget-weather',
      title: 'widget.json',
      cacheKey: 'widget:widget-weather'
    });
    expect(writeFileMock).toHaveBeenCalledWith('/tmp/widgets/weather/widget.json', diskContent);
    wrapper.unmount();
  });

  it('exports a Widget copy without rebinding the installed session path', async (): Promise<void> => {
    const diskContent = JSON.stringify({ ...createDefaultWidgetData('weather'), name: '磁盘天气' }, null, 2);
    const installedPath = '/tmp/widgets/weather/widget.json';
    const exportedPath = '/tmp/exports/weather-copy.json';
    getFileByIdMock.mockResolvedValue(undefined);
    getWidgetByIdMock.mockReturnValue({ id: 'weather', filePath: installedPath });
    readFileMock.mockResolvedValue({ name: 'widget', ext: 'json', content: diskContent });
    saveFileMock.mockResolvedValue(exportedPath);
    const scope = effectScope();
    let currentPath: string | null = null;

    await scope.run(async (): Promise<void> => {
      const session = useSession();
      await flushPromises();
      await flushPromises();
      await session.actions.onSaveAs();
      currentPath = session.fileState.value.path;
    });
    scope.stop();

    expect(saveFileMock).toHaveBeenCalledWith(diskContent, undefined, { defaultPath: installedPath });
    expect(currentPath).toBe(installedPath);
    expect(updateWatchPathMock).not.toHaveBeenCalledWith('widget-weather', exportedPath);
  });

  it('blocks renaming the fixed installed Widget file', async (): Promise<void> => {
    const diskContent = JSON.stringify({ ...createDefaultWidgetData('weather'), name: '磁盘天气' }, null, 2);
    const installedPath = '/tmp/widgets/weather/widget.json';
    getFileByIdMock.mockResolvedValue(undefined);
    getWidgetByIdMock.mockReturnValue({ id: 'weather', filePath: installedPath });
    readFileMock.mockResolvedValue({ name: 'widget', ext: 'json', content: diskContent });
    const scope = effectScope();

    await scope.run(async (): Promise<void> => {
      const session = useSession();
      await flushPromises();
      await flushPromises();
      await session.actions.onRename();
    });
    scope.stop();

    expect(alertMock).toHaveBeenCalledWith('无法重命名', '已安装 Widget 的配置文件名固定为 widget.json');
    expect(renameFileMock).not.toHaveBeenCalled();
  });

  it('exposes loading state while the initial disk read is pending', async (): Promise<void> => {
    const readDeferred = createDeferred<{ name: string; ext: string; content: string }>();
    getFileByIdMock.mockResolvedValue(undefined);
    getWidgetByIdMock.mockReturnValue({
      id: 'weather',
      filePath: '/tmp/widgets/weather/widget.json'
    });
    readFileMock.mockReturnValue(readDeferred.promise);
    const scope = effectScope();

    await scope.run(async (): Promise<void> => {
      const session = useSession();
      await flushPromises();
      expect(session).toHaveProperty('isLoading');
      expect(session).toHaveProperty('loadError');
      expect(session).toHaveProperty('reload');
      readDeferred.resolve({
        name: 'widget',
        ext: 'json',
        content: JSON.stringify(createDefaultWidgetData('weather'), null, 2)
      });
      await flushPromises();
    });
    scope.stop();
  });

  it('loads an installed Widget from disk when no recent record exists', async (): Promise<void> => {
    const diskContent = JSON.stringify({ ...createDefaultWidgetData('weather'), name: '磁盘天气' }, null, 2);
    getFileByIdMock.mockResolvedValue(undefined);
    getWidgetByIdMock.mockReturnValue({
      id: 'weather',
      filePath: '/tmp/widgets/weather/widget.json'
    });
    readFileMock.mockResolvedValue({
      name: 'widget',
      ext: 'json',
      content: diskContent
    });
    const scope = effectScope();
    let loadedName = '';

    await scope.run(async (): Promise<void> => {
      const session = useSession();
      await flushPromises();
      await flushPromises();
      loadedName = session.data.value.name;
    });
    scope.stop();

    expect(waitForInitMock).toHaveBeenCalledOnce();
    expect(getWidgetByIdMock).toHaveBeenCalledWith('weather');
    expect(readFileMock).toHaveBeenCalledWith('/tmp/widgets/weather/widget.json');
    expect(loadedName).toBe('磁盘天气');
    expect(addFileMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'widget',
        id: 'widget-weather',
        path: '/tmp/widgets/weather/widget.json',
        content: diskContent,
        savedContent: diskContent,
        openedAt: expect.any(Number)
      })
    );
  });

  it('refreshes a clean recent Widget from disk', async (): Promise<void> => {
    const storedContent = JSON.stringify({ ...createDefaultWidgetData('weather'), name: '缓存天气' }, null, 2);
    const diskContent = JSON.stringify({ ...createDefaultWidgetData('weather'), name: '磁盘天气' }, null, 2);
    getFileByIdMock.mockResolvedValue({
      type: 'widget',
      id: 'widget-weather',
      path: '/tmp/widgets/weather/widget.json',
      name: 'widget',
      ext: 'json',
      content: storedContent,
      savedContent: storedContent
    });
    readFileMock.mockResolvedValue({
      name: 'widget',
      ext: 'json',
      content: diskContent
    });
    const scope = effectScope();
    let loadedName = '';

    await scope.run(async (): Promise<void> => {
      const session = useSession();
      await flushPromises();
      await flushPromises();
      loadedName = session.data.value.name;
    });
    scope.stop();

    expect(loadedName).toBe('磁盘天气');
    expect(updateFileMock).toHaveBeenCalledWith(
      'widget-weather',
      expect.objectContaining({
        content: diskContent,
        savedContent: diskContent
      })
    );
  });

  it('uses the installed Widget path instead of a stale recent path', async (): Promise<void> => {
    const savedContent = JSON.stringify({ ...createDefaultWidgetData('weather'), name: '旧路径天气' }, null, 2);
    const diskContent = JSON.stringify({ ...createDefaultWidgetData('weather'), name: '新路径天气' }, null, 2);
    getFileByIdMock.mockResolvedValue({
      type: 'widget',
      id: 'widget-weather',
      path: '/tmp/widgets-old/weather/widget.json',
      name: 'widget',
      ext: 'json',
      content: savedContent,
      savedContent
    });
    getWidgetByIdMock.mockReturnValue({
      id: 'weather',
      filePath: '/tmp/widgets/weather/widget.json'
    });
    readFileMock.mockResolvedValue({
      name: 'widget',
      ext: 'json',
      content: diskContent
    });
    const scope = effectScope();
    let loadedPath: string | null = null;

    await scope.run(async (): Promise<void> => {
      const session = useSession();
      await flushPromises();
      await flushPromises();
      loadedPath = session.fileState.value.path;
    });
    scope.stop();

    expect(readFileMock).toHaveBeenCalledWith('/tmp/widgets/weather/widget.json');
    expect(loadedPath).toBe('/tmp/widgets/weather/widget.json');
  });

  it('normalizes incomplete Widget JSON before exposing page data', async (): Promise<void> => {
    getFileByIdMock.mockResolvedValue(undefined);
    getWidgetByIdMock.mockReturnValue({
      id: 'weather',
      filePath: '/tmp/widgets/weather/widget.json'
    });
    readFileMock.mockResolvedValue({
      name: 'widget',
      ext: 'json',
      content: '{}'
    });
    const scope = effectScope();
    let hasElements = false;
    let hasExecuteCode = false;

    await scope.run(async (): Promise<void> => {
      const session = useSession();
      await flushPromises();
      await flushPromises();
      hasElements = Array.isArray(session.data.value.elements);
      hasExecuteCode = typeof session.data.value.execute.code === 'string';
    });
    scope.stop();

    expect(hasElements).toBe(true);
    expect(hasExecuteCode).toBe(true);
  });

  it('surfaces invalid Widget JSON instead of accepting a default model as saved', async (): Promise<void> => {
    getFileByIdMock.mockResolvedValue(undefined);
    getWidgetByIdMock.mockReturnValue({
      id: 'weather',
      filePath: '/tmp/widgets/weather/widget.json'
    });
    readFileMock.mockResolvedValue({
      name: 'widget',
      ext: 'json',
      content: '{invalid json'
    });
    const scope = effectScope();
    let sessionResult: ReturnType<typeof useSession> | null = null;

    await scope.run(async (): Promise<void> => {
      const session = useSession();
      sessionResult = session;
      await flushPromises();
      await flushPromises();
      await session.actions.onSave();
    });
    scope.stop();

    expect(sessionResult).toHaveProperty('loadError');
    expect(addFileMock).not.toHaveBeenCalled();
    expect(clearDirtyMock).not.toHaveBeenCalled();
    expect(writeFileMock).not.toHaveBeenCalled();
    expect(autoSaveMock.pause).toHaveBeenCalledTimes(2);
    expect(autoSaveMock.resume).not.toHaveBeenCalled();
  });

  it('does not persist a blank recent record when the first disk read fails', async (): Promise<void> => {
    getFileByIdMock.mockResolvedValue(undefined);
    getWidgetByIdMock.mockReturnValue({
      id: 'weather',
      filePath: '/tmp/widgets/weather/widget.json'
    });
    readFileMock.mockRejectedValue(new Error('EACCES'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation((): void => undefined);
    const scope = effectScope();
    let loadedName = '';

    await scope.run(async (): Promise<void> => {
      const session = useSession();
      await flushPromises();
      await flushPromises();
      expect(addFileMock).not.toHaveBeenCalled();
      expect(session.loadError.value).toContain('EACCES');
      readFileMock.mockResolvedValue({
        name: 'widget',
        ext: 'json',
        content: JSON.stringify({ ...createDefaultWidgetData('weather'), name: '重试天气' }, null, 2)
      });
      await session.reload();
      loadedName = session.data.value.name;
    });
    scope.stop();
    consoleError.mockRestore();

    expect(loadedName).toBe('重试天气');
    expect(addFileMock).toHaveBeenCalledOnce();
  });

  it('keeps an unsaved Widget draft when disk still matches its saved baseline', async (): Promise<void> => {
    const savedContent = JSON.stringify({ ...createDefaultWidgetData('weather'), name: '已保存天气' }, null, 2);
    const draftContent = JSON.stringify({ ...createDefaultWidgetData('weather'), name: '草稿天气' }, null, 2);
    getFileByIdMock.mockResolvedValue({
      type: 'widget',
      id: 'widget-weather',
      path: '/tmp/widgets/weather/widget.json',
      name: 'widget',
      ext: 'json',
      content: draftContent,
      savedContent
    });
    readFileMock.mockResolvedValue({
      name: 'widget',
      ext: 'json',
      content: savedContent
    });
    const scope = effectScope();
    let loadedName = '';

    await scope.run(async (): Promise<void> => {
      const session = useSession();
      await flushPromises();
      await flushPromises();
      loadedName = session.data.value.name;
    });
    scope.stop();

    expect(readFileMock).toHaveBeenCalledWith('/tmp/widgets/weather/widget.json');
    expect(loadedName).toBe('草稿天气');
    expect(setDirtyMock).toHaveBeenCalledWith('widget-weather');
  });

  it('keeps a dirty draft when an external change is ignored', async (): Promise<void> => {
    const savedContent = JSON.stringify({ ...createDefaultWidgetData('weather'), name: '已保存天气' }, null, 2);
    const externalContent = JSON.stringify({ ...createDefaultWidgetData('weather'), name: '外部天气' }, null, 2);
    getFileByIdMock.mockResolvedValue({
      type: 'widget',
      id: 'widget-weather',
      path: '/tmp/widgets/weather/widget.json',
      name: 'widget',
      ext: 'json',
      content: savedContent,
      savedContent
    });
    readFileMock.mockResolvedValue({
      name: 'widget',
      ext: 'json',
      content: savedContent
    });
    const scope = effectScope();
    let currentName = '';

    await scope.run(async (): Promise<void> => {
      const session = useSession();
      await flushPromises();
      await flushPromises();
      session.data.value = { ...session.data.value, name: '本地草稿' };
      await nextTick();
      fileChangedHandler?.({
        type: 'change',
        filePath: '/tmp/widgets/weather/widget.json',
        content: externalContent
      });
      await flushPromises();
      currentName = session.data.value.name;
    });
    scope.stop();

    expect(confirmMock).toHaveBeenCalledWith('外部修改', expect.any(String), expect.any(Object));
    expect(currentName).toBe('本地草稿');
    expect(dirtyEvents.at(-1)).toBe('dirty');
  });

  it('loads recreated Widget content from an add event', async (): Promise<void> => {
    const diskContent = JSON.stringify({ ...createDefaultWidgetData('weather'), name: '原始天气' }, null, 2);
    const recreatedContent = JSON.stringify({ ...createDefaultWidgetData('weather'), name: '重建天气' }, null, 2);
    const installedPath = '/tmp/widgets/weather/widget.json';
    getFileByIdMock.mockResolvedValue(undefined);
    getWidgetByIdMock.mockReturnValue({ id: 'weather', filePath: installedPath });
    readFileMock
      .mockResolvedValueOnce({ name: 'widget', ext: 'json', content: diskContent })
      .mockResolvedValueOnce({ name: 'widget', ext: 'json', content: recreatedContent });
    const scope = effectScope();
    let currentName = '';

    await scope.run(async (): Promise<void> => {
      const session = useSession();
      await flushPromises();
      await flushPromises();
      fileChangedHandler?.({ type: 'add', filePath: installedPath });
      await flushPromises();
      await flushPromises();
      currentName = session.data.value.name;
    });
    scope.stop();

    expect(readFileMock).toHaveBeenCalledTimes(2);
    expect(currentName).toBe('重建天气');
  });

  it('keeps edits made during an in-flight save dirty and ignores its own file event', async (): Promise<void> => {
    const savedContent = JSON.stringify({ ...createDefaultWidgetData('weather'), name: '已保存天气' }, null, 2);
    getFileByIdMock.mockResolvedValue({
      type: 'widget',
      id: 'widget-weather',
      path: '/tmp/widgets/weather/widget.json',
      name: 'widget',
      ext: 'json',
      content: savedContent,
      savedContent
    });
    readFileMock.mockResolvedValue({
      name: 'widget',
      ext: 'json',
      content: savedContent
    });
    const writeDeferred = createDeferred<void>();
    writeFileMock.mockReturnValue(writeDeferred.promise);
    const scope = effectScope();
    let currentName = '';

    await scope.run(async (): Promise<void> => {
      const session = useSession();
      await flushPromises();
      await flushPromises();
      session.data.value = { ...session.data.value, name: '第一次编辑' };
      await nextTick();
      const writtenContent = session.fileState.value.content;
      const savePromise = session.actions.onSave();
      await nextTick();
      session.data.value = { ...session.data.value, name: '保存中继续编辑' };
      await nextTick();
      fileChangedHandler?.({
        type: 'change',
        filePath: '/tmp/widgets/weather/widget.json',
        content: writtenContent
      });
      await flushPromises();
      writeDeferred.resolve();
      await savePromise;
      currentName = session.data.value.name;

      expect(writeFileMock).toHaveBeenCalledWith('/tmp/widgets/weather/widget.json', writtenContent);
      expect(updateFileMock).toHaveBeenLastCalledWith(
        'widget-weather',
        expect.objectContaining({
          content: session.fileState.value.content,
          savedContent: writtenContent
        })
      );
    });
    scope.stop();

    expect(confirmMock).not.toHaveBeenCalled();
    expect(currentName).toBe('保存中继续编辑');
    expect(dirtyEvents.at(-1)).toBe('dirty');
  });

  it('suppresses delayed self-write events from overlapping saves', async (): Promise<void> => {
    const savedContent = JSON.stringify({ ...createDefaultWidgetData('weather'), name: '已保存天气' }, null, 2);
    getFileByIdMock.mockResolvedValue({
      type: 'widget',
      id: 'widget-weather',
      path: '/tmp/widgets/weather/widget.json',
      name: 'widget',
      ext: 'json',
      content: savedContent,
      savedContent
    });
    readFileMock.mockResolvedValue({ name: 'widget', ext: 'json', content: savedContent });
    const firstWrite = createDeferred<void>();
    const secondWrite = createDeferred<void>();
    writeFileMock.mockReturnValueOnce(firstWrite.promise).mockReturnValueOnce(secondWrite.promise);
    const scope = effectScope();
    let currentName = '';

    await scope.run(async (): Promise<void> => {
      const session = useSession();
      await flushPromises();
      await flushPromises();
      session.data.value = { ...session.data.value, name: '第一次保存' };
      await nextTick();
      const firstContent = session.fileState.value.content;
      const firstSave = session.actions.onSave();
      session.data.value = { ...session.data.value, name: '第二次保存' };
      await nextTick();
      const secondSave = session.actions.onSave();
      secondWrite.resolve();
      await secondSave;
      fileChangedHandler?.({ type: 'change', filePath: '/tmp/widgets/weather/widget.json', content: firstContent });
      await flushPromises();
      currentName = session.data.value.name;
      firstWrite.resolve();
      await firstSave;
    });
    scope.stop();

    expect(currentName).toBe('第二次保存');
    expect(confirmMock).not.toHaveBeenCalled();
  });

  it('expires stale self-write suppressions before matching later external changes', async (): Promise<void> => {
    const savedContent = JSON.stringify({ ...createDefaultWidgetData('weather'), name: '已保存天气' }, null, 2);
    getFileByIdMock.mockResolvedValue({
      type: 'widget',
      id: 'widget-weather',
      path: '/tmp/widgets/weather/widget.json',
      name: 'widget',
      ext: 'json',
      content: savedContent,
      savedContent
    });
    readFileMock.mockResolvedValue({ name: 'widget', ext: 'json', content: savedContent });
    const scope = effectScope();
    const dateNow = vi.spyOn(Date, 'now').mockReturnValue(1_000);

    await scope.run(async (): Promise<void> => {
      const session = useSession();
      await flushPromises();
      await flushPromises();
      session.data.value = { ...session.data.value, name: '写盘内容' };
      await nextTick();
      const writtenContent = session.fileState.value.content;
      await session.actions.onSave();
      session.data.value = { ...session.data.value, name: '后续草稿' };
      await nextTick();
      dateNow.mockReturnValue(61_000);
      fileChangedHandler?.({ type: 'change', filePath: '/tmp/widgets/weather/widget.json', content: writtenContent });
      await flushPromises();
    });
    scope.stop();
    dateNow.mockRestore();

    expect(confirmMock).toHaveBeenCalledWith('外部修改', expect.any(String), expect.any(Object));
  });

  it('keeps the Widget tab path stable when another route becomes active during loading', async (): Promise<void> => {
    const readDeferred = createDeferred<{ name: string; ext: string; content: string }>();
    getFileByIdMock.mockResolvedValue(undefined);
    getWidgetByIdMock.mockReturnValue({ id: 'weather', filePath: '/tmp/widgets/weather/widget.json' });
    readFileMock.mockReturnValue(readDeferred.promise);
    const scope = effectScope();

    await scope.run(async (): Promise<void> => {
      useSession();
      await flushPromises();
      routeMock.fullPath = '/settings/widget';
      readDeferred.resolve({
        name: 'widget',
        ext: 'json',
        content: JSON.stringify(createDefaultWidgetData('weather'), null, 2)
      });
      await flushPromises();
      await flushPromises();
    });
    scope.stop();

    expect(addTabMock).toHaveBeenLastCalledWith(expect.objectContaining({ path: '/widget/widget-weather' }));
  });

  it('unregisters a file watch that finishes registering after disposal', async (): Promise<void> => {
    const registerDeferred = createDeferred<void>();
    getFileByIdMock.mockResolvedValue(undefined);
    getWidgetByIdMock.mockReturnValue({ id: 'weather', filePath: '/tmp/widgets/weather/widget.json' });
    readFileMock.mockResolvedValue({
      name: 'widget',
      ext: 'json',
      content: JSON.stringify(createDefaultWidgetData('weather'), null, 2)
    });
    registerWatchMock.mockReturnValue(registerDeferred.promise);
    const scope = effectScope();

    scope.run((): void => {
      useSession();
    });
    await flushPromises();
    await flushPromises();
    scope.stop();
    registerDeferred.resolve();
    await flushPromises();
    await flushPromises();

    expect(unregisterWatchMock).toHaveBeenCalledWith('widget-weather');
  });
});
