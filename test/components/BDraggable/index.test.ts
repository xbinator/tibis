/**
 * @file index.test.ts
 * @description 验证 BDraggable 通过插槽渲染列表项。
 * @vitest-environment jsdom
 */
/* eslint-disable vue/one-component-per-file */
import { readFileSync } from 'node:fs';
import type { Input } from '@atlaskit/pragmatic-drag-and-drop/types';
import { defineComponent } from 'vue';
import { extractClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BDraggable from '@/components/BDraggable/index.vue';

/** BDraggable 组件源码。 */
const bDraggableSource = readFileSync('src/components/BDraggable/index.vue', 'utf8');

/**
 * 捕获的 drop target 配置。
 */
interface CapturedDropTargetOptions {
  /** 读取 drop target 数据 */
  getData?: (args: { input: Input; element: Element }) => Record<string | symbol, unknown>;
  /** 判断当前拖拽源是否可以投放到该目标 */
  canDrop?: (args: { source: { data: Record<string | symbol, unknown> } }) => boolean;
}

/**
 * 捕获的 draggable 配置。
 */
interface CapturedDraggableOptions {
  /** 读取拖拽初始数据 */
  getInitialData?: () => Record<string | symbol, unknown>;
  /** 生成原生拖拽预览 */
  onGenerateDragPreview?: (args: { nativeSetDragImage?: (element: Element, x: number, y: number) => void }) => void;
}

/**
 * 捕获的 monitor 配置。
 */
interface CapturedMonitorOptions {
  /** 判断当前拖拽源是否应该由该 monitor 处理 */
  canMonitor?: (args: { source: { data: Record<string | symbol, unknown> } }) => boolean;
}

/** draggable 配置捕获列表。 */
const capturedDraggableOptions = vi.hoisted<CapturedDraggableOptions[]>(() => []);
/** drop target 配置捕获列表。 */
const capturedDropTargetOptions = vi.hoisted<CapturedDropTargetOptions[]>(() => []);
/** monitor 配置捕获列表。 */
const capturedMonitorOptions = vi.hoisted<CapturedMonitorOptions[]>(() => []);

vi.mock('@atlaskit/pragmatic-drag-and-drop/element/adapter', () => ({
  draggable: vi.fn((options: CapturedDraggableOptions): (() => void) => {
    capturedDraggableOptions.push(options);

    return vi.fn();
  }),
  dropTargetForElements: vi.fn((options: CapturedDropTargetOptions): (() => void) => {
    capturedDropTargetOptions.push(options);

    return vi.fn();
  }),
  monitorForElements: vi.fn((options: CapturedMonitorOptions): (() => void) => {
    capturedMonitorOptions.push(options);

    return vi.fn();
  })
}));

vi.mock('@atlaskit/pragmatic-drag-and-drop-auto-scroll/element', () => ({
  autoScrollForElements: vi.fn(() => vi.fn())
}));

/**
 * 测试列表项。
 */
interface TestItem {
  /** 唯一标识 */
  id: string;
  /** 显示标题 */
  title: string;
}

/** 测试列表。 */
const testItems: TestItem[] = [
  { id: 'node-1', title: '节点 1' },
  { id: 'node-2', title: '节点 2' }
];

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
 * 创建 BDraggable 测试宿主组件。
 * @returns 测试宿主组件
 */
function createDraggableHost(): ReturnType<typeof defineComponent> {
  return defineComponent({
    name: 'BDraggableHost',
    components: { BDraggable },
    setup(): { items: TestItem[] } {
      return { items: testItems };
    },
    template: `
      <BDraggable :list="items" item-key="id" item-class="draggable-row" handle-class="draggable-row__handle">
        <template #default="{ item }">
          <button class="draggable-row__handle" type="button">{{ item.title }}</button>
        </template>
      </BDraggable>
    `
  });
}

/**
 * 创建两个 BDraggable 共存的测试宿主组件。
 * @returns 测试宿主组件
 */
function createDualDraggableHost(): ReturnType<typeof defineComponent> {
  return defineComponent({
    name: 'DualDraggableHost',
    components: { BDraggable },
    setup(): { leftItems: TestItem[]; rightItems: TestItem[] } {
      return {
        leftItems: [
          { id: 'left-1', title: '左 1' },
          { id: 'left-2', title: '左 2' }
        ],
        rightItems: [
          { id: 'right-1', title: '右 1' },
          { id: 'right-2', title: '右 2' }
        ]
      };
    },
    template: `
      <div>
        <BDraggable :list="leftItems" item-key="id" item-class="left-row" handle-class="left-row__handle">
          <template #default="{ item }">
            <button class="left-row__handle" type="button">{{ item.title }}</button>
          </template>
        </BDraggable>
        <BDraggable :list="rightItems" item-key="id" item-class="right-row" handle-class="right-row__handle">
          <template #default="{ item }">
            <button class="right-row__handle" type="button">{{ item.title }}</button>
          </template>
        </BDraggable>
      </div>
    `
  });
}

describe('BDraggable', (): void => {
  beforeEach((): void => {
    capturedDraggableOptions.length = 0;
    capturedDropTargetOptions.length = 0;
    capturedMonitorOptions.length = 0;
  });

  it('renders item wrappers and exposes handle class through the default slot', (): void => {
    const wrapper = mount(createDraggableHost());

    expect(wrapper.findAll('.draggable-row').map((row) => row.text())).toEqual(['节点 1', '节点 2']);
    expect(wrapper.findAll('.draggable-row.is-dragging')).toHaveLength(0);
    expect(wrapper.findAll('.draggable-row__handle')).toHaveLength(2);
    wrapper.unmount();
  });

  it('attaches closest edge data from drop target getData', (): void => {
    const wrapper = mount(createDraggableHost());
    const firstRow = wrapper.find('.draggable-row').element;
    const firstDropTarget = capturedDropTargetOptions[0];

    vi.spyOn(firstRow, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      right: 120,
      bottom: 32,
      left: 0,
      width: 120,
      height: 32,
      toJSON: (): Record<string, never> => ({})
    });

    expect(firstDropTarget?.getData).toBeDefined();
    expect(extractClosestEdge(firstDropTarget?.getData?.({ input: createInput(10, 4), element: firstRow }) ?? {})).toBe('top');
    wrapper.unmount();
  });

  it('uses a dedicated clone for the native drag preview', (): void => {
    const wrapper = mount(createDraggableHost());
    const firstRow = wrapper.find('.draggable-row').element;
    const firstDraggable = capturedDraggableOptions[0];
    const previewElements: Element[] = [];
    const previewOffsets: Array<[number, number]> = [];
    const nativeSetDragImage = vi.fn((element: Element, x: number, y: number): void => {
      previewElements.push(element);
      previewOffsets.push([x, y]);
    });

    firstDraggable?.onGenerateDragPreview?.({ nativeSetDragImage });

    const previewElement = previewElements[0];
    expect(previewElement).toBeInstanceOf(HTMLElement);
    expect(previewElement).not.toBe(firstRow);
    expect(previewElement instanceof HTMLElement && previewElement.classList.contains('b-draggable__native-preview')).toBe(true);
    expect(previewOffsets[0]).toEqual([0, 0]);
    wrapper.unmount();
  });

  it('uses one absolute indicator owned by BDraggable', (): void => {
    expect(bDraggableSource).toContain("bem('indicator'");
    expect(bDraggableSource).toContain('.b-draggable__indicator');
    expect(bDraggableSource).toContain('position: absolute;');
    expect(bDraggableSource).not.toContain('is-drop-before');
    expect(bDraggableSource).not.toContain('is-drop-after');
  });

  it('isolates drag data between different BDraggable instances', (): void => {
    const wrapper = mount(createDualDraggableHost());
    const leftDragData = capturedDraggableOptions[0]?.getInitialData?.() ?? {};
    const rightDropTarget = capturedDropTargetOptions[2];
    const rightMonitor = capturedMonitorOptions[1];

    expect(rightDropTarget?.canDrop?.({ source: { data: leftDragData } })).toBe(false);
    expect(rightMonitor?.canMonitor?.({ source: { data: leftDragData } })).toBe(false);
    wrapper.unmount();
  });
});
