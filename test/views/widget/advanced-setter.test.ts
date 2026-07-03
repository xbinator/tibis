/**
 * @file advanced-setter.test.ts
 * @description 验证Widget 高级设置面板的循环配置交互。
 * @vitest-environment jsdom
 */
/* eslint-disable vue/one-component-per-file */
import { defineComponent, nextTick } from 'vue';
import type { PropType } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import type { SelectOption } from '@/components/BSelect/types';
import type { WidgetData, WidgetElement, WidgetElementLoopConfig } from '@/components/BWidget/types';
import { createDefaultWidgetData } from '@/components/BWidget/utils/widgetData';
import { WIDGET_LOOP_METADATA_KEY } from '@/components/BWidget/utils/widgetLoop';
import AdvancedSetter from '@/views/widget/components/AdvancedSetter.vue';

vi.mock('ant-design-vue', () => ({
  Checkbox: defineComponent({
    name: 'ACheckboxStub',
    props: {
      checked: {
        type: Boolean,
        default: false
      }
    },
    emits: ['update:checked'],
    setup(_props, { emit }) {
      /**
       * 将原生 checkbox 事件转换为 ACheckbox 的 checked 更新事件。
       * @param event - 原生输入事件
       */
      function handleChange(event: Event): void {
        if (event.target instanceof HTMLInputElement) {
          emit('update:checked', event.target.checked);
        }
      }

      return { handleChange };
    },
    template: '<input type="checkbox" :checked="checked" @change="handleChange" />'
  }),
  Input: defineComponent({
    name: 'AInputStub',
    props: {
      value: {
        type: String,
        default: ''
      },
      placeholder: {
        type: String,
        default: ''
      }
    },
    emits: ['update:value'],
    setup(_props, { emit }) {
      /**
       * 将原生 input 事件转换为 AInput 的 value 更新事件。
       * @param event - 原生输入事件
       */
      function handleInput(event: Event): void {
        if (event.target instanceof HTMLInputElement) {
          emit('update:value', event.target.value);
        }
      }

      return { handleInput };
    },
    template: '<input :value="value" :placeholder="placeholder" @input="handleInput" />'
  }),
  InputNumber: defineComponent({
    name: 'AInputNumberStub',
    props: {
      value: {
        type: Number,
        default: null
      },
      controls: {
        type: Boolean,
        default: true
      },
      placeholder: {
        type: String,
        default: ''
      }
    },
    emits: ['update:value'],
    setup(_props, { emit }) {
      /**
       * 将原生数字输入事件转换为 AInputNumber 的 value 更新事件。
       * @param event - 原生输入事件
       */
      function handleInput(event: Event): void {
        if (event.target instanceof HTMLInputElement) {
          emit('update:value', Number(event.target.value));
        }
      }

      return { handleInput };
    },
    template: '<input type="number" :value="value" :placeholder="placeholder" @input="handleInput" />'
  })
}));

/**
 * 创建测试循环配置。
 * @returns 循环配置
 */
function createLoopConfig(): WidgetElementLoopConfig {
  return {
    enabled: true,
    source: 'input.items',
    columns: 2,
    columnGap: 12,
    rowGap: 12,
    itemName: 'item',
    indexName: 'index'
  };
}

/**
 * 创建测试Widget 元素。
 * @returns Widget 元素
 */
function createWidgetElement(): WidgetElement {
  return {
    id: 'text-1',
    name: 'text',
    label: '文本',
    icon: 'lucide:type',
    title: '文本',
    position: { x: 0, y: 0 },
    size: { width: 120, height: 40 },
    rotation: 0,
    style: {},
    metadata: {
      [WIDGET_LOOP_METADATA_KEY]: createLoopConfig()
    }
  };
}

/**
 * 创建测试Widget 数据。
 * @param element - Widget 元素
 * @returns Widget 数据
 */
function createWidgetData(element: WidgetElement): WidgetData {
  const dataItem = createDefaultWidgetData();
  dataItem.elements = [element];
  dataItem.inputSchema.properties.items = {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        name: { type: 'string' }
      }
    }
  };

  return dataItem;
}

describe('AdvancedSetter', (): void => {
  /**
   * 读取最近一次元素列表更新。
   * @param wrapper - 组件包装器
   * @returns 最近一次更新后的元素列表
   */
  function readLastElementsUpdate(wrapper: VueWrapper): WidgetElement[] {
    const updates = wrapper.emitted('update:elements');

    return updates?.[updates.length - 1]?.[0] as WidgetElement[];
  }

  /**
   * 创建高级设置面板测试包装器。
   * @param element - 当前元素
   * @returns 组件包装器
   */
  function mountAdvancedSetter(element: WidgetElement): VueWrapper {
    return mount(AdvancedSetter, {
      props: {
        dataItem: createWidgetData(element),
        elements: [element]
      },
      global: {
        stubs: {
          BSectionBlock: {
            template: '<section><slot></slot></section>'
          },
          BSectionItem: {
            props: {
              label: {
                type: String,
                default: ''
              }
            },
            template: '<label><span>{{ label }}</span><slot></slot></label>'
          },
          BSelect: defineComponent({
            name: 'BSelectStub',
            props: {
              value: {
                type: String,
                default: ''
              },
              options: {
                type: Array as PropType<SelectOption[]>,
                default: (): SelectOption[] => []
              }
            },
            emits: ['update:value'],
            setup(_props, { emit }) {
              /**
               * 将原生 select 事件转换为 BSelect 的 value 更新事件。
               * @param event - 原生选择事件
               */
              function handleChange(event: Event): void {
                if (event.target instanceof HTMLSelectElement) {
                  emit('update:value', event.target.value);
                }
              }

              return { handleChange };
            },
            template: '<select :value="value" @change="handleChange"><option v-for="option in options" :key="String(option.value)" :value="option.value">{{ option.label }}</option></select>'
          })
        }
      }
    });
  }

  it('renders loop source options from element variables', (): void => {
    const element = createWidgetElement();
    const wrapper = mountAdvancedSetter(element);

    expect(wrapper.find('select').text()).toContain('input.items');
    wrapper.unmount();
  });

  it('updates loop config through elements model', async (): Promise<void> => {
    const element = createWidgetElement();
    const wrapper = mountAdvancedSetter(element);

    wrapper.findComponent({ name: 'ACheckboxStub' }).vm.$emit('update:checked', false);
    await nextTick();
    const disabledElements = readLastElementsUpdate(wrapper);
    await wrapper.setProps({ elements: disabledElements });

    expect(disabledElements[0].metadata[WIDGET_LOOP_METADATA_KEY]).toMatchObject({
      enabled: false,
      itemName: 'item',
      indexName: 'index'
    });

    wrapper.findComponent({ name: 'BSelectStub' }).vm.$emit('update:value', 'input.items');
    await nextTick();
    const sourceElements = readLastElementsUpdate(wrapper);

    expect(sourceElements[0].metadata[WIDGET_LOOP_METADATA_KEY]).toMatchObject({
      source: 'input.items'
    });
    wrapper.unmount();
  });

  it('prevents saving duplicate effective item and index variable names', async (): Promise<void> => {
    const element = createWidgetElement();
    const wrapper = mountAdvancedSetter(element);

    await wrapper.find('input[placeholder="默认为：index"]').setValue('item');

    expect(wrapper.emitted('update:elements')).toBeUndefined();
    wrapper.unmount();
  });
});
