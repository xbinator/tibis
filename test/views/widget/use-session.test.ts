/**
 * @file use-session.test.ts
 * @description 验证 Widget 会话对公共文件控制器的 JSON 与已安装路径适配。
 * @vitest-environment jsdom
 */
import type { Ref } from 'vue';
import { defineComponent } from 'vue';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WidgetData } from '@/components/BWidget/types';
import { createDefaultWidgetData } from '@/components/BWidget/utils/widgetData';
import type { FileControllerOptions, FileControllerResult } from '@/hooks/useFileController/types';
import type { FileState } from '@/shared/platform/native/types';
import type { StoredWidget } from '@/shared/storage/files/types';
import { useSession } from '@/views/widget/hooks/useSession';

const getFileByIdMock = vi.hoisted(() => vi.fn());
const getWidgetByIdMock = vi.hoisted(() => vi.fn());
const waitForInitMock = vi.hoisted(() => vi.fn());
const readFileMock = vi.hoisted(() => vi.fn());
const getPathStatusMock = vi.hoisted(() => vi.fn());
const writeFileMock = vi.hoisted(() => vi.fn());
const saveFileMock = vi.hoisted(() => vi.fn());
const alertMock = vi.hoisted(() => vi.fn());
const addTabMock = vi.hoisted(() => vi.fn());
const removeTabMock = vi.hoisted(() => vi.fn());
const routerPushMock = vi.hoisted(() => vi.fn());
const controllerHarness = vi.hoisted(() => ({
  options: null as FileControllerOptions<WidgetData> | null,
  fileState: null as Ref<FileState> | null,
  data: null as Ref<WidgetData> | null,
  onSave: vi.fn(),
  onSaveAs: vi.fn(),
  onRename: vi.fn(),
  onBlur: vi.fn(),
  onReload: vi.fn(),
  onDelete: vi.fn(),
  onFlush: vi.fn(),
  onDispose: vi.fn()
}));
const routeMock = vi.hoisted(() => ({
  fullPath: '/widget/widget-weather',
  params: { id: 'widget-weather' }
}));

vi.mock('vue-router', () => ({
  useRoute: () => routeMock,
  useRouter: () => ({ push: routerPushMock })
}));

vi.mock('@/hooks/useClipboard', () => ({
  useClipboard: () => ({ clipboard: vi.fn() })
}));

vi.mock('@/hooks/useFileController', async () => {
  const { computed: vueComputed, ref: vueRef } = await import('vue');

  return {
    useFileController: (options: FileControllerOptions<WidgetData>): FileControllerResult<WidgetData> => {
      controllerHarness.options = options;
      const initial = options.events.onCreate({ fileId: options.fileId.value });
      const fileState = vueRef<FileState>({ ...initial.fileState });
      const data = vueRef<WidgetData>(initial.data) as Ref<WidgetData>;
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

vi.mock('@/stores/ai/widget', () => ({
  useWidgetStore: () => ({
    getWidgetById: getWidgetByIdMock,
    waitForInit: waitForInitMock
  })
}));

vi.mock('@/stores/workspace/recent', () => ({
  useRecentStore: () => ({ getFileById: getFileByIdMock })
}));

vi.mock('@/stores/workspace/tabs', () => ({
  useTabsStore: () => ({ addTab: addTabMock, removeTab: removeTabMock })
}));

vi.mock('@/shared/platform', () => ({
  native: {
    readFile: readFileMock,
    getPathStatus: getPathStatusMock,
    writeFile: writeFileMock,
    createFile: vi.fn(),
    saveFile: saveFileMock,
    showItemInFolder: vi.fn(),
    getRelativePath: vi.fn()
  }
}));

vi.mock('@/utils/modal', () => ({
  Modal: {
    alert: alertMock,
    confirm: vi.fn().mockResolvedValue([true, false])
  }
}));

/**
 * Widget 会话宿主暴露值。
 */
interface SessionExpose {
  /** Widget 文件会话。 */
  session: ReturnType<typeof useSession>;
}

/**
 * 创建 Widget 最近文件记录。
 * @param content - JSON 内容
 * @returns Widget 最近文件记录
 */
function createStoredWidget(content: string): StoredWidget {
  return {
    type: 'widget',
    id: 'widget-weather',
    path: '/old/widget.json',
    name: 'widget',
    ext: 'json',
    content,
    savedContent: content
  };
}

/**
 * 挂载 Widget 会话宿主。
 * @returns 测试包装器
 */
function mountSession(): VueWrapper {
  return mount(
    defineComponent({
      name: 'WidgetSessionHost',
      setup(_, { expose }): () => null {
        const session = useSession();
        expose({ session });
        return (): null => null;
      }
    })
  );
}

describe('Widget useSession adapter', (): void => {
  beforeEach((): void => {
    getFileByIdMock.mockReset();
    getWidgetByIdMock.mockReset();
    waitForInitMock.mockReset().mockResolvedValue(undefined);
    readFileMock.mockReset();
    getPathStatusMock.mockReset().mockResolvedValue({ exists: true, isFile: true, isDirectory: false });
    writeFileMock.mockReset().mockResolvedValue(undefined);
    saveFileMock.mockReset();
    alertMock.mockReset().mockResolvedValue(undefined);
    addTabMock.mockReset();
    removeTabMock.mockReset();
    routerPushMock.mockReset().mockResolvedValue(undefined);
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
  });

  it('loads installed path, recent draft, and disk content as controller candidates', async (): Promise<void> => {
    const draftContent = JSON.stringify({ ...createDefaultWidgetData('weather'), name: '草稿天气' }, null, 2);
    const diskContent = JSON.stringify({ ...createDefaultWidgetData('weather'), name: '磁盘天气' }, null, 2);
    getFileByIdMock.mockResolvedValue(createStoredWidget(draftContent));
    getWidgetByIdMock.mockReturnValue({ id: 'weather', filePath: '/installed/weather/widget.json' });
    readFileMock.mockResolvedValue({ name: 'widget', ext: 'json', content: diskContent });
    mountSession();
    await flushPromises();
    const { options } = controllerHarness;
    expect(options).not.toBeNull();
    if (!options) return;

    const candidates = await options.events.onLoad({ fileId: 'widget-weather', sessionVersion: 1 });

    expect(candidates.draft?.fileState).toEqual(expect.objectContaining({ path: '/installed/weather/widget.json', content: draftContent }));
    expect(candidates.disk?.fileState).toEqual(expect.objectContaining({ path: '/installed/weather/widget.json', content: diskContent }));
  });

  it('parses, serializes, and builds only Widget records through events', async (): Promise<void> => {
    mountSession();
    await flushPromises();
    const { options } = controllerHarness;
    expect(options).not.toBeNull();
    if (!options) return;
    const data = { ...createDefaultWidgetData('weather'), name: '天气' };
    const content = JSON.stringify(data, null, 2);

    const parsed = options.events.onParse({ content, path: '/tmp/widget.json' });
    const serialized = options.events.onSerialize({ data: parsed, path: '/tmp/widget.json' });
    const snapshot = options.events.onCreate({ fileId: 'widget-weather' });
    const record = options.events.onBuildRecord({ ...snapshot, modifiedAt: 1 });

    expect(parsed.name).toBe('天气');
    expect(serialized).toBe(content);
    expect(record.type).toBe('widget');
    expect((): WidgetData => options.events.onParse({ content: '{invalid', path: '/tmp/widget.json' })).toThrow('Widget JSON');
  });

  it('classifies an absent installed Widget path as missing without discarding its draft', async (): Promise<void> => {
    const draftContent = JSON.stringify(createDefaultWidgetData('weather'), null, 2);
    getFileByIdMock.mockResolvedValue(createStoredWidget(draftContent));
    getWidgetByIdMock.mockReturnValue({ id: 'weather', filePath: '/installed/weather/widget.json' });
    readFileMock.mockRejectedValue(new Error('file not found'));
    getPathStatusMock.mockResolvedValue({ exists: false, isFile: false, isDirectory: false });
    mountSession();
    await flushPromises();
    const { options } = controllerHarness;
    expect(options).not.toBeNull();
    if (!options) return;

    const candidates = await options.events.onLoad({ fileId: 'widget-weather', sessionVersion: 1 });

    expect(candidates.draft?.fileState.content).toBe(draftContent);
    expect(candidates.disk).toBeNull();
    expect(candidates.error).toBeNull();
    expect(candidates.missing).toBe(true);
  });

  it('forwards common actions and provides platform save-as and rename events', async (): Promise<void> => {
    saveFileMock.mockResolvedValue('/tmp/widget-copy.json');
    const wrapper = mountSession();
    await flushPromises();
    const exposed = wrapper.vm as unknown as SessionExpose;
    const { options } = controllerHarness;
    expect(options).not.toBeNull();
    if (!options) return;

    await exposed.session.actions.onSave();
    await exposed.session.actions.onBlur();
    await exposed.session.actions.onReload();
    expect(controllerHarness.onSave).toHaveBeenCalledTimes(1);
    expect(controllerHarness.onBlur).toHaveBeenCalledTimes(1);
    expect(controllerHarness.onReload).toHaveBeenCalledTimes(2);

    const { fileState } = options.events.onCreate({ fileId: 'widget-weather' });
    const savedPath = await options.events.onSaveAs({ fileState, content: fileState.content });
    const renameResult = await options.events.onRename({ fileState });
    expect(savedPath).toBe('/tmp/widget-copy.json');
    expect(renameResult).toBeNull();
    expect(alertMock).toHaveBeenCalledTimes(1);
  });

  it('removes the Widget tab and leaves the disposed route after deletion', async (): Promise<void> => {
    mountSession();
    await flushPromises();
    const { options } = controllerHarness;
    expect(options).not.toBeNull();
    if (!options) return;
    const { fileState } = options.events.onCreate({ fileId: 'widget-weather' });

    await options.events.onDeleted?.({ fileState });

    expect(removeTabMock).toHaveBeenCalledWith('widget-weather');
    expect(routerPushMock).toHaveBeenCalledWith('/welcome');
  });
});
