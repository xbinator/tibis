/**
 * @file index.test.ts
 * @description 小组件设置页创建小组件测试。
 * @vitest-environment jsdom
 */
/* eslint-disable vue/one-component-per-file */
import { defineComponent } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount, type DOMWrapper, type VueWrapper } from '@vue/test-utils';
import JSZip from 'jszip';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import WidgetSettingsPage from '@/views/settings/tools/widget/index.vue';

/** 原生平台方法 mock。 */
const nativeMock = vi.hoisted(() => ({
  getHomeDir: vi.fn<() => Promise<string>>(),
  readFile: vi.fn<(path: string) => Promise<{ content: string; name: string; ext: string }>>(),
  readWorkspaceDirectory: vi.fn<(options: { directoryPath: string }) => Promise<{ entries: Array<{ name: string; type: 'file' | 'directory' }> }>>(),
  saveBinaryFile: vi.fn<(content: ArrayBuffer, path?: string) => Promise<string | null>>(),
  writeFile: vi.fn<(path: string, content: string) => Promise<void>>()
}));

/** Electron API mock。 */
const electronAPIMock = vi.hoisted(() => ({
  ensureDir: vi.fn<(path: string) => Promise<void>>()
}));
/** 路由跳转 mock。 */
const routerReplaceMock = vi.hoisted(() => vi.fn<(_location: unknown) => Promise<void>>().mockResolvedValue(undefined));
const routerPushMock = vi.hoisted(() => vi.fn<(_location: unknown) => Promise<void>>().mockResolvedValue(undefined));
/** 最近文件创建 mock。 */
const createAndOpenMock = vi.hoisted(() =>
  vi.fn<(file: { id: string; content: string; name: string; ext: string; path: string | null }) => Promise<{ id: string }>>()
);

vi.mock('@/shared/platform', () => ({
  native: nativeMock
}));

vi.mock('@/shared/platform/electron-api', () => ({
  getElectronAPI: () => electronAPIMock
}));

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
    nativeMock.getHomeDir.mockReset();
    nativeMock.readFile.mockReset();
    nativeMock.readWorkspaceDirectory.mockReset();
    nativeMock.saveBinaryFile.mockReset();
    nativeMock.writeFile.mockReset();
    electronAPIMock.ensureDir.mockReset();
    routerPushMock.mockReset();
    routerReplaceMock.mockReset();
    createAndOpenMock.mockReset();
    nativeMock.getHomeDir.mockResolvedValue('/Users/test');
    nativeMock.readWorkspaceDirectory.mockResolvedValue({ entries: [] });
    nativeMock.saveBinaryFile.mockResolvedValue(null);
    nativeMock.writeFile.mockResolvedValue(undefined);
    electronAPIMock.ensureDir.mockResolvedValue(undefined);
    createAndOpenMock.mockImplementation(async (file: { id: string }): Promise<{ id: string }> => ({ id: file.id }));
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
      .find((button: DOMWrapper<HTMLButtonElement>): boolean => button.text() === '保存')
      ?.trigger('click');
    await flushPromises();

    const writeFileCall = nativeMock.writeFile.mock.calls[0];
    const savedContent = JSON.parse(writeFileCall?.[1] ?? '{}') as Record<string, unknown>;

    expect(electronAPIMock.ensureDir).toHaveBeenCalledWith('/Users/test/.tibis/widgets/weather');
    expect(writeFileCall?.[0]).toBe('/Users/test/.tibis/widgets/weather/widget.json');
    expect(savedContent.name).toBe('天气');
    expect(savedContent.description).toBe('查询指定城市天气');
    expect(savedContent).not.toHaveProperty('type');
    expect(savedContent).not.toHaveProperty('version');
    expect(createAndOpenMock.mock.calls[0]?.[0]).toMatchObject({
      id: 'widget-weather',
      path: null,
      name: '天气',
      ext: 'tibis'
    });
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
      .find((button: DOMWrapper<HTMLButtonElement>): boolean => button.text() === '保存')
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
      .find((button: DOMWrapper<HTMLButtonElement>): boolean => button.text() === '保存')
      ?.trigger('click');
    await flushPromises();

    const writeFileCall = nativeMock.writeFile.mock.calls[0];
    const savedContent = JSON.parse(writeFileCall?.[1] ?? '{}') as Record<string, unknown>;
    const savedElements = savedContent.elements as unknown[];

    expect(electronAPIMock.ensureDir).toHaveBeenCalledWith('/Users/test/.tibis/widgets/coffee');
    expect(savedContent.name).toBe('咖啡推荐');
    expect(savedContent.description).toBe('展示咖啡列表');
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
      .find((button: DOMWrapper<HTMLButtonElement>): boolean => button.text() === '保存')
      ?.trigger('click');
    await flushPromises();

    const saveBinaryFileCall = nativeMock.saveBinaryFile.mock.calls[0];
    const savedContent = saveBinaryFileCall?.[0] ?? new ArrayBuffer(0);

    expect(electronAPIMock.ensureDir).toHaveBeenCalledWith('/Users/test/.tibis/widgets/coffee/assets');
    expect(saveBinaryFileCall?.[1]).toBe('/Users/test/.tibis/widgets/coffee/assets/icon.png');
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

    const createdFile = createAndOpenMock.mock.calls[0]?.[0];
    const createdContent = JSON.parse(createdFile?.content ?? '{}') as Record<string, unknown>;

    expect(createdFile).toMatchObject({
      id: 'widget-weather',
      path: null,
      name: '天气',
      ext: 'tibis'
    });
    expect(createdContent).toMatchObject({
      type: 'widget',
      version: 1,
      name: '天气',
      description: '查询指定城市天气'
    });
    expect(routerPushMock).toHaveBeenCalledWith({ name: 'widget', params: { id: 'widget-weather' } });
  });
});
