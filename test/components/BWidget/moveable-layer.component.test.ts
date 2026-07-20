/**
 * @file moveable-layer.component.test.ts
 * @description 验证 BWidget Moveable 图层根据选中元素类型收敛控制器能力。
 * @vitest-environment jsdom
 */
/* eslint-disable vue/one-component-per-file */
import type { WidgetRenderContext } from 'types/widget';
import { computed, defineComponent, nextTick } from 'vue';
import type { PropType } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import MoveableLayer from '@/components/BWidget/components/MoveableLayer.vue';
import { provideRenderContext, type WidgetRenderMode } from '@/components/BWidget/hooks/useRenderContext';
import type { WidgetElement, WidgetGeometryChange, WidgetSize, WidgetViewport } from '@/components/BWidget/types';
import { queryWidgetElementTarget, registerWidgetElementTarget } from '@/components/BWidget/utils/widgetGeometry';
import { createDefaultWidgetElementLoopConfig } from '@/components/BWidget/utils/widgetLoop';

/**
 * Moveable padding 配置。
 */
interface MoveablePadding {
  /** 上侧留白 */
  top: number;
  /** 右侧留白 */
  right: number;
  /** 下侧留白 */
  bottom: number;
  /** 左侧留白 */
  left: number;
}

/**
 * Moveable 测试替身的目标类型。
 */
type MoveableStubTarget = Element[] | Element | null;

/** Moveable updateRect 调用记录。 */
const moveableUpdateRectMock = vi.hoisted(() => vi.fn<(className: string) => void>());
/** Moveable 生命周期调用记录，用于验证目标类型切换时重建控制器。 */
const moveableLifecycleMock = vi.hoisted(() => ({
  mounted: vi.fn<(className: string) => void>(),
  unmounted: vi.fn<(className: string) => void>()
}));

vi.mock('vue3-moveable/dist/moveable.js', () => ({
  default: defineComponent({
    name: 'VueMoveableStub',
    props: {
      elementGuidelines: {
        type: Array as PropType<Element[]>,
        default: (): Element[] => []
      },
      className: {
        type: String,
        default: ''
      },
      draggable: {
        type: Boolean,
        default: false
      },
      hideDefaultLines: {
        type: Boolean,
        default: false
      },
      hideChildMoveableDefaultLines: {
        type: Boolean,
        default: false
      },
      origin: {
        type: Boolean,
        default: true
      },
      padding: {
        type: Object as PropType<MoveablePadding>,
        required: true
      },
      resizable: {
        type: Boolean,
        default: false
      },
      renderDirections: {
        type: Array as PropType<string[]>,
        default: (): string[] => []
      },
      snapGap: {
        type: Boolean,
        default: false
      },
      snappable: {
        type: Boolean,
        default: false
      },
      target: {
        type: [Array, Object] as PropType<MoveableStubTarget>,
        default: null
      }
    },
    mounted(this: { className: string }): void {
      moveableLifecycleMock.mounted(this.className);
    },
    unmounted(this: { className: string }): void {
      moveableLifecycleMock.unmounted(this.className);
    },
    methods: {
      /**
       * 读取 Moveable 测试目标数量。
       * @param target - Moveable 目标
       * @returns 目标数量
       */
      getTargetLength(target: MoveableStubTarget): number {
        if (Array.isArray(target)) {
          return target.length;
        }

        return target ? 1 : 0;
      },
      /**
       * 读取 Moveable 测试目标类型。
       * @param target - Moveable 目标
       * @returns 目标类型
       */
      getTargetKind(target: MoveableStubTarget): string {
        return Array.isArray(target) ? 'group' : 'single';
      },
      /**
       * 读取 Moveable 测试目标 ID。
       * @param target - Moveable 目标
       * @returns 目标 ID 列表
       */
      getTargetIds(target: MoveableStubTarget): string {
        let targets: Element[] = [];

        if (Array.isArray(target)) {
          targets = target;
        } else if (target) {
          targets = [target];
        }

        return targets.map((item: Element): string => (item instanceof HTMLElement ? item.dataset.widgetElementId ?? '' : '')).join(',');
      },
      /**
       * 模拟 Moveable 对外暴露的位置刷新方法。
       */
      updateRect(this: { className: string }): void {
        moveableUpdateRectMock(this.className);
      }
    },
    template: `
      <div
        v-if="getTargetLength(target)"
        class="moveable-props"
        :data-class-name="className"
        :data-draggable="String(draggable)"
        :data-guideline-count="String(elementGuidelines.length)"
        :data-hide-default-lines="String(hideDefaultLines)"
        :data-hide-child-default-lines="String(hideChildMoveableDefaultLines)"
        :data-origin="String(origin)"
        :data-padding-bottom="String(padding.bottom)"
        :data-padding-left="String(padding.left)"
        :data-padding-right="String(padding.right)"
        :data-padding-top="String(padding.top)"
        :data-render-directions="renderDirections.join(',')"
        :data-resizable="String(resizable)"
        :data-snap-gap="String(snapGap)"
        :data-snappable="String(snappable)"
        :data-target-count="String(getTargetLength(target))"
        :data-target-ids="getTargetIds(target)"
        :data-target-kind="getTargetKind(target)"
      ></div>
    `
  })
}));

/**
 * MoveableLayer 测试宿主组件，用于提供与编辑器一致的渲染上下文。
 */
const MoveableLayerHost = defineComponent({
  name: 'MoveableLayerHost',
  components: {
    MoveableLayer
  },
  props: {
    activeElementId: {
      type: String as PropType<string | null>,
      default: null
    },
    elements: {
      type: Array as PropType<WidgetElement[]>,
      required: true
    },
    enabled: {
      type: Boolean,
      required: true
    },
    renderContext: {
      type: Object as PropType<WidgetRenderContext | undefined>,
      default: undefined
    },
    renderMode: {
      type: String as PropType<WidgetRenderMode>,
      default: 'design'
    },
    root: {
      type: Object as PropType<HTMLElement | null>,
      default: null
    },
    selection: {
      type: Array as PropType<string[]>,
      required: true
    },
    viewport: {
      type: Object as PropType<WidgetViewport>,
      required: true
    },
    viewportSize: {
      type: Object as PropType<WidgetSize>,
      required: true
    }
  },
  emits: ['context-menu', 'move', 'preview-end', 'resize', 'resize-preview'],
  setup(props) {
    /** 测试中透传给子节点渲染和 Moveable 尺寸测量的上下文。 */
    const providedRenderContext = computed<WidgetRenderContext | undefined>(() => props.renderContext);

    provideRenderContext(providedRenderContext, { mode: props.renderMode });
  },
  template: `
    <MoveableLayer
      :active-element-id="activeElementId"
      :elements="elements"
      :enabled="enabled"
      :root="root"
      :selection="selection"
      :viewport="viewport"
      :viewport-size="viewportSize"
      @context-menu="$emit('context-menu', $event)"
      @move="$emit('move', $event)"
      @preview-end="$emit('preview-end')"
      @resize="$emit('resize', $event)"
      @resize-preview="$emit('resize-preview', $event)"
    />
  `
});

/**
 * 创建测试元素。
 * @param id - 元素 ID
 * @param name - 元素注册名称
 * @returns 测试元素
 */
function createWidgetElement(id: string, name: 'rect' | 'text'): WidgetElement {
  const textStyle: WidgetElement['style'] = name === 'text' ? { fontSize: 10 } : {};
  const textMetadata: WidgetElement['metadata'] = name === 'text' ? { content: 'abcdef' } : {};

  return {
    id,
    name,
    label: name === 'text' ? '文本' : '矩形',
    icon: name === 'text' ? 'lucide:type' : 'lucide:square',
    title: name === 'text' ? '文本节点' : '矩形节点',
    position: { x: 20, y: 30 },
    size: { width: 120, height: 48 },
    rotation: 0,
    style: textStyle,
    loop: createDefaultWidgetElementLoopConfig(),
    metadata: textMetadata
  };
}

/**
 * 创建测试组合元素。
 * @param id - 组合元素 ID
 * @param children - 组合内子元素
 * @returns 测试组合元素
 */
function createGroupWidgetElement(id: string, children: WidgetElement[]): WidgetElement {
  return {
    id,
    name: 'group',
    label: '组合',
    icon: 'lucide:group',
    title: '组合节点',
    position: { x: 10, y: 20 },
    size: { width: 240, height: 160 },
    rotation: 0,
    style: {},
    loop: createDefaultWidgetElementLoopConfig(),
    metadata: {},
    children
  };
}

/**
 * 收集元素树中所有节点 ID。
 * @param elements - 元素树
 * @returns 节点 ID 列表
 */
function collectWidgetElementIds(elements: WidgetElement[]): string[] {
  return elements.flatMap((element: WidgetElement): string[] => [element.id, ...collectWidgetElementIds(element.children ?? [])]);
}

/**
 * 向测试根元素追加一个Widget节点 DOM。
 * @param root - 测试根元素
 * @param id - 节点 ID
 * @returns 新追加的 DOM target
 */
function appendRootElementTarget(root: HTMLElement, id: string): HTMLElement {
  const target = document.createElement('div');
  target.className = 'b-widget-node';
  target.dataset.widgetElementId = id;
  registerWidgetElementTarget(target, id);
  root.appendChild(target);

  return target;
}

/**
 * 创建包含Widget 节点的测试根元素。
 * @param ids - 节点 ID 列表
 * @returns 测试根元素
 */
function createRootElement(ids: string[]): HTMLElement {
  const root = document.createElement('div');

  ids.forEach((id: string): void => {
    appendRootElementTarget(root, id);
  });

  document.body.appendChild(root);

  return root;
}

/**
 * 等待 MoveableLayer 完成目标节点同步。
 */
async function flushMoveableLayerSync(): Promise<void> {
  await nextTick();
  await nextTick();
}

/**
 * 挂载 MoveableLayer 测试实例。
 * @param selection - 当前选区
 * @param activeElementId - 组合选区内当前编辑的子元素 ID
 * @param elements - 测试元素列表
 * @param renderContext - 测试渲染上下文
 * @param renderMode - 测试渲染模式
 * @returns 测试包装器与根元素
 */
function mountMoveableLayer(
  selection: string[],
  activeElementId: string | null = null,
  elements: WidgetElement[] = [createWidgetElement('text-1', 'text'), createWidgetElement('rect-1', 'rect')],
  renderContext: WidgetRenderContext | undefined = undefined,
  renderMode: WidgetRenderMode = 'design'
): { root: HTMLElement; wrapper: VueWrapper } {
  const root = createRootElement(collectWidgetElementIds(elements));
  const viewport: WidgetViewport = { center: { x: 0, y: 0 }, zoom: 1 };
  const viewportSize: WidgetSize = { width: 800, height: 600 };
  const wrapper = mount(MoveableLayerHost, {
    props: {
      root,
      elements,
      selection,
      viewport,
      viewportSize,
      activeElementId,
      enabled: true,
      renderContext,
      renderMode
    },
    attachTo: document.body
  });

  return { root, wrapper };
}

describe('MoveableLayer', (): void => {
  afterEach((): void => {
    document.body.innerHTML = '';
    moveableUpdateRectMock.mockClear();
    moveableLifecycleMock.mounted.mockClear();
    moveableLifecycleMock.unmounted.mockClear();
  });

  it('uses the shared resize handles for text while keeping schema resize enabled', async (): Promise<void> => {
    const { wrapper } = mountMoveableLayer(['text-1']);

    await flushMoveableLayerSync();

    const moveableProps = wrapper.find('.moveable-props');

    expect(moveableProps.attributes('data-resizable')).toBe('true');
    expect(moveableProps.attributes('data-render-directions')).toBe('nw,ne,sw,se');
    expect(moveableProps.attributes('data-snappable')).toBe('true');
    expect(moveableProps.attributes('data-snap-gap')).toBe('true');
    expect(moveableProps.attributes('data-guideline-count')).toBe('1');
    expect(moveableProps.attributes('data-target-kind')).toBe('single');
    expect(moveableProps.attributes('data-padding-top')).toBe('0');
    expect(moveableProps.attributes('data-padding-right')).toBe('0');
    expect(moveableProps.attributes('data-padding-bottom')).toBe('0');
    expect(moveableProps.attributes('data-padding-left')).toBe('0');
    wrapper.unmount();
  });

  it('keeps rectangle snap gap distance guides when the nearest reference is text', async (): Promise<void> => {
    const { wrapper } = mountMoveableLayer(['rect-1']);

    await flushMoveableLayerSync();

    const moveableProps = wrapper.find('.moveable-props');

    expect(moveableProps.attributes('data-resizable')).toBe('true');
    expect(moveableProps.attributes('data-snappable')).toBe('true');
    expect(moveableProps.attributes('data-snap-gap')).toBe('true');
    expect(moveableProps.attributes('data-guideline-count')).toBe('1');
    wrapper.unmount();
  });

  it('disables drag, resize and snapping when the selected element is locked', async (): Promise<void> => {
    const lockedElement = {
      ...createWidgetElement('rect-1', 'rect'),
      locked: true
    };
    const { wrapper } = mountMoveableLayer(['rect-1'], null, [lockedElement, createWidgetElement('text-1', 'text')]);

    await flushMoveableLayerSync();

    const moveableProps = wrapper.find('.moveable-props');

    expect(moveableProps.attributes('data-draggable')).toBe('false');
    expect(moveableProps.attributes('data-resizable')).toBe('false');
    expect(moveableProps.attributes('data-snappable')).toBe('false');
    expect(moveableProps.attributes('data-snap-gap')).toBe('false');
    wrapper.unmount();
  });

  it('keeps parent groups draggable and resizable when a descendant is locked', async (): Promise<void> => {
    const lockedChild = {
      ...createWidgetElement('group-child-1', 'rect'),
      locked: true
    };
    const group = createGroupWidgetElement('group-1', [lockedChild]);
    const outsideElement = createWidgetElement('outside-1', 'rect');
    const { wrapper } = mountMoveableLayer(['group-1'], null, [group, outsideElement]);

    await flushMoveableLayerSync();

    const moveableProps = wrapper.find('.moveable-props');

    expect(moveableProps.attributes('data-draggable')).toBe('true');
    expect(moveableProps.attributes('data-resizable')).toBe('true');
    expect(moveableProps.attributes('data-snappable')).toBe('true');
    wrapper.unmount();
  });

  it('excludes selected group descendants from snap guidelines while moving the group', async (): Promise<void> => {
    const groupChild = createWidgetElement('group-child-1', 'rect');
    const group = createGroupWidgetElement('group-1', [groupChild]);
    const outsideElement = createWidgetElement('outside-1', 'rect');
    const { wrapper } = mountMoveableLayer(['group-1'], null, [group, outsideElement]);

    await flushMoveableLayerSync();

    const moveableProps = wrapper.find('.moveable-props');

    expect(moveableProps.attributes('data-guideline-count')).toBe('1');
    wrapper.unmount();
  });

  it('keeps cleared selection empty when an older async target sync finishes later', async (): Promise<void> => {
    const staleElement = createWidgetElement('stale-1', 'rect');
    const root = createRootElement([]);
    const viewport: WidgetViewport = { center: { x: 0, y: 0 }, zoom: 1 };
    const viewportSize: WidgetSize = { width: 800, height: 600 };
    const wrapper = mount(MoveableLayerHost, {
      props: {
        root,
        elements: [staleElement],
        selection: ['stale-1'],
        viewport,
        viewportSize,
        enabled: true
      },
      attachTo: document.body
    });

    const clearSelection = wrapper.setProps({
      selection: []
    });
    appendRootElementTarget(root, 'stale-1');
    await clearSelection;
    await flushMoveableLayerSync();

    expect(wrapper.find('.moveable-props').exists()).toBe(false);
    wrapper.unmount();
  });

  it('remounts the controller when a multi selection becomes one grouped target', async (): Promise<void> => {
    const firstElement = createWidgetElement('text-1', 'text');
    const secondElement = createWidgetElement('rect-1', 'rect');
    const group = createGroupWidgetElement('group-1', [firstElement, secondElement]);
    const { root, wrapper } = mountMoveableLayer(['text-1', 'rect-1'], null, [firstElement, secondElement]);

    await flushMoveableLayerSync();
    moveableLifecycleMock.mounted.mockClear();
    moveableLifecycleMock.unmounted.mockClear();
    appendRootElementTarget(root, 'group-1');

    await wrapper.setProps({
      elements: [group],
      selection: ['group-1']
    });
    await flushMoveableLayerSync();

    expect(moveableLifecycleMock.unmounted).toHaveBeenCalledWith('');
    expect(moveableLifecycleMock.mounted).toHaveBeenCalledWith('');
    expect(wrapper.find('.moveable-props').attributes('data-target-kind')).toBe('single');
    wrapper.unmount();
  });

  it('hides child target default lines when editing a grouped child', async (): Promise<void> => {
    const { wrapper } = mountMoveableLayer(['text-1', 'rect-1'], 'rect-1');

    await flushMoveableLayerSync();

    const moveableProps = wrapper.find('.moveable-props');

    expect(moveableProps.attributes('data-hide-child-default-lines')).toBe('true');
    wrapper.unmount();
  });

  it('renders the active grouped child through a read-only Moveable control box', async (): Promise<void> => {
    const { wrapper } = mountMoveableLayer(['text-1', 'rect-1'], 'rect-1');

    await flushMoveableLayerSync();

    const moveableProps = wrapper.findAll('.moveable-props');
    const activeMoveableProps = moveableProps.find((item): boolean => item.attributes('data-class-name') === 'b-widget-moveable-layer__active-child');

    expect(moveableProps).toHaveLength(2);
    expect(activeMoveableProps?.attributes('data-target-count')).toBe('1');
    expect(activeMoveableProps?.attributes('data-draggable')).toBe('false');
    expect(activeMoveableProps?.attributes('data-resizable')).toBe('false');
    expect(activeMoveableProps?.attributes('data-snappable')).toBe('false');
    expect(activeMoveableProps?.attributes('data-origin')).toBe('false');
    expect(activeMoveableProps?.attributes('data-padding-top')).toBe('0');
    expect(activeMoveableProps?.attributes('data-padding-right')).toBe('0');
    expect(activeMoveableProps?.attributes('data-padding-bottom')).toBe('0');
    expect(activeMoveableProps?.attributes('data-padding-left')).toBe('0');
    expect(activeMoveableProps?.attributes('data-render-directions')).toBe('');
    wrapper.unmount();
  });

  it('refreshes the active grouped child control box while grouped targets are dragged', async (): Promise<void> => {
    const { root, wrapper } = mountMoveableLayer(['text-1', 'rect-1'], 'rect-1');

    await flushMoveableLayerSync();
    moveableUpdateRectMock.mockClear();

    const moveableComponents = wrapper.findAllComponents({ name: 'VueMoveableStub' });
    const rectTarget = queryWidgetElementTarget(root, 'rect-1');

    expect(rectTarget).not.toBeNull();
    moveableComponents[0].vm.$emit('drag-group', {
      events: [
        {
          target: rectTarget as Element,
          dist: [16, 8]
        }
      ]
    });
    await nextTick();

    expect(moveableUpdateRectMock).toHaveBeenCalledWith('b-widget-moveable-layer__active-child');
    wrapper.unmount();
  });

  it('restores text target render size when a drag starts after a stale resize preview', async (): Promise<void> => {
    const textElement: WidgetElement = {
      ...createWidgetElement('text-1', 'text'),
      size: { width: 30, height: 12 }
    };
    const { root, wrapper } = mountMoveableLayer(['text-1'], null, [textElement, createWidgetElement('rect-1', 'rect')]);

    await flushMoveableLayerSync();
    moveableUpdateRectMock.mockClear();

    const moveableComponent = wrapper.findComponent({ name: 'VueMoveableStub' });
    const textTarget = queryWidgetElementTarget(root, 'text-1');

    expect(textTarget).not.toBeNull();
    (textTarget as HTMLElement).style.width = '30px';
    (textTarget as HTMLElement).style.height = '12px';
    moveableComponent.vm.$emit('drag-start', {
      target: textTarget as Element
    });
    await nextTick();

    expect((textTarget as HTMLElement).style.width).toBe('30px');
    expect((textTarget as HTMLElement).style.height).toBe('31px');
    expect(moveableUpdateRectMock).toHaveBeenCalledWith('');
    wrapper.unmount();
  });

  it('emits a geometry preview while a target is dragged', async (): Promise<void> => {
    const { root, wrapper } = mountMoveableLayer(['rect-1']);

    await flushMoveableLayerSync();

    const moveableComponent = wrapper.findComponent({ name: 'VueMoveableStub' });
    const rectTarget = queryWidgetElementTarget(root, 'rect-1');

    expect(rectTarget).not.toBeNull();
    moveableComponent.vm.$emit('drag', {
      target: rectTarget as Element,
      dist: [16, 8]
    });
    await nextTick();

    const previewEvents = wrapper.emitted('resize-preview') as [WidgetGeometryChange[]][] | undefined;
    expect(previewEvents?.[0]?.[0][0]).toMatchObject({
      id: 'rect-1',
      position: { x: 36, y: 38 }
    });
    wrapper.unmount();
  });

  it('keeps text resize previews on the raw Moveable size before final content normalization', async (): Promise<void> => {
    const { root, wrapper } = mountMoveableLayer(['text-1']);

    await flushMoveableLayerSync();

    const moveableComponent = wrapper.findComponent({ name: 'VueMoveableStub' });
    const textTarget = queryWidgetElementTarget(root, 'text-1');

    expect(textTarget).not.toBeNull();
    moveableComponent.vm.$emit('resize', {
      target: textTarget as Element,
      width: 30,
      height: 12,
      drag: {
        beforeTranslate: [4, 6]
      }
    });
    await nextTick();

    const previewEvents = wrapper.emitted('resize-preview') as [WidgetGeometryChange[]][] | undefined;
    const textTargetStyle = (textTarget as HTMLElement).style;

    expect(previewEvents?.[0]?.[0][0]).toMatchObject({
      id: 'text-1',
      position: { x: 24, y: 36 },
      size: { width: 30, height: 12 }
    });
    expect(textTargetStyle.width).toBe('30px');
    expect(textTargetStyle.height).toBe('12px');
    wrapper.unmount();
  });

  it('sets text resize start from the schema render size before the first resize frame', async (): Promise<void> => {
    const textElement: WidgetElement = {
      ...createWidgetElement('text-1', 'text'),
      size: { width: 30, height: 12 }
    };
    const setStartSize = vi.fn<(size: [number, number]) => void>();
    const { root, wrapper } = mountMoveableLayer(['text-1'], null, [textElement, createWidgetElement('rect-1', 'rect')]);

    await flushMoveableLayerSync();

    const moveableComponent = wrapper.findComponent({ name: 'VueMoveableStub' });
    const textTarget = queryWidgetElementTarget(root, 'text-1');

    expect(textTarget).not.toBeNull();
    moveableComponent.vm.$emit('resize-start', {
      target: textTarget as Element,
      set: setStartSize
    });
    await nextTick();

    expect(setStartSize).toHaveBeenCalledWith([30, 31]);
    wrapper.unmount();
  });

  it('sets bound text resize start from the resolved render context content', async (): Promise<void> => {
    const textElement: WidgetElement = {
      ...createWidgetElement('text-1', 'text'),
      size: { width: 30, height: 12 },
      metadata: { content: '{{ shortText }}' }
    };
    const renderContext: WidgetRenderContext = {
      input: {},
      output: undefined,
      data: { shortText: 'abcdef' }
    };
    const setStartSize = vi.fn<(size: [number, number]) => void>();
    const { root, wrapper } = mountMoveableLayer(['text-1'], null, [textElement, createWidgetElement('rect-1', 'rect')], renderContext, 'runtime');

    await flushMoveableLayerSync();

    const moveableComponent = wrapper.findComponent({ name: 'VueMoveableStub' });
    const textTarget = queryWidgetElementTarget(root, 'text-1');

    expect(textTarget).not.toBeNull();
    moveableComponent.vm.$emit('resize-start', {
      target: textTarget as Element,
      set: setStartSize
    });
    await nextTick();

    expect(setStartSize).toHaveBeenCalledWith([30, 31]);
    wrapper.unmount();
  });

  it('normalizes bound text resize end with the resolved render context content', async (): Promise<void> => {
    const textElement: WidgetElement = {
      ...createWidgetElement('text-1', 'text'),
      size: { width: 30, height: 12 },
      metadata: { content: '{{ shortText }}' }
    };
    const renderContext: WidgetRenderContext = {
      input: {},
      output: undefined,
      data: { shortText: 'abcdef' }
    };
    const { root, wrapper } = mountMoveableLayer(['text-1'], null, [textElement, createWidgetElement('rect-1', 'rect')], renderContext, 'runtime');

    await flushMoveableLayerSync();

    const moveableComponent = wrapper.findComponent({ name: 'VueMoveableStub' });
    const textTarget = queryWidgetElementTarget(root, 'text-1');

    expect(textTarget).not.toBeNull();
    moveableComponent.vm.$emit('resize-end', {
      target: textTarget as Element,
      width: 30,
      height: 12
    });
    await nextTick();

    const resizeEvents = wrapper.emitted('resize') as [WidgetGeometryChange[]][] | undefined;

    expect(resizeEvents?.[0]?.[0][0]).toMatchObject({
      id: 'text-1',
      size: { width: 30, height: 31 }
    });
    wrapper.unmount();
  });

  it('keeps a manual design resize when hidden bindings have no visible content', async (): Promise<void> => {
    const textElement: WidgetElement = {
      ...createWidgetElement('text-1', 'text'),
      size: { width: 30, height: 12 },
      style: { fontSize: 10 },
      metadata: { content: "{{ movie.hasScore ? movie.scoreText : '暂无' }}" }
    };
    const { root, wrapper } = mountMoveableLayer(['text-1'], null, [textElement]);

    await flushMoveableLayerSync();
    const moveableComponent = wrapper.findComponent({ name: 'VueMoveableStub' });
    const textTarget = queryWidgetElementTarget(root, 'text-1');

    expect(textTarget).not.toBeNull();
    moveableComponent.vm.$emit('resize-end', {
      target: textTarget as Element,
      width: 30,
      height: 24
    });
    await nextTick();

    const resizeEvents = wrapper.emitted('resize') as [WidgetGeometryChange[]][] | undefined;
    expect(resizeEvents?.[0]?.[0][0].size).toEqual({ width: 30, height: 24 });
    wrapper.unmount();
  });

  it('refreshes the control box immediately when a resize starts after initial layout changes', async (): Promise<void> => {
    const setStartSize = vi.fn<(size: [number, number]) => void>();
    const { root, wrapper } = mountMoveableLayer(['text-1']);

    await flushMoveableLayerSync();
    moveableUpdateRectMock.mockClear();

    const moveableComponent = wrapper.findComponent({ name: 'VueMoveableStub' });
    const textTarget = queryWidgetElementTarget(root, 'text-1');

    expect(textTarget).not.toBeNull();
    moveableComponent.vm.$emit('resize-start', {
      target: textTarget as Element,
      set: setStartSize
    });
    await nextTick();

    expect(moveableUpdateRectMock).toHaveBeenCalledWith('');
    expect(setStartSize).toHaveBeenCalledWith([120, 48]);
    wrapper.unmount();
  });
});
