/**
 * @file drawing-context-menu-actions.test.ts
 * @description 验证 BDrawing 右键菜单动作会驱动画板数据变更。
 * @vitest-environment jsdom
 */
/* eslint-disable vue/one-component-per-file */
import { defineComponent, nextTick } from 'vue';
import type { ComponentPublicInstance } from 'vue';
import { mount, type DOMWrapper, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BDrawing from '@/components/BDrawing/index.vue';
import type { DrawingData, DrawingElement, DrawingSelectTarget } from '@/components/BDrawing/types';
import { createDefaultDrawingData } from '@/components/BDrawing/utils/drawingData';

/**
 * 带内部选区的测试画板数据。
 */
type DrawingDataWithSelection = DrawingData & {
  /** 内部选区 */
  selection: string[];
};

/**
 * BDrawing 暴露给页面层的测试命令。
 */
interface BDrawingExpose {
  /** 根据元素 ID 选择元素 */
  selectElementById: (id: string, options?: { activateElement?: boolean }) => void;
}

vi.mock('@/components/BDrawing/components/Toolbar.vue', () => ({
  default: defineComponent({
    name: 'ToolbarStub',
    template: '<div class="toolbar-stub"></div>'
  })
}));

vi.mock('@/components/BDrawing/components/SelectoLayer.vue', () => ({
  default: defineComponent({
    name: 'SelectoLayerStub',
    template: '<div class="selecto-layer-stub"></div>'
  })
}));

vi.mock('@/components/BDrawing/components/MoveableLayer.vue', () => ({
  default: defineComponent({
    name: 'MoveableLayerStub',
    template: '<div class="moveable-layer-stub"></div>'
  })
}));

/**
 * ResizeObserver 测试替身。
 */
class ResizeObserverMock {
  /** 监听目标元素尺寸。 */
  public observe = vi.fn();

  /** 停止监听目标元素。 */
  public unobserve = vi.fn();

  /** 断开全部尺寸监听。 */
  public disconnect = vi.fn();
}

/**
 * 创建测试元素。
 * @param id - 元素 ID
 * @param x - 横坐标
 * @param y - 纵坐标
 * @param groupId - 组合 ID
 * @returns 测试元素
 */
function createElement(id: string, x: number, y: number, groupId?: string): DrawingElement {
  return {
    id,
    name: 'rect',
    label: '矩形',
    icon: 'lucide:square',
    title: '节点',
    position: { x, y },
    size: { width: 100, height: 60 },
    rotation: 0,
    style: {},
    metadata: groupId ? { groupId } : {}
  };
}

/**
 * 创建右键菜单测试画板数据。
 * @returns 测试画板数据
 */
function createDrawingData(): DrawingData {
  return {
    ...createDefaultDrawingData(),
    elements: [createElement('node-1', 80, 60)],
    viewport: {
      center: { x: 0, y: 0 },
      zoom: 1
    }
  };
}

/**
 * 创建组合测试画板数据。
 * @returns 测试画板数据
 */
function createGroupedDrawingData(): DrawingData {
  return {
    ...createDefaultDrawingData(),
    elements: [createElement('node-1', 80, 60, 'drawing-group-1'), createElement('node-2', 220, 100, 'drawing-group-1')],
    viewport: {
      center: { x: 0, y: 0 },
      zoom: 1
    }
  };
}

/**
 * 创建多选右键菜单测试画板数据。
 * @returns 测试画板数据
 */
function createMultiSelectedDrawingData(): DrawingDataWithSelection {
  return {
    ...createDefaultDrawingData(),
    elements: [createElement('node-1', 80, 60), createElement('node-2', 220, 100)],
    selection: ['node-1', 'node-2'],
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
 * 等待组件响应式更新完成。
 */
async function flushDrawingUpdates(): Promise<void> {
  await nextTick();
  await nextTick();
}

/**
 * 通过节点 ID 查找测试节点。
 * @param wrapper - BDrawing 测试包装器
 * @param id - 节点 ID
 * @returns 节点包装器
 */
function findNodeById(wrapper: VueWrapper, id: string): DOMWrapper<Element> {
  return wrapper.find<Element>(`[data-drawing-element-id="${id}"]`);
}

/**
 * 读取 BDrawing 暴露命令。
 * @param wrapper - BDrawing 测试包装器
 * @returns 暴露命令
 */
function getDrawingExpose(wrapper: VueWrapper): ComponentPublicInstance & BDrawingExpose {
  return wrapper.vm as ComponentPublicInstance & BDrawingExpose;
}

/**
 * 点击右键菜单项。
 * @param wrapper - BDrawing 测试包装器
 * @param label - 菜单项文案
 */
async function clickContextMenuItem(wrapper: VueWrapper, label: string): Promise<void> {
  const item = wrapper
    .findAll<HTMLButtonElement>('.b-drawing-context-menu__item')
    .find((menuItem: DOMWrapper<HTMLButtonElement>): boolean => menuItem.text().includes(label));
  expect(item).toBeDefined();
  await item?.trigger('click');
  await flushDrawingUpdates();
}

/**
 * 读取最后一次画板数据更新。
 * @param wrapper - BDrawing 测试包装器
 * @returns 画板数据
 */
function getLatestDrawingData(wrapper: VueWrapper): DrawingData | undefined {
  const emitted = wrapper.emitted('update:value') as Array<[DrawingData]> | undefined;

  return emitted?.at(-1)?.[0];
}

/**
 * 读取右键菜单按钮文案。
 * @param wrapper - BDrawing 测试包装器
 * @returns 菜单按钮文案
 */
function readContextMenuLabels(wrapper: VueWrapper): string[] {
  return wrapper.findAll<HTMLButtonElement>('.b-drawing-context-menu__item').map((item: DOMWrapper<HTMLButtonElement>): string => item.text());
}

describe('BDrawing context menu actions', (): void => {
  beforeEach((): void => {
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback): number => {
      callback(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach((): void => {
    vi.unstubAllGlobals();
  });

  it('copies a node and pastes it at the canvas context point', async (): Promise<void> => {
    const wrapper = mount(BDrawing, {
      props: {
        value: createDrawingData()
      },
      global: {
        stubs: {
          BIcon: true
        }
      },
      attachTo: document.body
    });
    setElementRect(wrapper.element, { height: 600, left: 0, top: 0, width: 800 });
    setElementRect(wrapper.find('[data-testid="drawing-canvas"]').element, { height: 600, left: 0, top: 0, width: 800 });

    await findNodeById(wrapper, 'node-1').trigger('contextmenu', { clientX: 440, clientY: 330 });
    await clickContextMenuItem(wrapper, '复制');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('contextmenu', { clientX: 500, clientY: 360 });
    await clickContextMenuItem(wrapper, '粘贴');

    const latestData = getLatestDrawingData(wrapper);
    expect(latestData?.elements).toHaveLength(2);
    expect(latestData?.elements[1]).toMatchObject({
      position: { x: 100, y: 60 }
    });
    expect(latestData?.elements[1]?.id).toMatch(/^[A-Za-z0-9_-]{8}$/);
    wrapper.unmount();
  });

  it('ungroups the selected group from a member context menu', async (): Promise<void> => {
    const wrapper = mount(BDrawing, {
      props: {
        value: createGroupedDrawingData()
      },
      global: {
        stubs: {
          BIcon: true
        }
      },
      attachTo: document.body
    });
    setElementRect(wrapper.element, { height: 600, left: 0, top: 0, width: 800 });
    setElementRect(wrapper.find('[data-testid="drawing-canvas"]').element, { height: 600, left: 0, top: 0, width: 800 });

    await findNodeById(wrapper, 'node-1').trigger('contextmenu', { clientX: 440, clientY: 330 });
    expect(readContextMenuLabels(wrapper)).toContain('取消合并');
    expect(readContextMenuLabels(wrapper)).not.toContain('合并');
    expect(wrapper.findAll('.b-drawing-context-menu__divider')).toHaveLength(3);

    await clickContextMenuItem(wrapper, '取消合并');

    const latestData = getLatestDrawingData(wrapper);
    expect(latestData?.elements[0]?.metadata.groupId).toBeUndefined();
    expect(latestData?.elements[1]?.metadata.groupId).toBeUndefined();
    wrapper.unmount();
  });

  it('clears the active grouped child settings target after ungrouping selection', async (): Promise<void> => {
    const wrapper = mount(BDrawing, {
      props: {
        value: createGroupedDrawingData(),
        select: {}
      },
      global: {
        stubs: {
          BIcon: true
        }
      },
      attachTo: document.body
    });
    setElementRect(wrapper.element, { height: 600, left: 0, top: 0, width: 800 });
    setElementRect(wrapper.find('[data-testid="drawing-canvas"]').element, { height: 600, left: 0, top: 0, width: 800 });

    getDrawingExpose(wrapper).selectElementById('node-2', { activateElement: true });
    await flushDrawingUpdates();

    const activeChildPayload = wrapper.emitted('update:select')?.at(-1)?.[0] as DrawingSelectTarget;
    expect(activeChildPayload && 'id' in activeChildPayload ? activeChildPayload.id : '').toBe('node-2');

    await findNodeById(wrapper, 'node-1').trigger('contextmenu', { clientX: 440, clientY: 330 });
    await clickContextMenuItem(wrapper, '取消合并');

    expect(wrapper.emitted('update:select')?.at(-1)?.[0]).toBeNull();
    wrapper.unmount();
  });

  it('keeps a multi-selection when right-clicking a selected member so merge and paste stay usable', async (): Promise<void> => {
    const wrapper = mount(BDrawing, {
      props: {
        value: createMultiSelectedDrawingData(),
        select: {}
      },
      attachTo: document.body
    });
    setElementRect(wrapper.element, { height: 600, left: 0, top: 0, width: 800 });
    setElementRect(wrapper.find('[data-testid="drawing-canvas"]').element, { height: 600, left: 0, top: 0, width: 800 });

    await findNodeById(wrapper, 'node-1').trigger('contextmenu', { clientX: 440, clientY: 330 });
    const mergeItem = wrapper
      .findAll<HTMLButtonElement>('.b-drawing-context-menu__item')
      .find((item: DOMWrapper<HTMLButtonElement>): boolean => item.text().includes('合并'));

    expect(mergeItem?.attributes('disabled')).toBeUndefined();
    expect(readContextMenuLabels(wrapper)).not.toContain('取消合并');

    await clickContextMenuItem(wrapper, '复制');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('contextmenu', { clientX: 500, clientY: 360 });
    const pasteItem = wrapper
      .findAll<HTMLButtonElement>('.b-drawing-context-menu__item')
      .find((item: DOMWrapper<HTMLButtonElement>): boolean => item.text().includes('粘贴'));

    expect(pasteItem?.attributes('disabled')).toBeUndefined();

    await clickContextMenuItem(wrapper, '粘贴');

    const latestData = getLatestDrawingData(wrapper);
    expect(latestData?.elements.map((element: DrawingElement): string => element.id).slice(0, 2)).toEqual(['node-1', 'node-2']);
    expect(latestData?.elements.slice(2).map((element: DrawingElement): string => element.id)).toHaveLength(2);
    expect(latestData?.elements[2]?.id).toMatch(/^[A-Za-z0-9_-]{8}$/);
    expect(latestData?.elements[3]?.id).toMatch(/^[A-Za-z0-9_-]{8}$/);
    wrapper.unmount();
  });
});
