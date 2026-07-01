/**
 * @file widget-runtime-view.component.test.ts
 * @description 验证 BWidget 运行态只读视图按内容边界缩放渲染 Widget。
 * @vitest-environment jsdom
 */
import type { WidgetData, WidgetRenderContext } from 'types/widget';
import { nextTick } from 'vue';
import { mount, type DOMWrapper, type VueWrapper } from '@vue/test-utils';
import { cloneDeep } from 'lodash-es';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BWidgetRuntime from '@/components/BWidget/Runtime.vue';
import { createDefaultWidgetData } from '@/components/BWidget/utils/widgetData';

/** ResizeObserver 回调。 */
type ResizeObserverCallbackLike = (entries: ResizeObserverEntry[]) => void;

/** 运行态测试容器宽度。 */
const RUNTIME_CONTAINER_WIDTH = 504;
/** 运行态测试容器高度。 */
const RUNTIME_CONTAINER_HEIGHT = 300;
/** ResizeObserver 已监听的目标元素。 */
let observedResizeTargets: Element[] = [];

/**
 * ResizeObserver 测试替身。
 */
class ResizeObserverMock {
  /** ResizeObserver 回调。 */
  private readonly callback: ResizeObserverCallbackLike;

  /**
   * 创建 ResizeObserver 测试替身。
   * @param callback - ResizeObserver 回调
   */
  public constructor(callback: ResizeObserverCallbackLike) {
    this.callback = callback;
  }

  /**
   * 监听目标元素尺寸。
   * @param target - 监听目标
   */
  public observe = (target: Element): void => {
    observedResizeTargets.push(target);

    const entry = {
      target,
      contentRect: DOMRect.fromRect({
        width: RUNTIME_CONTAINER_WIDTH,
        height: RUNTIME_CONTAINER_HEIGHT
      }),
      contentBoxSize: [
        {
          inlineSize: RUNTIME_CONTAINER_WIDTH,
          blockSize: RUNTIME_CONTAINER_HEIGHT
        }
      ]
    } as unknown as ResizeObserverEntry;

    this.callback([entry]);
  };

  /** 停止监听目标元素。 */
  public unobserve = vi.fn();

  /** 断开全部尺寸监听。 */
  public disconnect = vi.fn();
}

/**
 * 创建运行态测试Widget 数据。
 * @returns 测试Widget 数据
 */
function createRuntimeWidgetData(): WidgetData {
  return {
    ...createDefaultWidgetData(),
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
      center: { x: 1000, y: 1000 },
      zoom: 0.1
    }
  };
}

/**
 * 创建运行态渲染上下文。
 * @param city - 城市名称
 * @param temperature - 温度
 * @returns 渲染上下文
 */
function createRenderContext(city: string, temperature: number): WidgetRenderContext {
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
 * 挂载运行态Widget 视图。
 * @param dataItem - Widget 数据
 * @param renderContext - 渲染上下文
 * @returns 组件包装器
 */
async function mountRuntime(dataItem: WidgetData, renderContext: WidgetRenderContext): Promise<VueWrapper> {
  const wrapper = mount(BWidgetRuntime, {
    props: {
      value: dataItem,
      renderContext
    },
    attachTo: document.body
  });

  await nextTick();
  await nextTick();

  return wrapper;
}

/**
 * 通过节点 ID 查找Widget 节点。
 * @param wrapper - 组件包装器
 * @param id - 节点 ID
 * @returns 节点包装器
 */
function findNodeById(wrapper: VueWrapper, id: string): DOMWrapper<Element> {
  return wrapper.find<Element>(`[data-widget-element-id="${id}"]`);
}

describe('BWidgetRuntime', (): void => {
  beforeEach((): void => {
    observedResizeTargets = [];
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

  it('renders widget nodes with template content from the runtime context', async (): Promise<void> => {
    const wrapper = await mountRuntime(createRuntimeWidgetData(), createRenderContext('上海', 28));

    expect(wrapper.find('.b-widget-runtime').exists()).toBe(true);
    expect(findNodeById(wrapper, 'text-1').text()).toBe('上海 当前 28°C');
    expect(findNodeById(wrapper, 'rect-1').find('.widget-rect-element-view').exists()).toBe(true);
    wrapper.unmount();
  });

  it('uses content bounds instead of infinite canvas or editor viewport', async (): Promise<void> => {
    const wrapper = await mountRuntime(createRuntimeWidgetData(), createRenderContext('上海', 28));
    const stageViewport = wrapper.find('.b-widget-runtime__stage-viewport');
    const stage = wrapper.find('.b-widget-runtime__stage');
    const textNode = findNodeById(wrapper, 'text-1');
    const rectNode = findNodeById(wrapper, 'rect-1');

    expect(wrapper.find('.b-widget-infinite-viewport').exists()).toBe(false);
    expect(wrapper.find('.b-widget-canvas').exists()).toBe(false);
    expect(stageViewport.attributes('style')).toContain('height: 256px');
    expect(stage.attributes('style')).toContain('width: 252px');
    expect(stage.attributes('style')).toContain('height: 128px');
    expect(stage.attributes('style')).toContain('scale(2)');
    expect(textNode.attributes('style')).toContain('translate(28px, 34px)');
    expect(rectNode.attributes('style')).toContain('translate(16px, 16px)');
    wrapper.unmount();
  });

  it('observes the runtime root element for scale-to-width layout', async (): Promise<void> => {
    const wrapper = await mountRuntime(createRuntimeWidgetData(), createRenderContext('上海', 28));
    const root = wrapper.find('.b-widget-runtime').element;

    expect(observedResizeTargets).toContain(root);
    wrapper.unmount();
  });

  it('does not render editor-only interaction layers', async (): Promise<void> => {
    const wrapper = await mountRuntime(createRuntimeWidgetData(), createRenderContext('上海', 28));

    expect(wrapper.find('.b-widget').exists()).toBe(false);
    expect(wrapper.find('.toolbar-stub').exists()).toBe(false);
    expect(wrapper.find('.moveable-layer-stub').exists()).toBe(false);
    expect(wrapper.find('.selecto-layer-stub').exists()).toBe(false);
    expect(wrapper.find('.widget-context-menu').exists()).toBe(false);
    expect(wrapper.find('.b-widget-node.is-selected').exists()).toBe(false);
    wrapper.unmount();
  });

  it('does not mutate the source widget data while rendering', async (): Promise<void> => {
    const dataItem = createRuntimeWidgetData();
    const originalWidgetData = cloneDeep(dataItem);
    const wrapper = await mountRuntime(dataItem, createRenderContext('上海', 28));

    await wrapper.setProps({
      renderContext: createRenderContext('杭州', 31)
    });
    await nextTick();

    expect(dataItem).toEqual(originalWidgetData);
    wrapper.unmount();
  });

  it('updates rendered template content when the runtime context changes', async (): Promise<void> => {
    const wrapper = await mountRuntime(createRuntimeWidgetData(), createRenderContext('上海', 28));

    await wrapper.setProps({
      renderContext: createRenderContext('杭州', 31)
    });
    await nextTick();

    expect(findNodeById(wrapper, 'text-1').text()).toBe('杭州 当前 31°C');
    wrapper.unmount();
  });

  it('emits submit payloads from runtime nodes', async (): Promise<void> => {
    const output = {
      coffeeId: 'latte',
      size: 'large'
    };
    const wrapper = await mountRuntime(createRuntimeWidgetData(), createRenderContext('上海', 28));

    wrapper.findComponent({ name: 'WidgetNode' }).vm.$emit('submit', output);

    expect(wrapper.emitted('submit')?.[0]).toEqual([output]);
    wrapper.unmount();
  });
});
