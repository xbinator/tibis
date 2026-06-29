/**
 * @file index.test.ts
 * @description 验证画图页面文件菜单事件绑定。
 * @vitest-environment jsdom
 */
import { defineComponent, nextTick } from 'vue';
import type { ComponentPublicInstance, PropType } from 'vue';
import { shallowMount, type VueWrapper } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DrawingData, DrawingElement, DrawingSelectTarget } from '@/components/BDrawing/types';
import { createDefaultDrawingData } from '@/components/BDrawing/utils/drawingData';
import { emitter } from '@/utils/emitter';
import DrawingPage from '@/views/drawing/index.vue';

const addTabMock = vi.hoisted(() => vi.fn());
const onSaveMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const onSaveAsMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const onRenameMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const selectElementByIdMock = vi.hoisted(() => vi.fn());
const selectElementsByIdsMock = vi.hoisted(() => vi.fn());
const copySelectionMock = vi.hoisted(() => vi.fn());
const groupSelectionMock = vi.hoisted(() => vi.fn());
const ungroupSelectionMock = vi.hoisted(() => vi.fn());
const deleteSelectionMock = vi.hoisted(() => vi.fn());
const reorderSelectionMock = vi.hoisted(() => vi.fn());
const nanoidMock = vi.hoisted(() => vi.fn<() => string>());
const drawingDataMock = vi.hoisted((): { value: DrawingData } => ({
  value: {
    name: '',
    description: '',
    inputSchema: {
      type: 'object',
      properties: {},
      required: []
    },
    outputSchema: {
      type: 'object',
      properties: {},
      required: []
    },
    metadata: {},
    elements: [],
    viewport: {
      center: { x: 0, y: 0 },
      zoom: 1
    }
  }
}));

vi.mock('nanoid', () => ({
  nanoid: nanoidMock
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
 * 创建页面图层测试元素。
 * @param id - 元素 ID
 * @param title - 元素名称
 * @param groupId - 组合 ID
 * @returns 测试元素
 */
function createDrawingElement(id: string, title: string, groupId?: string): DrawingElement {
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
    metadata: groupId ? { groupId } : {}
  };
}

/**
 * 创建 BDrawing 测试替身。
 * @returns BDrawing 测试组件
 */
function createBDrawingStub(): ReturnType<typeof defineComponent> {
  return defineComponent({
    name: 'BDrawing',
    props: {
      value: {
        type: Object as PropType<DrawingData>,
        required: true
      },
      select: {
        type: Object as PropType<DrawingSelectTarget>,
        default: null
      }
    },
    emits: ['selection-change', 'update:select', 'update:value'],
    setup(_props, { attrs, expose }): Record<string, never> {
      expose({
        readAttrs: (): Record<string, unknown> => attrs,
        createElementFromClientPoint: vi.fn(),
        selectElementById: selectElementByIdMock,
        selectElementsByIds: selectElementsByIdsMock,
        copySelection: copySelectionMock,
        groupSelection: groupSelectionMock,
        ungroupSelection: ungroupSelectionMock,
        deleteSelection: deleteSelectionMock,
        reorderSelection: reorderSelectionMock
      });

      return {};
    },
    template: '<div class="b-drawing-stub"></div>'
  });
}

/**
 * BDrawing 测试替身暴露能力。
 */
interface BDrawingStubExpose {
  /** 读取未声明为属性的透传参数 */
  readAttrs: () => Record<string, unknown>;
}

/**
 * 读取 BDrawing 测试替身暴露能力。
 * @param wrapper - BDrawing 测试替身包装器
 * @returns 替身暴露能力
 */
function getBDrawingStubExpose(wrapper: VueWrapper): ComponentPublicInstance & BDrawingStubExpose {
  return wrapper.vm as ComponentPublicInstance & BDrawingStubExpose;
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
    selectElementsByIdsMock.mockClear();
    copySelectionMock.mockClear();
    groupSelectionMock.mockClear();
    ungroupSelectionMock.mockClear();
    deleteSelectionMock.mockClear();
    reorderSelectionMock.mockClear();
    nanoidMock.mockReset();
    drawingDataMock.value = createDefaultDrawingData();
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

  it('syncs page settings data through the value model', async (): Promise<void> => {
    const wrapper = shallowMount(DrawingPage, {
      global: {
        stubs: {
          BDrawing: true,
          Icon: true
        }
      }
    });
    const panelSettings = wrapper.findComponent({ name: 'PanelSettings' });
    const nextDrawingData: DrawingData = {
      ...createDefaultDrawingData(),
      name: 'profile_card',
      description: '根据用户资料生成卡片节点'
    };

    expect(panelSettings.props('value')).toBe(drawingDataMock.value);

    panelSettings.vm.$emit('update:value', nextDrawingData);
    await nextTick();

    expect(drawingDataMock.value).toEqual(nextDrawingData);
    wrapper.unmount();
  });

  it('keeps design preview context inside drawing value instead of passing a separate prop', (): void => {
    drawingDataMock.value = {
      ...createDefaultDrawingData(),
      metadata: {
        previewContext: {
          input: {
            city: '上海'
          },
          state: {
            weather: {
              temperature: 28
            }
          }
        }
      }
    };
    const wrapper = shallowMount(DrawingPage, {
      global: {
        stubs: {
          BDrawing: createBDrawingStub(),
          Icon: true
        }
      }
    });
    const drawing = wrapper.findComponent({ name: 'BDrawing' });
    const drawingAttrs = getBDrawingStubExpose(drawing).readAttrs();

    expect(drawing.props('value')).toEqual(drawingDataMock.value);
    expect(drawingAttrs).not.toHaveProperty('renderContext');
    expect(drawingAttrs).not.toHaveProperty('render-context');
    wrapper.unmount();
  });

  it('selects the drawing element when the sidebar layer emits selection', async (): Promise<void> => {
    const selectedElement = createDrawingElement('node-2', '节点 2');
    drawingDataMock.value = {
      ...createDefaultDrawingData(),
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

  it('selects a grouped child as the editable target when the sidebar layer emits child selection', async (): Promise<void> => {
    const selectedElement = createDrawingElement('node-2', '节点 2', 'drawing-group-1');
    drawingDataMock.value = {
      ...createDefaultDrawingData(),
      elements: [createDrawingElement('node-1', '节点 1', 'drawing-group-1'), selectedElement]
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
    const panelSettings = wrapper.findComponent({ name: 'PanelSettings' });

    panelSidebar.vm.$emit('select-element', selectedElement);
    await nextTick();

    expect(selectElementByIdMock).toHaveBeenCalledWith('node-2', { activateElement: true });
    expect(panelSidebar.props('selectedElementIds')).toEqual(['node-2']);
    expect(panelSettings.props('select')).toEqual(selectedElement);
    wrapper.unmount();
  });

  it('selects grouped drawing elements when the sidebar layer emits group selection', async (): Promise<void> => {
    const firstElement = createDrawingElement('node-1', '节点 1', 'drawing-group-1');
    const secondElement = createDrawingElement('node-2', '节点 2', 'drawing-group-1');
    drawingDataMock.value = {
      ...createDefaultDrawingData(),
      elements: [firstElement, secondElement, createDrawingElement('node-3', '节点 3')]
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

    panelSidebar.vm.$emit('select-elements', [secondElement, firstElement]);
    await nextTick();

    expect(selectElementsByIdsMock).toHaveBeenCalledWith(['node-2', 'node-1']);
    expect(panelSidebar.props('selectedElementIds')).toEqual(['node-2', 'node-1']);
    wrapper.unmount();
  });

  it('syncs sidebar highlights from canvas multi-selection changes', async (): Promise<void> => {
    const selectedElement = createDrawingElement('node-2', '节点 2');
    drawingDataMock.value = {
      ...createDefaultDrawingData(),
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
    const drawing = wrapper.findComponent({ name: 'BDrawing' });

    panelSidebar.vm.$emit('select-element', selectedElement);
    await nextTick();
    drawing.vm.$emit('selection-change', ['node-1', 'node-3']);
    drawing.vm.$emit('update:select', null);
    await nextTick();

    expect(panelSidebar.props('selectedElementIds')).toEqual(['node-1', 'node-3']);
    wrapper.unmount();
  });

  it('keeps the selected group and active child highlighted from canvas selection changes', async (): Promise<void> => {
    const firstElement = createDrawingElement('node-1', '节点 1', 'drawing-group-1');
    const secondElement = createDrawingElement('node-2', '节点 2', 'drawing-group-1');
    drawingDataMock.value = {
      ...createDefaultDrawingData(),
      elements: [firstElement, secondElement, createDrawingElement('node-3', '节点 3')]
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
    const drawing = wrapper.findComponent({ name: 'BDrawing' });

    drawing.vm.$emit('update:select', secondElement);
    drawing.vm.$emit('selection-change', ['node-1', 'node-2']);
    await nextTick();

    expect(panelSidebar.props('selectedElementIds')).toEqual(['node-1', 'node-2']);
    expect(panelSidebar.props('activeElementId')).toBe('node-2');
    wrapper.unmount();
  });

  it('copies the drawing element when the sidebar layer emits copy', async (): Promise<void> => {
    nanoidMock.mockReturnValueOnce('copy0001');
    const copiedElement = createDrawingElement('node-2', '节点 2');
    drawingDataMock.value = {
      ...createDefaultDrawingData(),
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

    expect(drawingDataMock.value.elements.map((element: DrawingElement): string => element.id)).toEqual(['node-1', 'node-2', 'copy0001', 'node-3']);
    expect(drawingDataMock.value.elements[2]).toMatchObject({
      title: '节点 2',
      position: {
        x: 16,
        y: 16
      }
    });
    expect(selectElementByIdMock).toHaveBeenCalledWith('copy0001');
    expect(panelSidebar.props('selectedElementIds')).toEqual(['copy0001']);
    wrapper.unmount();
  });

  it('copies grouped drawing elements as a new group when the sidebar layer emits group copy', async (): Promise<void> => {
    nanoidMock.mockReturnValueOnce('copy0001').mockReturnValueOnce('copy0002');
    const firstElement = createDrawingElement('node-1', '节点 1', 'drawing-group-1');
    const secondElement = createDrawingElement('node-2', '节点 2', 'drawing-group-1');
    drawingDataMock.value = {
      ...createDefaultDrawingData(),
      elements: [firstElement, secondElement, createDrawingElement('node-3', '节点 3')]
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

    panelSidebar.vm.$emit('copy-elements', [secondElement, firstElement]);
    await flushPromises();

    expect(drawingDataMock.value.elements.map((element: DrawingElement): string => element.id)).toEqual(['node-1', 'node-2', 'copy0001', 'copy0002', 'node-3']);
    expect(drawingDataMock.value.elements[2]?.metadata.groupId).toBe('drawing-group-2');
    expect(drawingDataMock.value.elements[3]?.metadata.groupId).toBe('drawing-group-2');
    expect(selectElementsByIdsMock).toHaveBeenCalledWith(['copy0001', 'copy0002']);
    expect(panelSidebar.props('selectedElementIds')).toEqual(['copy0001', 'copy0002']);
    wrapper.unmount();
  });

  it('forwards settings multi-selection commands to the drawing canvas', async (): Promise<void> => {
    drawingDataMock.value = {
      ...createDefaultDrawingData(),
      elements: [createDrawingElement('node-1', '节点 1'), createDrawingElement('node-2', '节点 2')]
    };
    const wrapper = shallowMount(DrawingPage, {
      global: {
        stubs: {
          BDrawing: createBDrawingStub(),
          Icon: true
        }
      }
    });
    const panelSettings = wrapper.findComponent({ name: 'PanelSettings' });

    panelSettings.vm.$emit('multi-command', 'group');
    panelSettings.vm.$emit('multi-command', 'ungroup');
    panelSettings.vm.$emit('multi-command', 'copy');
    panelSettings.vm.$emit('multi-command', 'delete');
    panelSettings.vm.$emit('multi-command', 'bringToFront');
    await nextTick();

    expect(groupSelectionMock).toHaveBeenCalledTimes(1);
    expect(ungroupSelectionMock).toHaveBeenCalledTimes(1);
    expect(copySelectionMock).toHaveBeenCalledTimes(1);
    expect(deleteSelectionMock).toHaveBeenCalledTimes(1);
    expect(reorderSelectionMock).toHaveBeenCalledWith('bringToFront');
    wrapper.unmount();
  });

  it('ungroups the current settings multi-selection by selected ids', async (): Promise<void> => {
    drawingDataMock.value = {
      ...createDefaultDrawingData(),
      elements: [
        createDrawingElement('node-1', '节点 1', 'drawing-group-1'),
        createDrawingElement('node-2', '节点 2', 'drawing-group-1'),
        createDrawingElement('node-3', '节点 3', 'drawing-group-2')
      ]
    };
    const wrapper = shallowMount(DrawingPage, {
      global: {
        stubs: {
          BDrawing: createBDrawingStub(),
          Icon: true
        }
      }
    });
    const drawing = wrapper.findComponent({ name: 'BDrawing' });
    const panelSettings = wrapper.findComponent({ name: 'PanelSettings' });

    drawing.vm.$emit('selection-change', ['node-1', 'node-2']);
    await nextTick();
    panelSettings.vm.$emit('multi-command', 'ungroup');
    await nextTick();

    expect(drawingDataMock.value.elements[0]?.metadata.groupId).toBeUndefined();
    expect(drawingDataMock.value.elements[1]?.metadata.groupId).toBeUndefined();
    expect(drawingDataMock.value.elements[2]?.metadata.groupId).toBe('drawing-group-2');
    wrapper.unmount();
  });

  it('applies settings style changes to the current multi-selection only', async (): Promise<void> => {
    const firstElement = createDrawingElement('node-1', '节点 1');
    const secondElement = createDrawingElement('node-2', '节点 2');
    const thirdElement = createDrawingElement('node-3', '节点 3');
    drawingDataMock.value = {
      ...createDefaultDrawingData(),
      elements: [firstElement, secondElement, thirdElement]
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

    panelSidebar.vm.$emit('select-elements', [firstElement, secondElement]);
    await nextTick();

    wrapper.findComponent({ name: 'PanelSettings' }).vm.$emit('multi-style-change', {
      backgroundColor: '#fef3c7',
      borderColor: '#f97316',
      borderRadius: 6,
      borderWidth: 2
    });
    await nextTick();

    expect(drawingDataMock.value.elements[0]?.style).toEqual({
      backgroundColor: '#fef3c7',
      borderColor: '#f97316',
      borderRadius: 6,
      borderWidth: 2
    });
    expect(drawingDataMock.value.elements[1]?.style).toEqual({
      backgroundColor: '#fef3c7',
      borderColor: '#f97316',
      borderRadius: 6,
      borderWidth: 2
    });
    expect(drawingDataMock.value.elements[2]?.style).toEqual({});
    expect(wrapper.findComponent({ name: 'PanelSettings' }).props('selectedElementIds')).toEqual(['node-1', 'node-2']);
    wrapper.unmount();
  });

  it('applies settings layout changes to the current multi-selection bounds', async (): Promise<void> => {
    const firstElement = createDrawingElement('node-1', '节点 1');
    const secondElement = createDrawingElement('node-2', '节点 2');
    const thirdElement = createDrawingElement('node-3', '节点 3');
    firstElement.position = { x: 10, y: 20 };
    firstElement.size = { width: 100, height: 50 };
    secondElement.position = { x: 40, y: 100 };
    secondElement.size = { width: 80, height: 60 };
    drawingDataMock.value = {
      ...createDefaultDrawingData(),
      elements: [firstElement, secondElement, thirdElement]
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

    panelSidebar.vm.$emit('select-elements', [firstElement, secondElement]);
    await nextTick();

    wrapper.findComponent({ name: 'PanelSettings' }).vm.$emit('multi-layout-change', {
      x: 20,
      y: 10,
      width: 220,
      height: 280
    });
    await nextTick();

    expect(drawingDataMock.value.elements[0]?.position).toEqual({ x: 20, y: 10 });
    expect(drawingDataMock.value.elements[0]?.size).toEqual({ width: 200, height: 100 });
    expect(drawingDataMock.value.elements[1]?.position).toEqual({ x: 80, y: 170 });
    expect(drawingDataMock.value.elements[1]?.size).toEqual({ width: 160, height: 120 });
    expect(drawingDataMock.value.elements[2]?.position).toEqual({ x: 0, y: 0 });
    expect(drawingDataMock.value.elements[2]?.size).toEqual({ width: 120, height: 80 });
    wrapper.unmount();
  });

  it('deletes the drawing element when the sidebar layer emits delete', async (): Promise<void> => {
    const selectedElement = createDrawingElement('node-2', '节点 2');
    drawingDataMock.value = {
      ...createDefaultDrawingData(),
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

  it('deletes grouped drawing elements when the sidebar layer emits group delete', async (): Promise<void> => {
    const firstElement = createDrawingElement('node-1', '节点 1', 'drawing-group-1');
    const secondElement = createDrawingElement('node-2', '节点 2', 'drawing-group-1');
    drawingDataMock.value = {
      ...createDefaultDrawingData(),
      elements: [firstElement, secondElement, createDrawingElement('node-3', '节点 3')]
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

    panelSidebar.vm.$emit('select-elements', [secondElement, firstElement]);
    panelSidebar.vm.$emit('delete-elements', [secondElement, firstElement]);
    await nextTick();

    expect(drawingDataMock.value.elements.map((element: DrawingElement): string => element.id)).toEqual(['node-3']);
    expect(panelSidebar.props('selectedElementIds')).toEqual([]);
    wrapper.unmount();
  });

  it('reorders drawing elements when the sidebar layer emits move', async (): Promise<void> => {
    const selectedElement = createDrawingElement('node-2', '节点 2');
    drawingDataMock.value = {
      ...createDefaultDrawingData(),
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
