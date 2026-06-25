/**
 * @file settings-panel.test.ts
 * @description 验证画图右侧设置栏的默认、单选和多选展示规则。
 * @vitest-environment jsdom
 */
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import type { DrawingData, DrawingElement } from '@/components/BDrawing/types';
import SettingsPanel from '@/views/drawing/components/SettingsPanel.vue';

/**
 * 创建测试画图元素。
 * @param id - 元素 ID
 * @returns 测试画图元素
 */
function createDrawingElement(id: string): DrawingElement {
  return {
    id,
    name: 'rect',
    text: '通知栏',
    position: { x: 12, y: 24 },
    size: { width: 120, height: 48 },
    rotation: 0,
    style: {
      fill: '#ffffff',
      color: '#ed6a0c',
      fontSize: 14,
      fontWeight: 400,
      textAlign: 'center'
    },
    metadata: {
      source: 'user',
      createdAt: 1
    }
  };
}

/**
 * 创建测试画图数据。
 * @returns 测试画图数据
 */
function createDrawingData(): DrawingData {
  return {
    elements: [createDrawingElement('node-1'), createDrawingElement('node-2')],
    viewport: {
      center: { x: 0, y: 0 },
      zoom: 1
    }
  };
}

describe('Drawing SettingsPanel', (): void => {
  it('shows page setter when no element is selected', (): void => {
    const wrapper = mount(SettingsPanel, {
      global: {
        stubs: {
          BIcon: true
        }
      },
      props: {
        drawingData: createDrawingData(),
        selectedElements: []
      }
    });

    expect(wrapper.text()).toContain('设置');
    expect(wrapper.text()).toContain('元素');
    expect(wrapper.text()).not.toContain('属性');
  });

  it('shows design and attribute tabs for a single selected element', (): void => {
    const data = createDrawingData();
    const wrapper = mount(SettingsPanel, {
      global: {
        stubs: {
          BIcon: true
        }
      },
      props: {
        drawingData: data,
        selectedElements: [data.elements[0]]
      }
    });

    expect(wrapper.text()).toContain('设计');
    expect(wrapper.text()).toContain('属性');
    expect(wrapper.text()).toContain('名称');
    expect(wrapper.find<HTMLInputElement>('.setter-input').element.value).toBe('通知栏');
  });

  it('only shows design tab for multiple selected elements', (): void => {
    const data = createDrawingData();
    const wrapper = mount(SettingsPanel, {
      global: {
        stubs: {
          BIcon: true
        }
      },
      props: {
        drawingData: data,
        selectedElements: data.elements
      }
    });

    expect(wrapper.text()).toContain('设计');
    expect(wrapper.text()).not.toContain('属性');
  });
});
