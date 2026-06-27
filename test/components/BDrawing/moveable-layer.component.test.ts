/**
 * @file moveable-layer.component.test.ts
 * @description 验证 BDrawing Moveable 图层根据选中元素类型收敛控制器能力。
 * @vitest-environment jsdom
 */
import { defineComponent, nextTick } from 'vue';
import type { PropType } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import MoveableLayer from '@/components/BDrawing/components/MoveableLayer.vue';
import { DRAWING_ELEMENT_ID_ATTRIBUTE } from '@/components/BDrawing/constants/dom';
import type { DrawingElement, DrawingSize, DrawingViewport } from '@/components/BDrawing/types';

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
       * 模拟 Moveable 对外暴露的位置刷新方法。
       */
      updateRect(this: { className: string }): void {
        moveableUpdateRectMock(this.className);
      }
    },
    template: `
      <div
        v-if="getTargetLength(target)"
        data-testid="moveable-props"
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
      ></div>
    `
  })
}));

/**
 * 创建测试元素。
 * @param id - 元素 ID
 * @param name - 元素注册名称
 * @returns 测试元素
 */
function createDrawingElement(id: string, name: 'rect' | 'text'): DrawingElement {
  return {
    id,
    name,
    label: name === 'text' ? '文本' : '矩形',
    icon: name === 'text' ? 'lucide:type' : 'lucide:square',
    title: name === 'text' ? '文本节点' : '矩形节点',
    position: { x: 20, y: 30 },
    size: { width: 120, height: 48 },
    rotation: 0,
    style: {},
    metadata: {}
  };
}

/**
 * 创建包含画板节点的测试根元素。
 * @param ids - 节点 ID 列表
 * @returns 测试根元素
 */
function createRootElement(ids: string[]): HTMLElement {
  const root = document.createElement('div');

  ids.forEach((id: string): void => {
    const target = document.createElement('div');
    target.setAttribute(DRAWING_ELEMENT_ID_ATTRIBUTE, id);
    root.appendChild(target);
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
 * @returns 测试包装器与根元素
 */
function mountMoveableLayer(selection: string[], activeElementId: string | null = null): { root: HTMLElement; wrapper: VueWrapper } {
  const root = createRootElement(['text-1', 'rect-1']);
  const viewport: DrawingViewport = { center: { x: 0, y: 0 }, zoom: 1 };
  const viewportSize: DrawingSize = { width: 800, height: 600 };
  const wrapper = mount(MoveableLayer, {
    props: {
      root,
      elements: [createDrawingElement('text-1', 'text'), createDrawingElement('rect-1', 'rect')],
      selection,
      viewport,
      viewportSize,
      activeElementId,
      enabled: true
    },
    attachTo: document.body
  });

  return { root, wrapper };
}

describe('MoveableLayer', (): void => {
  afterEach((): void => {
    document.body.innerHTML = '';
    moveableUpdateRectMock.mockClear();
  });

  it('uses the shared resize handles for text while keeping schema resize enabled', async (): Promise<void> => {
    const { wrapper } = mountMoveableLayer(['text-1']);

    await flushMoveableLayerSync();

    const moveableProps = wrapper.find('[data-testid="moveable-props"]');

    expect(moveableProps.attributes('data-resizable')).toBe('true');
    expect(moveableProps.attributes('data-render-directions')).toBe('nw,ne,sw,se');
    expect(moveableProps.attributes('data-snappable')).toBe('true');
    expect(moveableProps.attributes('data-snap-gap')).toBe('true');
    expect(moveableProps.attributes('data-guideline-count')).toBe('1');
    expect(moveableProps.attributes('data-padding-top')).toBe('5');
    expect(moveableProps.attributes('data-padding-right')).toBe('5');
    expect(moveableProps.attributes('data-padding-bottom')).toBe('5');
    expect(moveableProps.attributes('data-padding-left')).toBe('5');
    wrapper.unmount();
  });

  it('keeps rectangle snap gap distance guides when the nearest reference is text', async (): Promise<void> => {
    const { wrapper } = mountMoveableLayer(['rect-1']);

    await flushMoveableLayerSync();

    const moveableProps = wrapper.find('[data-testid="moveable-props"]');

    expect(moveableProps.attributes('data-resizable')).toBe('true');
    expect(moveableProps.attributes('data-snappable')).toBe('true');
    expect(moveableProps.attributes('data-snap-gap')).toBe('true');
    expect(moveableProps.attributes('data-guideline-count')).toBe('1');
    wrapper.unmount();
  });

  it('hides child target default lines when editing a grouped child', async (): Promise<void> => {
    const { wrapper } = mountMoveableLayer(['text-1', 'rect-1'], 'rect-1');

    await flushMoveableLayerSync();

    const moveableProps = wrapper.find('[data-testid="moveable-props"]');

    expect(moveableProps.attributes('data-hide-child-default-lines')).toBe('true');
    wrapper.unmount();
  });

  it('renders the active grouped child through a read-only Moveable control box', async (): Promise<void> => {
    const { wrapper } = mountMoveableLayer(['text-1', 'rect-1'], 'rect-1');

    await flushMoveableLayerSync();

    const moveableProps = wrapper.findAll('[data-testid="moveable-props"]');
    const activeMoveableProps = moveableProps.find((item): boolean => item.attributes('data-class-name') === 'b-drawing-moveable-layer__active-child');

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
    const rectTarget = root.querySelector(`[${DRAWING_ELEMENT_ID_ATTRIBUTE}="rect-1"]`);

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

    expect(moveableUpdateRectMock).toHaveBeenCalledWith('b-drawing-moveable-layer__active-child');
    wrapper.unmount();
  });
});
