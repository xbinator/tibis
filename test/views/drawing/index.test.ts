/**
 * @file index.test.ts
 * @description 验证画图页面文件菜单事件绑定。
 * @vitest-environment jsdom
 */
import { shallowMount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emitter } from '@/utils/emitter';
import DrawingPage from '@/views/drawing/index.vue';

const addTabMock = vi.hoisted(() => vi.fn());
const drawingRegisterMock = vi.hoisted(() => vi.fn());
const drawingUnregisterMock = vi.hoisted(() => vi.fn());
const onSaveMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const onSaveAsMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const onRenameMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

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

vi.mock('@/ai/tools/context/drawing', () => ({
  drawingToolContextRegistry: {
    register: drawingRegisterMock,
    unregister: drawingUnregisterMock
  }
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
    data: {
      value: {
        elements: [],
        edges: [],
        viewport: {
          center: { x: 0, y: 0 },
          zoom: 1
        }
      }
    },
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
    drawingRegisterMock.mockClear();
    drawingUnregisterMock.mockClear();
    onSaveMock.mockClear();
    onSaveAsMock.mockClear();
    onRenameMock.mockClear();
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

  it('registers the active drawing AI tool context and unregisters it on unmount', (): void => {
    const wrapper = shallowMount(DrawingPage, {
      global: {
        stubs: {
          BDrawing: true,
          Icon: true
        }
      }
    });

    expect(drawingRegisterMock).toHaveBeenCalledWith(
      'drawing-1',
      expect.objectContaining({
        id: 'drawing-1',
        title: 'board.tibis',
        path: null,
        getData: expect.any(Function),
        replaceData: expect.any(Function)
      })
    );

    wrapper.unmount();

    expect(drawingUnregisterMock).toHaveBeenCalledWith('drawing-1');
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
});
