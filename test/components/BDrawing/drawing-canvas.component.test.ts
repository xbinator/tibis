/**
 * @file drawing-canvas.component.test.ts
 * @description 验证 BDrawing HTML 画布渲染和注册元素创建能力。
 * @vitest-environment jsdom
 */
import { defineComponent, nextTick, toRaw } from 'vue';
import type { ComponentPublicInstance } from 'vue';
import { mount, type DOMWrapper, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BDrawing from '@/components/BDrawing/index.vue';
import type { DrawingData, DrawingPoint } from '@/components/BDrawing/types';

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
 * BDrawing 暴露给页面层的创建命令。
 */
interface BDrawingExpose {
  /** 根据浏览器坐标创建元素 */
  createElementFromClientPoint: (name: string, point: DrawingPoint) => Promise<void>;
}

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
 * 创建测试用画板数据。
 * @returns 测试画板数据
 */
function createDrawingDataFixture(): DrawingData {
  return {
    metadata: {},
    elements: [
      {
        id: 'external-node-1',
        name: 'rect',
        label: '矩形',
        icon: 'lucide:square',
        title: '外部节点',
        position: { x: 24, y: 36 },
        size: { width: 180, height: 72 },
        rotation: 0,
        style: {},
        metadata: {}
      }
    ],
    viewport: {
      center: { x: 0, y: 0 },
      zoom: 1
    }
  };
}

/**
 * 创建空画板数据。
 * @returns 空画板数据
 */
function createEmptyDrawingData(): DrawingData {
  return {
    metadata: {},
    elements: [],
    viewport: {
      center: { x: 0, y: 0 },
      zoom: 1
    }
  };
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
 * 通过节点 ID 查找测试节点。
 * @param wrapper - BDrawing 测试包装器
 * @param id - 节点 ID
 * @returns 节点包装器
 */
function findNodeById(wrapper: VueWrapper, id: string): DOMWrapper<Element> {
  return wrapper.find<Element>(`[data-drawing-element-id="${id}"]`);
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

describe('BDrawing canvas component', (): void => {
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

  it('renders existing drawing data as HTML nodes with registered element views', (): void => {
    const wrapper = mount(BDrawing, {
      props: {
        value: createDrawingDataFixture()
      },
      attachTo: document.body
    });
    const node = findNodeById(wrapper, 'external-node-1');

    expect(wrapper.find('.b-drawing-canvas__stage').exists()).toBe(true);
    expect(node.exists()).toBe(true);
    expect(node.attributes('style')).toContain('width: 180px');
    expect(node.attributes('style')).toContain('height: 72px');
    expect(node.attributes('style')).toContain('translate(24px, 36px)');
    expect(node.find('.drawing-rect-element-view').text()).toBe('外部节点');
    expect(wrapper.find('svg').exists()).toBe(false);
    wrapper.unmount();
  });

  it('creates a rectangle through the exposed registered element command', async (): Promise<void> => {
    const wrapper = mount(BDrawing, {
      props: {
        value: createEmptyDrawingData()
      },
      attachTo: document.body
    });
    setElementRect(wrapper.element, { height: 600, left: 0, top: 0, width: 800 });

    await getDrawingExpose(wrapper).createElementFromClientPoint('rect', { x: 400, y: 300 });
    await flushDrawingUpdates();

    const node = findNodeById(wrapper, 'drawing-shape-1');
    const emitted = wrapper.emitted('update:value') as Array<[DrawingData]> | undefined;
    const latestData = emitted?.at(-1)?.[0];

    expect(node.exists()).toBe(true);
    expect(node.attributes('data-drawing-name')).toBe('rect');
    expect(node.attributes('style')).toContain('translate(-90px, -36px)');
    expect(latestData?.elements).toHaveLength(1);
    expect(latestData?.elements[0]?.id).toBe('drawing-shape-1');
    expect(latestData?.elements[0]).toMatchObject({
      name: 'rect',
      label: '矩形',
      icon: 'lucide:square',
      title: '矩形',
      style: {},
      metadata: {}
    });
    expect(latestData?.viewport).toEqual({ center: { x: 0, y: 0 }, zoom: 1 });
    wrapper.unmount();
  });

  it('creates a text node without opening the removed text editor', async (): Promise<void> => {
    const wrapper = mount(BDrawing, {
      props: {
        value: createEmptyDrawingData()
      },
      attachTo: document.body
    });
    setElementRect(wrapper.element, { height: 600, left: 0, top: 0, width: 800 });

    await getDrawingExpose(wrapper).createElementFromClientPoint('text', { x: 400, y: 300 });
    await flushDrawingUpdates();

    const textNode = wrapper.find('[data-drawing-name="text"]');
    expect(textNode.exists()).toBe(true);
    expect(textNode.attributes('style')).toContain('width: 32px');
    expect(textNode.attributes('style')).toContain('height: 21.55px');
    expect(textNode.attributes('style')).toContain('translate(0px, 0px)');
    expect(textNode.text()).toContain('文本');
    expect(wrapper.find('[data-testid="drawing-text-editor"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('ignores unknown registered element names', async (): Promise<void> => {
    const wrapper = mount(BDrawing, {
      props: {
        value: createEmptyDrawingData()
      },
      attachTo: document.body
    });
    setElementRect(wrapper.element, { height: 600, left: 0, top: 0, width: 800 });

    await getDrawingExpose(wrapper).createElementFromClientPoint('unknown-node', { x: 400, y: 300 });
    await flushDrawingUpdates();

    expect(wrapper.findAll('[data-testid="drawing-node"]')).toHaveLength(0);
    wrapper.unmount();
  });

  it('emits metadata select target for empty selection without changing drawing data', async (): Promise<void> => {
    const data = createEmptyDrawingData();
    const wrapper = mount(BDrawing, {
      props: {
        value: data
      },
      attachTo: document.body
    });

    await flushDrawingUpdates();

    const selectedPayload = wrapper.emitted('update:select')?.at(-1)?.[0] as DrawingData['metadata'];

    expect(selectedPayload).toEqual({});
    expect(toRaw(selectedPayload)).toBe(data.metadata);
    expect(wrapper.emitted('update:value')).toBeUndefined();
    wrapper.unmount();
  });
});
