/**
 * @file text-element-view.component.test.ts
 * @description 验证 BDrawing 文本元素视图使用元素 metadata 内容渲染。
 * @vitest-environment jsdom
 */
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import TextElementView from '@/components/BDrawing/elements/Text/index.vue';
import type { DrawingShapeElement } from '@/components/BDrawing/types';

/**
 * 创建文本视图测试元素。
 * @returns 文本元素
 */
function createTextElement(): DrawingShapeElement {
  return {
    id: 'text-1',
    name: 'text',
    label: '文本',
    icon: 'lucide:type',
    title: '图层名称',
    position: { x: 0, y: 0 },
    size: { width: 120, height: 32 },
    rotation: 0,
    style: {},
    metadata: {
      content: '正文内容'
    }
  };
}

describe('TextElementView', (): void => {
  it('renders text content from element metadata instead of the layer title', (): void => {
    const wrapper = mount(TextElementView, {
      props: {
        element: createTextElement()
      }
    });

    expect(wrapper.text()).toBe('正文内容');
    wrapper.unmount();
  });
});
