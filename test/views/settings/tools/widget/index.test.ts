/**
 * @file index.test.ts
 * @description 小组件设置页创建小组件测试。
 * @vitest-environment jsdom
 */
/* eslint-disable vue/one-component-per-file */
import { defineComponent } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount, type DOMWrapper, type VueWrapper } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import WidgetSettingsPage from '@/views/settings/tools/widget/index.vue';

/** 原生平台方法 mock。 */
const nativeMock = vi.hoisted(() => ({
  getHomeDir: vi.fn<() => Promise<string>>(),
  readFile: vi.fn<(path: string) => Promise<{ content: string; name: string; ext: string }>>(),
  readWorkspaceDirectory: vi.fn<(options: { directoryPath: string }) => Promise<{ entries: Array<{ name: string; type: 'file' | 'directory' }> }>>(),
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
      stubs: {
        SettingsPage: SettingsPageStub,
        SettingsSection: SettingsSectionStub,
        BButton: BButtonStub,
        BModal: BModalStub,
        AForm: AFormStub,
        AFormItem: AFormItemStub,
        AInput: AInputStub,
        ATextarea: ATextareaStub,
        APagination: true,
        BPagination: true,
        ASwitch: true
      }
    }
  });
}

describe('WidgetSettingsPage', (): void => {
  beforeEach((): void => {
    localStorage.clear();
    setActivePinia(createPinia());
    nativeMock.getHomeDir.mockReset();
    nativeMock.readFile.mockReset();
    nativeMock.readWorkspaceDirectory.mockReset();
    nativeMock.writeFile.mockReset();
    electronAPIMock.ensureDir.mockReset();
    routerPushMock.mockReset();
    routerReplaceMock.mockReset();
    createAndOpenMock.mockReset();
    nativeMock.getHomeDir.mockResolvedValue('/Users/test');
    nativeMock.readWorkspaceDirectory.mockResolvedValue({ entries: [] });
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

    expect(electronAPIMock.ensureDir).toHaveBeenCalledWith('/Users/test/.tibis/widget/weather');
    expect(writeFileCall?.[0]).toBe('/Users/test/.tibis/widget/weather/widget.json');
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
