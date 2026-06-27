/**
 * @file index.test.ts
 * @description 验证画图页面文件菜单事件绑定。
 * @vitest-environment jsdom
 */
import { defineComponent, nextTick } from 'vue';
import { shallowMount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DrawingData, DrawingElement } from '@/components/BDrawing/types';
import { emitter } from '@/utils/emitter';
import DrawingPage from '@/views/drawing/index.vue';

const addTabMock = vi.hoisted(() => vi.fn());
const onSaveMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const onSaveAsMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const onRenameMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const selectElementByIdMock = vi.hoisted(() => vi.fn());
const drawingDataMock = vi.hoisted((): { value: DrawingData } => ({
  value: {
    metadata: {},
    elements: [],
    viewport: {
      center: { x: 0, y: 0 },
      zoom: 1
    }
  }
}));

vi.mock('vue-router', () => ({
  useRoute: () => ({
    fullPath: '/drawing/drawing-1',
    params: {
      id: 'drawing-1'
    }
  })
}));

vi.mock('@/stores/workspace/tabs', () => ({
  useTabsStore: () => ({
    addTab: addTabMock
  })
}));

vi.mock('@/hooks/useFileSession', () => ({
  useFileSession: () => ({
    currentTitle: {
      value: 'board.tibis',
      __v_isRef: true
    },
    fileState: {
      value: {
        id: 'drawing-1',
        name: 'board',
        ext: 'tibis',
        path: null,
        content: ''
      },
      __v_isRef: true
    },
    data: drawingDataMock,
    actions: {
      onSave: onSaveMock,
      onSaveAs: onSaveAsMock,
      onRename: onRenameMock,
      onDelete: vi.fn(),
      onShowInFolder: vi.fn(),
      onCopyPath: vi.fn(),
      onCopyRelativePath: vi.fn(),
      onBlur: vi.fn()
    }
  })
}));

/**
 * 创建空画图测试数据。
 * @returns 画图测试数据
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
 * 创建页面图层测试元素。
 * @param id - 元素 ID
 * @param title - 元素名称
 * @returns 测试元素
 */
function createDrawingElement(id: string, title: string): DrawingElement {
  return {
    id,
    name: 'rect',
    label: '矩形',
    icon: 'lucide:square',
    title,
    position: { x: 0, y: 0 },
    size: { width: 120, height: 80 },
    rotation: 0,
    style: {},
    metadata: {}
  };
}

/**
 * 创建 BDrawing 测试替身。
 * @returns BDrawing 测试组件
 */
function createBDrawingStub(): ReturnType<typeof defineComponent> {
  return defineComponent({
    name: 'BDrawing',
    setup(_props, { expose }): Record<string, never> {
      expose({
        createElementFromClientPoint: vi.fn(),
        selectElementById: selectElementByIdMock
      });

      return {};
    },
    template: '<div class="b-drawing-stub"></div>'
  });
}

/**
 * 等待异步事件处理完成。
 * @returns Promise
 */
function flushPromises(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

describe('DrawingPage', (): void => {
  beforeEach((): void => {
    addTabMock.mockClear();
    onSaveMock.mockClear();
    onSaveAsMock.mockClear();
    onRenameMock.mockClear();
    selectElementByIdMock.mockClear();
    drawingDataMock.value = createEmptyDrawingData();
  });

  it('adds the drawing file tab with resolved file title', (): void => {
    const wrapper = shallowMount(DrawingPage, {
      global: {
        stubs: {
          BDrawing: true,
          Icon: true
        }
      }
    });

    expect(addTabMock).toHaveBeenCalledWith({
      id: 'drawing-1',
      path: '/drawing/drawing-1',
      title: 'board.tibis',
      cacheKey: 'drawing:drawing-1'
    });

    wrapper.unmount();
  });

  it('handles global file menu events while active', async (): Promise<void> => {
    const wrapper = shallowMount(DrawingPage, {
      global: {
        stubs: {
          BDrawing: true,
          Icon: true
        }
      }
    });

    emitter.emit('file:save');
    emitter.emit('file:saveAs');
    emitter.emit('file:rename');
    await flushPromises();

    expect(onSaveMock).toHaveBeenCalledTimes(1);
    expect(onSaveAsMock).toHaveBeenCalledTimes(1);
    expect(onRenameMock).toHaveBeenCalledTimes(1);

    wrapper.unmount();
  });

  it('selects the drawing element when the sidebar layer emits selection', async (): Promise<void> => {
    const selectedElement = createDrawingElement('node-2', '节点 2');
    drawingDataMock.value = {
      ...createEmptyDrawingData(),
      elements: [createDrawingElement('node-1', '节点 1'), selectedElement]
    };
    const wrapper = shallowMount(DrawingPage, {
      global: {
        stubs: {
          BDrawing: createBDrawingStub(),
          Icon: true
        }
      }
    });
    const panelSidebar = wrapper.findComponent({ name: 'PanelSidebar' });

    panelSidebar.vm.$emit('select-element', selectedElement);
    await nextTick();

    expect(selectElementByIdMock).toHaveBeenCalledWith('node-2');
    expect(panelSidebar.props('selectedElementIds')).toEqual(['node-2']);
    wrapper.unmount();
  });

  it('copies the drawing element when the sidebar layer emits copy', async (): Promise<void> => {
    const copiedElement = createDrawingElement('node-2', '节点 2');
    drawingDataMock.value = {
      ...createEmptyDrawingData(),
      elements: [createDrawingElement('node-1', '节点 1'), copiedElement, createDrawingElement('node-3', '节点 3')]
    };
    const wrapper = shallowMount(DrawingPage, {
      global: {
        stubs: {
          BDrawing: createBDrawingStub(),
          Icon: true
        }
      }
    });
    const panelSidebar = wrapper.findComponent({ name: 'PanelSidebar' });

    panelSidebar.vm.$emit('copy-element', copiedElement);
    await flushPromises();

    expect(drawingDataMock.value.elements.map((element: DrawingElement): string => element.id)).toEqual(['node-1', 'node-2', 'drawing-shape-1', 'node-3']);
    expect(drawingDataMock.value.elements[2]).toMatchObject({
      title: '节点 2',
      position: {
        x: 16,
        y: 16
      }
    });
    expect(selectElementByIdMock).toHaveBeenCalledWith('drawing-shape-1');
    expect(panelSidebar.props('selectedElementIds')).toEqual(['drawing-shape-1']);
    wrapper.unmount();
  });

  it('deletes the drawing element when the sidebar layer emits delete', async (): Promise<void> => {
    const selectedElement = createDrawingElement('node-2', '节点 2');
    drawingDataMock.value = {
      ...createEmptyDrawingData(),
      elements: [createDrawingElement('node-1', '节点 1'), selectedElement]
    };
    const wrapper = shallowMount(DrawingPage, {
      global: {
        stubs: {
          BDrawing: createBDrawingStub(),
          Icon: true
        }
      }
    });
    const panelSidebar = wrapper.findComponent({ name: 'PanelSidebar' });

    panelSidebar.vm.$emit('select-element', selectedElement);
    panelSidebar.vm.$emit('delete-element', selectedElement);
    await nextTick();

    expect(drawingDataMock.value.elements.map((element: DrawingElement): string => element.id)).toEqual(['node-1']);
    expect(panelSidebar.props('selectedElementIds')).toEqual([]);
    wrapper.unmount();
  });

  it('reorders drawing elements when the sidebar layer emits move', async (): Promise<void> => {
    const selectedElement = createDrawingElement('node-2', '节点 2');
    drawingDataMock.value = {
      ...createEmptyDrawingData(),
      elements: [createDrawingElement('node-1', '节点 1'), selectedElement, createDrawingElement('node-3', '节点 3')]
    };
    const wrapper = shallowMount(DrawingPage, {
      global: {
        stubs: {
          BDrawing: createBDrawingStub(),
          Icon: true
        }
      }
    });
    const panelSidebar = wrapper.findComponent({ name: 'PanelSidebar' });

    panelSidebar.vm.$emit('select-element', selectedElement);
    await nextTick();
    panelSidebar.vm.$emit('move-element', 'node-1', 'node-3', 'before');
    await nextTick();

    expect(drawingDataMock.value.elements.map((element: DrawingElement): string => element.id)).toEqual(['node-2', 'node-3', 'node-1']);
    expect(panelSidebar.props('selectedElementIds')).toEqual(['node-2']);
    wrapper.unmount();
  });
});
