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

    expect(wrapper.text()).toContain('已选择 3 个元素');
    expect(wrapper.text()).toContain('矩形 2');
    expect(wrapper.text()).toContain('文本 1');
    expect(wrapper.text()).toContain('多个组合');
    expect(wrapper.text()).toContain('140 x 140');

    await wrapper.find('[data-testid="multi-select-command-group"]').trigger('click');

    expect(wrapper.emitted('multi-command')).toEqual([['group']]);
    wrapper.unmount();
  });
});
