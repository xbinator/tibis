/**
 * @file use-tab-dragger.test.ts
 * @description HeaderTabs 拖拽指引条位置计算测试，覆盖首尾边界与 sticky target 的优先级。
 * @vitest-environment jsdom
 */
import type { Input } from '@atlaskit/pragmatic-drag-and-drop/types';
import { shallowRef } from 'vue';
import { extractClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isTabDragData, resolveDragIndicatorPlacement, useTabDragger } from '@/layouts/default/hooks/useTabDragger';

/**
 * 捕获的 HeaderTabs drop target 配置。
 */
interface CapturedDropTargetOptions {
  /**
   * 读取 drop target 数据。
   * @param args - Pragmatic Drag and Drop 反馈参数
   * @returns 拖拽数据
   */
  getData?: (args: { input: Input; element: Element }) => Record<string | symbol, unknown>;
}

/** 捕获到的 drop target 配置。 */
const capturedDropTargetOptions = vi.hoisted<CapturedDropTargetOptions[]>(() => []);

vi.mock('@atlaskit/pragmatic-drag-and-drop/element/adapter', () => ({
  draggable: vi.fn((): (() => void) => vi.fn()),
  dropTargetForElements: vi.fn((options: CapturedDropTargetOptions): (() => void) => {
    capturedDropTargetOptions.push(options);

    return vi.fn();
  }),
  monitorForElements: vi.fn((): (() => void) => vi.fn())
}));

vi.mock('@atlaskit/pragmatic-drag-and-drop-auto-scroll/element', () => ({
  autoScrollForElements: vi.fn((): (() => void) => vi.fn())
}));

/**
 * 创建拖拽输入点。
 * @param clientX - 视口 X 坐标
 * @param clientY - 视口 Y 坐标
 * @returns Pragmatic 输入信息
 */
function createInput(clientX: number, clientY: number): Input {
  return {
    altKey: false,
    button: 0,
    buttons: 1,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    clientX,
    clientY,
    pageX: clientX,
    pageY: clientY
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

beforeEach((): void => {
  capturedDropTargetOptions.length = 0;
});

describe('resolveDragIndicatorPlacement', (): void => {
  const tabRects = [
    { id: 'tab-1', left: 16, width: 80 },
    { id: 'tab-2', left: 100, width: 80 },
    { id: 'tab-3', left: 184, width: 80 }
  ];

  it('prefers the first-tab before indicator when the pointer is left of all tabs despite a sticky target', (): void => {
    const placement = resolveDragIndicatorPlacement({
      pointerX: 8,
      sourceTabId: 'tab-3',
      targetTabId: 'tab-2',
      targetEdge: 'right',
      tabs: tabRects
    });

    expect(placement).toEqual({
      tabId: 'tab-1',
      position: 'before',
      offset: 16
    });
  });

  it('prefers the last-tab after indicator when the pointer is right of all tabs despite a sticky target', (): void => {
    const placement = resolveDragIndicatorPlacement({
      pointerX: 280,
      sourceTabId: 'tab-1',
      targetTabId: 'tab-2',
      targetEdge: 'left',
      tabs: tabRects
    });

    expect(placement).toEqual({
      tabId: 'tab-3',
      position: 'after',
      offset: 264
    });
  });

  it('uses the hitbox edge while the pointer remains inside the tab strip', (): void => {
    const placement = resolveDragIndicatorPlacement({
      pointerX: 120,
      sourceTabId: 'tab-1',
      targetTabId: 'tab-2',
      targetEdge: 'left',
      tabs: tabRects
    });

    expect(placement).toEqual({
      tabId: 'tab-2',
      position: 'before',
      offset: 100
    });
  });
});

describe('isTabDragData', (): void => {
  it('rejects non-tab drag payloads from other draggable components', (): void => {
    expect(isTabDragData({ bDraggableKey: 'node-1' })).toBe(false);
    expect(isTabDragData({ tabId: 'tab-1' })).toBe(true);
  });
});

describe('useTabDragger', (): void => {
  it('attaches closest-edge data from drop target getData', (): void => {
    const scrollContainer = document.createElement('div');
    const tabElement = document.createElement('button');
    const tabDragger = useTabDragger(shallowRef(scrollContainer), vi.fn(), vi.fn());

    setElementRect(tabElement, { height: 32, left: 100, top: 0, width: 120 });
    tabDragger.registerTabElement('tab-1', tabElement);

    const data = capturedDropTargetOptions[0]?.getData?.({
      element: tabElement,
      input: createInput(102, 16)
    });

    expect(extractClosestEdge(data ?? {})).toBe('left');
    tabDragger.cleanup();
  });
});
