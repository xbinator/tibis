/**
 * @file page-setter.test.ts
 * @description 验证画图页面默认画布设置面板会展示画板概览。
 * @vitest-environment jsdom
 */
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import type { DrawingData, DrawingElement, DrawingMetadata } from '@/components/BDrawing/types';
import PageSetter from '@/views/drawing/components/PageSetter.vue';

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
 * @returns 测试画图数据
 */
function createDrawingData(): DrawingData {
  return {
    metadata: {},
    elements: [createDrawingElement('rect-1', 'rect'), createDrawingElement('text-1', 'text')],
    viewport: {
      center: { x: 12.4, y: 56.6 },
      zoom: 0.75
    }
  };
}

/**
 * 创建测试画板元信息。
 * @returns 测试画板元信息
 */
function createDrawingMetadata(): DrawingMetadata {
  return {};
}

describe('PageSetter', (): void => {
  it('renders drawing overview rows for the selected page', (): void => {
    const wrapper = mount(PageSetter, {
      props: {
        drawingData: createDrawingData(),
        metadata: createDrawingMetadata()
      }
    });

    expect(wrapper.findAll('.page-setter-row')).toHaveLength(4);
    expect(wrapper.text()).toContain('元素');
    expect(wrapper.text()).toContain('形状');
    expect(wrapper.text()).toContain('缩放');
    expect(wrapper.text()).toContain('中心点');
    expect(wrapper.text()).toContain('2');
    expect(wrapper.text()).toContain('75%');
    expect(wrapper.text()).toContain('12, 57');
    wrapper.unmount();
  });
});
