/**
 * @file panel-settings.test.ts
 * @description 验证画图右侧设置面板会在属性页签渲染元素专属 Setter。
 * @vitest-environment jsdom
 */
/* eslint-disable vue/one-component-per-file */
import { defineComponent } from 'vue';
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import type { DrawingData, DrawingElement } from '@/components/BDrawing/types';
import PanelSettings from '@/views/drawing/components/PanelSettings.vue';

vi.mock('ant-design-vue', () => ({
  Tabs: defineComponent({
    name: 'ATabsStub',
    template: '<div data-testid="settings-tabs"><slot></slot></div>'
  }),
  TabPane: defineComponent({
    name: 'ATabPaneStub',
    props: {
      tab: {
        type: String,
        required: true
      }
    },
    template: '<section :data-tab="tab"><slot></slot></section>'
  }),
  Input: defineComponent({
    name: 'AInputStub',
    props: {
      value: {
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
    template: '<input :value="value" @input="handleInput" />'
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
    template: '<input type="number" :value="value" @input="handleInput" />'
  })
}));

vi.mock('@/views/drawing/components/DesignSetter.vue', () => ({
  default: defineComponent({
    name: 'DesignSetterStub',
    template: '<div data-testid="design-setter"></div>'
  })
}));

/**
 * 创建测试画图元素。
 * @param id - 元素 ID
 * @param name - 元素注册名称
 * @returns 测试画图元素
 */
function createDrawingElement(id: string, name: 'rect' | 'text'): DrawingElement {
  return {
    id,
    name,
    label: name === 'text' ? '文本' : '矩形',
    icon: name === 'text' ? 'lucide:type' : 'lucide:square',
    title: name === 'text' ? '文本节点' : '矩形节点',
    position: { x: 12, y: 24 },
    size: { width: 160, height: 64 },
    rotation: 0,
    style: {},
    metadata: {}
  };
}

/**
 * 创建测试画图数据。
 * @param elements - 画图元素或元素列表
 * @returns 测试画图数据
 */
function createDrawingData(elements: DrawingElement | DrawingElement[]): DrawingData {
  return {
    metadata: {},
    elements: Array.isArray(elements) ? elements : [elements],
    viewport: {
      center: { x: 0, y: 0 },
      zoom: 1
    }
  };
}

describe('PanelSettings', (): void => {
  it('renders the selected element Setter.vue inside the property tab', (): void => {
    const element = createDrawingElement('text-1', 'text');
    const wrapper = mount(PanelSettings, {
      props: {
        drawingData: createDrawingData(element),
        select: element
      }
    });

    expect(wrapper.find('[data-testid="design-setter"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="drawing-text-setter"]').exists()).toBe(true);
    expect(wrapper.text()).not.toContain('暂无专属属性');
    wrapper.unmount();
  });

  it('renders a multi-selection dashboard and forwards quick commands', async (): Promise<void> => {
    const firstRect = createDrawingElement('rect-1', 'rect');
    const secondRect = createDrawingElement('rect-2', 'rect');
    const textElement = createDrawingElement('text-1', 'text');
    firstRect.position = { x: 10, y: 20 };
    firstRect.size = { width: 100, height: 50 };
    secondRect.position = { x: 40, y: 100 };
    secondRect.size = { width: 80, height: 60 };
    secondRect.metadata = { groupId: 'drawing-group-1' };
    textElement.position = { x: -20, y: 30 };
    textElement.size = { width: 60, height: 40 };
    textElement.metadata = { groupId: 'drawing-group-2' };
    const wrapper = mount(PanelSettings, {
      props: {
        drawingData: createDrawingData([firstRect, secondRect, textElement]),
        select: null,
        selectedElementIds: ['rect-1', 'rect-2', 'text-1']
      },
      global: {
        stubs: {
          BIcon: true
        }
      }
    });

    expect(wrapper.find('[data-tab="设计"]').exists()).toBe(true);
    expect(wrapper.find('[data-tab="概览"]').exists()).toBe(false);
    expect(wrapper.find('[data-tab="样式"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('已选择 3 个元素');
    expect(wrapper.text()).not.toContain('左对齐');
    expect(wrapper.find('[data-testid="multi-select-command-ungroup"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="multi-select-command-group"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="multi-select-command-copy"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="multi-select-command-delete"]').exists()).toBe(false);
    const layoutInputs = wrapper.findAll('input[type="number"]').slice(0, 4);
    expect(layoutInputs.map((input) => (input.element as HTMLInputElement).value)).toEqual(['-20', '20', '140', '140']);
    expect(wrapper.findAllComponents({ name: 'ControlPanel' })).toHaveLength(2);

    await wrapper.findAll('input[type="number"]')[0].setValue('24');
    expect(wrapper.emitted('multi-layout-change')).toEqual([[{ x: 24 }]]);

    await wrapper.find('[data-testid="multi-select-command-ungroup"]').trigger('click');

    expect(wrapper.emitted('multi-command')).toEqual([['ungroup']]);

    wrapper.findComponent({ name: 'BatchSetter' }).vm.$emit('style-change', {
      backgroundColor: '#fef3c7',
      borderColor: '#f97316',
      borderRadius: 6,
      borderWidth: 2
    });

    expect(wrapper.emitted('multi-style-change')).toEqual([
      [
        {
          backgroundColor: '#fef3c7',
          borderColor: '#f97316',
          borderRadius: 6,
          borderWidth: 2
        }
      ]
    ]);
    wrapper.unmount();
  });

  it('rounds multi-selection layout inputs and emitted layout changes to two decimals', async (): Promise<void> => {
    const firstRect = createDrawingElement('rect-1', 'rect');
    const secondRect = createDrawingElement('rect-2', 'rect');
    firstRect.position = { x: -411.544, y: -1216.326 };
    firstRect.size = { width: 100.333, height: 50.555 };
    secondRect.position = { x: -200.555, y: -1132.022 };
    secondRect.size = { width: 74.135, height: 50.556 };
    const wrapper = mount(PanelSettings, {
      props: {
        drawingData: createDrawingData([firstRect, secondRect]),
        select: null,
        selectedElementIds: ['rect-1', 'rect-2']
      }
    });
    const layoutInputs = wrapper.findAll('input[type="number"]').slice(0, 4);

    expect(layoutInputs.map((input) => (input.element as HTMLInputElement).value)).toEqual(['-411.54', '-1216.33', '285.12', '134.86']);

    await layoutInputs[3].setValue('134.8599999999999');

    expect(wrapper.emitted('multi-layout-change')).toEqual([[{ height: 134.86 }]]);
    wrapper.unmount();
  });

  it('switches the operation button to group after selected elements are ungrouped', async (): Promise<void> => {
    const firstRect = createDrawingElement('rect-1', 'rect');
    const secondRect = createDrawingElement('rect-2', 'rect');
    firstRect.metadata = { groupId: 'drawing-group-1' };
    secondRect.metadata = { groupId: 'drawing-group-1' };
    const wrapper = mount(PanelSettings, {
      props: {
        drawingData: createDrawingData([firstRect, secondRect]),
        select: null,
        selectedElementIds: ['rect-1', 'rect-2']
      },
      global: {
        stubs: {
          BIcon: true
        }
      }
    });

    expect(wrapper.find('[data-testid="multi-select-command-ungroup"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="multi-select-command-group"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('拆分组');
    wrapper.unmount();

    const ungroupedWrapper = mount(PanelSettings, {
      props: {
        drawingData: createDrawingData([
          {
            ...firstRect,
            metadata: {}
          },
          {
            ...secondRect,
            metadata: {}
          }
        ]),
        select: null,
        selectedElementIds: ['rect-1', 'rect-2']
      },
      global: {
        stubs: {
          BIcon: true
        }
      }
    });

    expect(ungroupedWrapper.find('[data-testid="multi-select-command-ungroup"]').exists()).toBe(false);
    expect(ungroupedWrapper.find('[data-testid="multi-select-command-group"]').exists()).toBe(true);
    expect(ungroupedWrapper.text()).toContain('合并');

    await ungroupedWrapper.find('[data-testid="multi-select-command-group"]').trigger('click');

    expect(ungroupedWrapper.emitted('multi-command')?.at(-1)).toEqual(['group']);
    ungroupedWrapper.unmount();
  });
});
