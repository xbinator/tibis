/**
 * @file widget-runtime-view.component.test.ts
 * @description 验证 BWidget 运行态只读视图按内容边界缩放渲染 Widget。
 * @vitest-environment jsdom
 */
import type { RequestInput, RequestResponse } from 'types/request';
import type { WidgetData, WidgetRenderContext, WidgetRuntimeChange } from 'types/widget';
import { defineComponent, nextTick } from 'vue';
import { mount, type DOMWrapper, type VueWrapper } from '@vue/test-utils';
import { cloneDeep } from 'lodash-es';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWidgetRuntime } from '@/components/BWidget/hooks/useWidgetRuntime';
import BWidgetRuntime from '@/components/BWidget/Runtime.vue';
import { queryWidgetElementTarget } from '@/components/BWidget/utils/widgetGeometry';
import { createDefaultWidgetData } from '@/components/BWidget/utils/widgetData';
import { WIDGET_LOOP_METADATA_KEY } from '@/components/BWidget/utils/widgetLoop';

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
          content: '{{ input.city }} 当前 {{ weather.temperature }}°C'
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
 * 创建带单元素循环的运行态测试Widget 数据。
 * @returns 测试Widget 数据
 */
function createRuntimeLoopTextWidgetData(): WidgetData {
  const dataItem = createRuntimeWidgetData();

  return {
    ...dataItem,
    elements: dataItem.elements.map((element) =>
      element.id === 'text-1'
        ? {
            ...element,
            metadata: {
              ...element.metadata,
              content: '{{ item.name }} {{ index }}',
              [WIDGET_LOOP_METADATA_KEY]: {
                enabled: true,
                source: 'products',
                columns: 2,
                columnGap: 12,
                rowGap: 10,
                itemName: 'item',
                indexName: 'index'
              }
            }
          }
        : element
    )
  };
}

/**
 * 创建带组合循环的运行态测试Widget 数据。
 * @returns 测试Widget 数据
 */
function createRuntimeLoopGroupWidgetData(): WidgetData {
  return {
    ...createDefaultWidgetData(),
    elements: [
      {
        id: 'card-group',
        name: 'group',
        label: '组合',
        icon: 'lucide:group',
        title: '卡片组合',
        position: { x: 20, y: 10 },
        size: { width: 120, height: 60 },
        rotation: 0,
        style: {},
        metadata: {
          [WIDGET_LOOP_METADATA_KEY]: {
            enabled: true,
            source: 'products',
            columns: 2,
            columnGap: 12,
            rowGap: 10,
            itemName: 'item',
            indexName: 'index'
          }
        },
        children: [
          {
            id: 'card-bg',
            name: 'rect',
            label: '矩形',
            icon: 'lucide:square',
            title: '背景',
            position: { x: 0, y: 0 },
            size: { width: 120, height: 60 },
            rotation: 0,
            style: {},
            metadata: {}
          },
          {
            id: 'card-title',
            name: 'text',
            label: '文本',
            icon: 'lucide:type',
            title: '标题',
            position: { x: 4, y: 8 },
            size: { width: 80, height: 24 },
            rotation: 0,
            style: {},
            metadata: {
              content: '{{ item.name }}'
            }
          }
        ]
      }
    ],
    viewport: {
      center: { x: 0, y: 0 },
      zoom: 1
    }
  };
}

/**
 * 创建嵌套组合运行态测试Widget 数据。
 * @returns 测试Widget 数据
 */
function createRuntimeNestedGroupWidgetData(): WidgetData {
  return {
    ...createDefaultWidgetData(),
    elements: [
      {
        id: 'group-1',
        name: 'group',
        label: '组合',
        icon: 'lucide:group',
        title: '组合',
        position: { x: 20, y: 10 },
        size: { width: 120, height: 60 },
        rotation: 0,
        style: {},
        metadata: {},
        children: [
          {
            id: 'nested-title',
            name: 'text',
            label: '文本',
            icon: 'lucide:type',
            title: '标题',
            position: { x: 4, y: 8 },
            size: { width: 80, height: 24 },
            rotation: 0,
            style: {},
            metadata: {
              content: '{{ input.city }}'
            }
          }
        ]
      }
    ],
    viewport: {
      center: { x: 0, y: 0 },
      zoom: 1
    }
  };
}

/**
 * 创建展示 message 字段的运行态测试Widget 数据。
 * @param code - 运行脚本
 * @returns 测试Widget 数据
 */
function createRuntimeMessageWidgetData(code: string): WidgetData {
  const dataItem = createRuntimeWidgetData();

  return {
    ...dataItem,
    execute: {
      code
    },
    elements: dataItem.elements.map((element) =>
      element.id === 'text-1'
        ? {
            ...element,
            metadata: {
              ...element.metadata,
              content: '{{ message }}'
            }
          }
        : element
    )
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
    data: {
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
 * 等待运行态异步脚本执行完成。
 * @returns 异步完成信号
 */
async function flushWidgetRuntime(): Promise<void> {
  await nextTick();
  await Promise.resolve();
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
  await nextTick();
}

/**
 * 创建可手动 resolve 的 Promise。
 * @returns deferred 对象
 */
function createDeferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolveDeferred: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolve): void => {
    resolveDeferred = resolve;
  });

  return {
    promise,
    resolve: resolveDeferred
  };
}

/**
 * 模拟 Electron request 能力。
 * @param request - request 实现
 */
function stubElectronRequest(request: (input: RequestInput) => Promise<RequestResponse>): void {
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    value: {
      request
    }
  });
}

/**
 * 通过节点 ID 查找Widget 节点。
 * @param wrapper - 组件包装器
 * @param id - 节点 ID
 * @returns 节点包装器
 */
function findNodeById(wrapper: VueWrapper, id: string): DOMWrapper<Element> {
  const target = queryWidgetElementTarget(wrapper.element, id);

  return wrapper.findAll<Element>('.b-widget-node').find((node: DOMWrapper<Element>): boolean => node.element === target) ?? wrapper.find<Element>('.missing-widget-node');
}

/** 运行态控制器注入探针。 */
const RuntimeControllerProbe = defineComponent({
  name: 'RuntimeControllerProbe',
  setup() {
    const runtime = useWidgetRuntime();
    /**
     * 模拟元素运行自己声明的交互表达式。
     */
    function runProbe(): void {
      runtime.value?.runInteraction("this.$sendMessage('确认下单')");
    }

    return { runProbe };
  },
  template: '<button class="runtime-interaction-probe" type="button" @click="runProbe">运行交互</button>'
});

/** WidgetNode 测试替身，用于验证运行态控制器能被元素层注入。 */
const WidgetNodeRuntimeProbeStub = defineComponent({
  name: 'WidgetNode',
  components: {
    RuntimeControllerProbe
  },
  template: '<RuntimeControllerProbe />'
});

/** 运行态计数交互探针。 */
const RuntimeCounterProbe = defineComponent({
  name: 'RuntimeCounterProbe',
  setup() {
    const runtime = useWidgetRuntime();
    /**
     * 模拟元素连续更新运行态数据。
     */
    function increment(): void {
      runtime.value?.runInteraction('this.count = (this.count || 0) + 1');
    }

    return { increment };
  },
  template: '<button class="runtime-counter-probe" type="button" @click="increment">递增</button>'
});

/** WidgetNode 测试替身，用于验证运行态交互使用本地最新状态串行执行。 */
const WidgetNodeRuntimeCounterStub = defineComponent({
  name: 'WidgetNode',
  components: {
    RuntimeCounterProbe
  },
  template: '<RuntimeCounterProbe />'
});

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
    Reflect.deleteProperty(window, 'electronAPI');
    vi.unstubAllGlobals();
  });

  it('renders widget nodes with template content from the runtime context', async (): Promise<void> => {
    const wrapper = await mountRuntime(createRuntimeWidgetData(), createRenderContext('上海', 28));

    expect(wrapper.find('.b-widget-runtime').exists()).toBe(true);
    expect(findNodeById(wrapper, 'text-1').text()).toBe('上海 当前 28°C');
    expect(findNodeById(wrapper, 'rect-1').find('.widget-rect-element-view').exists()).toBe(true);
    wrapper.unmount();
  });

  it('renders loop-expanded text nodes with item and index locals', async (): Promise<void> => {
    const wrapper = await mountRuntime(createRuntimeLoopTextWidgetData(), {
      input: {},
      data: {
        products: [{ name: '拿铁' }, { name: '美式' }]
      }
    });

    expect(findNodeById(wrapper, 'text-1').exists()).toBe(false);
    expect(findNodeById(wrapper, 'text-1__loop_0').text()).toBe('拿铁 0');
    expect(findNodeById(wrapper, 'text-1__loop_1').text()).toBe('美式 1');
    wrapper.unmount();
  });

  it('renders nested group children with inherited runtime context', async (): Promise<void> => {
    const wrapper = await mountRuntime(createRuntimeNestedGroupWidgetData(), createRenderContext('上海', 28));

    expect(findNodeById(wrapper, 'group-1').exists()).toBe(true);
    expect(findNodeById(wrapper, 'nested-title').text()).toBe('上海');
    wrapper.unmount();
  });

  it('renders grouped loop nodes with the same item local per iteration', async (): Promise<void> => {
    const wrapper = await mountRuntime(createRuntimeLoopGroupWidgetData(), {
      input: {},
      data: {
        products: [{ name: '拿铁' }, { name: '美式' }]
      }
    });

    expect(findNodeById(wrapper, 'card-group').exists()).toBe(false);
    expect(findNodeById(wrapper, 'card-bg').exists()).toBe(false);
    expect(findNodeById(wrapper, 'card-title').exists()).toBe(false);
    expect(findNodeById(wrapper, 'card-group__loop_0').exists()).toBe(true);
    expect(findNodeById(wrapper, 'card-bg__loop_0').exists()).toBe(true);
    expect(findNodeById(wrapper, 'card-title__loop_0').text()).toBe('拿铁');
    expect(findNodeById(wrapper, 'card-group__loop_1').exists()).toBe(true);
    expect(findNodeById(wrapper, 'card-bg__loop_1').exists()).toBe(true);
    expect(findNodeById(wrapper, 'card-title__loop_1').text()).toBe('美式');
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

  it('executes mounted scripts and emits runtime changes from the view boundary', async (): Promise<void> => {
    const dataItem = {
      ...createRuntimeWidgetData(),
      execute: {
        code: ['Widget({', '  mounted() {', '    this.weather = { temperature: 29 }', '  }', '})'].join('\n')
      }
    };
    const wrapper = mount(BWidgetRuntime, {
      props: {
        value: dataItem,
        renderContext: {
          input: {
            city: '上海'
          },
          data: {}
        },
        runtimeEnabled: true,
        status: 'created',
        lifecycle: {}
      },
      attachTo: document.body
    });

    await flushWidgetRuntime();

    expect(wrapper.emitted('change')?.[0]?.[0]).toMatchObject({
      reason: 'mount',
      status: 'mounted',
      renderContext: {
        data: {
          weather: {
            temperature: 29
          }
        }
      }
    });
    wrapper.unmount();
  });

  it('renders patch preview before mounted scripts finish', async (): Promise<void> => {
    const requestDeferred = createDeferred<RequestResponse>();
    const request = vi.fn<(input: RequestInput) => Promise<RequestResponse>>(() => requestDeferred.promise);
    stubElectronRequest(request);

    const dataItem = createRuntimeMessageWidgetData(
      [
        'Widget({',
        '  async mounted() {',
        "    this.message = '正在加载'",
        "    await this.$http.get('https://api.example.com/weather')",
        "    this.message = '加载完成'",
        '  }',
        '})'
      ].join('\n')
    );
    const wrapper = mount(BWidgetRuntime, {
      props: {
        value: dataItem,
        renderContext: {
          input: {},
          data: {}
        },
        runtimeEnabled: true,
        status: 'created',
        lifecycle: {}
      },
      attachTo: document.body
    });

    await nextTick();
    await Promise.resolve();
    await nextTick();

    expect(findNodeById(wrapper, 'text-1').text()).toBe('正在加载');
    expect(wrapper.emitted('change')).toBeUndefined();

    requestDeferred.resolve({ status: 200, ok: true, url: 'https://api.example.com/weather', headers: {}, data: {} });
    await flushWidgetRuntime();

    expect(wrapper.emitted('change')?.[0]?.[0]).toMatchObject({
      reason: 'mount',
      status: 'mounted',
      renderContext: {
        data: {
          message: '加载完成'
        }
      }
    });
    wrapper.unmount();
  });

  it('finishes runtime scripts before reporting node submit changes', async (): Promise<void> => {
    const output = {
      coffeeId: 'latte'
    };
    const dataItem = {
      ...createRuntimeWidgetData(),
      execute: {
        code: ['Widget({', '  unmounted() {', '    this.submitted = { coffeeId: this.$input.coffeeId }', '  }', '})'].join('\n')
      }
    };
    const wrapper = mount(BWidgetRuntime, {
      props: {
        value: dataItem,
        renderContext: {
          input: {
            coffeeId: 'latte'
          },
          data: {}
        },
        runtimeEnabled: true,
        status: 'mounted',
        lifecycle: {
          mountedAt: '2026-07-01T00:00:00.000Z'
        }
      },
      attachTo: document.body
    });

    wrapper.findComponent({ name: 'WidgetNode' }).vm.$emit('submit', output);
    await flushWidgetRuntime();

    expect(wrapper.emitted('submit')).toBeUndefined();
    expect(wrapper.emitted('change')?.[0]?.[0]).toMatchObject({
      reason: 'submit',
      output,
      status: 'finished',
      renderContext: {
        data: {
          submitted: {
            coffeeId: 'latte'
          }
        }
      }
    });
    wrapper.unmount();
  });

  it('serializes runtime interactions against local state before parent props are written back', async (): Promise<void> => {
    const wrapper = mount(BWidgetRuntime, {
      props: {
        value: {
          ...createRuntimeWidgetData(),
          execute: {
            code: 'Widget({})'
          }
        },
        renderContext: {
          input: {},
          data: {
            count: 0
          }
        },
        runtimeEnabled: true,
        status: 'mounted',
        lifecycle: {
          mountedAt: '2026-07-01T00:00:00.000Z'
        }
      },
      global: {
        stubs: {
          WidgetNode: WidgetNodeRuntimeCounterStub
        }
      },
      attachTo: document.body
    });

    await nextTick();
    await wrapper.get('.runtime-counter-probe').trigger('click');
    await wrapper.get('.runtime-counter-probe').trigger('click');
    await flushWidgetRuntime();

    const changes = (wrapper.emitted('change') ?? []).map(([change]): WidgetRuntimeChange => change as WidgetRuntimeChange);

    expect(changes).toHaveLength(2);
    expect(changes[0].renderContext.data.count).toBe(1);
    expect(changes[1].renderContext.data.count).toBe(2);
    wrapper.unmount();
  });

  it('provides the runtime controller to rendered elements', async (): Promise<void> => {
    const runInteraction = vi.fn<(code: string) => void>();
    const wrapper = mount(BWidgetRuntime, {
      props: {
        value: createRuntimeWidgetData(),
        renderContext: createRenderContext('上海', 28),
        runtime: {
          runInteraction
        }
      },
      global: {
        stubs: {
          WidgetNode: WidgetNodeRuntimeProbeStub
        }
      },
      attachTo: document.body
    });

    await nextTick();
    await wrapper.get('.runtime-interaction-probe').trigger('click');

    expect(runInteraction).toHaveBeenCalledWith("this.$sendMessage('确认下单')");
    wrapper.unmount();
  });
});
