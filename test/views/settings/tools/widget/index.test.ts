/**
 * @file index.test.ts
 * @description 小组件设置页创建、打开小组件测试。
 * @vitest-environment jsdom
 */
/* eslint-disable vue/one-component-per-file */
import { defineComponent } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount, type DOMWrapper, type VueWrapper } from '@vue/test-utils';
import JSZip from 'jszip';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultWidgetExecuteMethod } from '@/components/BWidget/utils/widgetExecuteMethod';
import { useWidgetStore } from '@/stores/ai/widget';
import WidgetSettingsPage from '@/views/settings/tools/widget/index.vue';

/** 原生平台方法 mock。 */
const nativeMock = vi.hoisted(() => ({
  acquireDirectoryInstallLock: vi.fn<(path: string) => Promise<string>>(),
  ensureDir: vi.fn<(path: string) => Promise<void>>(),
  getHomeDir: vi.fn<() => Promise<string>>(),
  getPathStatus: vi.fn<(path: string) => Promise<{ exists: boolean; isFile: boolean; isDirectory: boolean }>>(),
  readFile: vi.fn<(path: string) => Promise<{ content: string; name: string; ext: string }>>(),
  readWorkspaceDirectory: vi.fn<(options: { directoryPath: string }) => Promise<{ entries: Array<{ name: string; type: 'file' | 'directory' }> }>>(),
  renameFile: vi.fn<(oldPath: string, newPath: string) => Promise<void>>(),
  releaseDirectoryInstallLock: vi.fn<(token: string) => Promise<void>>(),
  saveBinaryFile: vi.fn<(content: ArrayBuffer, path?: string) => Promise<string | null>>(),
  trashFile: vi.fn<(path: string) => Promise<void>>(),
  writeFile: vi.fn<(path: string, content: string) => Promise<void>>()
}));

/** 路由跳转 mock。 */
const routerReplaceMock = vi.hoisted(() => vi.fn<(_location: unknown) => Promise<void>>().mockResolvedValue(undefined));
const routerPushMock = vi.hoisted(() => vi.fn<(_location: unknown) => Promise<void>>().mockResolvedValue(undefined));
/** 最近文件创建 mock。 */
const createAndOpenMock = vi.hoisted(() =>
  vi.fn<(file: { type: 'file' | 'widget'; id: string; content: string; name: string; ext: string; path: string | null }) => Promise<{ id: string }>>()
);

/** 持久化日志 mock。 */
const loggerMock = vi.hoisted(() => ({
  error: vi.fn<(message: string) => Promise<void>>(),
  info: vi.fn<(message: string) => Promise<void>>(),
  warn: vi.fn<(message: string) => Promise<void>>()
}));

/** Ant Design 消息 mock。 */
const messageMock = vi.hoisted(() => ({
  error: vi.fn<(message: string) => void>(),
  success: vi.fn<(message: string) => void>(),
  warning: vi.fn<(message: string) => void>()
}));

/**
 * 可由测试控制完成时机的 Promise。
 */
interface Deferred<T> {
  /** 延迟 Promise。 */
  promise: Promise<T>;
  /** 完成 Promise。 */
  resolve: (value: T) => void;
}

/**
 * 创建可控 Promise。
 * @returns 可控 Promise
 */
function createDeferred<T>(): Deferred<T> {
  let resolvePromise: (value: T) => void = (): void => undefined;
  const promise = new Promise<T>((resolve: (value: T) => void): void => {
    resolvePromise = resolve;
  });

  return { promise, resolve: resolvePromise };
}

/**
 * 读取写入临时目录中 widget.json 的调用，排除安装事务记录写入。
 * @returns widget.json 写入参数
 */
function findWidgetJsonWriteCall(): [string, string] | undefined {
  return nativeMock.writeFile.mock.calls.find(([path]: [string, string]): boolean => path.endsWith('/widget.json'));
}

vi.mock('@/shared/platform', () => ({
  native: nativeMock
}));

vi.mock('@/shared/logger', () => ({
  logger: loggerMock
}));

vi.mock('@/utils/logger', () => ({
  default: loggerMock
}));

vi.mock('ant-design-vue', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ant-design-vue')>();
  return { ...actual, message: messageMock };
});

vi.mock('vue-router', () => ({
  useRoute: () => ({
    query: {}
  }),
  useRouter: () => ({
    push: routerPushMock,
    replace: routerReplaceMock
  })
}));

vi.mock('@/stores/workspace/files', () => ({
  useFilesStore: () => ({
    createAndOpen: createAndOpenMock
  })
}));

vi.mock('@/utils/modal', () => ({
  Modal: {
    alert: vi.fn()
  }
}));

vi.mock('@iconify/vue', () => ({
  Icon: {
    name: 'Icon',
    props: {
      icon: { type: String, required: true }
    },
    template: '<i class="icon-stub" :data-icon="icon"></i>'
  }
}));

/**
 * 设置页测试替身。
 */
const SettingsPageStub = defineComponent({
  name: 'SettingsPage',
  props: {
    title: { type: String, required: true }
  },
  template: '<main><header><h1>{{ title }}</h1><slot name="extra" /></header><slot /></main>'
});

/**
 * 设置区块测试替身。
 */
const SettingsSectionStub = defineComponent({
  name: 'SettingsSection',
  props: {
    title: { type: String, required: true },
    contentClass: { type: String, default: '' }
  },
  template: '<section><h2>{{ title }}</h2><div :class="contentClass"><slot /></div><slot name="extra" /></section>'
});

/**
 * 按钮测试替身。
 */
const BButtonStub = defineComponent({
  name: 'BButton',
  emits: ['click'],
  template: '<button type="button" @click="$emit(\'click\', $event)"><slot /></button>'
});

/**
 * 上传组件测试替身。
 */
const BUploadStub = defineComponent({
  name: 'BUpload',
  props: {
    accept: { type: String, default: '' },
    draggable: { type: Boolean, default: false },
    dragOver: { type: Boolean, default: false }
  },
  emits: ['change', 'update:dragOver'],
  setup(_props, { emit }) {
    /**
     * 转发原生文件选择事件。
     * @param event - 原生变更事件
     */
    function handleChange(event: Event): void {
      if (event.target instanceof HTMLInputElement && event.target.files) {
        emit('change', event.target.files);
      }
    }

    return { handleChange };
  },
  template: '<div><slot></slot><input type="file" @change="handleChange" /></div>'
});

/**
 * 图标测试替身。
 */
const BIconStub = defineComponent({
  name: 'BIcon',
  props: {
    icon: { type: String, default: '' },
    size: { type: Number, default: 16 }
  },
  template: '<i class="b-icon-stub" :data-icon="icon" :data-size="size"></i>'
});

/**
 * 表单测试替身。
 */
const AFormStub = defineComponent({
  name: 'AForm',
  template: '<form class="a-form-stub"><slot /></form>'
});

/**
 * 表单项测试替身。
 */
const AFormItemStub = defineComponent({
  name: 'AFormItem',
  props: {
    label: { type: String, required: true },
    required: { type: Boolean, default: false }
  },
  template: '<label><span>{{ label }}</span><slot /></label>'
});

/**
 * 弹窗测试替身。
 */
const BModalStub = defineComponent({
  name: 'BModal',
  props: {
    open: { type: Boolean, required: true },
    title: { type: String, default: '' }
  },
  emits: ['update:open', 'close'],
  template: '<section v-if="open" class="b-modal-stub"><h3>{{ title }}</h3><slot /><footer><slot name="footer" /></footer></section>'
});

/**
 * 输入框测试替身。
 */
const AInputStub = defineComponent({
  name: 'AInput',
  props: {
    value: { type: String, default: '' },
    placeholder: { type: String, default: '' }
  },
  emits: ['update:value'],
  template: '<input :value="value" :placeholder="placeholder" @input="$emit(\'update:value\', $event.target.value)" />'
});

/**
 * 多行输入框测试替身。
 */
const ATextareaStub = defineComponent({
  name: 'ATextarea',
  props: {
    value: { type: String, default: '' },
    placeholder: { type: String, default: '' }
  },
  emits: ['update:value'],
  template: '<textarea :value="value" :placeholder="placeholder" @input="$emit(\'update:value\', $event.target.value)"></textarea>'
});

/**
 * 挂载小组件设置页。
 * @returns 组件包装器
 */
function mountWidgetSettingsPage(): VueWrapper {
  return mount(WidgetSettingsPage, {
    global: {
      components: {
        BUpload: BUploadStub
      },
      stubs: {
        SettingsPage: SettingsPageStub,
        SettingsSection: SettingsSectionStub,
        BButton: BButtonStub,
        BModal: BModalStub,
        AForm: AFormStub,
        AFormItem: AFormItemStub,
        AInput: AInputStub,
        ATextarea: ATextareaStub,
        BIcon: BIconStub,
        BDropdown: true,
        BDropdownMenu: true,
        APagination: true,
        BPagination: true,
        ASwitch: true
      }
    }
  });
}

/**
 * 创建测试 zip 文件。
 * @param widgetJson - widget.json 内容
 * @returns zip 文件
 */
async function createWidgetZipFile(widgetJson: Record<string, unknown>, resources: Array<{ path: string; content: Uint8Array }> = []): Promise<File> {
  const zip = new JSZip();
  zip.file('widget.json', JSON.stringify(widgetJson));
  resources.forEach((resource: { path: string; content: Uint8Array }): void => {
    zip.file(resource.path, resource.content);
  });
  const buffer = await zip.generateAsync({ type: 'arraybuffer' });

  return new File([buffer], 'coffee.zip', { type: 'application/zip' });
}

/**
 * 通过真实上传输入框选择 zip 文件。
 * @param wrapper - 组件包装器
 * @param file - zip 文件
 */
async function selectZipFile(wrapper: VueWrapper, file: File): Promise<void> {
  const input = wrapper.find<HTMLInputElement>('.widget-creator__dropzone input[type="file"]');

  if (!input.exists()) {
    throw new Error('未找到 zip 上传输入框');
  }

  Object.defineProperty(input.element, 'files', {
    value: [file],
    configurable: true
  });
  await input.trigger('change');
}

/**
 * 等待 zip 导入完成并回填创建表单。
 * @param wrapper - 组件包装器
 */
async function waitForZipImport(wrapper: VueWrapper, remainAttempts = 16): Promise<void> {
  await flushPromises();

  const idInput = wrapper.find<HTMLInputElement>('.widget-creator__id input');

  if (idInput.exists() && idInput.element.value) {
    return;
  }

  if (remainAttempts <= 1) {
    throw new Error('等待 zip 导入回填表单超时');
  }

  await waitForZipImport(wrapper, remainAttempts - 1);
}

describe('WidgetSettingsPage', (): void => {
  beforeEach((): void => {
    localStorage.clear();
    setActivePinia(createPinia());
    nativeMock.acquireDirectoryInstallLock.mockReset();
    nativeMock.getHomeDir.mockReset();
    nativeMock.getPathStatus.mockReset();
    nativeMock.readFile.mockReset();
    nativeMock.readWorkspaceDirectory.mockReset();
    nativeMock.renameFile.mockReset();
    nativeMock.releaseDirectoryInstallLock.mockReset();
    nativeMock.saveBinaryFile.mockReset();
    nativeMock.trashFile.mockReset();
    nativeMock.writeFile.mockReset();
    nativeMock.ensureDir.mockReset();
    routerPushMock.mockReset();
    routerReplaceMock.mockReset();
    createAndOpenMock.mockReset();
    loggerMock.error.mockReset();
    loggerMock.info.mockReset();
    loggerMock.warn.mockReset();
    messageMock.error.mockReset();
    messageMock.success.mockReset();
    messageMock.warning.mockReset();
    nativeMock.acquireDirectoryInstallLock.mockResolvedValue('widget-install-lock');
    nativeMock.getHomeDir.mockResolvedValue('/Users/test');
    nativeMock.getPathStatus.mockResolvedValue({ exists: false, isFile: false, isDirectory: false });
    nativeMock.readWorkspaceDirectory.mockResolvedValue({ entries: [] });
    nativeMock.renameFile.mockResolvedValue(undefined);
    nativeMock.releaseDirectoryInstallLock.mockResolvedValue(undefined);
    nativeMock.saveBinaryFile.mockResolvedValue(null);
    nativeMock.trashFile.mockResolvedValue(undefined);
    nativeMock.writeFile.mockResolvedValue(undefined);
    nativeMock.ensureDir.mockResolvedValue(undefined);
    createAndOpenMock.mockImplementation(async (file: { id: string }): Promise<{ id: string }> => ({ id: file.id }));
    loggerMock.error.mockResolvedValue(undefined);
    loggerMock.info.mockResolvedValue(undefined);
    loggerMock.warn.mockResolvedValue(undefined);
  });

  it('creates a widget registry JSON from id and name', async (): Promise<void> => {
    const wrapper = mountWidgetSettingsPage();

    await flushPromises();
    await wrapper
      .findAll('button')
      .find((button: DOMWrapper<HTMLButtonElement>): boolean => button.text() === '创建小组件')
      ?.trigger('click');
    await wrapper.find('.widget-creator__id input').setValue('weather');
    await wrapper.find('.widget-creator__name input').setValue('天气');
    await wrapper.find('.widget-creator__description textarea').setValue('查询指定城市天气');
    await wrapper
      .findAll('button')
      .find((button: DOMWrapper<HTMLButtonElement>): boolean => button.text() === '确定')
      ?.trigger('click');
    await flushPromises();

    const writeFileCall = findWidgetJsonWriteCall();
    const savedContent = JSON.parse(writeFileCall?.[1] ?? '{}') as Record<string, unknown>;
    const defaultExecute = createDefaultWidgetExecuteMethod('weather');

    expect(nativeMock.ensureDir).toHaveBeenCalledWith(expect.stringMatching(/^\/Users\/test\/\.tibis\/widgets\/\.tmp-.+$/u));
    expect(writeFileCall?.[0]).toMatch(/^\/Users\/test\/\.tibis\/widgets\/\.tmp-.+\/widget\.json$/u);
    expect(savedContent.name).toBe('天气');
    expect(savedContent.description).toBe('查询指定城市天气');
    expect(savedContent.execute).toEqual(defaultExecute);
    expect(savedContent).not.toHaveProperty('type');
    expect(savedContent).not.toHaveProperty('version');
    expect(createAndOpenMock).not.toHaveBeenCalled();
    expect(routerPushMock).toHaveBeenCalledWith({ name: 'widget', params: { id: 'widget-weather' } });
  });

  it('shows the newly created widget even when rescan does not see it immediately', async (): Promise<void> => {
    const wrapper = mountWidgetSettingsPage();

    await flushPromises();
    await wrapper
      .findAll('button')
      .find((button: DOMWrapper<HTMLButtonElement>): boolean => button.text() === '创建小组件')
      ?.trigger('click');
    await wrapper.find('.widget-creator__id input').setValue('weather');
    await wrapper.find('.widget-creator__name input').setValue('天气');
    await wrapper.find('.widget-creator__description textarea').setValue('查询指定城市天气');
    await wrapper
      .findAll('button')
      .find((button: DOMWrapper<HTMLButtonElement>): boolean => button.text() === '确定')
      ?.trigger('click');
    await flushPromises();

    expect(nativeMock.readWorkspaceDirectory).toHaveBeenCalledTimes(2);
    expect(wrapper.find('.widget-settings__item-row').text()).toContain('天气');
  });

  it('creates a widget from imported zip data without losing its canvas data', async (): Promise<void> => {
    const wrapper = mountWidgetSettingsPage();
    const file = await createWidgetZipFile({
      name: '咖啡菜单',
      description: '展示咖啡列表',
      elements: [
        {
          id: 'text-1',
          name: 'text',
          label: '文本',
          icon: 'lucide:type',
          title: '文本节点',
          position: { x: 12, y: 24 },
          size: { width: 120, height: 48 },
          rotation: 0,
          style: {},
          metadata: {}
        }
      ]
    });

    await flushPromises();
    await wrapper
      .findAll('button')
      .find((button: DOMWrapper<HTMLButtonElement>): boolean => button.text() === '创建小组件')
      ?.trigger('click');
    await selectZipFile(wrapper, file);
    await waitForZipImport(wrapper);
    await wrapper.find('.widget-creator__name input').setValue('咖啡推荐');
    await wrapper
      .findAll('button')
      .find((button: DOMWrapper<HTMLButtonElement>): boolean => button.text() === '确定')
      ?.trigger('click');
    await flushPromises();

    const writeFileCall = findWidgetJsonWriteCall();
    const savedContent = JSON.parse(writeFileCall?.[1] ?? '{}') as Record<string, unknown>;
    const savedElements = savedContent.elements as unknown[];
    const defaultExecute = createDefaultWidgetExecuteMethod('coffee');

    expect(nativeMock.ensureDir).toHaveBeenCalledWith(expect.stringMatching(/^\/Users\/test\/\.tibis\/widgets\/\.tmp-.+$/u));
    expect(savedContent.name).toBe('咖啡推荐');
    expect(savedContent.description).toBe('展示咖啡列表');
    expect(savedContent.execute).toEqual(defaultExecute);
    expect(savedElements).toHaveLength(1);
  });

  it('writes imported zip resources beside widget.json', async (): Promise<void> => {
    const wrapper = mountWidgetSettingsPage();
    const file = await createWidgetZipFile(
      {
        name: '咖啡菜单',
        description: '展示咖啡列表'
      },
      [
        {
          path: 'assets/icon.png',
          content: new Uint8Array([9, 8, 7])
        }
      ]
    );

    await flushPromises();
    await wrapper
      .findAll('button')
      .find((button: DOMWrapper<HTMLButtonElement>): boolean => button.text() === '创建小组件')
      ?.trigger('click');
    await selectZipFile(wrapper, file);
    await waitForZipImport(wrapper);
    await wrapper.find('.widget-creator__id input').setValue('coffee');
    await wrapper.find('.widget-creator__name input').setValue('咖啡菜单');
    await wrapper
      .findAll('button')
      .find((button: DOMWrapper<HTMLButtonElement>): boolean => button.text() === '确定')
      ?.trigger('click');
    await flushPromises();

    const saveBinaryFileCall = nativeMock.saveBinaryFile.mock.calls[0];
    const savedContent = saveBinaryFileCall?.[0] ?? new ArrayBuffer(0);

    expect(nativeMock.ensureDir).toHaveBeenCalledWith(expect.stringMatching(/^\/Users\/test\/\.tibis\/widgets\/\.tmp-.+\/assets$/u));
    expect(saveBinaryFileCall?.[1]).toMatch(/^\/Users\/test\/\.tibis\/widgets\/\.tmp-.+\/assets\/icon\.png$/u);
    expect(Array.from(new Uint8Array(savedContent))).toEqual([9, 8, 7]);
  });

  it('opens a discovered widget in the widget editor route', async (): Promise<void> => {
    nativeMock.readWorkspaceDirectory.mockResolvedValue({
      entries: [{ name: 'weather', type: 'directory' }]
    });
    nativeMock.readFile.mockResolvedValue({
      content: JSON.stringify({
        name: '天气',
        description: '查询指定城市天气'
      }),
      name: 'weather',
      ext: 'json'
    });
    const wrapper = mountWidgetSettingsPage();

    await flushPromises();
    await wrapper.find('.widget-settings__item-row').trigger('click');
    await flushPromises();

    expect(createAndOpenMock).not.toHaveBeenCalled();
    expect(routerPushMock).toHaveBeenCalledWith({ name: 'widget', params: { id: 'widget-weather' } });
  });

  it('delegates latest widget disk loading to the editor page', async (): Promise<void> => {
    nativeMock.readWorkspaceDirectory.mockResolvedValue({
      entries: [{ name: 'weather', type: 'directory' }]
    });
    nativeMock.readFile.mockResolvedValue({
      content: JSON.stringify({
        name: '天气旧版',
        description: '旧描述'
      }),
      name: 'weather',
      ext: 'json'
    });
    const wrapper = mountWidgetSettingsPage();

    await flushPromises();
    await wrapper.find('.widget-settings__item-row').trigger('click');
    await flushPromises();

    expect(nativeMock.readFile).toHaveBeenCalledTimes(1);
    expect(createAndOpenMock).not.toHaveBeenCalled();
    expect(routerPushMock).toHaveBeenCalledWith({ name: 'widget', params: { id: 'widget-weather' } });
    wrapper.unmount();
  });

  it('does not create a widget when identifier duplicates an installed widget', async (): Promise<void> => {
    nativeMock.readWorkspaceDirectory.mockResolvedValue({
      entries: [{ name: 'weather', type: 'directory' }]
    });
    nativeMock.readFile.mockResolvedValue({
      content: JSON.stringify({
        name: '天气',
        description: '查询指定城市天气'
      }),
      name: 'weather',
      ext: 'json'
    });
    const wrapper = mountWidgetSettingsPage();

    await flushPromises();
    await wrapper
      .findAll('button')
      .find((button: DOMWrapper<HTMLButtonElement>): boolean => button.text() === '创建小组件')
      ?.trigger('click');
    await wrapper.find('.widget-creator__id input').setValue(' Weather ');
    await wrapper.find('.widget-creator__name input').setValue('天气副本');
    await wrapper
      .findAll('button')
      .find((button: DOMWrapper<HTMLButtonElement>): boolean => button.text() === '确定')
      ?.trigger('click');
    await flushPromises();

    expect(nativeMock.writeFile).not.toHaveBeenCalled();
    expect(nativeMock.ensureDir).not.toHaveBeenCalled();
    expect(createAndOpenMock).not.toHaveBeenCalled();
  });

  it('ignores repeated create confirmations while a widget is being written', async (): Promise<void> => {
    const deferredHomeDir = createDeferred<string>();
    nativeMock.getHomeDir.mockReturnValue(deferredHomeDir.promise);
    const wrapper = mountWidgetSettingsPage();

    await flushPromises();
    await wrapper
      .findAll('button')
      .find((button: DOMWrapper<HTMLButtonElement>): boolean => button.text() === '创建小组件')
      ?.trigger('click');
    await wrapper.find('.widget-creator__id input').setValue('weather');
    await wrapper.find('.widget-creator__name input').setValue('天气');
    const confirmButton = wrapper.findAll('button').find((button: DOMWrapper<HTMLButtonElement>): boolean => button.text() === '确定');
    await confirmButton?.trigger('click');
    confirmButton?.element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();

    expect(nativeMock.getHomeDir).toHaveBeenCalledTimes(2);
    expect(nativeMock.ensureDir).not.toHaveBeenCalled();

    deferredHomeDir.resolve('/Users/test');
    await flushPromises();
  });

  it('does not render the legacy inline widget delete action', async (): Promise<void> => {
    nativeMock.readWorkspaceDirectory.mockResolvedValue({
      entries: [{ name: 'weather', type: 'directory' }]
    });
    nativeMock.readFile.mockResolvedValue({
      content: JSON.stringify({
        name: '天气',
        description: '查询指定城市天气'
      }),
      name: 'weather',
      ext: 'json'
    });
    const wrapper = mountWidgetSettingsPage();

    await flushPromises();

    expect(wrapper.find('.widget-settings__item-delete').exists()).toBe(false);
  });

  it('rejects an existing widget directory without writing or deleting it', async (): Promise<void> => {
    nativeMock.getPathStatus.mockResolvedValue({ exists: true, isFile: false, isDirectory: true });
    const wrapper = mountWidgetSettingsPage();

    await flushPromises();
    await wrapper
      .findAll('button')
      .find((button: DOMWrapper<HTMLButtonElement>): boolean => button.text() === '创建小组件')
      ?.trigger('click');
    await wrapper.find('.widget-creator__id input').setValue('weather');
    await wrapper.find('.widget-creator__name input').setValue('天气');
    await wrapper
      .findAll('button')
      .find((button: DOMWrapper<HTMLButtonElement>): boolean => button.text() === '确定')
      ?.trigger('click');
    await flushPromises();

    expect(nativeMock.writeFile).not.toHaveBeenCalled();
    expect(nativeMock.trashFile).not.toHaveBeenCalled();
    expect(messageMock.error).toHaveBeenCalledWith(expect.stringContaining('目标目录已存在'));
    expect(loggerMock.error).toHaveBeenCalledWith(expect.stringContaining('[widget-install] failed resource=weather stage=check-target'));
  });

  it('cleans the temporary directory and logs the original write failure', async (): Promise<void> => {
    nativeMock.writeFile.mockImplementation(async (path: string): Promise<void> => {
      if (path.endsWith('/widget.json')) {
        throw new Error('EACCES: permission denied');
      }
    });
    const wrapper = mountWidgetSettingsPage();

    await flushPromises();
    await wrapper
      .findAll('button')
      .find((button: DOMWrapper<HTMLButtonElement>): boolean => button.text() === '创建小组件')
      ?.trigger('click');
    await wrapper.find('.widget-creator__id input').setValue('weather');
    await wrapper.find('.widget-creator__name input').setValue('天气');
    await wrapper
      .findAll('button')
      .find((button: DOMWrapper<HTMLButtonElement>): boolean => button.text() === '确定')
      ?.trigger('click');
    await flushPromises();

    expect(nativeMock.trashFile).toHaveBeenCalledWith(expect.stringMatching(/^\/Users\/test\/\.tibis\/widgets\/\.tmp-.+$/u));
    expect(messageMock.error).toHaveBeenCalledWith(expect.stringContaining('EACCES'));
    expect(loggerMock.error).toHaveBeenCalledWith(expect.stringContaining('[widget-install] failed resource=weather stage=write-files error=EACCES'));
  });

  it('keeps a persisted widget successful when rescan fails', async (): Promise<void> => {
    const wrapper = mountWidgetSettingsPage();

    await flushPromises();
    vi.spyOn(useWidgetStore(), 'rescan').mockRejectedValueOnce(new Error('scan failed'));
    await wrapper
      .findAll('button')
      .find((button: DOMWrapper<HTMLButtonElement>): boolean => button.text() === '创建小组件')
      ?.trigger('click');
    await wrapper.find('.widget-creator__id input').setValue('weather');
    await wrapper.find('.widget-creator__name input').setValue('天气');
    await wrapper
      .findAll('button')
      .find((button: DOMWrapper<HTMLButtonElement>): boolean => button.text() === '确定')
      ?.trigger('click');
    await flushPromises();

    expect(wrapper.find('.widget-settings__item-row').text()).toContain('天气');
    expect(messageMock.warning).toHaveBeenCalledWith('小组件 "天气" 创建成功，但刷新列表失败，请稍后重试');
    expect(loggerMock.warn).toHaveBeenCalledWith(expect.stringContaining('[widget-install] rescan-failed resource=weather'));
  });

  it('keeps a persisted widget when opening the editor fails', async (): Promise<void> => {
    routerPushMock.mockRejectedValueOnce(new Error('open failed'));
    const wrapper = mountWidgetSettingsPage();

    await flushPromises();
    await wrapper
      .findAll('button')
      .find((button: DOMWrapper<HTMLButtonElement>): boolean => button.text() === '创建小组件')
      ?.trigger('click');
    await wrapper.find('.widget-creator__id input').setValue('weather');
    await wrapper.find('.widget-creator__name input').setValue('天气');
    await wrapper
      .findAll('button')
      .find((button: DOMWrapper<HTMLButtonElement>): boolean => button.text() === '确定')
      ?.trigger('click');
    await flushPromises();

    expect(wrapper.find('.widget-settings__item-row').text()).toContain('天气');
    expect(messageMock.warning).toHaveBeenCalledWith('小组件 "天气" 创建成功，但打开编辑器失败');
    expect(loggerMock.warn).toHaveBeenCalledWith(expect.stringContaining('[widget-install] open-editor-failed resource=weather error=open failed'));
  });
});
