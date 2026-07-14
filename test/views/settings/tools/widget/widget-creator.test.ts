/**
 * @file widget-creator.test.ts
 * @description 小组件创建弹窗校验、安装与创建后同步闭环测试。
 * @vitest-environment jsdom
 */
/* eslint-disable vue/one-component-per-file */
import { defineComponent } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount, type DOMWrapper, type VueWrapper } from '@vue/test-utils';
import JSZip from 'jszip';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WidgetData } from '@/components/BWidget/types';
import { createDefaultWidgetData } from '@/components/BWidget/utils/widgetData';
import { createDefaultWidgetExecuteMethod } from '@/components/BWidget/utils/widgetExecuteMethod';
import { useWidgetStore } from '@/stores/ai/widget';
import type { DirectoryInstallFile } from '@/utils/file/directory';
import WidgetCreator from '@/views/settings/tools/widget/components/WidgetCreator.vue';

/** 目录安装调用快照。 */
interface DirectoryInstallRequestSnapshot {
  /** 最终目标目录。 */
  targetDir: string;
  /** 目录冲突策略。 */
  conflictStrategy: string;
  /** 待安装文件。 */
  files: DirectoryInstallFile[];
}

/** 目录安装 mock。 */
const installDirectoryMock = vi.hoisted(() => vi.fn<(options: DirectoryInstallRequestSnapshot) => Promise<void>>());
/** 创建后打开 Widget mock。 */
const openWidgetFileMock = vi.hoisted(() => vi.fn<(widgetId: string) => Promise<void>>());
/** 原生平台 mock。 */
const nativeMock = vi.hoisted(() => ({
  getHomeDir: vi.fn<() => Promise<string>>()
}));
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

vi.mock('@/utils/file/directory', () => ({
  formatDirectoryInstallError: (error: unknown): string => (error instanceof Error ? error.message : String(error)),
  installDirectory: installDirectoryMock
}));

vi.mock('@/hooks/useOpenFile', () => ({
  useOpenFile: () => ({ openWidgetFile: openWidgetFileMock })
}));

vi.mock('@/shared/platform', () => ({
  native: nativeMock
}));

vi.mock('@/shared/logger', () => ({
  logger: loggerMock
}));

vi.mock('ant-design-vue', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ant-design-vue')>();
  return { ...actual, message: messageMock };
});

/** 弹窗测试替身。 */
const BModalStub = defineComponent({
  name: 'BModal',
  props: {
    open: { type: Boolean, required: true },
    title: { type: String, default: '' }
  },
  emits: ['update:open', 'close'],
  template: '<section v-if="open" class="b-modal-stub"><h3>{{ title }}</h3><slot /><footer><slot name="footer" /></footer></section>'
});

/** 表单测试替身。 */
const AFormStub = defineComponent({
  name: 'AForm',
  template: '<form class="a-form-stub"><slot /></form>'
});

/** 表单项测试替身。 */
const AFormItemStub = defineComponent({
  name: 'AFormItem',
  props: {
    label: { type: String, required: true },
    required: { type: Boolean, default: false }
  },
  template: '<label class="a-form-item-stub"><span>{{ label }}</span><slot /></label>'
});

/** 输入框测试替身。 */
const AInputStub = defineComponent({
  name: 'AInput',
  props: {
    value: { type: String, default: '' },
    placeholder: { type: String, default: '' }
  },
  emits: ['update:value'],
  template: '<input :value="value" :placeholder="placeholder" @input="$emit(\'update:value\', $event.target.value)" />'
});

/** 多行输入框测试替身。 */
const ATextareaStub = defineComponent({
  name: 'ATextarea',
  props: {
    value: { type: String, default: '' },
    placeholder: { type: String, default: '' }
  },
  emits: ['update:value'],
  template: '<textarea :value="value" :placeholder="placeholder" @input="$emit(\'update:value\', $event.target.value)"></textarea>'
});

/** 按钮测试替身。 */
const BButtonStub = defineComponent({
  name: 'BButton',
  props: {
    disabled: { type: Boolean, default: false },
    loading: { type: Boolean, default: false },
    type: { type: String, default: 'primary' }
  },
  emits: ['click'],
  template: '<button type="button" :disabled="disabled || loading" @click="$emit(\'click\', $event)"><slot /></button>'
});

/** 上传组件测试替身。 */
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
  template: '<div><slot></slot><input type="file" :accept="accept" @change="handleChange" /></div>'
});

/** 图标测试替身。 */
const BIconStub = defineComponent({
  name: 'BIcon',
  props: {
    icon: { type: String, default: '' },
    size: { type: Number, default: 16 }
  },
  template: '<i class="b-icon-stub" :data-icon="icon" :data-size="size"></i>'
});

/**
 * 挂载小组件创建弹窗。
 * @returns 组件包装器
 */
function mountWidgetCreator(): VueWrapper {
  return mount(WidgetCreator, {
    props: { open: true },
    global: {
      components: { BUpload: BUploadStub },
      stubs: {
        BModal: BModalStub,
        AForm: AFormStub,
        AFormItem: AFormItemStub,
        AInput: AInputStub,
        ATextarea: ATextareaStub,
        BButton: BButtonStub,
        BIcon: BIconStub
      }
    }
  });
}

/**
 * 查找指定文本的按钮。
 * @param wrapper - 组件包装器
 * @param text - 按钮文本
 * @returns 按钮包装器
 */
function findButtonByText(wrapper: VueWrapper, text: string): DOMWrapper<HTMLButtonElement> {
  const button = wrapper.findAll<HTMLButtonElement>('button').find((item: DOMWrapper<HTMLButtonElement>): boolean => item.text() === text);

  if (!button) {
    throw new Error(`Button not found: ${text}`);
  }

  return button;
}

/**
 * 创建测试 zip 文件。
 * @param widgetJson - widget.json 内容
 * @param resources - zip 内资源
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
 * 读取首次目录安装调用。
 * @returns 安装调用快照
 */
function readInstallRequest(): DirectoryInstallRequestSnapshot {
  const request = installDirectoryMock.mock.calls[0]?.[0];
  if (!request) {
    throw new Error('未触发目录安装');
  }

  return request;
}

/**
 * 读取安装请求中的 widget.json。
 * @returns Widget 配置数据
 */
function readInstalledWidgetData(): WidgetData {
  const widgetFile = readInstallRequest().files.find((file: DirectoryInstallFile): boolean => file.kind === 'text' && file.relativePath === 'widget.json');
  if (!widgetFile || widgetFile.kind !== 'text') {
    throw new Error('安装请求缺少 widget.json');
  }

  return JSON.parse(widgetFile.content) as WidgetData;
}

/**
 * 通过真实上传输入框选择导入文件。
 * @param wrapper - 组件包装器
 * @param file - 导入文件
 */
async function selectImportFile(wrapper: VueWrapper, file: File): Promise<void> {
  const input = wrapper.find<HTMLInputElement>('.widget-creator__dropzone input[type="file"]');
  if (!input.exists()) {
    throw new Error('未找到小组件导入上传输入框');
  }

  Object.defineProperty(input.element, 'files', { value: [file], configurable: true });
  await input.trigger('change');
}

/**
 * 等待 zip 导入完成并回填创建表单。
 * @param wrapper - 组件包装器
 * @param remainAttempts - 剩余等待次数
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

describe('WidgetCreator', (): void => {
  beforeEach((): void => {
    setActivePinia(createPinia());
    installDirectoryMock.mockReset().mockResolvedValue(undefined);
    openWidgetFileMock.mockReset().mockResolvedValue(undefined);
    nativeMock.getHomeDir.mockReset().mockResolvedValue('/home/test');
    loggerMock.error.mockReset().mockResolvedValue(undefined);
    loggerMock.info.mockReset().mockResolvedValue(undefined);
    loggerMock.warn.mockReset().mockResolvedValue(undefined);
    messageMock.error.mockReset();
    messageMock.success.mockReset();
    messageMock.warning.mockReset();
  });

  it('installs trimmed widget data and opens the created widget', async (): Promise<void> => {
    const wrapper = mountWidgetCreator();

    await wrapper.find('.widget-creator__id input').setValue(' Weather_01 ');
    await wrapper.find('.widget-creator__name input').setValue(' 天气 ');
    await wrapper.find('.widget-creator__description textarea').setValue(' 查询指定城市天气 ');
    await findButtonByText(wrapper, '确定').trigger('click');
    await flushPromises();

    expect(readInstallRequest()).toMatchObject({ targetDir: '/home/test/.tibis/widgets/weather_01', conflictStrategy: 'reject' });
    expect(readInstalledWidgetData()).toMatchObject({ name: '天气', description: '查询指定城市天气' });
    expect(useWidgetStore().getWidgetById('weather_01')).toMatchObject({ name: '天气', description: '查询指定城市天气' });
    expect(openWidgetFileMock).toHaveBeenCalledWith('weather_01');
    expect(wrapper.emitted('update:open')?.at(-1)).toEqual([false]);
  });

  it('does not install when identifier contains unsupported characters', async (): Promise<void> => {
    const wrapper = mountWidgetCreator();
    await wrapper.find('.widget-creator__id input').setValue('weather/cn');
    await wrapper.find('.widget-creator__name input').setValue('天气');
    await findButtonByText(wrapper, '确定').trigger('click');
    await flushPromises();

    expect(installDirectoryMock).not.toHaveBeenCalled();
  });

  it('does not install when identifier is a Windows reserved name', async (): Promise<void> => {
    const wrapper = mountWidgetCreator();
    await wrapper.find('.widget-creator__id input').setValue('CON');
    await wrapper.find('.widget-creator__name input').setValue('系统设备名');
    await findButtonByText(wrapper, '确定').trigger('click');
    await flushPromises();

    expect(installDirectoryMock).not.toHaveBeenCalled();
  });

  it('installs imported widget data from a zip file', async (): Promise<void> => {
    const wrapper = mountWidgetCreator();
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

    await selectImportFile(wrapper, file);
    await waitForZipImport(wrapper);
    await findButtonByText(wrapper, '确定').trigger('click');
    await flushPromises();

    expect(readInstalledWidgetData()).toMatchObject({ name: '咖啡菜单', description: '展示咖啡列表' });
    expect(readInstalledWidgetData().elements).toHaveLength(1);
  });

  it('regenerates imported default execute class name when the final widget id changes', async (): Promise<void> => {
    const wrapper = mountWidgetCreator();
    const file = await createWidgetZipFile({ name: '咖啡菜单', description: '展示咖啡列表' });

    await selectImportFile(wrapper, file);
    await waitForZipImport(wrapper);
    await wrapper.find('.widget-creator__id input').setValue('tea-menu');
    await findButtonByText(wrapper, '确定').trigger('click');
    await flushPromises();

    expect(readInstalledWidgetData().execute).toEqual(createDefaultWidgetExecuteMethod('tea-menu'));
  });

  it('installs imported zip resources beside widget.json', async (): Promise<void> => {
    const wrapper = mountWidgetCreator();
    const file = await createWidgetZipFile({ name: '咖啡菜单', description: '展示咖啡列表' }, [
      { path: 'assets/icon.png', content: new Uint8Array([9, 8, 7]) }
    ]);

    await selectImportFile(wrapper, file);
    await waitForZipImport(wrapper);
    await findButtonByText(wrapper, '确定').trigger('click');
    await flushPromises();

    const resource = readInstallRequest().files.find((item: DirectoryInstallFile): boolean => item.relativePath === 'assets/icon.png');
    expect(resource?.kind).toBe('binary');
    expect(resource?.kind === 'binary' ? Array.from(new Uint8Array(resource.content)) : []).toEqual([9, 8, 7]);
  });

  it('clears previous imported data when the next zip import fails', async (): Promise<void> => {
    const wrapper = mountWidgetCreator();
    const validFile = await createWidgetZipFile({ name: '咖啡菜单', description: '展示咖啡列表' }, [
      { path: 'assets/icon.png', content: new Uint8Array([9, 8, 7]) }
    ]);
    const invalidZip = new JSZip();
    invalidZip.file('nested/widget.json', JSON.stringify({ name: '错误包' }));
    const invalidFile = new File([await invalidZip.generateAsync({ type: 'arraybuffer' })], 'bad.zip', { type: 'application/zip' });

    await selectImportFile(wrapper, validFile);
    await waitForZipImport(wrapper);
    await selectImportFile(wrapper, invalidFile);
    await flushPromises();
    await findButtonByText(wrapper, '确定').trigger('click');
    await flushPromises();

    expect(readInstalledWidgetData().elements).toEqual([]);
    expect(readInstallRequest().files).toHaveLength(1);
  });

  it('imports widget.json without overriding an existing identifier', async (): Promise<void> => {
    const wrapper = mountWidgetCreator();
    const file = new File([JSON.stringify({ name: '天气', description: '查询天气', elements: [] })], 'widget.json', {
      type: 'application/json'
    });

    await wrapper.find('.widget-creator__id input').setValue('weather-card');
    await selectImportFile(wrapper, file);
    await waitForZipImport(wrapper);
    await findButtonByText(wrapper, '确定').trigger('click');
    await flushPromises();

    expect(readInstallRequest().targetDir).toBe('/home/test/.tibis/widgets/weather-card');
    expect(readInstalledWidgetData()).toMatchObject({ name: '天气', description: '查询天气', elements: [] });
  });

  it('closes when clicking cancel', async (): Promise<void> => {
    const wrapper = mountWidgetCreator();
    await findButtonByText(wrapper, '取消').trigger('click');

    expect(wrapper.emitted('update:open')?.[0]).toEqual([false]);
  });

  it('does not install when identifier already exists in the widget store', async (): Promise<void> => {
    useWidgetStore().upsertWidget({
      id: 'weather',
      name: '天气',
      description: '',
      data: createDefaultWidgetData('weather'),
      filePath: '/home/test/.tibis/widgets/weather/widget.json',
      dirPath: '/home/test/.tibis/widgets/weather',
      enabled: true,
      parsedAt: 1
    });
    const wrapper = mountWidgetCreator();

    await wrapper.find('.widget-creator__id input').setValue(' Weather ');
    await wrapper.find('.widget-creator__name input').setValue('天气');
    await findButtonByText(wrapper, '确定').trigger('click');
    await flushPromises();

    expect(installDirectoryMock).not.toHaveBeenCalled();
  });
});
