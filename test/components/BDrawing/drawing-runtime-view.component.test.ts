/**
 * @file drawing-runtime-view.component.test.ts
 * @description 验证 BDrawing 运行态只读视图按会话上下文渲染画布。
 * @vitest-environment jsdom
 */
import { nextTick } from 'vue';
import { mount, type DOMWrapper, type VueWrapper } from '@vue/test-utils';
import { cloneDeep } from 'lodash-es';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BDrawingRuntimeView from '@/components/BDrawing/RuntimeView.vue';
import type { DrawingData, DrawingRenderContext } from '@/components/BDrawing/types';
import { createDefaultDrawingData } from '@/components/BDrawing/utils/drawingData';

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
 * 创建运行态测试画布数据。
 * @returns 测试画布数据
 */
function createRuntimeDrawingData(): DrawingData {
  return {
    ...createDefaultDrawingData(),
    elements: [
      {
        id: 'text-1',
        name: 'text',
        label: '文本',
        icon: 'lucide:type',
        title: '天气文本',
        position: { x: 24, y: 36 },
        size: { width: 180, height: 48 },
        rotation: 0,
        style: {},
        metadata: {
          content: '{{ input.city }} 当前 {{ state.weather.temperature }}°C'
        }
      },
      {
        id: 'rect-1',
        name: 'rect',
        label: '矩形',
        icon: 'lucide:square',
        title: '背景卡片',
        position: { x: 12, y: 18 },
        size: { width: 220, height: 96 },
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
 * 创建运行态渲染上下文。
 * @param city - 城市名称
 * @param temperature - 温度
 * @returns 渲染上下文
 */
function createRenderContext(city: string, temperature: number): DrawingRenderContext {
  return {
    input: {
      city
    },
    state: {
      weather: {
        temperature
      }
    }
  };
}

/**
 * 挂载运行态画布视图。
 * @param drawingData - 画布数据
 * @param renderContext - 渲染上下文
 * @returns 组件包装器
 */
function mountRuntimeView(drawingData: DrawingData, renderContext: DrawingRenderContext): VueWrapper {
  return mount(BDrawingRuntimeView, {
    props: {
      drawingData,
      renderContext
    },
    attachTo: document.body
  });
}

/**
 * 通过节点 ID 查找画布节点。
 * @param wrapper - 组件包装器
 * @param id - 节点 ID
 * @returns 节点包装器
 */
function findNodeById(wrapper: VueWrapper, id: string): DOMWrapper<Element> {
  return wrapper.find<Element>(`[data-drawing-element-id="${id}"]`);
}

describe('BDrawingRuntimeView', (): void => {
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

  it('renders drawing nodes with template content from the runtime context', (): void => {
    const wrapper = mountRuntimeView(createRuntimeDrawingData(), createRenderContext('上海', 28));

    expect(wrapper.find('[data-testid="drawing-runtime-view"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="drawing-canvas"]').exists()).toBe(true);
    expect(findNodeById(wrapper, 'text-1').text()).toBe('上海 当前 28°C');
    expect(findNodeById(wrapper, 'rect-1').find('.drawing-rect-element-view').exists()).toBe(true);
    wrapper.unmount();
  });

  it('does not render editor-only interaction layers', (): void => {
    const wrapper = mountRuntimeView(createRuntimeDrawingData(), createRenderContext('上海', 28));

    expect(wrapper.find('.b-drawing').exists()).toBe(false);
    expect(wrapper.find('.toolbar-stub').exists()).toBe(false);
    expect(wrapper.find('.moveable-layer-stub').exists()).toBe(false);
    expect(wrapper.find('.selecto-layer-stub').exists()).toBe(false);
    expect(wrapper.find('.drawing-context-menu').exists()).toBe(false);
    expect(wrapper.find('.b-drawing-node.is-selected').exists()).toBe(false);
    wrapper.unmount();
  });

  it('does not mutate the source drawing data while rendering', async (): Promise<void> => {
    const drawingData = createRuntimeDrawingData();
    const originalDrawingData = cloneDeep(drawingData);
    const wrapper = mountRuntimeView(drawingData, createRenderContext('上海', 28));

    await wrapper.setProps({
      renderContext: createRenderContext('杭州', 31)
    });
    await nextTick();

    expect(drawingData).toEqual(originalDrawingData);
    wrapper.unmount();
  });

  it('updates rendered template content when the runtime context changes', async (): Promise<void> => {
    const wrapper = mountRuntimeView(createRuntimeDrawingData(), createRenderContext('上海', 28));

    await wrapper.setProps({
      renderContext: createRenderContext('杭州', 31)
    });
    await nextTick();

    expect(findNodeById(wrapper, 'text-1').text()).toBe('杭州 当前 31°C');
    wrapper.unmount();
  });
});
