/**
 * @file node-click-selection.test.ts
 * @description 验证 BDrawing 节点点击选中后不会让节点消失。
 * @vitest-environment jsdom
 */
/* eslint-disable vue/one-component-per-file */
import { computed, defineComponent, nextTick, ref, toRaw } from 'vue';
import type { ComponentPublicInstance, ComputedRef, Ref } from 'vue';
import { mount, type DOMWrapper, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BDrawing from '@/components/BDrawing/index.vue';
import type { DrawingData, DrawingElement, DrawingPoint, DrawingSelectTarget } from '@/components/BDrawing/types';

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
    methods: {
      /**
       * 模拟 Moveable 对外暴露的位置刷新方法。
       */
      updateRect(): void {
        return undefined;
      },
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
          events: targets.map((target: Element): MoveableDragTestEvent => {
            const currentTranslate = this.readTargetTranslate(target);

            return {
              target,
              dist: [40, 20],
              translate: [currentTranslate[0] + 40, currentTranslate[1] + 20]
            };
          })
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
    `
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
 * 创建节点点击测试用画板数据。
 * @returns 画板数据
 */
function createNodeClickDrawingData(): DrawingData {
  return {
    metadata: {},
    elements: [
      {
        id: 'node-1',
        name: 'rect',
        label: '矩形',
        icon: 'lucide:square',
        title: '节点',
        position: { x: 80, y: 60 },
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
 * 创建多选节点测试用画板数据。
 * @returns 带两个已选节点的画板数据
 */
function createMultiSelectedDrawingData(): DrawingDataWithSelection {
  return {
    metadata: {},
    elements: [
      {
        id: 'node-1',
        name: 'rect',
        label: '矩形',
        icon: 'lucide:square',
        title: '节点 1',
        position: { x: 80, y: 60 },
        size: { width: 180, height: 72 },
        rotation: 0,
        style: {},
        metadata: {}
      },
      {
        id: 'node-2',
        name: 'rect',
        label: '矩形',
        icon: 'lucide:square',
        title: '节点 2',
        position: { x: 260, y: 120 },
        size: { width: 180, height: 72 },
        rotation: 0,
        style: {},
        metadata: {}
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
 * 创建单选节点切换测试用画板数据。
 * @returns 带两个节点且已选中第一个节点的画板数据
 */
function createSingleSelectedTwoNodeDrawingData(): DrawingDataWithSelection {
  const data = createMultiSelectedDrawingData();

  return {
    ...data,
    selection: ['node-1']
  };
}

/**
 * 创建两个未内置选区的节点测试数据。
 * @returns 两个节点的画板数据
 */
function createTwoNodeDrawingData(): DrawingData {
  const data = createMultiSelectedDrawingData();

  return {
    metadata: data.metadata,
    elements: data.elements,
    viewport: data.viewport
  };
}

/**
 * 创建空画板数据。
 * @returns 画板数据
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
 * BDrawing 暴露给页面层的创建命令。
 */
interface BDrawingExpose {
  /** 根据浏览器坐标创建元素 */
  createElementFromClientPoint: (name: string, point: DrawingPoint) => Promise<void>;
  /** 根据元素 ID 选择元素 */
  selectElementById: (id: string) => void;
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
 * 判断设置目标是否为页面元信息。
 * @param target - 设置面板目标
 * @returns 是否为页面元信息
 */
function isMetadataSelectTarget(target: DrawingSelectTarget): boolean {
  return target !== null && typeof target === 'object' && !('id' in target);
}

/**
 * 判断设置目标是否为画图元素。
 * @param target - 设置面板目标
 * @returns 是否为画图元素
 */
function isElementSelectTarget(target: DrawingSelectTarget): target is DrawingElement {
  return target !== null && typeof target === 'object' && 'id' in target && typeof target.id === 'string';
}

/**
 * 创建带真实 v-model 回写的 BDrawing 测试父组件。
 * @returns 父组件定义
 */
function createDrawingRoundTripHost(): ReturnType<typeof defineComponent> {
  return defineComponent({
    name: 'DrawingRoundTripHost',
    components: {
      BDrawing
    },
    setup(): {
      drawingData: Ref<DrawingData>;
      selectedTarget: Ref<DrawingSelectTarget>;
      selectedId: ComputedRef<string>;
      isSelectedCurrentElement: ComputedRef<boolean>;
    } {
      const drawingData = ref<DrawingData>(createTwoNodeDrawingData());
      const selectedTarget = ref<DrawingSelectTarget>(drawingData.value.metadata);
      const selectedId = computed<string>(() => (isElementSelectTarget(selectedTarget.value) ? selectedTarget.value.id : ''));
      const isSelectedCurrentElement = computed<boolean>(() =>
        isElementSelectTarget(selectedTarget.value) ? drawingData.value.elements.includes(selectedTarget.value) : false
      );

      return {
        drawingData,
        selectedTarget,
        selectedId,
        isSelectedCurrentElement
      };
    },
    template: `
      <div>
        <BDrawing v-model:value="drawingData" v-model:select="selectedTarget" />
        <span data-testid="selected-id">{{ selectedId }}</span>
        <span data-testid="selected-current">{{ isSelectedCurrentElement ? 'yes' : 'no' }}</span>
      </div>
    `
  });
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
  await nextTick();
  await nextTick();
}

describe('BDrawing node click selection', () => {
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

  it('keeps the clicked node visible and positioned after selection', async (): Promise<void> => {
    const data = createNodeClickDrawingData();
    const wrapper = mount(BDrawing, {
      props: {
        value: data
      },
      attachTo: document.body
    });
    const node = findNode(wrapper);
    const initialTransform = node.attributes('style');

    await dispatchPointerEvent(node.element, 'pointerdown', { clientX: 100, clientY: 100 });
    await dispatchPointerEvent(window, 'pointerup', { clientX: 100, clientY: 100 });
    await nextTick();

    const selectedNode = findNode(wrapper);
    const selectedPayload = wrapper.emitted('update:select')?.at(-1)?.[0] as DrawingSelectTarget;
    const latestData = (wrapper.emitted('update:value') as Array<[DrawingData]> | undefined)?.at(-1)?.[0] ?? data;

    expect(selectedNode.exists()).toBe(true);
    expect(selectedNode.classes()).toContain('is-selected');
    expect(selectedNode.attributes('style')).toBe(initialTransform);
    expect(selectedPayload && 'id' in selectedPayload ? selectedPayload.id : '').toBe('node-1');
    expect(toRaw(selectedPayload)).toBe(latestData.elements[0]);
    expect(wrapper.find('[data-testid="moveable-stub"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('creates a visible text node without opening the text editor', async (): Promise<void> => {
    const wrapper = mount(BDrawing, {
      props: {
        value: createEmptyDrawingData()
      },
      attachTo: document.body
    });
    setElementRect(wrapper.element, { height: 600, left: 0, top: 0, width: 800 });

    await getDrawingExpose(wrapper).createElementFromClientPoint('text', { x: 400, y: 300 });
    await nextTick();

    const textNode = wrapper.find('[data-drawing-name="text"]');
    const latestData = (wrapper.emitted('update:value') as Array<[DrawingData]> | undefined)?.at(-1)?.[0] ?? createEmptyDrawingData();
    const textElement = latestData.elements[0];

    expect(textNode.exists()).toBe(true);
    expect(textNode.text()).toContain('文本');
    expect(textElement?.title).toBe('文本');
    expect(textElement?.metadata).toEqual({ content: '文本' });
    expect(wrapper.find('[data-testid="drawing-text-editor"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('creates new elements with schema default styles', async (): Promise<void> => {
    const wrapper = mount(BDrawing, {
      props: {
        value: createEmptyDrawingData()
      },
      attachTo: document.body
    });
    setElementRect(wrapper.element, { height: 600, left: 0, top: 0, width: 800 });

    await getDrawingExpose(wrapper).createElementFromClientPoint('rect', { x: 240, y: 220 });
    await nextTick();
    const rectData = (wrapper.emitted('update:value') as Array<[DrawingData]> | undefined)?.at(-1)?.[0] ?? createEmptyDrawingData();

    await getDrawingExpose(wrapper).createElementFromClientPoint('text', { x: 400, y: 300 });
    await nextTick();
    const textData = (wrapper.emitted('update:value') as Array<[DrawingData]> | undefined)?.at(-1)?.[0] ?? createEmptyDrawingData();

    expect(rectData.elements[0]?.style).toEqual({
      backgroundColor: '#ffffff',
      borderColor: '#d9d9d9',
      borderRadius: 6,
      borderStyle: 'solid',
      borderWidth: 1,
      color: '#1f2937',
      fontSize: 14,
      fontWeight: 400,
      textAlign: 'center',
      textVerticalAlign: 'middle'
    });
    expect(textData.elements[1]?.style).toEqual(rectData.elements[0]?.style);
    wrapper.unmount();
  });

  it('selects a node from the external element id command', async (): Promise<void> => {
    const data = createNodeClickDrawingData();
    const wrapper = mount(BDrawing, {
      props: {
        value: data
      },
      attachTo: document.body
    });

    getDrawingExpose(wrapper).selectElementById('node-1');
    await nextTick();
    await nextTick();

    const selectedPayload = wrapper.emitted('update:select')?.at(-1)?.[0] as DrawingSelectTarget;

    expect(selectedPayload && 'id' in selectedPayload ? selectedPayload.id : '').toBe('node-1');
    expect(wrapper.find('[data-testid="moveable-stub"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('keeps the settings target on an element while switching nodes', async (): Promise<void> => {
    const data = createSingleSelectedTwoNodeDrawingData();
    const wrapper = mount(BDrawing, {
      props: {
        value: data,
        select: data.elements[0]
      },
      attachTo: document.body
    });
    await nextTick();
    await nextTick();
    const emittedBeforeSwitch = wrapper.emitted('update:select')?.length ?? 0;

    await dispatchPointerEvent(findNodeById(wrapper, 'node-2').element, 'pointerdown', { clientX: 300, clientY: 140 });

    const switchEmissions = ((wrapper.emitted('update:select') as Array<[DrawingSelectTarget]> | undefined) ?? []).slice(emittedBeforeSwitch);
    expect(switchEmissions.some(([target]: [DrawingSelectTarget]): boolean => isMetadataSelectTarget(target))).toBe(false);

    await dispatchPointerEvent(window, 'pointerup', { clientX: 300, clientY: 140 });
    await nextTick();

    const selectedPayload = wrapper.emitted('update:select')?.at(-1)?.[0] as DrawingSelectTarget;

    expect(selectedPayload && 'id' in selectedPayload ? selectedPayload.id : '').toBe('node-2');
    wrapper.unmount();
  });

  it('keeps the selected node and moveable handles after moving it one layer up from the context menu', async (): Promise<void> => {
    const data = createSingleSelectedTwoNodeDrawingData();
    const wrapper = mount(BDrawing, {
      props: {
        value: data,
        select: data.elements[0]
      },
      attachTo: document.body
    });
    await nextTick();
    await nextTick();

    await findNodeById(wrapper, 'node-1').trigger('contextmenu', { clientX: 160, clientY: 120 });
    await clickContextMenuItem(wrapper, '上一层');

    const selectedPayload = wrapper.emitted('update:select')?.at(-1)?.[0] as DrawingSelectTarget;
    const latestData = (wrapper.emitted('update:value') as Array<[DrawingData]> | undefined)?.at(-1)?.[0] ?? data;

    expect(findNodeById(wrapper, 'node-1').classes()).toContain('is-selected');
    expect(wrapper.find('[data-testid="moveable-stub"]').exists()).toBe(true);
    expect(selectedPayload && 'id' in selectedPayload ? selectedPayload.id : '').toBe('node-1');
    expect(latestData.elements.map((element: DrawingElement): string => element.id)).toEqual(['node-2', 'node-1']);
    wrapper.unmount();
  });

  it('keeps the parent v-model select bound to the current element after moving a node one layer up', async (): Promise<void> => {
    const wrapper = mount(createDrawingRoundTripHost(), {
      attachTo: document.body
    });
    await nextTick();
    await nextTick();

    await findNodeById(wrapper, 'node-1').trigger('contextmenu', { clientX: 160, clientY: 120 });
    expect(wrapper.find('[data-testid="selected-id"]').text()).toBe('node-1');
    expect(wrapper.find('[data-testid="selected-current"]').text()).toBe('yes');

    await clickContextMenuItem(wrapper, '上一层');

    expect(findNodeById(wrapper, 'node-1').classes()).toContain('is-selected');
    expect(wrapper.find('[data-testid="moveable-stub"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="selected-id"]').text()).toBe('node-1');
    expect(wrapper.find('[data-testid="selected-current"]').text()).toBe('yes');
    wrapper.unmount();
  });

  it('does not open the text editor when a node is double clicked', async (): Promise<void> => {
    const wrapper = mount(BDrawing, {
      props: {
        value: createNodeClickDrawingData()
      },
      attachTo: document.body
    });
    const node = findNode(wrapper);

    await dispatchPointerEvent(node.element, 'dblclick', { clientX: 100, clientY: 100 });
    await nextTick();

    expect(findNode(wrapper).exists()).toBe(true);
    expect(wrapper.find('[data-testid="drawing-text-editor"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('keeps multi selected nodes under the pointer when Moveable reports absolute translate', async (): Promise<void> => {
    const wrapper = mount(BDrawing, {
      props: {
        value: createMultiSelectedDrawingData(),
        select: {}
      },
      attachTo: document.body
    });
    await nextTick();
    await nextTick();

    expect(wrapper.emitted('update:select')?.at(-1)?.[0]).toBeNull();

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
