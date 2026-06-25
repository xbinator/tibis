/**
 * @file node-click-selection.test.ts
 * @description 验证 BDrawing 节点点击选中后不会让节点消失。
 * @vitest-environment jsdom
 */
import { defineComponent, nextTick } from 'vue';
import type { ComponentPublicInstance } from 'vue';
import { mount, type DOMWrapper, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BDrawing from '@/components/BDrawing/index.vue';
import type { DrawingData, DrawingPoint } from '@/components/BDrawing/types';

/**
 * 带内部选区的测试画板数据。
 */
type DrawingDataWithSelection = DrawingData & {
  /** 内部选区 */
  selection: string[];
};

/**
 * Moveable 拖拽事件测试数据。
 */
interface MoveableDragTestEvent {
  /** 操作目标 */
  target: Element;
  /** Moveable 拖拽总位移 */
  dist: [number, number];
  /** Moveable 基于已有 CSS transform 计算出的绝对 translate */
  translate: [number, number];
}

/**
 * Moveable 拖拽结束测试数据。
 */
interface MoveableDragEndTestEvent {
  /** 操作目标 */
  target: Element;
  /** 最后一帧拖拽数据 */
  lastEvent: MoveableDragTestEvent;
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

vi.mock('vue3-moveable/dist/moveable.js', () => ({
  default: defineComponent({
    name: 'VueMoveableStub',
    props: {
      target: {
        type: Array,
        default: (): Element[] => []
      }
    },
    template: `
      <div v-if="target.length" data-testid="moveable-stub">
        <button
          data-testid="moveable-absolute-drag-group"
          @click="$emit('drag-group', createAbsoluteDragGroupEvent(target))"
        ></button>
        <button
          data-testid="moveable-absolute-drag-group-end"
          @click="$emit('drag-group-end', createAbsoluteDragGroupEndEvent(target))"
        ></button>
      </div>
    `,
    methods: {
      /**
       * 模拟 Moveable 对外暴露的位置刷新方法。
       */
      updateRect(): void {},
      /**
       * 读取目标元素当前 CSS translate。
       * @param target - Moveable 目标元素
       * @returns CSS translate
       */
      readTargetTranslate(target: Element): [number, number] {
        if (!(target instanceof HTMLElement)) {
          return [0, 0];
        }

        const match = target.style.transform.match(/translate\((-?\d+(?:\.\d+)?)px,\s*(-?\d+(?:\.\d+)?)px\)/);
        if (!match) {
          return [0, 0];
        }

        return [Number(match[1]), Number(match[2])];
      },
      /**
       * 创建模拟 Moveable 真实 absolute translate 的拖拽事件。
       * @param targets - Moveable 目标元素列表
       * @returns 多选拖拽事件
       */
      createAbsoluteDragGroupEvent(targets: Element[]): { events: MoveableDragTestEvent[] } {
        return {
          events: targets.map(
            (target: Element): MoveableDragTestEvent => {
              const currentTranslate = this.readTargetTranslate(target);

              return {
                target,
                dist: [40, 20],
                translate: [currentTranslate[0] + 40, currentTranslate[1] + 20]
              };
            }
          )
        };
      },
      /**
       * 创建模拟 Moveable 真实 absolute translate 的拖拽结束事件。
       * @param targets - Moveable 目标元素列表
       * @returns 多选拖拽结束事件
       */
      createAbsoluteDragGroupEndEvent(targets: Element[]): { events: MoveableDragEndTestEvent[] } {
        const dragGroupEvent = this.createAbsoluteDragGroupEvent(targets);

        return {
          events: dragGroupEvent.events.map(
            (event: MoveableDragTestEvent): MoveableDragEndTestEvent => ({
              target: event.target,
              lastEvent: event
            })
          )
        };
      }
    }
  })
}));

/**
 * ResizeObserver 测试替身。
 */
class ResizeObserverMock {
  /**
   * 创建 ResizeObserver 测试替身。
   * @param _callback - 尺寸变化回调
   */
  public constructor(_callback: ResizeObserverCallback) {}

  /**
   * 监听目标元素尺寸。
   */
  public observe(): void {}

  /**
   * 停止监听目标元素。
   */
  public unobserve(): void {}

  /**
   * 断开全部尺寸监听。
   */
  public disconnect(): void {}
}

/**
 * 创建节点点击测试用画板数据。
 * @returns 画板数据
 */
function createNodeClickDrawingData(): DrawingData {
  return {
    elements: [
      {
        id: 'node-1',
        name: 'rect',
        text: '节点',
        position: { x: 80, y: 60 },
        size: { width: 180, height: 72 },
        rotation: 0,
        metadata: {
          source: 'user',
          createdAt: 1
        }
      }
    ],
    viewport: {
      center: { x: 0, y: 0 },
      zoom: 1
    }
  };
}

/**
 * 创建多选节点测试用画板数据。
 * @returns 带两个已选节点的画板数据
 */
function createMultiSelectedDrawingData(): DrawingDataWithSelection {
  return {
    elements: [
      {
        id: 'node-1',
        name: 'rect',
        text: '节点 1',
        position: { x: 80, y: 60 },
        size: { width: 180, height: 72 },
        rotation: 0,
        metadata: {
          source: 'user',
          createdAt: 1
        }
      },
      {
        id: 'node-2',
        name: 'rect',
        text: '节点 2',
        position: { x: 260, y: 120 },
        size: { width: 180, height: 72 },
        rotation: 0,
        metadata: {
          source: 'user',
          createdAt: 2
        }
      }
    ],
    selection: ['node-1', 'node-2'],
    viewport: {
      center: { x: 0, y: 0 },
      zoom: 1
    }
  };
}

/**
 * 创建空画板数据。
 * @returns 画板数据
 */
function createEmptyDrawingData(): DrawingData {
  return {
    elements: [],
    viewport: {
      center: { x: 0, y: 0 },
      zoom: 1
    }
  };
}

/**
 * BDrawing 暴露给页面层的创建命令。
 */
interface BDrawingExpose {
  /** 根据浏览器坐标创建元素 */
  createElementFromClientPoint: (name: string, point: DrawingPoint) => Promise<void>;
}

/**
 * 查找测试节点。
 * @param wrapper - BDrawing 测试包装器
 * @returns 节点包装器
 */
function findNode(wrapper: VueWrapper): DOMWrapper<Element> {
  return wrapper.find<Element>('[data-drawing-element-id="node-1"]');
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
 * 派发带浏览器坐标的指针事件。
 * @param target - 目标对象
 * @param type - 事件类型
 * @param point - 浏览器坐标
 */
async function dispatchPointerEvent(target: Element | Window, type: string, point: { clientX: number; clientY: number }): Promise<void> {
  target.dispatchEvent(
    new MouseEvent(type, {
      bubbles: true,
      clientX: point.clientX,
      clientY: point.clientY
    })
  );
  await nextTick();
}

describe('BDrawing node click selection', () => {
  beforeEach((): void => {
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
    vi.stubGlobal(
      'requestAnimationFrame',
      (callback: FrameRequestCallback): number => {
        callback(0);
        return 1;
      }
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach((): void => {
    vi.unstubAllGlobals();
  });

  it('keeps the clicked node visible and positioned after selection', async (): Promise<void> => {
    const wrapper = mount(BDrawing, {
      props: {
        modelValue: createNodeClickDrawingData()
      },
      attachTo: document.body
    });
    const node = findNode(wrapper);
    const initialTransform = node.attributes('style');

    await dispatchPointerEvent(node.element, 'pointerdown', { clientX: 100, clientY: 100 });
    await dispatchPointerEvent(window, 'pointerup', { clientX: 100, clientY: 100 });
    await nextTick();

    const selectedNode = findNode(wrapper);
    expect(selectedNode.exists()).toBe(true);
    expect(selectedNode.classes()).toContain('is-selected');
    expect(selectedNode.attributes('style')).toBe(initialTransform);
    expect(wrapper.find('[data-testid="moveable-stub"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('creates a visible text node without opening the text editor', async (): Promise<void> => {
    const wrapper = mount(BDrawing, {
      props: {
        modelValue: createEmptyDrawingData()
      },
      attachTo: document.body
    });
    setElementRect(wrapper.element, { height: 600, left: 0, top: 0, width: 800 });

    await getDrawingExpose(wrapper).createElementFromClientPoint('text', { x: 400, y: 300 });
    await nextTick();

    const textNode = wrapper.find('[data-drawing-name="text"]');
    expect(textNode.exists()).toBe(true);
    expect(textNode.text()).toContain('文本');
    expect(wrapper.find('[data-testid="drawing-text-editor"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('does not open the text editor when a node is double clicked', async (): Promise<void> => {
    const wrapper = mount(BDrawing, {
      props: {
        modelValue: createNodeClickDrawingData()
      },
      attachTo: document.body
    });
    const node = findNode(wrapper);

    await dispatchPointerEvent(node.element, 'dblclick', { clientX: 100, clientY: 100 });
    await nextTick();

    expect(findNode(wrapper).text()).toContain('节点');
    expect(wrapper.find('[data-testid="drawing-text-editor"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('keeps multi selected nodes under the pointer when Moveable reports absolute translate', async (): Promise<void> => {
    const wrapper = mount(BDrawing, {
      props: {
        modelValue: createMultiSelectedDrawingData()
      },
      attachTo: document.body
    });
    await nextTick();
    await nextTick();

    await wrapper.find('[data-testid="moveable-absolute-drag-group"]').trigger('click');
    await nextTick();

    expect(findNodeById(wrapper, 'node-1').attributes('style')).toContain('translate(120px, 80px)');
    expect(findNodeById(wrapper, 'node-2').attributes('style')).toContain('translate(300px, 140px)');

    await wrapper.find('[data-testid="moveable-absolute-drag-group-end"]').trigger('click');
    await nextTick();

    expect(findNodeById(wrapper, 'node-1').attributes('style')).toContain('translate(120px, 80px)');
    expect(findNodeById(wrapper, 'node-2').attributes('style')).toContain('translate(300px, 140px)');
    wrapper.unmount();
  });
});
