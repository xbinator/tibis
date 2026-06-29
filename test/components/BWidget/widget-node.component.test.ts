/**
 * @file widget-node.component.test.ts
 * @description 验证 BWidget 节点统一承接元素视觉样式。
 * @vitest-environment jsdom
 */
import { readFileSync } from 'node:fs';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import WidgetNode from '@/components/BWidget/renderers/WidgetNode.vue';
import type { WidgetShapeElement } from '@/components/BWidget/types';

/** WidgetNode 组件源码。 */
const widgetNodeSource = readFileSync('src/components/BWidget/renderers/WidgetNode.vue', 'utf8');

/**
 * 创建节点样式测试元素。
 * @returns 测试节点
 */
function createStyledNode(): WidgetShapeElement {
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

describe('WidgetNode', (): void => {
  it('applies shared element visual styles on the node root', (): void => {
    const wrapper = mount(WidgetNode, {
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

  it('does not render active child selection chrome on the node itself', (): void => {
    expect(widgetNodeSource).not.toContain('is-active-child');
    expect(widgetNodeSource).not.toContain('b-widget-node__active-border');
    expect(widgetNodeSource).not.toContain('border-radius: 0 !important;');
    expect(widgetNodeSource).not.toContain('box-shadow: inset 0 0 0 1px var(--color-primary);');
  });
});
