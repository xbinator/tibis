/**
 * @file widget-context-menu.component.test.ts
 * @description 验证 BWidget Widget 右键菜单事件会携带命中元素和坐标。
 * @vitest-environment jsdom
 */
import { mount, type VueWrapper } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import WidgetCanvas from '@/components/BWidget/renderers/WidgetCanvas.vue';
import type { WidgetContextMenuPayload, WidgetData, WidgetShapeElement } from '@/components/BWidget/types';
import { queryWidgetElementTarget } from '@/components/BWidget/utils/widgetGeometry';
import { createDefaultWidgetData } from '@/components/BWidget/utils/widgetData';
import { createDefaultWidgetElementLoopConfig } from '@/components/BWidget/utils/widgetLoop';

/**
 * 创建右键菜单测试元素。
 * @returns 测试元素
 */
function createContextMenuElement(): WidgetShapeElement {
  return {
    id: 'node-1',
    name: 'rect',
    label: '矩形',
    icon: 'lucide:square',
    title: '节点',
    position: { x: 80, y: 60 },
    size: { width: 180, height: 72 },
    rotation: 0,
    style: {},
    loop: createDefaultWidgetElementLoopConfig(),
    metadata: {}
  };
}

/**
 * 创建右键菜单测试Widget 数据。
 * @returns 测试Widget 数据
 */
function createWidgetData(): WidgetData {
  return {
    ...createDefaultWidgetData(),
    elements: [createContextMenuElement()],
    viewport: {
      center: { x: 0, y: 0 },
      zoom: 1
    }
  };
}

/**
 * 设置元素测试尺寸。
 * @param element - DOM 元素
 * @param rect - 目标尺寸
 */
function setElementRect(element: Element, rect: { left: number; top: number; width: number; height: number }): void {
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: (): DOMRect =>
      DOMRect.fromRect({
        height: rect.height,
        width: rect.width,
        x: rect.left,
        y: rect.top
      })
  });
}

/**
 * 挂载Widget 组件。
 * @returns Widget 测试包装器
 */
function mountWidgetCanvas(): VueWrapper {
  const data = createWidgetData();

  return mount(WidgetCanvas, {
    props: {
      elements: data.elements,
      selection: [],
      viewport: data.viewport,
      viewportSize: { width: 800, height: 600 },
      viewportReady: true,
      activeTool: 'select'
    },
    attachTo: document.body
  });
}

/**
 * 读取最后一次右键菜单事件。
 * @param wrapper - Widget 测试包装器
 * @returns 右键菜单事件
 */
function getLatestContextMenuPayload(wrapper: VueWrapper): WidgetContextMenuPayload | undefined {
  const emitted = wrapper.emitted('context-menu') as Array<[WidgetContextMenuPayload]> | undefined;

  return emitted?.at(-1)?.[0];
}

/**
 * 断言右键菜单事件坐标。
 * @param payload - 右键菜单事件
 * @param expected - 预期事件
 */
function expectContextMenuPayload(payload: WidgetContextMenuPayload | undefined, expected: WidgetContextMenuPayload): void {
  expect(payload?.elementId).toBe(expected.elementId);
  expect(payload?.clientPoint).toEqual(expected.clientPoint);
  expect(payload?.boardPoint.x).toBeCloseTo(expected.boardPoint.x);
  expect(payload?.boardPoint.y).toBeCloseTo(expected.boardPoint.y);
}

describe('WidgetCanvas context menu', (): void => {
  it('emits an element context menu payload when right-clicking a widget node', async (): Promise<void> => {
    const wrapper = mountWidgetCanvas();
    setElementRect(wrapper.element, { height: 600, left: 0, top: 0, width: 800 });

    const target = queryWidgetElementTarget(wrapper.element, 'node-1');
    const node = wrapper.findAll<Element>('.b-widget-node').find((item): boolean => item.element === target);

    expect(node).toBeDefined();
    await node?.trigger('contextmenu', {
      clientX: 440,
      clientY: 330
    });

    expectContextMenuPayload(getLatestContextMenuPayload(wrapper), {
      elementId: 'node-1',
      clientPoint: { x: 440, y: 330 },
      boardPoint: { x: 40, y: 30 }
    });
    wrapper.unmount();
  });

  it('emits an empty canvas context menu payload when right-clicking the canvas', async (): Promise<void> => {
    const wrapper = mountWidgetCanvas();
    setElementRect(wrapper.element, { height: 600, left: 0, top: 0, width: 800 });

    await wrapper.trigger('contextmenu', {
      clientX: 420,
      clientY: 320
    });

    expectContextMenuPayload(getLatestContextMenuPayload(wrapper), {
      elementId: null,
      clientPoint: { x: 420, y: 320 },
      boardPoint: { x: 20, y: 20 }
    });
    wrapper.unmount();
  });
});
