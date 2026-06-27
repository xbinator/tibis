/**
 * @file drawing-node.component.test.ts
 * @description 验证 BDrawing 节点统一承接元素视觉样式。
 * @vitest-environment jsdom
 */
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import DrawingNode from '@/components/BDrawing/renderers/DrawingNode.vue';
import type { DrawingShapeElement } from '@/components/BDrawing/types';

/**
 * 创建节点样式测试元素。
 * @returns 测试节点
 */
function createStyledNode(): DrawingShapeElement {
  return {
    id: 'node-1',
    name: 'rect',
    label: '矩形',
    icon: 'lucide:square',
    title: '矩形',
    position: { x: 20, y: 30 },
    size: { width: 160, height: 80 },
    rotation: 0,
    style: {
      backgroundColor: '#ffeeaa',
      borderColor: '#3355ff',
      borderStyle: 'dashed',
      borderWidth: 2,
      borderRadius: 6,
      color: '#111827',
      fontSize: 18,
      fontWeight: 700,
      textAlign: 'right',
      textVerticalAlign: 'middle'
    },
    metadata: {}
  };
}

describe('DrawingNode', (): void => {
  it('applies shared element visual styles on the node root', (): void => {
    const wrapper = mount(DrawingNode, {
      props: {
        node: createStyledNode()
      }
    });
    const nodeStyle = (wrapper.element as HTMLElement).style;

    expect(nodeStyle.width).toBe('160px');
    expect(nodeStyle.height).toBe('80px');
    expect(nodeStyle.backgroundColor).toBe('rgb(255, 238, 170)');
    expect(nodeStyle.borderColor).toBe('rgb(51, 85, 255)');
    expect(nodeStyle.borderStyle).toBe('dashed');
    expect(nodeStyle.borderWidth).toBe('2px');
    expect(nodeStyle.borderRadius).toBe('6px');
    expect(nodeStyle.color).toBe('rgb(17, 24, 39)');
    expect(nodeStyle.fontSize).toBe('18px');
    expect(nodeStyle.fontWeight).toBe('700');
    expect(nodeStyle.justifyContent).toBe('flex-end');
    expect(nodeStyle.alignItems).toBe('center');
    wrapper.unmount();
  });
});
