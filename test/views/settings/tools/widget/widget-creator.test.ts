/**
 * @file widget-creator.test.ts
 * @description 小组件创建弹窗表单校验测试。
 * @vitest-environment jsdom
 */
/* eslint-disable vue/one-component-per-file */
import { defineComponent } from 'vue';
import { flushPromises, mount, type DOMWrapper, type VueWrapper } from '@vue/test-utils';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import type { WidgetImportResource } from '@/ai/widget';
import type { WidgetData } from '@/components/BWidget/types';
import { createDefaultWidgetExecuteMethod } from '@/components/BWidget/utils/widgetExecuteMethod';
import WidgetCreator from '@/views/settings/tools/widget/components/WidgetCreator.vue';

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
  template: '<label class="a-form-item-stub"><span>{{ label }}</span><slot /></label>'
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
 * 按钮测试替身。
 */
const BButtonStub = defineComponent({
  name: 'BButton',
  props: {
    disabled: { type: Boolean, default: false },
    type: { type: String, default: 'primary' }
  },
  emits: ['click'],
  template: '<button type="button" :disabled="disabled" @click="$emit(\'click\', $event)"><slot /></button>'
});

/**
 * 小组件创建事件负载快照。
 */
interface WidgetCreatePayloadSnapshot {
  /** 小组件标识。 */
  id: string;
  /** 小组件名称。 */
  name: string;
  /** 小组件描述。 */
  description: string;
  /** 从导入文件读取的小组件数据。 */
  data?: WidgetData;
  /** 从 zip 导入的小组件资源文件。 */
  resources?: WidgetImportResource[];
}

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
  template: '<div><slot></slot><input type="file" :accept="accept" @change="handleChange" /></div>'
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
 * 挂载小组件创建弹窗。
 * @returns 组件包装器
 */
function mountWidgetCreator(existingIds: string[] = []): VueWrapper {
  return mount(WidgetCreator, {
    props: {
      open: true,
      existingIds
    },
    global: {
      components: {
        BUpload: BUploadStub
      },
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
 * 读取确认事件负载。
 * @param wrapper - 组件包装器
 * @returns 创建负载
 */
function readConfirmPayload(wrapper: VueWrapper): WidgetCreatePayloadSnapshot {
  const payload = wrapper.emitted('confirm')?.[0]?.[0];

  if (!payload) {
    throw new Error('未触发 confirm 事件');
  }

  return payload as WidgetCreatePayloadSnapshot;
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

describe('WidgetCreator', (): void => {
  it('emits trimmed widget payload for a valid identifier', async (): Promise<void> => {
    const wrapper = mountWidgetCreator();

    await wrapper.find('.widget-creator__id input').setValue(' Weather_01 ');
    await wrapper.find('.widget-creator__name input').setValue(' 天气 ');
    await wrapper.find('.widget-creator__description textarea').setValue(' 查询指定城市天气 ');
    await findButtonByText(wrapper, '确定').trigger('click');
    await flushPromises();

    expect(wrapper.emitted('confirm')?.[0]).toEqual([
      {
        id: 'weather_01',
        name: '天气',
        description: '查询指定城市天气'
      }
    ]);
  });

  it('does not emit confirm when identifier contains unsupported characters', async (): Promise<void> => {
    const wrapper = mountWidgetCreator();

    await wrapper.find('.widget-creator__id input').setValue('weather/cn');
    await wrapper.find('.widget-creator__name input').setValue('天气');
    await findButtonByText(wrapper, '确定').trigger('click');
    await flushPromises();

    expect(wrapper.emitted('confirm')).toBeUndefined();
  });

  it('fills form and emits imported widget data from a zip file', async (): Promise<void> => {
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

    expect((wrapper.find('.widget-creator__id input').element as HTMLInputElement).value).toBe('coffee');
    expect((wrapper.find('.widget-creator__name input').element as HTMLInputElement).value).toBe('咖啡菜单');
    expect((wrapper.find('.widget-creator__description textarea').element as HTMLTextAreaElement).value).toBe('展示咖啡列表');

    await findButtonByText(wrapper, '确定').trigger('click');
    await flushPromises();

    const payload = readConfirmPayload(wrapper);

    expect(payload.id).toBe('coffee');
    expect(payload.name).toBe('咖啡菜单');
    expect(payload.description).toBe('展示咖啡列表');
    expect(payload.data?.elements).toHaveLength(1);
  });

  it('regenerates imported default execute class name when the final widget id changes', async (): Promise<void> => {
    const wrapper = mountWidgetCreator();
    const file = await createWidgetZipFile({
      name: '咖啡菜单',
      description: '展示咖啡列表'
    });

    await selectImportFile(wrapper, file);
    await waitForZipImport(wrapper);
    await wrapper.find('.widget-creator__id input').setValue('tea-menu');
    await findButtonByText(wrapper, '确定').trigger('click');
    await flushPromises();

    const payload = readConfirmPayload(wrapper);

    expect(payload.id).toBe('tea-menu');
    expect(payload.data?.execute).toEqual(createDefaultWidgetExecuteMethod('tea-menu'));
  });

  it('emits imported zip resources with widget data', async (): Promise<void> => {
    const wrapper = mountWidgetCreator();
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

    await selectImportFile(wrapper, file);
    await waitForZipImport(wrapper);
    await findButtonByText(wrapper, '确定').trigger('click');
    await flushPromises();

    const payload = readConfirmPayload(wrapper);

    expect(payload.resources).toHaveLength(1);
    expect(payload.resources?.[0]?.relativePath).toBe('assets/icon.png');
    expect(Array.from(new Uint8Array(payload.resources?.[0]?.content ?? new ArrayBuffer(0)))).toEqual([9, 8, 7]);
  });

  it('clears previous imported data when the next zip import fails', async (): Promise<void> => {
    const wrapper = mountWidgetCreator();
    const validFile = await createWidgetZipFile(
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
    const invalidZip = new JSZip();
    invalidZip.file('nested/widget.json', JSON.stringify({ name: '错误包' }));
    const invalidBuffer = await invalidZip.generateAsync({ type: 'arraybuffer' });
    const invalidFile = new File([invalidBuffer], 'bad.zip', { type: 'application/zip' });

    await selectImportFile(wrapper, validFile);
    await waitForZipImport(wrapper);
    await selectImportFile(wrapper, invalidFile);
    await flushPromises();
    await flushPromises();
    await findButtonByText(wrapper, '确定').trigger('click');
    await flushPromises();

    const payload = readConfirmPayload(wrapper);

    expect(payload.data).toBeUndefined();
    expect(payload.resources).toBeUndefined();
  });

  it('fills form without overriding an existing identifier when importing widget.json', async (): Promise<void> => {
    const wrapper = mountWidgetCreator();
    const file = new File(
      [
        JSON.stringify({
          name: '天气',
          description: '查询天气',
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
        })
      ],
      'widget.json',
      { type: 'application/json' }
    );

    await wrapper.find('.widget-creator__id input').setValue('weather-card');
    await selectImportFile(wrapper, file);
    await waitForZipImport(wrapper);

    expect(wrapper.find<HTMLInputElement>('.widget-creator__dropzone input[type="file"]').attributes('accept')).toBe('.zip,.json');
    expect(wrapper.find('.widget-creator__dropzone-file').exists()).toBe(false);
    expect((wrapper.find('.widget-creator__id input').element as HTMLInputElement).value).toBe('weather-card');
    expect((wrapper.find('.widget-creator__name input').element as HTMLInputElement).value).toBe('天气');
    expect((wrapper.find('.widget-creator__description textarea').element as HTMLTextAreaElement).value).toBe('查询天气');

    await findButtonByText(wrapper, '确定').trigger('click');
    await flushPromises();

    const payload = readConfirmPayload(wrapper);

    expect(payload.id).toBe('weather-card');
    expect(payload.name).toBe('天气');
    expect(payload.description).toBe('查询天气');
    expect(payload.data?.elements).toHaveLength(1);
    expect(payload.resources).toBeUndefined();
  });

  it('closes when clicking cancel', async (): Promise<void> => {
    const wrapper = mountWidgetCreator();

    await findButtonByText(wrapper, '取消').trigger('click');

    expect(wrapper.emitted('update:open')?.[0]).toEqual([false]);
  });

  it('does not emit confirm when identifier already exists', async (): Promise<void> => {
    const wrapper = mountWidgetCreator(['weather']);

    await wrapper.find('.widget-creator__id input').setValue(' Weather ');
    await wrapper.find('.widget-creator__name input').setValue('天气');
    await findButtonByText(wrapper, '确定').trigger('click');
    await flushPromises();

    expect(wrapper.emitted('confirm')).toBeUndefined();
  });
});
