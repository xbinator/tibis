/**
 * @file drawing-canvas.component.test.ts
 * @description 验证 BDrawing SVG 画布和基础工具栏交互。
 * @vitest-environment jsdom
 */
import { nextTick } from 'vue';
import { mount, type DOMWrapper, type VueWrapper } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BDrawing from '@/components/BDrawing/index.vue';

const selectoMockState = vi.hoisted(() => ({
  instances: [] as Array<{
    handlers: Record<string, (event: unknown) => void>;
    options: Record<string, unknown>;
    destroy: ReturnType<typeof vi.fn>;
  }>
}));
const moveableMockState = vi.hoisted(() => ({
  updateRect: vi.fn()
}));
const resizeObserverMockState = vi.hoisted(() => ({
  callbacks: [] as ResizeObserverCallback[],
  targets: [] as Element[]
}));

/**
 * Selecto 拖拽条件回调。
 */
type SelectoDragCondition = (event: { inputEvent?: { target?: EventTarget | null } }) => boolean;

/**
 * 工具栏工具按钮类型。
 */
type DrawingToolbarTool = 'select' | 'hand' | 'rect' | 'ellipse' | 'diamond' | 'text' | 'connector';

/**
 * 工具栏历史按钮类型。
 */
type DrawingToolbarHistoryAction = 'undo' | 'redo';

/**
 * 工具栏缩放按钮类型。
 */
type DrawingToolbarZoomAction = 'out' | 'in';

/**
 * 工具栏工具按钮在顶部按钮组中的位置。
 */
const DRAWING_TOOLBAR_TOOL_BUTTON_INDEX: Record<DrawingToolbarTool, number> = {
  connector: 6,
  diamond: 4,
  ellipse: 3,
  hand: 1,
  rect: 2,
  select: 0,
  text: 5
};

/**
 * 工具栏历史按钮在历史按钮组中的位置。
 */
const DRAWING_TOOLBAR_HISTORY_BUTTON_INDEX: Record<DrawingToolbarHistoryAction, number> = {
  redo: 1,
  undo: 0
};

/**
 * 工具栏缩放按钮在缩放按钮组中的位置。
 */
const DRAWING_TOOLBAR_ZOOM_BUTTON_INDEX: Record<DrawingToolbarZoomAction, number> = {
  in: 2,
  out: 0
};

/**
 * 查找绘图工具栏中的工具按钮。
 * @param wrapper - BDrawing 测试包装器
 * @param tool - 工具类型
 * @returns 工具按钮包装器
 */
function findDrawingToolbarToolButton(wrapper: VueWrapper, tool: DrawingToolbarTool): DOMWrapper<Element> {
  return wrapper.findAll('.b-drawing-toolbar__group--top button')[DRAWING_TOOLBAR_TOOL_BUTTON_INDEX[tool]];
}

/**
 * 查找绘图工具栏中的历史按钮。
 * @param wrapper - BDrawing 测试包装器
 * @param action - 历史动作
 * @returns 历史按钮包装器
 */
function findDrawingToolbarHistoryButton(wrapper: VueWrapper, action: DrawingToolbarHistoryAction): DOMWrapper<Element> {
  return wrapper.findAll('.b-drawing-toolbar__group--bottom-left button')[DRAWING_TOOLBAR_HISTORY_BUTTON_INDEX[action]];
}

/**
 * 查找绘图工具栏中的缩放按钮。
 * @param wrapper - BDrawing 测试包装器
 * @param action - 缩放动作
 * @returns 缩放按钮包装器
 */
function findDrawingToolbarZoomButton(wrapper: VueWrapper, action: DrawingToolbarZoomAction): DOMWrapper<Element> {
  return wrapper.findAll('.b-drawing-toolbar__group--bottom-left-zoom button')[DRAWING_TOOLBAR_ZOOM_BUTTON_INDEX[action]];
}

/**
 * 查找绘图工具栏中的缩放百分比按钮。
 * @param wrapper - BDrawing 测试包装器
 * @returns 缩放百分比按钮包装器
 */
function findDrawingToolbarZoomValue(wrapper: VueWrapper): DOMWrapper<Element> {
  return wrapper.find('.b-drawing-toolbar__zoom');
}

/**
 * 创建 ResizeObserver 测试替身构造器。
 * @returns ResizeObserver 构造器替身
 */
function createResizeObserverMock(): typeof ResizeObserver {
  function MockResizeObserver(callback: ResizeObserverCallback): ResizeObserver {
    resizeObserverMockState.callbacks.push(callback);

    return {
      observe: (target: Element): void => {
        resizeObserverMockState.targets.push(target);
      },
      unobserve: (target: Element): void => {
        const index = resizeObserverMockState.targets.indexOf(target);
        if (index >= 0) {
          resizeObserverMockState.targets.splice(index, 1);
        }
      },
      disconnect: (): void => {
        const index = resizeObserverMockState.callbacks.indexOf(callback);
        if (index >= 0) {
          resizeObserverMockState.callbacks.splice(index, 1);
        }
      }
    };
  }

  return MockResizeObserver as unknown as typeof ResizeObserver;
}

vi.mock('@/components/BButton/index.vue', () => ({
  default: {
    name: 'BButton',
    inheritAttrs: false,
    props: {
      tooltip: {
        type: String,
        default: ''
      }
    },
    emits: ['click'],
    template: '<button v-bind="$attrs" :aria-label="$attrs[\'aria-label\'] || tooltip" @click="$emit(\'click\')"><slot /></button>'
  }
}));

vi.mock('@/components/BIcon/index.vue', () => ({
  default: {
    name: 'BIcon',
    template: '<span></span>'
  }
}));

vi.mock('vue3-infinite-viewer', () => ({
  VueInfiniteViewer: {
    name: 'VueInfiniteViewer',
    props: {
      displayHorizontalScroll: {
        type: Boolean,
        default: false
      },
      displayVerticalScroll: {
        type: Boolean,
        default: false
      },
      useMouseDrag: {
        type: Boolean,
        default: false
      },
      useWheelPinch: {
        type: Boolean,
        default: false
      },
      useWheelScroll: {
        type: Boolean,
        default: false
      },
      zoom: {
        type: Number,
        default: 1
      }
    },
    emits: ['scroll'],
    template: `
      <div
        class="vue-infinite-viewer-mock"
        data-testid="vue-infinite-viewer-mock"
        :data-use-mouse-drag="String(useMouseDrag)"
        :data-use-wheel-pinch="String(useWheelPinch)"
        :data-use-wheel-scroll="String(useWheelScroll)"
        :data-zoom="String(zoom)"
      >
        <slot />
      </div>
    `
  }
}));

vi.mock('vue3-moveable/dist/moveable.js', () => ({
  default: {
    name: 'VueMoveable',
    props: {
      target: {
        type: Array,
        default: (): Element[] => []
      },
      rotatable: {
        type: Boolean,
        default: false
      },
      zoom: {
        type: Number,
        default: 1
      },
      resizable: {
        type: Boolean,
        default: false
      },
      snappable: {
        type: Boolean,
        default: false
      },
      elementGuidelines: {
        type: Array,
        default: (): Element[] => []
      },
      snapDirections: {
        type: [Boolean, Object],
        default: true
      },
      elementSnapDirections: {
        type: [Boolean, Object],
        default: true
      }
    },
    emits: ['drag', 'drag-end', 'drag-group', 'drag-group-end', 'resize', 'resize-end', 'resize-group', 'resize-group-end', 'rotate-end'],
    methods: {
      /**
       * 模拟 Moveable 重新计算控制框。
       */
      updateRect(): void {
        moveableMockState.updateRect();
      }
    },
    template: `
      <div
        v-if="target.length"
        data-testid="drawing-moveable-mock"
        :data-zoom="String(zoom)"
        :data-resizable="String(resizable)"
        :data-snappable="String(snappable)"
        :data-guideline-count="String(elementGuidelines.length)"
        :data-snap-directions="String(snapDirections)"
        :data-element-snap-directions="String(elementSnapDirections)"
        :data-snap-center="String(snapDirections.center)"
        :data-snap-middle="String(snapDirections.middle)"
        :data-element-snap-center="String(elementSnapDirections.center)"
        :data-element-snap-middle="String(elementSnapDirections.middle)"
      >
        <button
          data-testid="moveable-drag"
          @click="$emit('drag', { target: target[0], translate: [40, 20] })"
        ></button>
        <button
          data-testid="moveable-drag-end"
          @click="$emit('drag-end', { target: target[0], lastEvent: { translate: [40, 20] } })"
        ></button>
        <button
          data-testid="moveable-drag-group"
          @click="$emit('drag-group', { events: target.map((item) => ({ target: item, translate: [40, 20] })) })"
        ></button>
        <button
          data-testid="moveable-drag-group-end"
          @click="$emit('drag-group-end', { events: target.map((item) => ({ target: item, lastEvent: { translate: [40, 20] } })) })"
        ></button>
        <button
          data-testid="moveable-resize-end"
          @click="$emit('resize-end', { target: target[0], width: 240, height: 120, drag: { beforeTranslate: [30, 50] } })"
        ></button>
        <button
          data-testid="moveable-resize"
          @click="$emit('resize', { target: target[0], width: 240, height: 120, drag: { beforeTranslate: [30, 50] } })"
        ></button>
        <button
          data-testid="moveable-resize-group"
          @click="$emit('resize-group', { events: target.map((item) => ({ target: item, width: 240, height: 120, drag: { beforeTranslate: [30, 50] } })) })"
        ></button>
        <button
          data-testid="moveable-resize-group-end"
          @click="$emit('resize-group-end', { events: target.map((item) => ({ target: item, width: 240, height: 120, drag: { beforeTranslate: [30, 50] } })) })"
        ></button>
        <button v-if="rotatable" data-testid="moveable-rotate-end" @click="$emit('rotate-end', { target: target[0], beforeRotate: -30 })"></button>
      </div>
    `
  }
}));

vi.mock('selecto', () => ({
  default: class MockSelecto {
    public handlers: Record<string, (event: unknown) => void> = {};

    public destroy = vi.fn();

    public options: Record<string, unknown>;

    public constructor(options: Record<string, unknown>) {
      this.options = options;
      selectoMockState.instances.push(this);
    }

    /**
     * 注册 Selecto 事件。
     * @param name - 事件名
     * @param handler - 事件处理器
     * @returns 当前实例
     */
    public on(name: string, handler: (event: unknown) => void): this {
      this.handlers[name] = handler;
      return this;
    }
  }
}));

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

/**
 * 派发滚轮事件。
 * @param target - 目标元素
 * @param options - 滚轮事件参数
 */
async function dispatchWheelEvent(target: Element, options: WheelEventInit): Promise<void> {
  target.dispatchEvent(
    new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      ...options
    })
  );
  await nextTick();
}

/**
 * 设置画布测试尺寸。
 * @param element - 画布元素
 * @param size - 画布尺寸
 */
function setCanvasRect(element: Element, size: { width: number; height: number }): void {
  const getRect = (): DOMRect =>
    ({
      bottom: size.height,
      height: size.height,
      left: 0,
      right: size.width,
      top: 0,
      width: size.width,
      x: 0,
      y: 0,
      toJSON: (): Record<string, number> => ({})
    } as DOMRect);

  element.getBoundingClientRect = getRect;
  const root = element.closest('.b-drawing');
  if (root) {
    root.getBoundingClientRect = getRect;
  }
}

/**
 * 解析 SVG viewBox 数值。
 * @param value - viewBox 属性值
 * @returns viewBox 数字列表
 */
function parseViewBox(value: string | undefined): number[] {
  return (value ?? '').split(' ').map((item) => Number(item));
}

/**
 * 触发最近一个 Selecto mock 实例的 selectEnd 事件。
 * @param targets - 选中的 DOM 目标
 * @param shiftKey - 是否追加选择
 */
async function emitSelectoEnd(targets: Element[], shiftKey = false): Promise<void> {
  const instance = selectoMockState.instances.at(-1);
  instance?.handlers.selectEnd?.({
    selected: targets,
    inputEvent: {
      shiftKey
    }
  });
  await nextTick();
}

/**
 * 触发 ResizeObserver mock 回调。
 */
async function emitCanvasResize(): Promise<void> {
  const entries = resizeObserverMockState.targets.map(
    (target): ResizeObserverEntry =>
      ({
        target,
        contentRect: target.getBoundingClientRect()
      } as ResizeObserverEntry)
  );

  for (const callback of resizeObserverMockState.callbacks) {
    callback(entries, {} as ResizeObserver);
  }
  await nextTick();
}

/**
 * 等待画布首屏尺寸稳定检查完成。
 */
async function flushViewportReadyCheck(): Promise<void> {
  await new Promise<void>((resolve) => {
    requestAnimationFrame((): void => {
      resolve();
    });
  });
  await new Promise<void>((resolve) => {
    requestAnimationFrame((): void => {
      resolve();
    });
  });
  await nextTick();
}

/**
 * 重置第三方 mock 状态。
 */
function resetMockState(): void {
  selectoMockState.instances.length = 0;
  resizeObserverMockState.callbacks.length = 0;
  resizeObserverMockState.targets.length = 0;
  moveableMockState.updateRect.mockClear();
  vi.stubGlobal('ResizeObserver', createResizeObserverMock());
}

describe('BDrawing', (): void => {
  beforeEach((): void => {
    resetMockState();
  });

  it('renders an empty drawing workbench', (): void => {
    const wrapper = mount(BDrawing);

    expect(wrapper.find('.b-drawing').exists()).toBe(true);
    expect(wrapper.find('[data-testid="drawing-infinite-viewer"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="vue-infinite-viewer-mock"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="drawing-canvas"]').exists()).toBe(true);
    expect(wrapper.text()).not.toContain('开始画图');
    expect(wrapper.find('[data-testid="drawing-add-process"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="drawing-delete"]').exists()).toBe(false);
  });

  it('keeps SVG hidden until the initial rendered canvas size stabilizes', async (): Promise<void> => {
    const wrapper = mount(BDrawing);
    const canvas = wrapper.find('[data-testid="drawing-canvas"]');

    await nextTick();

    expect(wrapper.find('.b-drawing-canvas__svg').classes()).toContain('is-measuring');

    setCanvasRect(canvas.element, { width: 800, height: 600 });
    await emitCanvasResize();

    expect(wrapper.find('.b-drawing-canvas__svg').attributes('viewBox')).toBe('-400 -300 800 600');
    expect(wrapper.find('.b-drawing-canvas__svg').classes()).toContain('is-measuring');

    setCanvasRect(canvas.element, { width: 1000, height: 500 });
    await emitCanvasResize();

    expect(wrapper.find('.b-drawing-canvas__svg').attributes('viewBox')).toBe('-500 -250 1000 500');
    expect(wrapper.find('.b-drawing-canvas__svg').classes()).toContain('is-measuring');

    await flushViewportReadyCheck();

    expect(wrapper.find('.b-drawing-canvas__svg').classes()).not.toContain('is-measuring');
  });

  it('selects the process tool and places a node on canvas click', async (): Promise<void> => {
    const wrapper = mount(BDrawing);

    await wrapper.trigger('keydown', { key: 'p' });
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');

    expect(wrapper.findAll('[data-testid="drawing-node"]')).toHaveLength(1);
    expect(wrapper.find('[data-testid="drawing-node"]').attributes('data-drawing-element-id')).toBe('drawing-node-1');
    expect(wrapper.text()).toContain('流程节点');
  });

  it('returns to the select tool after creating one process node', async (): Promise<void> => {
    const wrapper = mount(BDrawing);

    await wrapper.trigger('keydown', { key: 'p' });
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');

    expect(findDrawingToolbarToolButton(wrapper, 'select').classes()).toContain('is-active');
    expect(wrapper.findAll('[data-testid="drawing-node"]')).toHaveLength(1);
    expect(wrapper.findAll('[data-testid="drawing-edge"]')).toHaveLength(0);
  });

  it('undoes and redoes manual node creation', async (): Promise<void> => {
    const wrapper = mount(BDrawing);

    await wrapper.trigger('keydown', { key: 'p' });
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');
    await findDrawingToolbarHistoryButton(wrapper, 'undo').trigger('click');

    expect(wrapper.findAll('[data-testid="drawing-node"]')).toHaveLength(0);

    await findDrawingToolbarHistoryButton(wrapper, 'redo').trigger('click');

    expect(wrapper.findAll('[data-testid="drawing-node"]')).toHaveLength(1);
  });

  it('disables history toolbar actions when undo or redo is unavailable', async (): Promise<void> => {
    const wrapper = mount(BDrawing);
    const undoButton = findDrawingToolbarHistoryButton(wrapper, 'undo');
    const redoButton = findDrawingToolbarHistoryButton(wrapper, 'redo');

    expect(undoButton.attributes('disabled')).toBeDefined();
    expect(redoButton.attributes('disabled')).toBeDefined();

    await wrapper.trigger('keydown', { key: 'p' });
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');

    expect(findDrawingToolbarHistoryButton(wrapper, 'undo').attributes('disabled')).toBeUndefined();
    expect(findDrawingToolbarHistoryButton(wrapper, 'redo').attributes('disabled')).toBeDefined();

    await findDrawingToolbarHistoryButton(wrapper, 'undo').trigger('click');

    expect(findDrawingToolbarHistoryButton(wrapper, 'undo').attributes('disabled')).toBeDefined();
    expect(findDrawingToolbarHistoryButton(wrapper, 'redo').attributes('disabled')).toBeUndefined();
  });

  it('selects a node and deletes it with the keyboard shortcut', async (): Promise<void> => {
    const wrapper = mount(BDrawing);

    await wrapper.trigger('keydown', { key: 'p' });
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');
    await wrapper.find('[data-testid="drawing-node"]').trigger('pointerdown');
    await wrapper.trigger('keydown', { key: 'Delete' });

    expect(wrapper.findAll('[data-testid="drawing-node"]')).toHaveLength(0);
  });

  it('switches tools with Drawnix-style keyboard shortcuts', async (): Promise<void> => {
    const wrapper = mount(BDrawing, {
      attachTo: document.body
    });

    await wrapper.trigger('keydown', { key: 'p' });
    expect(wrapper.find('[data-testid="drawing-canvas"]').classes()).toContain('is-tool-process');

    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');
    expect(wrapper.findAll('[data-testid="drawing-node"]')).toHaveLength(1);

    await wrapper.trigger('keydown', { key: 'Escape' });
    expect(findDrawingToolbarToolButton(wrapper, 'select').classes()).toContain('is-active');

    await wrapper.find('[data-testid="drawing-node"]').trigger('pointerdown');
    await wrapper.trigger('keydown', { key: 'Delete' });
    expect(wrapper.findAll('[data-testid="drawing-node"]')).toHaveLength(0);

    wrapper.unmount();
  });

  it('updates zoom through toolbar buttons', async (): Promise<void> => {
    const wrapper = mount(BDrawing);

    expect(findDrawingToolbarZoomValue(wrapper).text()).toBe('100%');
    await findDrawingToolbarZoomButton(wrapper, 'in').trigger('click');

    expect(findDrawingToolbarZoomValue(wrapper).text()).toBe('110%');
  });

  it('resets zoom to 100% when clicking the toolbar zoom value', async (): Promise<void> => {
    const wrapper = mount(BDrawing);

    await findDrawingToolbarZoomButton(wrapper, 'in').trigger('click');
    expect(findDrawingToolbarZoomValue(wrapper).text()).toBe('110%');

    await findDrawingToolbarZoomValue(wrapper).trigger('click');

    expect(findDrawingToolbarZoomValue(wrapper).text()).toBe('100%');
  });

  it('disables toolbar zoom buttons at viewport zoom limits', async (): Promise<void> => {
    const wrapper = mount(BDrawing);
    const zoomInButton = findDrawingToolbarZoomButton(wrapper, 'in');
    const zoomOutButton = findDrawingToolbarZoomButton(wrapper, 'out');

    expect(zoomInButton.attributes('disabled')).toBeUndefined();
    expect(zoomOutButton.attributes('disabled')).toBeUndefined();

    for (let index = 0; index < 10; index += 1) {
      await zoomInButton.trigger('click');
    }

    expect(findDrawingToolbarZoomValue(wrapper).text()).toBe('200%');
    expect(zoomInButton.attributes('disabled')).toBeDefined();

    await findDrawingToolbarZoomValue(wrapper).trigger('click');

    for (let index = 0; index < 6; index += 1) {
      await zoomOutButton.trigger('click');
    }

    expect(findDrawingToolbarZoomValue(wrapper).text()).toBe('40%');
    expect(zoomOutButton.attributes('disabled')).toBeDefined();
  });

  it('toggles the minimap from the lower-left toolbar area', async (): Promise<void> => {
    const wrapper = mount(BDrawing);

    expect(wrapper.find('.b-drawing-minimap__panel').exists()).toBe(false);

    await wrapper.find('.b-drawing-minimap__toggle').trigger('click');

    expect(wrapper.find('.b-drawing-minimap__panel').exists()).toBe(true);
  });

  it('renders drawing elements and the viewport frame in the minimap', async (): Promise<void> => {
    const wrapper = mount(BDrawing);

    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');
    await wrapper.find('.b-drawing-minimap__toggle').trigger('click');

    expect(wrapper.find('.b-drawing-minimap__shape').exists()).toBe(true);
    expect(wrapper.find('.b-drawing-minimap__viewport').exists()).toBe(true);
  });

  it('recenters the drawing viewport when clicking the minimap', async (): Promise<void> => {
    const wrapper = mount(BDrawing);

    await wrapper.find('.b-drawing-minimap__toggle').trigger('click');

    const minimap = wrapper.find('.b-drawing-minimap__svg');
    minimap.element.getBoundingClientRect = (): DOMRect =>
      ({
        bottom: 120,
        height: 120,
        left: 0,
        right: 168,
        top: 0,
        width: 168,
        x: 0,
        y: 0,
        toJSON: (): Record<string, number> => ({})
      } as DOMRect);
    const initialViewBox = wrapper.find('.b-drawing-canvas__svg').attributes('viewBox');

    await dispatchPointerEvent(minimap.element, 'pointerdown', { clientX: 168, clientY: 120 });

    expect(wrapper.find('.b-drawing-canvas__svg').attributes('viewBox')).not.toBe(initialViewBox);
  });

  it('zooms the drawing viewport with modified wheel events', async (): Promise<void> => {
    const wrapper = mount(BDrawing);
    const canvas = wrapper.find('[data-testid="drawing-canvas"]');

    await dispatchWheelEvent(canvas.element, { ctrlKey: true, deltaY: -100 });

    expect(findDrawingToolbarZoomValue(wrapper).text()).toBe('110%');

    await dispatchWheelEvent(canvas.element, { metaKey: true, deltaY: 100 });

    expect(findDrawingToolbarZoomValue(wrapper).text()).toBe('100%');
  });

  it('keeps the wheel pointer anchored while zooming the viewport', async (): Promise<void> => {
    const wrapper = mount(BDrawing);
    const canvas = wrapper.find('[data-testid="drawing-canvas"]');

    setCanvasRect(canvas.element, { width: 1200, height: 720 });
    await dispatchWheelEvent(canvas.element, { clientX: 900, clientY: 540, ctrlKey: true, deltaY: -100 });

    const [minX, minY, width, height] = parseViewBox(wrapper.find('.b-drawing-canvas__svg').attributes('viewBox'));

    expect(width).toBeCloseTo(1200 / 1.1, 5);
    expect(height).toBeCloseTo(720 / 1.1, 5);
    expect(minX + width * 0.75).toBeCloseTo(300, 5);
    expect(minY + height * 0.75).toBeCloseTo(180, 5);
  });

  it('pans the infinite canvas with the hand tool without moving element geometry', async (): Promise<void> => {
    const wrapper = mount(BDrawing);
    const canvas = wrapper.find('[data-testid="drawing-canvas"]');

    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
    await canvas.trigger('pointerdown');
    await canvas.trigger('pointerup');
    await findDrawingToolbarToolButton(wrapper, 'hand').trigger('click');
    setCanvasRect(canvas.element, { width: 1200, height: 720 });

    const initialTransform = wrapper.find('[data-testid="drawing-node"]').attributes('transform');
    await dispatchPointerEvent(canvas.element, 'pointerdown', { clientX: 600, clientY: 360 });
    await dispatchPointerEvent(window, 'pointermove', { clientX: 720, clientY: 420 });
    await dispatchPointerEvent(window, 'pointerup', { clientX: 720, clientY: 420 });

    const [minX, minY] = parseViewBox(wrapper.find('.b-drawing-canvas__svg').attributes('viewBox'));

    expect(minX).toBeCloseTo(-720, 5);
    expect(minY).toBeCloseTo(-420, 5);
    expect(wrapper.find('[data-testid="drawing-node"]').attributes('transform')).toBe(initialTransform);
  });

  it('keeps select-mode empty drags from panning the infinite canvas', async (): Promise<void> => {
    const wrapper = mount(BDrawing);
    const canvas = wrapper.find('[data-testid="drawing-canvas"]');

    setCanvasRect(canvas.element, { width: 1200, height: 720 });
    await dispatchPointerEvent(canvas.element, 'pointerdown', { clientX: 600, clientY: 360 });
    await dispatchPointerEvent(window, 'pointermove', { clientX: 720, clientY: 420 });
    await dispatchPointerEvent(window, 'pointerup', { clientX: 720, clientY: 420 });

    const [minX, minY] = parseViewBox(wrapper.find('.b-drawing-canvas__svg').attributes('viewBox'));

    expect(minX).toBeCloseTo(-600, 5);
    expect(minY).toBeCloseTo(-360, 5);
  });

  it('pans the infinite canvas with ordinary wheel events without changing zoom', async (): Promise<void> => {
    const wrapper = mount(BDrawing);
    const canvas = wrapper.find('[data-testid="drawing-canvas"]');

    setCanvasRect(canvas.element, { width: 1200, height: 720 });
    await dispatchWheelEvent(canvas.element, { deltaX: 120, deltaY: 60 });

    const [minX, minY] = parseViewBox(wrapper.find('.b-drawing-canvas__svg').attributes('viewBox'));

    expect(findDrawingToolbarZoomValue(wrapper).text()).toBe('100%');
    expect(minX).toBeCloseTo(-480, 5);
    expect(minY).toBeCloseTo(-300, 5);
  });

  it('creates a rectangle with default size from the rect tool click', async (): Promise<void> => {
    const wrapper = mount(BDrawing);

    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');

    const node = wrapper.find('[data-testid="drawing-node"]');
    expect(node.attributes('data-drawing-shape')).toBe('rect');
    expect(node.text()).toContain('矩形');
    expect(findDrawingToolbarToolButton(wrapper, 'select').classes()).toContain('is-active');
  });

  it('does not leave Moveable controls visible while a creation tool is active', async (): Promise<void> => {
    const wrapper = mount(BDrawing);

    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');
    await wrapper.find('[data-testid="drawing-node"]').trigger('pointerdown');

    expect(wrapper.find('[data-testid="drawing-moveable-mock"]').exists()).toBe(true);

    await findDrawingToolbarToolButton(wrapper, 'ellipse').trigger('click');

    expect(wrapper.find('[data-testid="drawing-moveable-mock"]').exists()).toBe(false);
  });

  it('disables Selecto while a creation tool is active', async (): Promise<void> => {
    const wrapper = mount(BDrawing);
    await nextTick();

    const initialSelecto = selectoMockState.instances.at(-1);

    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');

    expect(initialSelecto?.destroy).toHaveBeenCalledTimes(1);
    expect(selectoMockState.instances).toHaveLength(1);

    await findDrawingToolbarToolButton(wrapper, 'select').trigger('click');

    expect(selectoMockState.instances).toHaveLength(2);
  });

  it('does not start Selecto from Moveable controls', async (): Promise<void> => {
    mount(BDrawing);
    await nextTick();

    const control = document.createElement('button');
    control.className = 'moveable-control';
    const condition = selectoMockState.instances.at(-1)?.options.dragCondition as SelectoDragCondition;

    expect(condition({ inputEvent: { target: control } })).toBe(false);
  });

  it('does not start Selecto from selected drawing nodes', async (): Promise<void> => {
    const wrapper = mount(BDrawing);

    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');
    await wrapper.find('[data-testid="drawing-node"]').trigger('pointerdown');

    const condition = selectoMockState.instances.at(-1)?.options.dragCondition as SelectoDragCondition;
    expect(condition({ inputEvent: { target: wrapper.find('[data-testid="drawing-node"]').element } })).toBe(false);
  });

  it('creates a custom sized process node by dragging on the canvas', async (): Promise<void> => {
    const wrapper = mount(BDrawing);
    const canvas = wrapper.find('[data-testid="drawing-canvas"]');
    canvas.element.getBoundingClientRect = (): DOMRect =>
      ({
        bottom: 720,
        height: 720,
        left: 0,
        right: 1200,
        top: 0,
        width: 1200,
        x: 0,
        y: 0,
        toJSON: (): Record<string, number> => ({})
      } as DOMRect);

    await wrapper.trigger('keydown', { key: 'p' });
    await dispatchPointerEvent(canvas.element, 'pointerdown', { clientX: 100, clientY: 100 });
    await dispatchPointerEvent(canvas.element, 'pointermove', { clientX: 300, clientY: 180 });
    await dispatchPointerEvent(canvas.element, 'pointerup', { clientX: 300, clientY: 180 });

    const rect = wrapper.find('[data-testid="drawing-shape-rect"]');
    expect(rect.attributes('width')).toBe('200');
    expect(rect.attributes('height')).toBe('80');
    expect(findDrawingToolbarToolButton(wrapper, 'select').classes()).toContain('is-active');
  });

  it('shows a preview while dragging a shape', async (): Promise<void> => {
    const wrapper = mount(BDrawing);

    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointermove');

    expect(wrapper.find('[data-testid="drawing-create-preview"]').exists()).toBe(true);

    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');

    expect(wrapper.find('[data-testid="drawing-create-preview"]').exists()).toBe(false);
  });

  it('creates a custom sized ellipse by dragging on the canvas', async (): Promise<void> => {
    const wrapper = mount(BDrawing);
    const canvas = wrapper.find('[data-testid="drawing-canvas"]');
    canvas.element.getBoundingClientRect = (): DOMRect =>
      ({
        bottom: 720,
        height: 720,
        left: 0,
        right: 1200,
        top: 0,
        width: 1200,
        x: 0,
        y: 0,
        toJSON: (): Record<string, number> => ({})
      } as DOMRect);

    await findDrawingToolbarToolButton(wrapper, 'ellipse').trigger('click');
    await dispatchPointerEvent(canvas.element, 'pointerdown', { clientX: 100, clientY: 100 });
    await dispatchPointerEvent(canvas.element, 'pointermove', { clientX: 260, clientY: 220 });
    await dispatchPointerEvent(canvas.element, 'pointerup', { clientX: 260, clientY: 220 });

    const node = wrapper.find('[data-testid="drawing-node"]');
    const ellipse = wrapper.find('[data-testid="drawing-shape-ellipse"]');
    expect(node.attributes('data-drawing-shape')).toBe('ellipse');
    expect(ellipse.attributes('rx')).toBe('80');
    expect(ellipse.attributes('ry')).toBe('60');
  });

  it('switches to the diamond tool with the D shortcut', async (): Promise<void> => {
    const wrapper = mount(BDrawing, {
      attachTo: document.body
    });

    await wrapper.trigger('keydown', { key: 'd' });

    expect(findDrawingToolbarToolButton(wrapper, 'diamond').classes()).toContain('is-active');

    wrapper.unmount();
  });

  it('shows Moveable controls for the selected element', async (): Promise<void> => {
    const wrapper = mount(BDrawing);

    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');
    await wrapper.find('[data-testid="drawing-node"]').trigger('pointerdown');

    expect(wrapper.find('[data-testid="drawing-moveable-mock"]').exists()).toBe(true);
  });

  it('syncs Moveable visual zoom with the drawing viewport zoom', async (): Promise<void> => {
    const wrapper = mount(BDrawing);
    const canvas = wrapper.find('[data-testid="drawing-canvas"]');

    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
    await canvas.trigger('pointerdown');
    await canvas.trigger('pointerup');
    await wrapper.find('[data-testid="drawing-node"]').trigger('pointerdown');
    await dispatchWheelEvent(canvas.element, { clientX: 600, clientY: 360, ctrlKey: true, deltaY: -100 });

    expect(wrapper.find('[data-testid="drawing-moveable-mock"]').attributes('data-zoom')).toBe('1.1');
  });

  it('updates Moveable target rect after viewport zoom changes selected node layout', async (): Promise<void> => {
    const wrapper = mount(BDrawing);
    const canvas = wrapper.find('[data-testid="drawing-canvas"]');

    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
    await canvas.trigger('pointerdown');
    await canvas.trigger('pointerup');
    await wrapper.find('[data-testid="drawing-node"]').trigger('pointerdown');
    moveableMockState.updateRect.mockClear();
    await dispatchWheelEvent(canvas.element, { clientX: 600, clientY: 360, ctrlKey: true, deltaY: -100 });
    await nextTick();
    await nextTick();

    expect(moveableMockState.updateRect).toHaveBeenCalled();
  });

  it('updates Moveable target rect after the drawing viewport size changes', async (): Promise<void> => {
    const wrapper = mount(BDrawing);
    const canvas = wrapper.find('[data-testid="drawing-canvas"]');

    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
    await canvas.trigger('pointerdown');
    await canvas.trigger('pointerup');
    await wrapper.find('[data-testid="drawing-node"]').trigger('pointerdown');
    await nextTick();
    moveableMockState.updateRect.mockClear();

    setCanvasRect(canvas.element, { width: 1000, height: 500 });
    await emitCanvasResize();
    await nextTick();

    expect(moveableMockState.updateRect).toHaveBeenCalled();
  });

  it('disables Moveable snapping for multi selection', async (): Promise<void> => {
    const wrapper = mount(BDrawing);

    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');
    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');
    await findDrawingToolbarToolButton(wrapper, 'select').trigger('click');

    const nodes = wrapper.findAll('[data-testid="drawing-node"]');
    await emitSelectoEnd([nodes[0].element, nodes[1].element]);
    await nextTick();

    expect(wrapper.find('[data-testid="drawing-moveable-mock"]').attributes('data-snappable')).toBe('false');
  });

  it('keeps Moveable resize enabled for multi selection', async (): Promise<void> => {
    const wrapper = mount(BDrawing);

    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');
    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');
    await findDrawingToolbarToolButton(wrapper, 'select').trigger('click');

    const nodes = wrapper.findAll('[data-testid="drawing-node"]');
    await emitSelectoEnd([nodes[0].element, nodes[1].element]);
    await nextTick();

    expect(wrapper.find('[data-testid="drawing-moveable-mock"]').attributes('data-resizable')).toBe('true');
  });

  it('commits Moveable group drag end for multi selection', async (): Promise<void> => {
    const wrapper = mount(BDrawing);

    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');
    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');
    await findDrawingToolbarToolButton(wrapper, 'select').trigger('click');

    const nodes = wrapper.findAll('[data-testid="drawing-node"]');
    const initialTransforms = nodes.map((node) => node.attributes('transform'));
    await emitSelectoEnd([nodes[0].element, nodes[1].element]);
    await nextTick();
    await wrapper.find('[data-testid="moveable-drag-group-end"]').trigger('click');

    const movedNodes = wrapper.findAll('[data-testid="drawing-node"]');
    expect(movedNodes.map((node) => node.attributes('transform'))).not.toEqual(initialTransforms);
    expect(movedNodes[0].attributes('transform')).toBe('translate(-50, -16)');
    expect(movedNodes[1].attributes('transform')).toBe('translate(-50, -16)');
  });

  it('commits Moveable group resize end for multi selection', async (): Promise<void> => {
    const wrapper = mount(BDrawing);

    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');
    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');
    await findDrawingToolbarToolButton(wrapper, 'select').trigger('click');

    const nodes = wrapper.findAll('[data-testid="drawing-node"]');
    await emitSelectoEnd([nodes[0].element, nodes[1].element]);
    await nextTick();
    await wrapper.find('[data-testid="moveable-resize-group-end"]').trigger('click');

    expect(wrapper.findAll('[data-testid="drawing-shape-rect"]').map((shape) => shape.attributes('width'))).toEqual(['240', '240']);
    expect(wrapper.findAll('[data-testid="drawing-shape-rect"]').map((shape) => shape.attributes('height'))).toEqual(['120', '120']);
  });

  it('provides other nodes as Moveable element snap guidelines for single selection', async (): Promise<void> => {
    const wrapper = mount(BDrawing);

    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');
    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');

    const nodes = wrapper.findAll('[data-testid="drawing-node"]');
    await dispatchPointerEvent(nodes[0].element, 'pointerdown', { clientX: 100, clientY: 100 });
    await dispatchPointerEvent(window, 'pointerup', { clientX: 100, clientY: 100 });
    await nextTick();

    const moveable = wrapper.find('[data-testid="drawing-moveable-mock"]');
    expect(moveable.attributes('data-snappable')).toBe('true');
    expect(moveable.attributes('data-guideline-count')).toBe('1');
    expect(moveable.attributes('data-snap-center')).toBe('true');
    expect(moveable.attributes('data-snap-middle')).toBe('true');
    expect(moveable.attributes('data-element-snap-center')).toBe('true');
    expect(moveable.attributes('data-element-snap-middle')).toBe('true');
  });

  it('commits Moveable drag end as one undoable geometry update', async (): Promise<void> => {
    const wrapper = mount(BDrawing);

    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');
    await wrapper.find('[data-testid="drawing-node"]').trigger('pointerdown');
    await wrapper.find('[data-testid="moveable-drag-end"]').trigger('click');

    expect(wrapper.find('[data-testid="drawing-node"]').attributes('transform')).toBe('translate(-50, -16)');

    await findDrawingToolbarHistoryButton(wrapper, 'undo').trigger('click');

    expect(wrapper.find('[data-testid="drawing-node"]').attributes('transform')).toBe('translate(-90, -36)');
  });

  it('previews Moveable drag before the drag end event commits state', async (): Promise<void> => {
    const wrapper = mount(BDrawing);

    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');
    await wrapper.find('[data-testid="drawing-node"]').trigger('pointerdown');
    await wrapper.find('[data-testid="moveable-drag"]').trigger('click');

    expect(wrapper.find('[data-testid="drawing-node"]').attributes('transform')).toBe('translate(-50, -16)');
  });

  it('drags an unselected node and shows Moveable after pointerup', async (): Promise<void> => {
    const wrapper = mount(BDrawing);

    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');
    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');
    await dispatchPointerEvent(wrapper.findAll('[data-testid="drawing-node"]')[0].element, 'pointerdown', { clientX: 100, clientY: 100 });

    expect(wrapper.find('[data-testid="drawing-moveable-mock"]').exists()).toBe(false);

    await dispatchPointerEvent(window, 'pointermove', { clientX: 140, clientY: 120 });

    expect(wrapper.findAll('[data-testid="drawing-node"]')[0].classes()).not.toContain('is-selected');
    expect(wrapper.find('[data-testid="drawing-moveable-mock"]').exists()).toBe(false);
    expect(wrapper.findAll('[data-testid="drawing-node"]')[0].attributes('transform')).toBe('translate(-50, -16)');

    await dispatchPointerEvent(window, 'pointerup', { clientX: 140, clientY: 120 });
    await nextTick();

    expect(wrapper.findAll('[data-testid="drawing-node"]')[0].classes()).toContain('is-selected');
    expect(wrapper.find('[data-testid="drawing-moveable-mock"]').exists()).toBe(true);
  });

  it('stops direct node dragging after pointerup', async (): Promise<void> => {
    const wrapper = mount(BDrawing);

    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await dispatchPointerEvent(wrapper.find('[data-testid="drawing-node"]').element, 'pointerdown', { clientX: 100, clientY: 100 });
    await dispatchPointerEvent(window, 'pointermove', { clientX: 140, clientY: 120 });
    await dispatchPointerEvent(window, 'pointerup', { clientX: 140, clientY: 120 });
    await dispatchPointerEvent(window, 'pointermove', { clientX: 220, clientY: 180 });

    expect(wrapper.find('[data-testid="drawing-node"]').attributes('transform')).toBe('translate(-50, -16)');
  });

  it('commits direct node drag at the last preview position instead of the pointerup position', async (): Promise<void> => {
    const wrapper = mount(BDrawing);

    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await dispatchPointerEvent(wrapper.find('[data-testid="drawing-node"]').element, 'pointerdown', { clientX: 100, clientY: 100 });
    await dispatchPointerEvent(window, 'pointermove', { clientX: 140, clientY: 120 });
    await dispatchPointerEvent(window, 'pointerup', { clientX: 220, clientY: 180 });

    expect(wrapper.find('[data-testid="drawing-node"]').attributes('transform')).toBe('translate(-50, -16)');
  });

  it('maps direct node dragging through the rendered canvas scale', async (): Promise<void> => {
    const wrapper = mount(BDrawing);

    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    setCanvasRect(wrapper.find('[data-testid="drawing-canvas"]').element, { width: 600, height: 360 });
    await dispatchPointerEvent(wrapper.find('[data-testid="drawing-node"]').element, 'pointerdown', { clientX: 100, clientY: 100 });
    await dispatchPointerEvent(window, 'pointermove', { clientX: 160, clientY: 130 });

    expect(wrapper.find('[data-testid="drawing-node"]').attributes('transform')).toBe('translate(-30, -6)');
  });

  it('commits Moveable resize end events without exposing rotate controls', async (): Promise<void> => {
    const wrapper = mount(BDrawing);

    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');
    await wrapper.find('[data-testid="drawing-node"]').trigger('pointerdown');
    await wrapper.find('[data-testid="moveable-resize-end"]').trigger('click');

    expect(wrapper.find('[data-testid="drawing-shape-rect"]').attributes('width')).toBe('240');
    expect(wrapper.find('[data-testid="drawing-shape-rect"]').attributes('height')).toBe('120');
    expect(wrapper.find('[data-testid="moveable-rotate-end"]').exists()).toBe(false);
  });

  it('keeps Moveable resize dimensions in board units after viewport zoom', async (): Promise<void> => {
    const wrapper = mount(BDrawing);
    const canvas = wrapper.find('[data-testid="drawing-canvas"]');

    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
    await canvas.trigger('pointerdown');
    await canvas.trigger('pointerup');
    await wrapper.find('[data-testid="drawing-node"]').trigger('pointerdown');
    await dispatchWheelEvent(canvas.element, { clientX: 600, clientY: 360, ctrlKey: true, deltaY: -100 });
    await wrapper.find('[data-testid="moveable-resize-end"]').trigger('click');

    expect(wrapper.find('[data-testid="drawing-shape-rect"]').attributes('width')).toBe('240');
    expect(wrapper.find('[data-testid="drawing-shape-rect"]').attributes('height')).toBe('120');
  });

  it('previews Moveable resize before the resize end event commits state', async (): Promise<void> => {
    const wrapper = mount(BDrawing);

    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');
    await nextTick();
    await wrapper.find('[data-testid="moveable-resize"]').trigger('click');

    expect(wrapper.find('[data-testid="drawing-node"]').attributes('transform')).toBe('translate(-60, 14)');
    expect(wrapper.find('[data-testid="drawing-shape-rect"]').attributes('width')).toBe('240');
    expect(wrapper.find('[data-testid="drawing-shape-rect"]').attributes('height')).toBe('120');
  });

  it('replaces the selection from a Selecto selectEnd event', async (): Promise<void> => {
    const wrapper = mount(BDrawing);

    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');
    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');
    await findDrawingToolbarToolButton(wrapper, 'select').trigger('click');

    const nodes = wrapper.findAll('[data-testid="drawing-node"]');
    await emitSelectoEnd([nodes[0].element]);

    expect(nodes[0].classes()).toContain('is-selected');
    expect(nodes[1].classes()).not.toContain('is-selected');
  });

  it('appends to the current selection when Selecto ends with Shift pressed', async (): Promise<void> => {
    const wrapper = mount(BDrawing);

    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');
    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');
    await findDrawingToolbarToolButton(wrapper, 'select').trigger('click');

    const nodes = wrapper.findAll('[data-testid="drawing-node"]');
    await emitSelectoEnd([nodes[0].element]);
    await emitSelectoEnd([nodes[1].element], true);

    expect(nodes[0].classes()).toContain('is-selected');
    expect(nodes[1].classes()).toContain('is-selected');
  });

  it('keeps selection changes out of the undo stack', async (): Promise<void> => {
    const wrapper = mount(BDrawing);

    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');
    await findDrawingToolbarToolButton(wrapper, 'select').trigger('click');
    await emitSelectoEnd([wrapper.find('[data-testid="drawing-node"]').element]);
    await findDrawingToolbarHistoryButton(wrapper, 'undo').trigger('click');

    expect(wrapper.findAll('[data-testid="drawing-node"]')).toHaveLength(0);
  });

  it('creates a connector by clicking two shapes with the connector tool', async (): Promise<void> => {
    const wrapper = mount(BDrawing);

    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');
    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');
    await findDrawingToolbarToolButton(wrapper, 'connector').trigger('click');

    const nodes = wrapper.findAll('[data-testid="drawing-node"]');
    await nodes[0].trigger('pointerdown');
    await nodes[1].trigger('pointerdown');

    expect(wrapper.findAll('[data-testid="drawing-connector"]')).toHaveLength(1);
  });

  it('updates connector path when a connected shape moves', async (): Promise<void> => {
    const wrapper = mount(BDrawing);

    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');
    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');
    await findDrawingToolbarToolButton(wrapper, 'connector').trigger('click');

    const nodes = wrapper.findAll('[data-testid="drawing-node"]');
    await nodes[0].trigger('pointerdown');
    await nodes[1].trigger('pointerdown');

    const initialPath = wrapper.find('[data-testid="drawing-connector-path"]').attributes('d');
    await findDrawingToolbarToolButton(wrapper, 'select').trigger('click');
    await dispatchPointerEvent(nodes[0].element, 'pointerdown', { clientX: 100, clientY: 100 });
    await dispatchPointerEvent(window, 'pointerup', { clientX: 100, clientY: 100 });
    await nextTick();
    await wrapper.find('[data-testid="moveable-drag-end"]').trigger('click');

    expect(wrapper.find('[data-testid="drawing-connector-path"]').attributes('d')).not.toBe(initialPath);
  });

  it('removes attached connectors when deleting a connected shape', async (): Promise<void> => {
    const wrapper = mount(BDrawing);

    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');
    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');
    await findDrawingToolbarToolButton(wrapper, 'connector').trigger('click');

    const nodes = wrapper.findAll('[data-testid="drawing-node"]');
    await nodes[0].trigger('pointerdown');
    await nodes[1].trigger('pointerdown');
    await findDrawingToolbarToolButton(wrapper, 'select').trigger('click');
    await dispatchPointerEvent(nodes[0].element, 'pointerdown', { clientX: 100, clientY: 100 });
    await dispatchPointerEvent(window, 'pointerup', { clientX: 100, clientY: 100 });
    await wrapper.trigger('keydown', { key: 'Delete' });

    expect(wrapper.findAll('[data-testid="drawing-connector"]')).toHaveLength(0);
  });
});
