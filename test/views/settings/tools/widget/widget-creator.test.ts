/**
 * @file widget-creator.test.ts
 * @description 小组件创建弹窗表单校验测试。
 * @vitest-environment jsdom
 */
/* eslint-disable vue/one-component-per-file */
import { defineComponent } from 'vue';
import { flushPromises, mount, type DOMWrapper, type VueWrapper } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
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
 * 挂载小组件创建弹窗。
 * @returns 组件包装器
 */
function mountWidgetCreator(): VueWrapper {
  return mount(WidgetCreator, {
    props: {
      open: true
    },
    global: {
      stubs: {
        BModal: BModalStub,
        AForm: AFormStub,
        AFormItem: AFormItemStub,
        AInput: AInputStub,
        ATextarea: ATextareaStub,
        BButton: BButtonStub
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

describe('WidgetCreator', (): void => {
  it('emits trimmed widget payload for a valid identifier', async (): Promise<void> => {
    const wrapper = mountWidgetCreator();

    await wrapper.find('.widget-creator__id input').setValue(' Weather_01 ');
    await wrapper.find('.widget-creator__name input').setValue(' 天气 ');
    await wrapper.find('.widget-creator__description textarea').setValue(' 查询指定城市天气 ');
    await findButtonByText(wrapper, '保存').trigger('click');
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
    await findButtonByText(wrapper, '保存').trigger('click');
    await flushPromises();

    expect(wrapper.emitted('confirm')).toBeUndefined();
  });

  it('closes when clicking cancel', async (): Promise<void> => {
    const wrapper = mountWidgetCreator();

    await findButtonByText(wrapper, '取消').trigger('click');

    expect(wrapper.emitted('update:open')?.[0]).toEqual([false]);
  });
});
