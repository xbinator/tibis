/**
 * @file drawing-canvas.component.test.ts
 * @description 验证 BDrawing SVG 画布和基础工具栏交互。
 * @vitest-environment jsdom
 */
import { defineComponent, nextTick, ref } from 'vue';
import { config, mount, type DOMWrapper, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BDrawing from '@/components/BDrawing/index.vue';
import DrawingEdgeRenderer from '@/components/BDrawing/renderers/DrawingEdge.vue';
import DrawingNodeRenderer from '@/components/BDrawing/renderers/DrawingNode.vue';
import type { DrawingConnectorElement, DrawingData, DrawingEdge, DrawingElement, DrawingShapeElement } from '@/components/BDrawing/types';
import { measureDrawingTextElementSize } from '@/components/BDrawing/utils/boardTransforms';

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
/** 文本工具单击已有元素后等待双击判定的测试延迟。 */
const TEXT_ELEMENT_CLICK_CREATE_DELAY_MS = 260;

/**
 * 创建测试用画板数据。
 * @returns 测试画板数据
 */
function createDrawingDataFixture(): DrawingData {
  return {
    elements: [
      {
        id: 'external-node-1',
        kind: 'shape',
        shape: 'rect',
        text: '外部节点',
        position: { x: 24, y: 36 },
        size: { width: 180, height: 72 },
        rotation: 0,
        metadata: {
          source: 'user',
          createdAt: 1
        }
      }
    ],
    edges: [],
    viewport: {
      center: { x: 10, y: 20 },
      zoom: 1
    }
  };
}

/**
 * 创建支持连接线标签编辑的测试画板数据。
 * @returns 包含两个节点和一条连接线的画板数据
 */
function createConnectorLabelDrawingDataFixture(): DrawingData {
  const source: DrawingShapeElement = {
    id: 'node-1',
    kind: 'shape',
    shape: 'rect',
    text: '开始',
    position: { x: 20, y: 30 },
    size: { width: 180, height: 72 },
    rotation: 0,
    metadata: {
      source: 'user',
      createdAt: 1
    }
  };
  const target: DrawingShapeElement = {
    id: 'node-2',
    kind: 'shape',
    shape: 'rect',
    text: '结束',
    position: { x: 260, y: 30 },
    size: { width: 180, height: 72 },
    rotation: 0,
    metadata: {
      source: 'user',
      createdAt: 2
    }
  };
  const connector: DrawingConnectorElement = {
    id: 'connector-1',
    kind: 'connector',
    source: {
      elementId: source.id,
      anchor: 'center'
    },
    target: {
      elementId: target.id,
      anchor: 'center'
    },
    label: '',
    position: { x: 0, y: 0 },
    size: { width: 0, height: 0 },
    rotation: 0,
    metadata: {
      source: 'user',
      createdAt: 3
    }
  };

  return {
    elements: [source, target, connector],
    edges: [],
    viewport: {
      center: { x: 0, y: 0 },
      zoom: 1
    }
  };
}

/**
 * 创建远离原点的测试画板数据。
 * @returns 远处节点画板数据
 */
function createFarDrawingDataFixture(): DrawingData {
  return {
    elements: [
      {
        id: 'far-node-1',
        kind: 'shape',
        shape: 'rect',
        text: '远处节点',
        position: { x: 2000, y: 1200 },
        size: { width: 200, height: 100 },
        rotation: 0,
        metadata: {
          source: 'user',
          createdAt: 1
        }
      }
    ],
    edges: [],
    viewport: {
      center: { x: 0, y: 0 },
      zoom: 1
    }
  };
}

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
 * 查找绘图工具栏中的工具按钮。
 * @param wrapper - BDrawing 测试包装器
 * @param tool - 工具类型
 * @returns 工具按钮包装器
 */
function findDrawingToolbarToolButton(wrapper: VueWrapper, tool: DrawingToolbarTool): DOMWrapper<Element> {
  return wrapper.findAll('.b-drawing-toolbar__group--top > button')[DRAWING_TOOLBAR_TOOL_BUTTON_INDEX[tool]];
}

/**
 * 查找绘图工具栏中的历史按钮。
 * @param wrapper - BDrawing 测试包装器
 * @param action - 历史动作
 * @returns 历史按钮包装器
 */
function findDrawingToolbarHistoryButton(wrapper: VueWrapper, action: DrawingToolbarHistoryAction): DOMWrapper<Element> {
  return wrapper.findAll('.b-drawing-toolbar__group--bottom-left > button')[DRAWING_TOOLBAR_HISTORY_BUTTON_INDEX[action]];
}

/**
 * 查找绘图工具栏中的缩放按钮。
 * @param wrapper - BDrawing 测试包装器
 * @param action - 缩放动作
 * @returns 缩放按钮包装器
 */
function findDrawingToolbarZoomButton(wrapper: VueWrapper, action: DrawingToolbarZoomAction): DOMWrapper<Element> {
  return wrapper.find(`[aria-label="${action === 'in' ? '放大' : '缩小'}"]`);
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
 * 通过元素 ID 查找绘图节点。
 * @param wrapper - BDrawing 测试包装器
 * @param id - 元素 ID
 * @returns 节点包装器
 */
function findDrawingNodeById(wrapper: VueWrapper, id: string): DOMWrapper<Element> {
  return wrapper.find(`[data-drawing-element-id="${id}"]`);
}

/**
 * 查找文本编辑器。
 * @param wrapper - BDrawing 测试包装器
 * @returns 文本编辑器包装器
 */
function findDrawingTextEditor(wrapper: VueWrapper): DOMWrapper<HTMLTextAreaElement> {
  return wrapper.find<HTMLTextAreaElement>('[data-testid="drawing-text-editor"]');
}

/**
 * 设置文本编辑器纯文本内容。
 * @param editor - 文本编辑器包装器
 * @param value - 文本内容
 */
async function setDrawingTextEditorValue(editor: DOMWrapper<HTMLTextAreaElement>, value: string): Promise<void> {
  editor.element.value = value;
  editor.element.setSelectionRange(value.length, value.length);
  await editor.trigger('input');
  await nextTick();
}

/**
 * 读取文本编辑器纯文本内容。
 * @param editor - 文本编辑器包装器
 * @returns 文本内容
 */
function readDrawingTextEditorValue(editor: DOMWrapper<HTMLTextAreaElement>): string {
  return editor.element.value;
}

/**
 * 读取内联像素样式数值。
 * @param value - CSS 像素值
 * @returns 数字值
 */
function readInlinePixelValue(value: string): number {
  return Number(value.replace('px', ''));
}

/**
 * 向文本编辑器模拟粘贴纯文本。
 * @param editor - 文本编辑器包装器
 * @param text - 粘贴文本
 */
async function pasteDrawingTextEditorPlainText(editor: DOMWrapper<HTMLTextAreaElement>, text: string): Promise<void> {
  editor.element.value = `${editor.element.value}${text}`;
  await editor.trigger('input');
  await nextTick();
}

/**
 * 查找连接线创建预览路径。
 * @param wrapper - BDrawing 测试包装器
 * @returns 连接线预览路径包装器
 */
function findDrawingConnectorPreview(wrapper: VueWrapper): DOMWrapper<Element> {
  return wrapper.find('.b-drawing-canvas__connector-preview');
}

/**
 * 查找已渲染连接线主体。
 * @param wrapper - BDrawing 测试包装器
 * @returns 连接线主体包装器
 */
function findDrawingConnectorPath(wrapper: VueWrapper): DOMWrapper<Element> {
  return wrapper.find('.b-drawing-connector__line');
}

/**
 * 查找所有已渲染连接线主体。
 * @param wrapper - BDrawing 测试包装器
 * @returns 连接线主体包装器列表
 */
function findDrawingConnectorPaths(wrapper: VueWrapper): DOMWrapper<Element>[] {
  return wrapper.findAll('.b-drawing-connector__line');
}

/**
 * 查找连接线终点箭头路径。
 * @param wrapper - BDrawing 测试包装器
 * @returns 终点箭头路径包装器
 */
function findDrawingConnectorEndMarker(wrapper: VueWrapper): DOMWrapper<Element> {
  return wrapper.find('.b-drawing-connector__marker-arrow--end');
}

/**
 * 查找连接线选中端点。
 * @param wrapper - BDrawing 测试包装器
 * @returns 连接线端点包装器列表
 */
function findDrawingConnectorEndpoints(wrapper: VueWrapper): DOMWrapper<Element>[] {
  return wrapper.findAll('.b-drawing-connector__endpoint');
}

/**
 * 读取连接线端点圆心坐标。
 * @param endpoint - 连接线端点包装器
 * @returns 端点圆心坐标
 */
function readDrawingConnectorEndpointPosition(endpoint: DOMWrapper<Element>): { cx: number; cy: number } {
  return {
    cx: Number(endpoint.attributes('cx')),
    cy: Number(endpoint.attributes('cy'))
  };
}

/**
 * 样式面板颜色配置类型。
 */
type DrawingStyleColorTarget = 'stroke' | 'fill' | 'text';

/**
 * 样式面板颜色配置对应标签文本。
 */
const DRAWING_STYLE_COLOR_TARGET_LABEL: Record<DrawingStyleColorTarget, string> = {
  fill: '背景',
  stroke: '描边',
  text: '文字'
};

/**
 * 查找绘图样式面板。
 * @param wrapper - BDrawing 测试包装器
 * @returns 样式面板包装器
 */
function findDrawingStylePanel(wrapper: VueWrapper): DOMWrapper<Element> {
  return wrapper.find('.b-drawing-style-panel');
}

/**
 * 读取样式面板区块标题。
 * @param wrapper - BDrawing 测试包装器
 * @returns 区块标题列表
 */
function readDrawingStylePanelSectionLabels(wrapper: VueWrapper): string[] {
  return findDrawingStylePanel(wrapper)
    .findAll('.b-drawing-style-panel__label')
    .map((label: DOMWrapper<Element>): string => label.text());
}

/**
 * 查找绘图样式面板中的颜色配置区块。
 * @param wrapper - BDrawing 测试包装器
 * @param target - 颜色配置类型
 * @returns 颜色配置区块包装器
 */
function findDrawingColorSection(wrapper: VueWrapper, target: DrawingStyleColorTarget): DOMWrapper<Element> {
  const sections = findDrawingStylePanel(wrapper).findAll('.b-drawing-style-panel__section');
  const label = DRAWING_STYLE_COLOR_TARGET_LABEL[target];

  return sections.find((section: DOMWrapper<Element>): boolean => {
    const labelEl = section.find('.b-drawing-style-panel__label');
    return labelEl.exists() && labelEl.text() === label;
  })!;
}

/**
 * 查找绘图样式面板中的背景色输入。
 * @param wrapper - BDrawing 测试包装器
 * @returns 背景色输入包装器
 */
function findDrawingFillInput(wrapper: VueWrapper): DOMWrapper<HTMLInputElement> {
  return findDrawingColorSection(wrapper, 'fill').find<HTMLInputElement>('.b-color-picker__input input, input.b-color-picker__input');
}

/**
 * 查找绘图样式面板中的描边色输入。
 * @param wrapper - BDrawing 测试包装器
 * @returns 描边色输入包装器
 */
function findDrawingStrokeInput(wrapper: VueWrapper): DOMWrapper<HTMLInputElement> {
  return findDrawingColorSection(wrapper, 'stroke').find<HTMLInputElement>('.b-color-picker__input input, input.b-color-picker__input');
}

/**
 * 查找绘图样式面板中的文字色输入。
 * @param wrapper - BDrawing 测试包装器
 * @returns 文字色输入包装器
 */
function findDrawingTextInput(wrapper: VueWrapper): DOMWrapper<HTMLInputElement> {
  return findDrawingColorSection(wrapper, 'text').find<HTMLInputElement>('.b-color-picker__input input, input.b-color-picker__input');
}

/**
 * 查找样式面板中的自定义颜色按钮。
 * @param wrapper - BDrawing 测试包装器
 * @param target - 颜色配置类型
 * @returns 自定义颜色按钮包装器
 */
function findDrawingColorCustomTrigger(wrapper: VueWrapper, target: DrawingStyleColorTarget): DOMWrapper<Element> {
  return findDrawingColorSection(wrapper, target).find('.b-color-picker__custom-trigger');
}

/**
 * 打开样式面板中的颜色输入框。
 * @param wrapper - BDrawing 测试包装器
 * @param target - 颜色配置类型
 * @returns 颜色输入框包装器
 */
async function openDrawingColorInput(wrapper: VueWrapper, target: DrawingStyleColorTarget): Promise<DOMWrapper<HTMLInputElement>> {
  let findInput: (wrapper: VueWrapper) => DOMWrapper<HTMLInputElement>;
  if (target === 'fill') {
    findInput = findDrawingFillInput;
  } else if (target === 'stroke') {
    findInput = findDrawingStrokeInput;
  } else {
    findInput = findDrawingTextInput;
  }
  const currentInput = findInput(wrapper);

  if (currentInput.exists()) {
    return currentInput;
  }

  await findDrawingColorCustomTrigger(wrapper, target).trigger('click');
  await nextTick();
  return findInput(wrapper);
}

/**
 * 按顺序重复触发元素事件。
 * @param wrapper - 目标元素包装器
 * @param times - 触发次数
 */
async function triggerClickRepeatedly(wrapper: DOMWrapper<Element>, times: number): Promise<void> {
  await Array.from({ length: times }).reduce<Promise<void>>(async (previousTask: Promise<void>): Promise<void> => {
    await previousTask;
    await wrapper.trigger('click');
  }, Promise.resolve());
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

vi.mock('@/components/BDropdown/index.vue', () => ({
  default: {
    name: 'BDropdown',
    props: {
      open: {
        type: Boolean,
        default: false
      }
    },
    emits: ['update:open'],
    template: `
      <div class="b-dropdown-stub">
        <div class="b-dropdown-stub__trigger" @click="$emit('update:open', !open)">
          <slot />
        </div>
        <div v-if="open" class="b-dropdown-stub__overlay">
          <slot name="overlay" />
        </div>
      </div>
    `
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
      },
      padding: {
        type: Object,
        default: (): Record<string, number> => ({})
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
        :data-padding="JSON.stringify(padding)"
      >
        <span v-if="$attrs.control">{{ $attrs.control }}</span>
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
          data-testid="moveable-resize-narrow-text"
          @click="$emit('resize', { target: target[0], width: 80, height: 72, drag: { beforeTranslate: [0, 0] } })"
        ></button>
        <button
          data-testid="moveable-resize-wide-text"
          @click="$emit('resize', { target: target[0], width: 260, height: 72, drag: { beforeTranslate: [0, 0] } })"
        ></button>
        <button
          data-testid="moveable-resize-wide-from-grown-text"
          @click="$emit('resize', {
            target: target[0],
            width: 260,
            height: Number(target[0]?.querySelector('.b-drawing-node__shape')?.getAttribute('height') ?? 72),
            drag: { beforeTranslate: [0, 0] }
          })"
        ></button>
        <button
          data-testid="moveable-resize-group"
          @click="$emit('resize-group', { events: target.map((item) => ({ target: item, width: 240, height: 120, drag: { beforeTranslate: [30, 50] } })) })"
        ></button>
        <button
          data-testid="moveable-resize-group-end"
          @click="$emit('resize-group-end', { events: target.map((item) => ({ target: item, width: 240, height: 120, drag: { beforeTranslate: [30, 50] } })) })"
        ></button>
        <button
          data-testid="moveable-zoomed-resize-group-end"
          @click="$emit('resize-group-end', {
            events: target.map((item) => ({
              target: item,
              width: 264,
              height: 132,
              drag: { beforeTranslate: [33, 55] }
            }))
          })"
        ></button>
        <button
          data-testid="moveable-real-resize-group-end"
          @click="$emit('resize-group-end', {
            events: target.map((item) => ({
              target: item,
              lastEvent: { width: 240, height: 120, drag: { beforeTranslate: [30, 50] } }
            }))
          })"
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

config.global.components = {
  BButton: {
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
  },
  BIcon: {
    name: 'BIcon',
    template: '<span></span>'
  }
};

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
 * 设置画布测试尺寸读取器。
 * @param element - 画布元素
 * @param readSize - 动态读取尺寸
 */
function setDynamicCanvasRect(element: Element, readSize: () => { width: number; height: number }): void {
  const getRect = (): DOMRect => {
    const size = readSize();

    return {
      bottom: size.height,
      height: size.height,
      left: 0,
      right: size.width,
      top: 0,
      width: size.width,
      x: 0,
      y: 0,
      toJSON: (): Record<string, number> => ({})
    } as DOMRect;
  };

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
 * 判断 viewBox 是否完整包含指定矩形。
 * @param viewBox - SVG viewBox 数值
 * @param rect - 待检查矩形
 * @returns 是否完整包含
 */
function doesViewBoxContainRect(
  viewBox: number[],
  rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  }
): boolean {
  const [minX, minY, width, height] = viewBox;

  return minX <= rect.x && minY <= rect.y && minX + width >= rect.x + rect.width && minY + height >= rect.y + rect.height;
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

  afterEach((): void => {
    vi.useRealTimers();
  });

  it('renders an empty drawing workbench', (): void => {
    const wrapper = mount(BDrawing);

    expect(wrapper.find('.b-drawing').exists()).toBe(true);
    expect(wrapper.find('[data-testid="drawing-infinite-viewer"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="vue-infinite-viewer-mock"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="drawing-canvas"]').exists()).toBe(true);
    expect(findDrawingStylePanel(wrapper).exists()).toBe(false);
    expect(wrapper.text()).not.toContain('开始画图');
    expect(wrapper.find('[data-testid="drawing-add-process"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="drawing-delete"]').exists()).toBe(false);
  });

  it('renders initial drawing data from v-model', (): void => {
    const wrapper = mount(BDrawing, {
      props: {
        modelValue: createDrawingDataFixture()
      }
    });

    expect(wrapper.find('[data-drawing-element-id="external-node-1"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="drawing-node"]').text()).toContain('外部节点');
    expect(wrapper.find('.b-drawing-canvas__svg').attributes('viewBox')).toBe('-590 -340 1200 720');
  });

  it('fits existing drawing content into the first visible viewport', async (): Promise<void> => {
    const wrapper = mount(BDrawing, {
      props: {
        modelValue: createFarDrawingDataFixture()
      }
    });
    const canvas = wrapper.find('[data-testid="drawing-canvas"]');

    await nextTick();
    setCanvasRect(canvas.element, { width: 800, height: 600 });
    await emitCanvasResize();
    await flushViewportReadyCheck();
    await nextTick();

    const viewBox = parseViewBox(wrapper.find('.b-drawing-canvas__svg').attributes('viewBox'));

    expect(doesViewBoxContainRect(viewBox, { x: 2000, y: 1200, width: 200, height: 100 })).toBe(true);
  });

  it('emits drawing data updates without internal interaction state', async (): Promise<void> => {
    const wrapper = mount(BDrawing, {
      props: {
        modelValue: {
          elements: [],
          edges: [],
          viewport: {
            center: { x: 0, y: 0 },
            zoom: 1
          }
        }
      }
    });

    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');

    const emitted = wrapper.emitted('update:modelValue') as Array<[DrawingData]> | undefined;
    const latestData = emitted?.at(-1)?.[0];

    expect(latestData?.elements).toHaveLength(1);
    expect(latestData?.edges).toEqual([]);
    expect(latestData?.viewport).toEqual({ center: { x: 0, y: 0 }, zoom: 1 });
    expect(Object.keys(latestData ?? {}).sort()).toEqual(['edges', 'elements', 'viewport']);
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

  it('resyncs the rendered viewport size after KeepAlive activation', async (): Promise<void> => {
    const visible = ref<boolean>(true);
    const drawingData = ref<DrawingData>(createDrawingDataFixture());
    let canvasSize = { width: 1000, height: 500 };
    let layoutSettledAfterActivation = true;
    const Host = defineComponent({
      components: { BDrawing },
      /**
       * 暴露 KeepAlive 测试状态。
       * @returns 测试状态
       */
      setup(): { drawingData: typeof drawingData; visible: typeof visible } {
        return { drawingData, visible };
      },
      template: '<KeepAlive><BDrawing v-if="visible" v-model="drawingData" /></KeepAlive>'
    });
    const wrapper = mount(Host);

    await nextTick();
    setDynamicCanvasRect(wrapper.find('[data-testid="drawing-canvas"]').element, (): { width: number; height: number } =>
      layoutSettledAfterActivation ? canvasSize : { width: 1000, height: 500 }
    );
    await emitCanvasResize();

    expect(wrapper.find('.b-drawing-canvas__svg').attributes('viewBox')).toBe('-490 -230 1000 500');

    visible.value = false;
    await nextTick();
    canvasSize = { width: 800, height: 400 };
    layoutSettledAfterActivation = false;
    visible.value = true;
    await nextTick();
    layoutSettledAfterActivation = true;
    await flushViewportReadyCheck();

    expect(wrapper.find('.b-drawing-canvas__svg').attributes('viewBox')).toBe('-390 -180 800 400');
  });

  it('selects the rectangle tool and places a node on canvas click', async (): Promise<void> => {
    const wrapper = mount(BDrawing);

    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');

    expect(wrapper.findAll('[data-testid="drawing-node"]')).toHaveLength(1);
    expect(wrapper.find('[data-testid="drawing-node"]').attributes('data-drawing-element-id')).toBe('drawing-shape-1');
    expect(wrapper.find('[data-testid="drawing-node"]').text()).not.toContain('矩形');
  });

  it('creates text from the text tool input after blur', async (): Promise<void> => {
    const wrapper = mount(BDrawing);

    await findDrawingToolbarToolButton(wrapper, 'text').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');

    const editor = findDrawingTextEditor(wrapper);
    expect(editor.exists()).toBe(true);
    expect(editor.element.tagName).toBe('TEXTAREA');
    expect(editor.attributes('wrap')).toBeUndefined();
    expect(editor.element.style.position).toBe('fixed');
    expect(editor.element.style.whiteSpace).toBe('pre');
    expect(editor.element.style.background).toBe('transparent');
    expect(editor.element.style.borderStyle).toBe('none');
    expect(editor.element.style.boxShadow).toBe('none');

    await setDrawingTextEditorValue(editor, '需求说明');
    await editor.trigger('blur');

    expect(wrapper.find('[data-testid="drawing-text-editor"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="drawing-node"]').classes()).toContain('is-text');
    expect(wrapper.find('[data-testid="drawing-node"]').text()).toContain('需求说明');
    expect(wrapper.find('[data-testid="drawing-shape-rect"]').attributes('fill')).toBe('transparent');
    expect(wrapper.find('[data-testid="drawing-shape-rect"]').attributes('stroke')).toBe('transparent');
    expect(Number(wrapper.find('[data-testid="drawing-shape-rect"]').attributes('width'))).toBeLessThan(180);
  });

  it('renders text node bounds from content size instead of stale node size', (): void => {
    const textNode: DrawingShapeElement = {
      id: 'text-1',
      kind: 'shape',
      metadata: { createdAt: 1, source: 'user' },
      position: { x: 0, y: 0 },
      rotation: 0,
      shape: 'text',
      size: { height: 120, width: 260 },
      style: {
        fill: 'transparent',
        fontSize: 13,
        fontWeight: 650,
        stroke: 'transparent',
        textAlign: 'center'
      },
      text: 'Hi'
    };
    const expectedSize = measureDrawingTextElementSize(textNode.text, textNode.style);
    const wrapper = mount(DrawingNodeRenderer, {
      props: {
        node: textNode
      }
    });
    const shape = wrapper.find('[data-testid="drawing-shape-rect"]');

    expect(Number(shape.attributes('width'))).toBe(expectedSize.width);
    expect(Number(shape.attributes('height'))).toBe(expectedSize.height);
  });

  it('clips node text to the rendered node bounds', (): void => {
    const node: DrawingShapeElement = {
      id: 'node-1',
      kind: 'shape',
      metadata: { createdAt: 1, source: 'user' },
      position: { x: 0, y: 0 },
      rotation: 0,
      shape: 'rect',
      size: { height: 72, width: 120 },
      text: '这是一段比节点宽度更长的文字内容'
    };
    const wrapper = mount(DrawingNodeRenderer, {
      props: {
        node
      }
    });
    const viewport = wrapper.find('.b-drawing-node__text-viewport');

    expect(viewport.attributes('width')).toBe('120');
    expect(viewport.attributes('height')).toBe('72');
    expect(viewport.attributes('overflow')).toBe('hidden');
  });

  it('inserts a newline instead of saving when pressing Enter in the text editor', async (): Promise<void> => {
    const wrapper = mount(BDrawing);

    await findDrawingToolbarToolButton(wrapper, 'text').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');
    const editor = findDrawingTextEditor(wrapper);

    await setDrawingTextEditorValue(editor, '第一行');
    await editor.trigger('keydown', { key: 'Enter' });

    expect(findDrawingTextEditor(wrapper).exists()).toBe(true);
    expect(readDrawingTextEditorValue(editor)).toBe('第一行\n');

    await setDrawingTextEditorValue(editor, `${readDrawingTextEditorValue(editor)}第二行`);
    await editor.trigger('blur');

    expect(wrapper.findAll('.b-drawing-node__text-line')).toHaveLength(2);
  });

  it('pastes plain text into the textarea text editor', async (): Promise<void> => {
    const wrapper = mount(BDrawing);

    await findDrawingToolbarToolButton(wrapper, 'text').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');
    const editor = findDrawingTextEditor(wrapper);

    await pasteDrawingTextEditorPlainText(editor, '粘贴\n文本');
    await editor.trigger('blur');

    expect(wrapper.find('[data-testid="drawing-node"]').text()).toContain('粘贴');
    expect(wrapper.findAll('.b-drawing-node__text-line')).toHaveLength(2);
  });

  it('keeps the growing text editor inside the visible viewport', async (): Promise<void> => {
    const wrapper = mount(BDrawing);
    const canvas = wrapper.find('[data-testid="drawing-canvas"]');
    setCanvasRect(canvas.element, { width: 800, height: 600 });

    await findDrawingToolbarToolButton(wrapper, 'text').trigger('click');
    await dispatchPointerEvent(canvas.element, 'pointerdown', { clientX: 730, clientY: 300 });
    await dispatchPointerEvent(canvas.element, 'pointerup', { clientX: 730, clientY: 300 });
    const editor = findDrawingTextEditor(wrapper);
    await setDrawingTextEditorValue(editor, '这是一段会逐渐变长并接近可视区右侧边界的文本');

    const editorRight = readInlinePixelValue(editor.element.style.left) + readInlinePixelValue(editor.element.style.width);

    expect(editorRight).toBeLessThanOrEqual(776);
  });

  it('matches text editor typography with the rendered text style while editing', async (): Promise<void> => {
    const wrapper = mount(BDrawing);

    await findDrawingToolbarToolButton(wrapper, 'text').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');
    let editor = findDrawingTextEditor(wrapper);
    await setDrawingTextEditorValue(editor, '标题');
    await editor.trigger('blur');
    await findDrawingStylePanel(wrapper).find('[aria-label="大字号"]').trigger('click');

    await wrapper.find('[data-testid="drawing-node"]').trigger('dblclick');
    editor = findDrawingTextEditor(wrapper);

    expect(editor.element.style.fontSize).toBe('18px');
    expect(editor.element.style.fontWeight).toBe('400');
    expect(editor.element.style.lineHeight).toBe('24.3px');
    expect(editor.element.style.padding).toBe('2px 3px');
    expect(editor.element.style.textAlign).toBe('center');
  });

  it('uses the text cursor while the text tool is active', async (): Promise<void> => {
    const wrapper = mount(BDrawing);

    await findDrawingToolbarToolButton(wrapper, 'text').trigger('click');

    expect(wrapper.find('[data-testid="drawing-canvas"]').classes()).toContain('is-tool-text');
    expect(getComputedStyle(wrapper.find('[data-testid="drawing-canvas"]').element).cursor).toBe('text');
  });

  it('does not create text from a drag gesture', async (): Promise<void> => {
    const wrapper = mount(BDrawing);
    const canvas = wrapper.find('[data-testid="drawing-canvas"]');
    setCanvasRect(canvas.element, { width: 800, height: 600 });

    await findDrawingToolbarToolButton(wrapper, 'text').trigger('click');
    await dispatchPointerEvent(canvas.element, 'pointerdown', { clientX: 100, clientY: 100 });
    await dispatchPointerEvent(canvas.element, 'pointermove', { clientX: 220, clientY: 160 });
    await dispatchPointerEvent(canvas.element, 'pointerup', { clientX: 220, clientY: 160 });

    expect(wrapper.find('[data-testid="drawing-node"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="drawing-text-editor"]').exists()).toBe(false);
    expect(findDrawingToolbarToolButton(wrapper, 'text').classes()).toContain('is-active');
  });

  it('does not create text from a drag gesture that starts on an existing node', async (): Promise<void> => {
    const wrapper = mount(BDrawing);
    const canvas = wrapper.find('[data-testid="drawing-canvas"]');
    setCanvasRect(canvas.element, { width: 800, height: 600 });

    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
    await canvas.trigger('pointerdown');
    await canvas.trigger('pointerup');
    await findDrawingToolbarToolButton(wrapper, 'text').trigger('click');
    const node = wrapper.find('[data-testid="drawing-node"]');
    await dispatchPointerEvent(node.element, 'pointerdown', { clientX: 100, clientY: 100 });
    await dispatchPointerEvent(window, 'pointermove', { clientX: 180, clientY: 160 });
    await dispatchPointerEvent(window, 'pointerup', { clientX: 180, clientY: 160 });
    await new Promise<void>((resolve) => {
      setTimeout(resolve, TEXT_ELEMENT_CLICK_CREATE_DELAY_MS);
    });
    await nextTick();

    expect(wrapper.findAll('[data-testid="drawing-node"]')).toHaveLength(1);
    expect(wrapper.find('[data-testid="drawing-text-editor"]').exists()).toBe(false);
    expect(findDrawingToolbarToolButton(wrapper, 'text').classes()).toContain('is-active');
  });

  it('reopens the text editor when double clicking an existing text node', async (): Promise<void> => {
    const wrapper = mount(BDrawing);

    await findDrawingToolbarToolButton(wrapper, 'text').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');
    let editor = findDrawingTextEditor(wrapper);
    await setDrawingTextEditorValue(editor, '旧标题');
    await editor.trigger('blur');

    await wrapper.find('[data-testid="drawing-node"]').trigger('dblclick');
    editor = findDrawingTextEditor(wrapper);
    expect(editor.exists()).toBe(true);
    expect(readDrawingTextEditorValue(editor)).toBe('旧标题');

    await setDrawingTextEditorValue(editor, '新标题');
    await editor.trigger('blur');

    expect(wrapper.find('[data-testid="drawing-node"]').text()).toContain('新标题');
  });

  it('opens the text editor when double clicking a regular shape', async (): Promise<void> => {
    const wrapper = mount(BDrawing, {
      props: {
        modelValue: createDrawingDataFixture()
      }
    });

    await findDrawingNodeById(wrapper, 'external-node-1').trigger('dblclick');
    const editor = findDrawingTextEditor(wrapper);
    expect(editor.exists()).toBe(true);
    expect(readDrawingTextEditorValue(editor)).toBe('外部节点');

    await setDrawingTextEditorValue(editor, '流程说明');
    await editor.trigger('blur');

    expect(findDrawingNodeById(wrapper, 'external-node-1').text()).toContain('流程说明');
  });

  it('wraps regular shape text within the shape width while editing commits long text', async (): Promise<void> => {
    const wrapper = mount(BDrawing, {
      props: {
        modelValue: createDrawingDataFixture()
      }
    });
    const initialHeight = Number(findDrawingNodeById(wrapper, 'external-node-1').find('[data-testid="drawing-shape-rect"]').attributes('height'));

    await findDrawingNodeById(wrapper, 'external-node-1').trigger('dblclick');
    const editor = findDrawingTextEditor(wrapper);
    await setDrawingTextEditorValue(
      editor,
      '这是一个会超过普通形状宽度并自动换行的说明文本，用来验证矩形节点在内容明显变多时会跟随文本高度自动增高，避免文字溢出到节点外面'
    );
    await editor.trigger('blur');

    expect(findDrawingNodeById(wrapper, 'external-node-1').findAll('.b-drawing-node__text-line').length).toBeGreaterThan(1);
    expect(Number(findDrawingNodeById(wrapper, 'external-node-1').find('[data-testid="drawing-shape-rect"]').attributes('height'))).toBeGreaterThan(
      initialHeight
    );
  });

  it('previews regular shape height growth while editing long text', async (): Promise<void> => {
    const wrapper = mount(BDrawing, {
      props: {
        modelValue: createDrawingDataFixture()
      }
    });
    const initialHeight = Number(findDrawingNodeById(wrapper, 'external-node-1').find('[data-testid="drawing-shape-rect"]').attributes('height'));

    await findDrawingNodeById(wrapper, 'external-node-1').trigger('dblclick');
    const editor = findDrawingTextEditor(wrapper);
    await setDrawingTextEditorValue(editor, '这是一段正在编辑中的长文本，用来验证还没有提交时矩形节点也会跟随文本高度即时增高，避免编辑态先溢出再提交后修正');

    expect(findDrawingTextEditor(wrapper).exists()).toBe(true);
    expect(Number(findDrawingNodeById(wrapper, 'external-node-1').find('[data-testid="drawing-shape-rect"]').attributes('height'))).toBeGreaterThan(
      initialHeight
    );
  });

  it('keeps standalone text elements unconstrained by the shape width', async (): Promise<void> => {
    const wrapper = mount(BDrawing);

    await findDrawingToolbarToolButton(wrapper, 'text').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');
    const editor = findDrawingTextEditor(wrapper);
    await setDrawingTextEditorValue(editor, '这是一个独立文本元素不应该被形状宽度自动换行的长标题');
    await editor.trigger('blur');

    expect(wrapper.findAll('.b-drawing-node__text-line')).toHaveLength(1);
  });

  it('opens the text editor when double clicking a connector and commits its label', async (): Promise<void> => {
    const wrapper = mount(BDrawing, {
      props: {
        modelValue: createConnectorLabelDrawingDataFixture()
      }
    });

    await wrapper.find('.b-drawing-connector.b-drawing-element').trigger('dblclick');
    const editor = findDrawingTextEditor(wrapper);
    expect(editor.exists()).toBe(true);
    expect(readDrawingTextEditorValue(editor)).toBe('');

    await setDrawingTextEditorValue(editor, '通过');
    await editor.trigger('blur');

    expect(wrapper.find('.b-drawing-connector__label').text()).toBe('通过');
  });

  it('hides the rendered text and Moveable controls while editing a text node', async (): Promise<void> => {
    const wrapper = mount(BDrawing);

    await findDrawingToolbarToolButton(wrapper, 'text').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');
    let editor = findDrawingTextEditor(wrapper);
    await setDrawingTextEditorValue(editor, '旧标题');
    await editor.trigger('blur');

    expect(wrapper.find('.b-drawing-node__text').exists()).toBe(true);

    await wrapper.find('[data-testid="drawing-node"]').trigger('dblclick');
    editor = findDrawingTextEditor(wrapper);

    expect(editor.exists()).toBe(true);
    expect(wrapper.find('.b-drawing-node__text').exists()).toBe(false);
    expect(wrapper.find('[data-testid="drawing-moveable-mock"]').exists()).toBe(false);
  });

  it('deletes an existing text node when committing empty text', async (): Promise<void> => {
    const wrapper = mount(BDrawing);

    await findDrawingToolbarToolButton(wrapper, 'text').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');
    let editor = findDrawingTextEditor(wrapper);
    await setDrawingTextEditorValue(editor, '旧标题');
    await editor.trigger('blur');

    await wrapper.find('[data-testid="drawing-node"]').trigger('dblclick');
    editor = findDrawingTextEditor(wrapper);
    await setDrawingTextEditorValue(editor, '');
    await editor.trigger('blur');

    expect(wrapper.find('[data-testid="drawing-node"]').exists()).toBe(false);
  });

  it('creates a new text node when clicking an existing node with the text tool', async (): Promise<void> => {
    const wrapper = mount(BDrawing);
    const canvas = wrapper.find('[data-testid="drawing-canvas"]');
    setCanvasRect(canvas.element, { width: 800, height: 600 });

    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
    await canvas.trigger('pointerdown');
    await canvas.trigger('pointerup');
    await findDrawingToolbarToolButton(wrapper, 'text').trigger('click');
    await wrapper.find('[data-testid="drawing-node"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-node"]').trigger('pointerup');
    await new Promise<void>((resolve) => {
      setTimeout(resolve, TEXT_ELEMENT_CLICK_CREATE_DELAY_MS);
    });
    await nextTick();

    const editor = findDrawingTextEditor(wrapper);
    expect(editor.exists()).toBe(true);
    await setDrawingTextEditorValue(editor, '覆盖标注');
    await editor.trigger('blur');

    expect(wrapper.findAll('[data-testid="drawing-node"]')).toHaveLength(2);
    expect(wrapper.findAll('[data-testid="drawing-node"]')[1].text()).toContain('覆盖标注');
  });

  it('edits the existing text instead of creating a new node when double clicking with the text tool', async (): Promise<void> => {
    vi.useFakeTimers();
    const wrapper = mount(BDrawing);

    await findDrawingToolbarToolButton(wrapper, 'text').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');
    let editor = findDrawingTextEditor(wrapper);
    await setDrawingTextEditorValue(editor, '旧标题');
    await editor.trigger('blur');
    await findDrawingToolbarToolButton(wrapper, 'text').trigger('click');

    const node = wrapper.find('[data-testid="drawing-node"]');
    await node.trigger('pointerdown');
    await node.trigger('pointerup');
    await node.trigger('dblclick');
    await vi.runAllTimersAsync();
    await nextTick();
    editor = findDrawingTextEditor(wrapper);

    expect(editor.exists()).toBe(true);
    expect(readDrawingTextEditorValue(editor)).toBe('旧标题');
    expect(wrapper.findAll('[data-testid="drawing-node"]')).toHaveLength(1);
  });

  it('disables Moveable resize for selected text nodes', async (): Promise<void> => {
    const wrapper = mount(BDrawing);

    await findDrawingToolbarToolButton(wrapper, 'text').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');
    const editor = findDrawingTextEditor(wrapper);
    await setDrawingTextEditorValue(editor, '标题');
    await editor.trigger('blur');
    await nextTick();

    const shape = wrapper.find('[data-testid="drawing-shape-rect"]');
    const initialWidth = shape.attributes('width');
    const initialHeight = shape.attributes('height');

    expect(wrapper.find('[data-testid="drawing-moveable-mock"]').attributes('data-resizable')).toBe('false');

    await wrapper.find('[data-testid="moveable-resize-end"]').trigger('click');

    expect(wrapper.find('[data-testid="drawing-shape-rect"]').attributes('width')).toBe(initialWidth);
    expect(wrapper.find('[data-testid="drawing-shape-rect"]').attributes('height')).toBe(initialHeight);
  });

  it('preserves blank lines when rendering multiline text', async (): Promise<void> => {
    const wrapper = mount(BDrawing);

    await findDrawingToolbarToolButton(wrapper, 'text').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');
    const editor = findDrawingTextEditor(wrapper);
    await setDrawingTextEditorValue(editor, '第一行\n\n第三行');
    await editor.trigger('blur');

    const lines = wrapper.findAll('.b-drawing-node__text-line');
    expect(lines).toHaveLength(3);
    expect(lines[0].text()).toBe('第一行');
    expect(lines[1].attributes('data-drawing-empty-line')).toBe('true');
    expect(lines[2].text()).toBe('第三行');
  });

  it('updates standalone text color and font size from the style panel', async (): Promise<void> => {
    const wrapper = mount(BDrawing);

    await findDrawingToolbarToolButton(wrapper, 'text').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');
    const editor = findDrawingTextEditor(wrapper);
    await setDrawingTextEditorValue(editor, '标题');
    await editor.trigger('blur');

    await findDrawingColorSection(wrapper, 'text').find('[data-testid="color-picker-preset-#dc2626"]').trigger('click');
    await findDrawingStylePanel(wrapper).find('[aria-label="大字号"]').trigger('click');

    const text = wrapper.find('.b-drawing-node__text');
    expect(text.attributes('fill')).toBe('#dc2626');
    expect((text.element as SVGTextElement).style.fontSize).toBe('18px');
  });

  it('hides alignment controls for standalone text elements', async (): Promise<void> => {
    const wrapper = mount(BDrawing);

    await findDrawingToolbarToolButton(wrapper, 'text').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');
    const editor = findDrawingTextEditor(wrapper);
    await setDrawingTextEditorValue(editor, '标题');
    await editor.trigger('blur');

    const stylePanel = findDrawingStylePanel(wrapper);

    expect(stylePanel.find('[aria-label="左对齐"]').exists()).toBe(false);
    expect(stylePanel.find('[aria-label="底部对齐"]').exists()).toBe(false);
  });

  it('updates regular shape text horizontal and vertical alignment from the style panel', async (): Promise<void> => {
    const wrapper = mount(BDrawing, {
      props: {
        modelValue: createDrawingDataFixture()
      }
    });

    await findDrawingNodeById(wrapper, 'external-node-1').trigger('dblclick');
    const editor = findDrawingTextEditor(wrapper);
    await setDrawingTextEditorValue(editor, '第一行\n第二行');
    await editor.trigger('blur');

    await findDrawingStylePanel(wrapper).find('[aria-label="左对齐"]').trigger('click');
    await findDrawingStylePanel(wrapper).find('[aria-label="底部对齐"]').trigger('click');

    const text = findDrawingNodeById(wrapper, 'external-node-1').find('.b-drawing-node__text');
    expect(text.attributes('text-anchor')).toBe('start');
    expect(Number(text.attributes('y'))).toBeGreaterThan(40);
  });

  it('applies regular shape text anchor through inline style when left aligned', async (): Promise<void> => {
    const wrapper = mount(BDrawing, {
      props: {
        modelValue: createDrawingDataFixture()
      }
    });

    await findDrawingNodeById(wrapper, 'external-node-1').trigger('dblclick');
    const editor = findDrawingTextEditor(wrapper);
    await setDrawingTextEditorValue(editor, '什么');
    await editor.trigger('blur');
    await findDrawingStylePanel(wrapper).find('[aria-label="左对齐"]').trigger('click');

    const text = findDrawingNodeById(wrapper, 'external-node-1').find<SVGTextElement>('.b-drawing-node__text');

    expect(text.element.style.getPropertyValue('text-anchor')).toBe('start');
  });

  it('aligns the regular shape text editor with the rendered vertical text position', async (): Promise<void> => {
    const wrapper = mount(BDrawing, {
      props: {
        modelValue: createDrawingDataFixture()
      }
    });

    await findDrawingNodeById(wrapper, 'external-node-1').trigger('dblclick');
    let editor = findDrawingTextEditor(wrapper);
    await setDrawingTextEditorValue(editor, '第一行\n第二行');
    await editor.trigger('blur');
    await findDrawingStylePanel(wrapper).find('[aria-label="底部对齐"]').trigger('click');

    await findDrawingNodeById(wrapper, 'external-node-1').trigger('dblclick');
    editor = findDrawingTextEditor(wrapper);

    expect(readInlinePixelValue(editor.element.style.top)).toBeGreaterThan(40);
  });

  it('places layer controls at the bottom of the style panel', async (): Promise<void> => {
    const wrapper = mount(BDrawing, {
      props: {
        modelValue: createDrawingDataFixture()
      }
    });

    await findDrawingNodeById(wrapper, 'external-node-1').trigger('pointerdown');
    await dispatchPointerEvent(window, 'pointerup', { clientX: 100, clientY: 100 });
    await nextTick();

    const labels = readDrawingStylePanelSectionLabels(wrapper);
    expect(labels.at(-1)).toBe('层级');
  });

  it('centers rendered text lines within the measured text bounds', async (): Promise<void> => {
    const wrapper = mount(BDrawing);

    await findDrawingToolbarToolButton(wrapper, 'text').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');
    const editor = findDrawingTextEditor(wrapper);
    await setDrawingTextEditorValue(editor, '第一行\n第二行');
    await editor.trigger('blur');

    const text = wrapper.find('.b-drawing-node__text');
    const lines = wrapper.findAll('.b-drawing-node__text-line');
    const shapeHeight = Number(wrapper.find('[data-testid="drawing-shape-rect"]').attributes('height'));
    const lineHeight = Number(lines[1].attributes('dy'));
    const expectedFirstLineY = shapeHeight / 2 - lineHeight / 2;

    expect(text.attributes('dominant-baseline')).toBe('central');
    expect(text.attributes('alignment-baseline')).toBe('central');
    expect(Number(text.attributes('y'))).toBeCloseTo(expectedFirstLineY);
    expect(lines[0].attributes('dy')).toBe('0');
    expect(lines[1].attributes('dy')).toBe('17.55');
  });

  it('returns to the select tool after creating one rectangle node', async (): Promise<void> => {
    const wrapper = mount(BDrawing);

    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
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

    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');
    await findDrawingToolbarHistoryButton(wrapper, 'undo').trigger('click');

    expect(wrapper.findAll('[data-testid="drawing-node"]')).toHaveLength(0);

    await findDrawingToolbarHistoryButton(wrapper, 'redo').trigger('click');

    expect(wrapper.findAll('[data-testid="drawing-node"]')).toHaveLength(1);
  });

  it('undoes and redoes manual node creation with history shortcuts', async (): Promise<void> => {
    const wrapper = mount(BDrawing, {
      attachTo: document.body
    });

    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');
    await wrapper.trigger('keydown', { key: 'z', ctrlKey: true, metaKey: true });

    expect(wrapper.findAll('[data-testid="drawing-node"]')).toHaveLength(0);

    await wrapper.trigger('keydown', { key: 'z', ctrlKey: true, metaKey: true, shiftKey: true });

    expect(wrapper.findAll('[data-testid="drawing-node"]')).toHaveLength(1);

    wrapper.unmount();
  });

  it('redoes manual node creation with the Ctrl+Y history shortcut', async (): Promise<void> => {
    const wrapper = mount(BDrawing, {
      attachTo: document.body
    });

    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');
    await wrapper.trigger('keydown', { key: 'z', ctrlKey: true, metaKey: true });
    await wrapper.trigger('keydown', { key: 'y', ctrlKey: true, metaKey: true });

    expect(wrapper.findAll('[data-testid="drawing-node"]')).toHaveLength(1);

    wrapper.unmount();
  });

  it('ignores history shortcuts from outside the drawing board', async (): Promise<void> => {
    const wrapper = mount(BDrawing, {
      attachTo: document.body
    });

    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, metaKey: true, bubbles: true }));

    expect(wrapper.findAll('[data-testid="drawing-node"]')).toHaveLength(1);

    wrapper.unmount();
  });

  it('disables history toolbar actions when undo or redo is unavailable', async (): Promise<void> => {
    const wrapper = mount(BDrawing);
    const undoButton = findDrawingToolbarHistoryButton(wrapper, 'undo');
    const redoButton = findDrawingToolbarHistoryButton(wrapper, 'redo');

    expect(undoButton.attributes('disabled')).toBeDefined();
    expect(redoButton.attributes('disabled')).toBeDefined();

    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');

    expect(findDrawingToolbarHistoryButton(wrapper, 'undo').attributes('disabled')).toBeUndefined();
    expect(findDrawingToolbarHistoryButton(wrapper, 'redo').attributes('disabled')).toBeDefined();

    await findDrawingToolbarHistoryButton(wrapper, 'undo').trigger('click');

    expect(findDrawingToolbarHistoryButton(wrapper, 'undo').attributes('disabled')).toBeDefined();
    expect(findDrawingToolbarHistoryButton(wrapper, 'redo').attributes('disabled')).toBeUndefined();
  });

  it('deletes selected nodes when Delete is pressed on the drawing board', async (): Promise<void> => {
    const wrapper = mount(BDrawing, {
      attachTo: document.body
    });

    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');
    await wrapper.find('[data-testid="drawing-node"]').trigger('pointerdown');
    await wrapper.trigger('keydown', { key: 'Delete' });

    expect(wrapper.findAll('[data-testid="drawing-node"]')).toHaveLength(0);

    wrapper.unmount();
  });

  it('selects every drawing element when the select all shortcut is pressed on the drawing board', async (): Promise<void> => {
    const wrapper = mount(BDrawing, {
      attachTo: document.body
    });

    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');
    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');

    const nodesBeforeSelectAll = wrapper.findAll('[data-testid="drawing-node"]');
    expect(nodesBeforeSelectAll).toHaveLength(2);
    expect(nodesBeforeSelectAll[0].classes()).not.toContain('is-selected');
    expect(nodesBeforeSelectAll[1].classes()).toContain('is-selected');

    await wrapper.trigger('keydown', { key: 'a', ctrlKey: true, metaKey: true });

    const nodesAfterSelectAll = wrapper.findAll('[data-testid="drawing-node"]');
    expect(nodesAfterSelectAll[0].classes()).toContain('is-selected');
    expect(nodesAfterSelectAll[1].classes()).toContain('is-selected');

    wrapper.unmount();
  });

  it('ignores drawing keyboard shortcuts', async (): Promise<void> => {
    const wrapper = mount(BDrawing, {
      attachTo: document.body
    });

    await wrapper.trigger('keydown', { key: 'p' });
    expect(findDrawingToolbarToolButton(wrapper, 'select').classes()).toContain('is-active');

    await wrapper.trigger('keydown', { key: 'd' });
    expect(findDrawingToolbarToolButton(wrapper, 'select').classes()).toContain('is-active');

    await wrapper.trigger('keydown', { key: 'h' });
    expect(findDrawingToolbarToolButton(wrapper, 'select').classes()).toContain('is-active');

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

    await triggerClickRepeatedly(zoomInButton, 10);

    expect(findDrawingToolbarZoomValue(wrapper).text()).toBe('200%');
    expect(zoomInButton.attributes('disabled')).toBeDefined();

    await findDrawingToolbarZoomValue(wrapper).trigger('click');

    await triggerClickRepeatedly(zoomOutButton, 6);

    expect(findDrawingToolbarZoomValue(wrapper).text()).toBe('40%');
    expect(zoomOutButton.attributes('disabled')).toBeDefined();
  });

  it('toggles the minimap from the lower-left toolbar area', async (): Promise<void> => {
    const wrapper = mount(BDrawing);

    expect(wrapper.find('.b-drawing-toolbar__minimap').exists()).toBe(true);
    expect(wrapper.find('.b-drawing-minimap__panel').exists()).toBe(false);

    await wrapper.find('.b-drawing-toolbar__minimap').trigger('click');

    expect(wrapper.find('.b-drawing-minimap__panel').exists()).toBe(true);
  });

  it('renders drawing elements and the viewport frame in the minimap', async (): Promise<void> => {
    const wrapper = mount(BDrawing);

    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');
    await wrapper.find('.b-drawing-toolbar__minimap').trigger('click');

    expect(wrapper.find('.b-drawing-minimap__shape').exists()).toBe(true);
    expect(wrapper.find('.b-drawing-minimap__viewport').exists()).toBe(true);
  });

  it('recenters the drawing viewport when clicking the minimap', async (): Promise<void> => {
    const wrapper = mount(BDrawing);

    await wrapper.find('.b-drawing-toolbar__minimap').trigger('click');

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
    expect(node.text()).not.toContain('矩形');
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

  it('does not start Selecto from the node style panel', async (): Promise<void> => {
    const wrapper = mount(BDrawing);

    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');
    await wrapper.find('[data-testid="drawing-node"]').trigger('pointerdown');

    const condition = selectoMockState.instances.at(-1)?.options.dragCondition as SelectoDragCondition;
    expect(condition({ inputEvent: { target: findDrawingStylePanel(wrapper).element } })).toBe(false);
  });

  it('creates a custom sized rectangle node by dragging on the canvas', async (): Promise<void> => {
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

    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
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

  it('renders rectangle creation preview without rounded corners', async (): Promise<void> => {
    const wrapper = mount(BDrawing);

    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointermove');

    expect(wrapper.find('[data-testid="drawing-create-preview"] rect').attributes('rx')).toBeUndefined();
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

  it('keeps the current tool when pressing D', async (): Promise<void> => {
    const wrapper = mount(BDrawing, {
      attachTo: document.body
    });

    await wrapper.trigger('keydown', { key: 'd' });

    expect(findDrawingToolbarToolButton(wrapper, 'select').classes()).toContain('is-active');

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

  it('renders rectangle nodes without rounded corners', async (): Promise<void> => {
    const wrapper = mount(BDrawing);

    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');

    expect(wrapper.find('[data-testid="drawing-shape-rect"]').attributes('rx')).toBeUndefined();
  });

  it('shows the left style panel while a creation tool is active', async (): Promise<void> => {
    const wrapper = mount(BDrawing);

    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');

    expect(findDrawingStylePanel(wrapper).exists()).toBe(true);
    expect(findDrawingColorCustomTrigger(wrapper, 'fill').exists()).toBe(true);
  });

  it('applies creation style panel changes to the next created shape', async (): Promise<void> => {
    const wrapper = mount(BDrawing);

    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
    const fillInput = await openDrawingColorInput(wrapper, 'fill');
    await fillInput.setValue('#f08c00');
    await fillInput.trigger('blur');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');

    expect(wrapper.find('[data-testid="drawing-shape-rect"]').attributes('fill')).toBe('#f08c00');
    expect((wrapper.find('[data-testid="drawing-shape-rect"]').element as SVGRectElement).style.fill).toBe('rgb(240, 140, 0)');
  });

  it('applies typed creation color before the color input loses focus', async (): Promise<void> => {
    const wrapper = mount(BDrawing);

    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
    const fillInput = await openDrawingColorInput(wrapper, 'fill');
    await fillInput.setValue('#f08c00');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');

    expect(wrapper.find('[data-testid="drawing-shape-rect"]').attributes('fill')).toBe('#f08c00');
  });

  it('shows the left style panel for a selected node and updates fill color', async (): Promise<void> => {
    const wrapper = mount(BDrawing);

    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');
    await wrapper.find('[data-testid="drawing-node"]').trigger('pointerdown');

    expect(findDrawingStylePanel(wrapper).exists()).toBe(true);
    expect(findDrawingStylePanel(wrapper).text()).not.toContain('透明度');
    expect(wrapper.find('.b-drawing-style-panel__range').exists()).toBe(false);
    expect(wrapper.find('[data-testid="drawing-style-fill-picker"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="drawing-style-fill-orange"]').exists()).toBe(false);
    expect(findDrawingColorCustomTrigger(wrapper, 'fill').exists()).toBe(true);

    const fillInput = await openDrawingColorInput(wrapper, 'fill');
    await fillInput.setValue('#f08c00');
    await fillInput.trigger('blur');

    expect(wrapper.find('[data-testid="drawing-shape-rect"]').attributes('fill')).toBe('#f08c00');
    expect((wrapper.find('[data-testid="drawing-shape-rect"]').element as SVGRectElement).style.fill).toBe('rgb(240, 140, 0)');
  });

  it('keeps selected node stroke color visible after changing the hex input', async (): Promise<void> => {
    const wrapper = mount(BDrawing);

    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');
    await wrapper.find('[data-testid="drawing-node"]').trigger('pointerdown');

    const strokeInput = await openDrawingColorInput(wrapper, 'stroke');
    await strokeInput.setValue('#f08c00');
    await strokeInput.trigger('blur');

    expect(wrapper.find('[data-testid="drawing-node"]').classes()).toContain('is-selected');
    expect(wrapper.find('[data-testid="drawing-shape-rect"]').attributes('stroke')).toBe('#f08c00');
    expect((wrapper.find('[data-testid="drawing-shape-rect"]').element as SVGRectElement).style.stroke).toBe('rgb(240, 140, 0)');
  });

  it('shows selected node colors as hex inputs', async (): Promise<void> => {
    const wrapper = mount(BDrawing);

    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');
    await wrapper.find('[data-testid="drawing-node"]').trigger('pointerdown');

    const strokeInput = await openDrawingColorInput(wrapper, 'stroke');
    const fillInput = await openDrawingColorInput(wrapper, 'fill');
    expect(strokeInput.element.value).toBe('#64748b');
    expect(fillInput.element.value).toBe('#00000000');
  });

  it('keeps the selected node active when interacting with the style panel', async (): Promise<void> => {
    const wrapper = mount(BDrawing);

    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');
    await wrapper.find('[data-testid="drawing-node"]').trigger('pointerdown');

    expect(wrapper.find('[data-testid="drawing-node"]').classes()).toContain('is-selected');

    await findDrawingColorCustomTrigger(wrapper, 'fill').trigger('pointerdown');

    expect(wrapper.find('[data-testid="drawing-node"]').classes()).toContain('is-selected');
    expect(findDrawingStylePanel(wrapper).exists()).toBe(true);
  });

  it('keeps the selected node active when copying text from the style panel input', async (): Promise<void> => {
    const wrapper = mount(BDrawing);

    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');
    await wrapper.find('[data-testid="drawing-node"]').trigger('pointerdown');

    const fillInput = await openDrawingColorInput(wrapper, 'fill');
    await fillInput.trigger('keydown', { key: 'c', metaKey: true });

    expect(wrapper.find('[data-testid="drawing-node"]').classes()).toContain('is-selected');
    expect(findDrawingStylePanel(wrapper).exists()).toBe(true);
    expect(findDrawingToolbarToolButton(wrapper, 'select').classes()).toContain('is-active');
  });

  it('keeps the selected node active when Delete is pressed inside the style panel input', async (): Promise<void> => {
    const wrapper = mount(BDrawing);

    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');
    await wrapper.find('[data-testid="drawing-node"]').trigger('pointerdown');

    const fillInput = await openDrawingColorInput(wrapper, 'fill');
    await fillInput.trigger('keydown', { key: 'Delete' });

    expect(wrapper.findAll('[data-testid="drawing-node"]')).toHaveLength(1);
    expect(wrapper.find('[data-testid="drawing-node"]').classes()).toContain('is-selected');
    expect(findDrawingStylePanel(wrapper).exists()).toBe(true);
  });

  it('does not render a numeric control placeholder when Moveable control count is zero', async (): Promise<void> => {
    const wrapper = mount(BDrawing);

    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');
    await wrapper.find('[data-testid="drawing-node"]').trigger('pointerdown');
    await nextTick();

    expect(wrapper.find('[data-testid="drawing-moveable-mock"]').text()).not.toContain('0');
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

  it('keeps the Moveable selection box tight around the selected node', async (): Promise<void> => {
    const wrapper = mount(BDrawing);

    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');
    await wrapper.find('[data-testid="drawing-node"]').trigger('pointerdown');
    await nextTick();

    expect(wrapper.find('[data-testid="drawing-moveable-mock"]').attributes('data-padding')).toBe(
      JSON.stringify({
        bottom: 0,
        left: 0,
        right: 0,
        top: 0
      })
    );
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

  it('keeps Moveable group resize dimensions in board units after viewport zoom', async (): Promise<void> => {
    const wrapper = mount(BDrawing);
    const canvas = wrapper.find('[data-testid="drawing-canvas"]');

    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
    await canvas.trigger('pointerdown');
    await canvas.trigger('pointerup');
    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
    await canvas.trigger('pointerdown');
    await canvas.trigger('pointerup');
    await findDrawingToolbarToolButton(wrapper, 'select').trigger('click');
    await dispatchWheelEvent(canvas.element, { clientX: 600, clientY: 360, ctrlKey: true, deltaY: -100 });

    const nodes = wrapper.findAll('[data-testid="drawing-node"]');
    await emitSelectoEnd([nodes[0].element, nodes[1].element]);
    await nextTick();
    await wrapper.find('[data-testid="moveable-zoomed-resize-group-end"]').trigger('click');

    expect(wrapper.findAll('[data-testid="drawing-shape-rect"]').map((shape) => shape.attributes('width'))).toEqual(['240', '240']);
    expect(wrapper.findAll('[data-testid="drawing-shape-rect"]').map((shape) => shape.attributes('height'))).toEqual(['120', '120']);
  });

  it('keeps resized multi selection dimensions after the next group drag', async (): Promise<void> => {
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
    await wrapper.find('[data-testid="moveable-real-resize-group-end"]').trigger('click');
    await wrapper.find('[data-testid="moveable-drag-group-end"]').trigger('click');

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
    const nodeId = wrapper.findAll('[data-testid="drawing-node"]')[0].attributes('data-drawing-element-id') ?? '';
    await dispatchPointerEvent(findDrawingNodeById(wrapper, nodeId).element, 'pointerdown', { clientX: 100, clientY: 100 });

    expect(wrapper.find('[data-testid="drawing-moveable-mock"]').exists()).toBe(false);

    await dispatchPointerEvent(window, 'pointermove', { clientX: 140, clientY: 120 });

    expect(findDrawingNodeById(wrapper, nodeId).classes()).not.toContain('is-selected');
    expect(wrapper.find('[data-testid="drawing-moveable-mock"]').exists()).toBe(false);
    expect(findDrawingNodeById(wrapper, nodeId).attributes('transform')).toBe('translate(-50, -16)');

    await dispatchPointerEvent(window, 'pointerup', { clientX: 140, clientY: 120 });
    await nextTick();

    expect(findDrawingNodeById(wrapper, nodeId).classes()).toContain('is-selected');
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

  it('stops direct node dragging when pointerup happens on the node', async (): Promise<void> => {
    const wrapper = mount(BDrawing);

    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await dispatchPointerEvent(wrapper.find('[data-testid="drawing-node"]').element, 'pointerdown', { clientX: 100, clientY: 100 });
    await dispatchPointerEvent(wrapper.find('[data-testid="drawing-node"]').element, 'pointerup', { clientX: 100, clientY: 100 });
    const transformAfterPointerup = wrapper.find('[data-testid="drawing-node"]').attributes('transform');

    await dispatchPointerEvent(window, 'pointermove', { clientX: 220, clientY: 180 });

    expect(wrapper.find('[data-testid="drawing-node"]').attributes('transform')).toBe(transformAfterPointerup);
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

  it('keeps Moveable resize enabled for regular shapes that contain text', async (): Promise<void> => {
    const wrapper = mount(BDrawing, {
      props: {
        modelValue: createDrawingDataFixture()
      }
    });

    await dispatchPointerEvent(findDrawingNodeById(wrapper, 'external-node-1').element, 'pointerdown', { clientX: 100, clientY: 100 });
    await dispatchPointerEvent(window, 'pointerup', { clientX: 100, clientY: 100 });
    await nextTick();
    expect(wrapper.find('[data-testid="drawing-moveable-mock"]').attributes('data-resizable')).toBe('true');

    await wrapper.find('[data-testid="moveable-resize-end"]').trigger('click');

    expect(findDrawingNodeById(wrapper, 'external-node-1').find('[data-testid="drawing-shape-rect"]').attributes('width')).toBe('240');
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

  it('previews Moveable text fit height while resizing a text-bearing shape', async (): Promise<void> => {
    const wrapper = mount(BDrawing, {
      props: {
        modelValue: {
          elements: [
            {
              id: 'external-node-1',
              kind: 'shape',
              shape: 'rect',
              text: '这是一段已经存在于节点内部的长文本，拖拽修改宽度后需要重新计算换行高度',
              position: { x: 24, y: 36 },
              size: { width: 180, height: 72 },
              rotation: 0,
              metadata: {
                source: 'user',
                createdAt: 1
              }
            }
          ],
          edges: [],
          viewport: {
            center: { x: 0, y: 0 },
            zoom: 1
          }
        }
      }
    });

    await dispatchPointerEvent(findDrawingNodeById(wrapper, 'external-node-1').element, 'pointerdown', { clientX: 100, clientY: 100 });
    await dispatchPointerEvent(window, 'pointerup', { clientX: 100, clientY: 100 });
    await nextTick();
    await wrapper.find('[data-testid="moveable-resize-narrow-text"]').trigger('click');
    const narrowHeight = Number(findDrawingNodeById(wrapper, 'external-node-1').find('[data-testid="drawing-shape-rect"]').attributes('height'));

    expect(findDrawingNodeById(wrapper, 'external-node-1').find('[data-testid="drawing-shape-rect"]').attributes('width')).toBe('80');
    expect(narrowHeight).toBeGreaterThan(72);

    await wrapper.find('[data-testid="moveable-resize-wide-text"]').trigger('click');

    expect(findDrawingNodeById(wrapper, 'external-node-1').find('[data-testid="drawing-shape-rect"]').attributes('width')).toBe('260');
    expect(findDrawingNodeById(wrapper, 'external-node-1').find('[data-testid="drawing-shape-rect"]').attributes('height')).toBe('72');
  });

  it('restores Moveable preview height from the resize gesture base size when widening again', async (): Promise<void> => {
    const wrapper = mount(BDrawing, {
      props: {
        modelValue: {
          elements: [
            {
              id: 'external-node-1',
              kind: 'shape',
              shape: 'rect',
              text: '这是一段已经存在于节点内部的长文本，拖拽修改宽度后需要重新计算换行高度',
              position: { x: 24, y: 36 },
              size: { width: 180, height: 72 },
              rotation: 0,
              metadata: {
                source: 'user',
                createdAt: 1
              }
            }
          ],
          edges: [],
          viewport: {
            center: { x: 0, y: 0 },
            zoom: 1
          }
        }
      }
    });

    await dispatchPointerEvent(findDrawingNodeById(wrapper, 'external-node-1').element, 'pointerdown', { clientX: 100, clientY: 100 });
    await dispatchPointerEvent(window, 'pointerup', { clientX: 100, clientY: 100 });
    await nextTick();
    await wrapper.find('[data-testid="moveable-resize-narrow-text"]').trigger('click');
    const grownHeight = Number(findDrawingNodeById(wrapper, 'external-node-1').find('[data-testid="drawing-shape-rect"]').attributes('height'));

    expect(grownHeight).toBeGreaterThan(72);

    await wrapper.find('[data-testid="moveable-resize-wide-from-grown-text"]').trigger('click');

    expect(findDrawingNodeById(wrapper, 'external-node-1').find('[data-testid="drawing-shape-rect"]').attributes('width')).toBe('260');
    expect(findDrawingNodeById(wrapper, 'external-node-1').find('[data-testid="drawing-shape-rect"]').attributes('height')).toBe('72');
  });

  it('commits Moveable resize after previewing wrapped node text', async (): Promise<void> => {
    const wrapper = mount(BDrawing, {
      props: {
        modelValue: {
          elements: [
            {
              id: 'external-node-1',
              kind: 'shape',
              shape: 'rect',
              text: '这是一段已经存在于节点内部的长文本，拖拽修改宽度后需要重新计算换行高度',
              position: { x: 24, y: 36 },
              size: { width: 180, height: 72 },
              rotation: 0,
              metadata: {
                source: 'user',
                createdAt: 1
              }
            }
          ],
          edges: [],
          viewport: {
            center: { x: 0, y: 0 },
            zoom: 1
          }
        }
      }
    });

    await dispatchPointerEvent(findDrawingNodeById(wrapper, 'external-node-1').element, 'pointerdown', { clientX: 100, clientY: 100 });
    await dispatchPointerEvent(window, 'pointerup', { clientX: 100, clientY: 100 });
    await nextTick();
    await wrapper.find('[data-testid="moveable-resize-narrow-text"]').trigger('click');
    await wrapper.find('[data-testid="moveable-resize-end"]').trigger('click');

    expect(findDrawingNodeById(wrapper, 'external-node-1').find('[data-testid="drawing-shape-rect"]').attributes('width')).toBe('240');
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

  it('shows a connector preview while dragging from one shape to another', async (): Promise<void> => {
    const wrapper = mount(BDrawing);

    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');
    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');
    await findDrawingToolbarToolButton(wrapper, 'connector').trigger('click');

    const nodes = wrapper.findAll('[data-testid="drawing-node"]');
    await dispatchPointerEvent(nodes[0].element, 'pointerdown', { clientX: 100, clientY: 100 });
    await dispatchPointerEvent(window, 'pointermove', { clientX: 220, clientY: 160 });

    const preview = findDrawingConnectorPreview(wrapper);
    expect(preview.exists()).toBe(true);
    expect(nodes[0].element.compareDocumentPosition(preview.element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(findDrawingConnectorPaths(wrapper)).toHaveLength(0);
  });

  it('shows four connector anchors on each shape while the connector tool is active', async (): Promise<void> => {
    const wrapper = mount(BDrawing);

    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');
    await findDrawingToolbarToolButton(wrapper, 'connector').trigger('click');

    expect(wrapper.findAll('.b-drawing-node__anchor')).toHaveLength(4);
  });

  it('applies connector tool draft style to the next connector', async (): Promise<void> => {
    const wrapper = mount(BDrawing);

    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');
    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');
    await findDrawingToolbarToolButton(wrapper, 'connector').trigger('click');

    expect(findDrawingStylePanel(wrapper).exists()).toBe(true);
    await findDrawingStylePanel(wrapper).find('[aria-label="选择颜色 #dc2626"]').trigger('click');
    await findDrawingStylePanel(wrapper).find('[aria-label="终点无箭头"]').trigger('click');
    await findDrawingStylePanel(wrapper).find('[aria-label="贝塞尔曲线"]').trigger('click');

    const nodes = wrapper.findAll('[data-testid="drawing-node"]');
    await dispatchPointerEvent(nodes[0].element, 'pointerdown', { clientX: 100, clientY: 100 });
    await dispatchPointerEvent(window, 'pointermove', { clientX: 220, clientY: 160 });
    await dispatchPointerEvent(nodes[1].element, 'pointerup', { clientX: 220, clientY: 160 });

    const connectorPath = findDrawingConnectorPath(wrapper);
    expect(connectorPath.attributes('stroke')).toBe('#dc2626');
    expect(connectorPath.attributes('d')).toContain(' C ');
    expect(findDrawingConnectorEndMarker(wrapper).exists()).toBe(false);
  });

  it('creates a connector by dragging from one shape to another with the connector tool', async (): Promise<void> => {
    const wrapper = mount(BDrawing);

    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');
    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');
    await findDrawingToolbarToolButton(wrapper, 'connector').trigger('click');

    const nodes = wrapper.findAll('[data-testid="drawing-node"]');
    await dispatchPointerEvent(nodes[0].element, 'pointerdown', { clientX: 100, clientY: 100 });
    await dispatchPointerEvent(window, 'pointermove', { clientX: 220, clientY: 160 });
    await dispatchPointerEvent(wrapper.findAll('[data-testid="drawing-node"]')[1].element, 'pointerup', { clientX: 220, clientY: 160 });

    expect(findDrawingConnectorPreview(wrapper).exists()).toBe(false);
    expect(findDrawingConnectorPaths(wrapper)).toHaveLength(1);
    expect(nodes[0].element.compareDocumentPosition(findDrawingConnectorPath(wrapper).element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('creates a connector when drag end target is resolved from pointer coordinates', async (): Promise<void> => {
    const wrapper = mount(BDrawing);

    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');
    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');
    await findDrawingToolbarToolButton(wrapper, 'connector').trigger('click');

    const nodes = wrapper.findAll('[data-testid="drawing-node"]');
    const originalElementFromPoint = document.elementFromPoint;
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: vi.fn((): Element => nodes[1].element)
    });

    await dispatchPointerEvent(nodes[0].element, 'pointerdown', { clientX: 100, clientY: 100 });
    await dispatchPointerEvent(window, 'pointermove', { clientX: 220, clientY: 160 });
    await dispatchPointerEvent(window, 'pointerup', { clientX: 220, clientY: 160 });
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: originalElementFromPoint
    });

    expect(findDrawingConnectorPreview(wrapper).exists()).toBe(false);
    expect(findDrawingConnectorPaths(wrapper)).toHaveLength(1);
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
    await dispatchPointerEvent(nodes[0].element, 'pointerdown', { clientX: 100, clientY: 100 });
    await dispatchPointerEvent(window, 'pointermove', { clientX: 220, clientY: 160 });
    await dispatchPointerEvent(wrapper.findAll('[data-testid="drawing-node"]')[1].element, 'pointerup', { clientX: 220, clientY: 160 });

    const initialPath = findDrawingConnectorPath(wrapper).attributes('d');
    await findDrawingToolbarToolButton(wrapper, 'select').trigger('click');
    await dispatchPointerEvent(nodes[0].element, 'pointerdown', { clientX: 100, clientY: 100 });
    await dispatchPointerEvent(window, 'pointerup', { clientX: 100, clientY: 100 });
    await nextTick();
    await wrapper.find('[data-testid="moveable-drag-end"]').trigger('click');

    expect(findDrawingConnectorPath(wrapper).attributes('d')).not.toBe(initialPath);
  });

  it('updates connector path while previewing a connected shape drag', async (): Promise<void> => {
    const wrapper = mount(BDrawing);

    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');
    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');
    await findDrawingToolbarToolButton(wrapper, 'connector').trigger('click');

    const nodes = wrapper.findAll('[data-testid="drawing-node"]');
    await dispatchPointerEvent(nodes[0].element, 'pointerdown', { clientX: 100, clientY: 100 });
    await dispatchPointerEvent(window, 'pointermove', { clientX: 220, clientY: 160 });
    await dispatchPointerEvent(nodes[1].element, 'pointerup', { clientX: 220, clientY: 160 });

    const initialPath = findDrawingConnectorPath(wrapper).attributes('d');
    await dispatchPointerEvent(nodes[0].element, 'pointerdown', { clientX: 100, clientY: 100 });
    await dispatchPointerEvent(window, 'pointerup', { clientX: 100, clientY: 100 });
    await nextTick();
    await wrapper.find('[data-testid="moveable-drag"]').trigger('click');

    expect(findDrawingConnectorPath(wrapper).attributes('d')).not.toBe(initialPath);
  });

  it('updates connector marker while previewing a connected shape drag', async (): Promise<void> => {
    const wrapper = mount(BDrawing);

    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');
    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');
    await findDrawingToolbarToolButton(wrapper, 'connector').trigger('click');

    const nodes = wrapper.findAll('[data-testid="drawing-node"]');
    await dispatchPointerEvent(nodes[0].element, 'pointerdown', { clientX: 100, clientY: 100 });
    await dispatchPointerEvent(window, 'pointermove', { clientX: 220, clientY: 160 });
    await dispatchPointerEvent(nodes[1].element, 'pointerup', { clientX: 220, clientY: 160 });

    const initialMarkerPath = findDrawingConnectorEndMarker(wrapper).attributes('d');
    await dispatchPointerEvent(nodes[0].element, 'pointerdown', { clientX: 100, clientY: 100 });
    await dispatchPointerEvent(window, 'pointerup', { clientX: 100, clientY: 100 });
    await nextTick();
    await wrapper.find('[data-testid="moveable-drag"]').trigger('click');

    expect(findDrawingConnectorEndMarker(wrapper).attributes('d')).not.toBe(initialMarkerPath);
  });

  it('updates selected connector endpoints while previewing a Selecto multi-node drag', async (): Promise<void> => {
    const wrapper = mount(BDrawing);

    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');
    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');
    await findDrawingToolbarToolButton(wrapper, 'connector').trigger('click');

    const nodes = wrapper.findAll('[data-testid="drawing-node"]');
    await dispatchPointerEvent(nodes[0].element, 'pointerdown', { clientX: 100, clientY: 100 });
    await dispatchPointerEvent(window, 'pointermove', { clientX: 220, clientY: 160 });
    await dispatchPointerEvent(nodes[1].element, 'pointerup', { clientX: 220, clientY: 160 });
    await findDrawingToolbarToolButton(wrapper, 'select').trigger('click');

    const connectorTarget = wrapper.find('.b-drawing-connector.b-drawing-element');
    await emitSelectoEnd([nodes[0].element, nodes[1].element, connectorTarget.element]);
    await nextTick();

    const initialEndpoints = findDrawingConnectorEndpoints(wrapper).map(readDrawingConnectorEndpointPosition);
    await wrapper.find('[data-testid="moveable-drag-group"]').trigger('click');

    expect(findDrawingConnectorEndpoints(wrapper).map(readDrawingConnectorEndpointPosition)).toEqual(
      initialEndpoints.map((endpoint: { cx: number; cy: number }): { cx: number; cy: number } => ({
        cx: endpoint.cx + 40,
        cy: endpoint.cy + 20
      }))
    );
  });

  it('highlights connector target node while creating a connector', async (): Promise<void> => {
    const wrapper = mount(BDrawing);

    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');
    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');
    await findDrawingToolbarToolButton(wrapper, 'connector').trigger('click');

    const nodes = wrapper.findAll('[data-testid="drawing-node"]');
    const originalElementFromPoint = document.elementFromPoint;
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: vi.fn((): Element => nodes[1].element)
    });

    await dispatchPointerEvent(nodes[0].element, 'pointerdown', { clientX: 100, clientY: 100 });
    await dispatchPointerEvent(window, 'pointermove', { clientX: 220, clientY: 160 });

    expect(nodes[1].classes()).not.toContain('is-connector-active');
    expect(nodes[1].find('[data-drawing-anchor="center"]').exists()).toBe(false);
    const activeAnchor = nodes[1].find('.b-drawing-node__anchor.is-active');
    expect(activeAnchor.exists()).toBe(true);
    expect(activeAnchor.attributes('r')).toBe('6');

    await dispatchPointerEvent(nodes[1].element, 'pointerup', { clientX: 220, clientY: 160 });
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: originalElementFromPoint
    });

    expect(wrapper.findAll('[data-testid="drawing-node"]')[1].find('.b-drawing-node__anchor.is-active').exists()).toBe(false);
  });

  it('selects and deletes a connector from the canvas', async (): Promise<void> => {
    const wrapper = mount(BDrawing, {
      attachTo: document.body
    });

    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');
    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');
    await findDrawingToolbarToolButton(wrapper, 'connector').trigger('click');

    const nodes = wrapper.findAll('[data-testid="drawing-node"]');
    await dispatchPointerEvent(nodes[0].element, 'pointerdown', { clientX: 100, clientY: 100 });
    await dispatchPointerEvent(window, 'pointermove', { clientX: 220, clientY: 160 });
    await dispatchPointerEvent(nodes[1].element, 'pointerup', { clientX: 220, clientY: 160 });
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');

    expect(findDrawingConnectorEndpoints(wrapper)).toHaveLength(0);

    await findDrawingConnectorPath(wrapper).trigger('pointerdown');

    const endpoints = findDrawingConnectorEndpoints(wrapper);
    expect(endpoints).toHaveLength(2);
    expect(nodes[0].element.compareDocumentPosition(endpoints[0].element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await wrapper.trigger('keydown', { key: 'Delete' });

    expect(findDrawingConnectorPaths(wrapper)).toHaveLength(0);

    wrapper.unmount();
  });

  it('updates selected connector color, marker and curve from the style panel', async (): Promise<void> => {
    const wrapper = mount(BDrawing);

    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');
    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');
    await findDrawingToolbarToolButton(wrapper, 'connector').trigger('click');

    const nodes = wrapper.findAll('[data-testid="drawing-node"]');
    await dispatchPointerEvent(nodes[0].element, 'pointerdown', { clientX: 100, clientY: 100 });
    await dispatchPointerEvent(window, 'pointermove', { clientX: 220, clientY: 160 });
    await dispatchPointerEvent(nodes[1].element, 'pointerup', { clientX: 220, clientY: 160 });
    await findDrawingConnectorPath(wrapper).trigger('pointerdown');

    await findDrawingStylePanel(wrapper).find('[data-testid="color-picker-preset-#dc2626"]').trigger('click');
    await findDrawingStylePanel(wrapper).find('[aria-label="终点无箭头"]').trigger('click');
    await findDrawingStylePanel(wrapper).find('[aria-label="贝塞尔曲线"]').trigger('click');

    const connectorPath = findDrawingConnectorPath(wrapper);
    expect(connectorPath.attributes('stroke')).toBe('#dc2626');
    expect(findDrawingConnectorEndMarker(wrapper).exists()).toBe(false);
    expect(connectorPath.attributes('d')).toContain(' C ');
  });

  it('renders connector style controls as icon-only buttons', async (): Promise<void> => {
    const wrapper = mount(BDrawing);

    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');
    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');
    await findDrawingToolbarToolButton(wrapper, 'connector').trigger('click');

    const nodes = wrapper.findAll('[data-testid="drawing-node"]');
    await dispatchPointerEvent(nodes[0].element, 'pointerdown', { clientX: 100, clientY: 100 });
    await dispatchPointerEvent(window, 'pointermove', { clientX: 220, clientY: 160 });
    await dispatchPointerEvent(nodes[1].element, 'pointerup', { clientX: 220, clientY: 160 });
    await findDrawingConnectorPath(wrapper).trigger('pointerdown');

    expect(findDrawingStylePanel(wrapper).find('[aria-label="直线"]').text()).toBe('');
    expect(findDrawingStylePanel(wrapper).find('[aria-label="贝塞尔曲线"]').text()).toBe('');
    expect(findDrawingStylePanel(wrapper).find('[aria-label="起点无箭头"]').text()).toBe('');
    expect(findDrawingStylePanel(wrapper).find('[aria-label="终点箭头"]').text()).toBe('');
  });

  it('keeps the bezier connector end marker above the target node', async (): Promise<void> => {
    const wrapper = mount(BDrawing);

    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');
    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');
    await findDrawingToolbarToolButton(wrapper, 'connector').trigger('click');

    const nodes = wrapper.findAll('[data-testid="drawing-node"]');
    await dispatchPointerEvent(nodes[0].element, 'pointerdown', { clientX: 100, clientY: 100 });
    await dispatchPointerEvent(window, 'pointermove', { clientX: 220, clientY: 160 });
    await dispatchPointerEvent(nodes[1].element, 'pointerup', { clientX: 220, clientY: 160 });
    await findDrawingConnectorPath(wrapper).trigger('pointerdown');
    await findDrawingStylePanel(wrapper).find('[aria-label="贝塞尔曲线"]').trigger('click');

    const endMarker = findDrawingConnectorEndMarker(wrapper);
    expect(endMarker.exists()).toBe(true);
    expect(nodes[1].element.compareDocumentPosition(endMarker.element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('removes attached connectors when deleting a connected shape', async (): Promise<void> => {
    const wrapper = mount(BDrawing, {
      attachTo: document.body
    });

    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');
    await findDrawingToolbarToolButton(wrapper, 'rect').trigger('click');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerdown');
    await wrapper.find('[data-testid="drawing-canvas"]').trigger('pointerup');
    await findDrawingToolbarToolButton(wrapper, 'connector').trigger('click');

    const nodes = wrapper.findAll('[data-testid="drawing-node"]');
    await dispatchPointerEvent(nodes[0].element, 'pointerdown', { clientX: 100, clientY: 100 });
    await dispatchPointerEvent(window, 'pointermove', { clientX: 220, clientY: 160 });
    await dispatchPointerEvent(wrapper.findAll('[data-testid="drawing-node"]')[1].element, 'pointerup', { clientX: 220, clientY: 160 });
    await findDrawingToolbarToolButton(wrapper, 'select').trigger('click');
    await dispatchPointerEvent(wrapper.findAll('[data-testid="drawing-node"]')[0].element, 'pointerdown', { clientX: 100, clientY: 100 });
    await dispatchPointerEvent(window, 'pointerup', { clientX: 100, clientY: 100 });
    await wrapper.trigger('keydown', { key: 'Delete' });

    expect(findDrawingConnectorPaths(wrapper)).toHaveLength(0);

    wrapper.unmount();
  });
});

describe('DrawingEdgeRenderer', (): void => {
  it('hides the edge DOM when either endpoint is missing', (): void => {
    const edge: DrawingEdge = {
      id: 'edge-1',
      type: 'arrow',
      sourceId: 'missing-source',
      targetId: 'missing-target',
      metadata: {
        source: 'user',
        createdAt: 1
      }
    };
    const elements: DrawingElement[] = [];
    const wrapper = mount(DrawingEdgeRenderer, {
      props: {
        edge,
        elements
      }
    });

    expect(wrapper.find('[data-testid="drawing-edge"]').exists()).toBe(false);
  });
});
