/**
 * @file widget-canvas.component.test.ts
 * @description 验证 BWidget HTML Widget 渲染和注册元素创建能力。
 * @vitest-environment jsdom
 */
/* eslint-disable vue/one-component-per-file */
import { defineComponent, nextTick, toRaw } from 'vue';
import type { ComponentPublicInstance } from 'vue';
import { mount, type DOMWrapper, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BWidget from '@/components/BWidget/index.vue';
import type { WidgetData, WidgetPoint } from '@/components/BWidget/types';
import { createDefaultWidgetData } from '@/components/BWidget/utils/widgetData';

vi.mock('@/components/BWidget/components/Toolbar.vue', () => ({
  default: defineComponent({
    name: 'ToolbarStub',
    template: '<div class="toolbar-stub"></div>'
  })
}));

vi.mock('@/components/BWidget/components/SelectoLayer.vue', () => ({
  default: defineComponent({
    name: 'SelectoLayerStub',
    template: '<div class="selecto-layer-stub"></div>'
  })
}));

vi.mock('@/components/BWidget/components/MoveableLayer.vue', () => ({
  default: defineComponent({
    name: 'MoveableLayerStub',
    template: '<div class="moveable-layer-stub"></div>'
  })
}));

/**
 * BWidget 暴露给页面层的创建命令。
 */
interface BWidgetExpose {
  /** 根据浏览器坐标创建元素 */
  createElementFromClientPoint: (name: string, point: WidgetPoint) => Promise<void>;
}

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
 * 创建测试用Widget 数据。
 * @returns 测试Widget 数据
 */
function createWidgetDataFixture(): WidgetData {
  return {
    ...createDefaultWidgetData(),
    elements: [
      {
        id: 'external-node-1',
        name: 'rect',
        label: '矩形',
        icon: 'lucide:square',
        title: '外部节点',
        position: { x: 24, y: 36 },
        size: { width: 180, height: 72 },
        rotation: 0,
        style: {},
        metadata: {}
      }
    ]
  };
}

/**
 * 读取 BWidget 暴露命令。
 * @param wrapper - BWidget 测试包装器
 * @returns 暴露命令
 */
function getWidgetExpose(wrapper: VueWrapper): ComponentPublicInstance & BWidgetExpose {
  return wrapper.vm as ComponentPublicInstance & BWidgetExpose;
}

/**
 * 通过节点 ID 查找测试节点。
 * @param wrapper - BWidget 测试包装器
 * @param id - 节点 ID
 * @returns 节点包装器
 */
function findNodeById(wrapper: VueWrapper, id: string): DOMWrapper<Element> {
  return wrapper.find<Element>(`[data-widget-element-id="${id}"]`);
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
 * 等待组件响应式更新完成。
 */
async function flushWidgetUpdates(): Promise<void> {
  await nextTick();
  await nextTick();
}

describe('BWidget canvas component', (): void => {
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

  it('renders existing widget data as HTML nodes with registered element views', (): void => {
    const wrapper = mount(BWidget, {
      props: {
        value: createWidgetDataFixture()
      },
      attachTo: document.body
    });
    const node = findNodeById(wrapper, 'external-node-1');

    expect(wrapper.find('.b-widget-canvas__stage').exists()).toBe(true);
    expect(node.exists()).toBe(true);
    expect(node.attributes('style')).toContain('width: 180px');
    expect(node.attributes('style')).toContain('height: 72px');
    expect(node.attributes('style')).toContain('translate(24px, 36px)');
    expect(node.find('.widget-rect-element-view').exists()).toBe(true);
    expect(node.find('.widget-rect-element-view').attributes('aria-hidden')).toBe('true');
    expect(wrapper.find('svg').exists()).toBe(false);
    wrapper.unmount();
  });

  it('renders rectangle box style properties on the element view', (): void => {
    const data = createWidgetDataFixture();
    const element = data.elements[0];
    element.style = {
      backgroundColor: '#f8fafc',
      borderColor: '#123456',
      borderStyle: 'dashed',
      borderWidth: { top: 1, right: 2, bottom: 3, left: 4 },
      borderRadius: { topLeft: 5, topRight: 6, bottomRight: 7, bottomLeft: 8 },
      padding: { top: 9, right: 10, bottom: 11, left: 12 }
    };
    const wrapper = mount(BWidget, {
      props: {
        value: data
      },
      attachTo: document.body
    });
    const nodeStyle = (findNodeById(wrapper, 'external-node-1').element as HTMLElement).style;

    expect(nodeStyle.backgroundColor).toBe('rgb(248, 250, 252)');
    expect(nodeStyle.borderColor).toBe('rgb(18, 52, 86)');
    expect(nodeStyle.borderStyle).toBe('dashed');
    expect(nodeStyle.borderTopWidth).toBe('1px');
    expect(nodeStyle.borderRightWidth).toBe('2px');
    expect(nodeStyle.borderBottomWidth).toBe('3px');
    expect(nodeStyle.borderLeftWidth).toBe('4px');
    expect(nodeStyle.borderTopLeftRadius).toBe('5px');
    expect(nodeStyle.borderTopRightRadius).toBe('6px');
    expect(nodeStyle.borderBottomRightRadius).toBe('7px');
    expect(nodeStyle.borderBottomLeftRadius).toBe('8px');
    wrapper.unmount();
  });

  it('creates a rectangle through the exposed registered element command', async (): Promise<void> => {
    const wrapper = mount(BWidget, {
      props: {
        value: createDefaultWidgetData()
      },
      attachTo: document.body
    });
    setElementRect(wrapper.element, { height: 600, left: 0, top: 0, width: 800 });

    await getWidgetExpose(wrapper).createElementFromClientPoint('rect', { x: 400, y: 300 });
    await flushWidgetUpdates();

    const emitted = wrapper.emitted('update:value') as Array<[WidgetData]> | undefined;
    const latestData = emitted?.at(-1)?.[0];
    const createdId = latestData?.elements[0]?.id ?? '';
    const node = findNodeById(wrapper, createdId);

    expect(node.exists()).toBe(true);
    expect(node.attributes('data-widget-name')).toBe('rect');
    expect(node.attributes('style')).toContain('translate(-90px, -36px)');
    expect(latestData?.elements).toHaveLength(1);
    expect(createdId).toMatch(/^[A-Za-z0-9_-]{8}$/);
    expect(latestData?.elements[0]).toMatchObject({
      name: 'rect',
      label: '矩形',
      icon: 'lucide:square',
      title: '矩形1',
      style: {},
      metadata: {}
    });
    expect(latestData?.viewport).toEqual({ center: { x: 0, y: 0 }, zoom: 1 });
    wrapper.unmount();
  });

  it('creates a text node without opening the removed text editor', async (): Promise<void> => {
    const wrapper = mount(BWidget, {
      props: {
        value: createDefaultWidgetData()
      },
      attachTo: document.body
    });
    setElementRect(wrapper.element, { height: 600, left: 0, top: 0, width: 800 });

    await getWidgetExpose(wrapper).createElementFromClientPoint('text', { x: 400, y: 300 });
    await flushWidgetUpdates();

    const textNode = wrapper.find('[data-widget-name="text"]');
    expect(textNode.exists()).toBe(true);
    expect(textNode.attributes('style')).toContain('width: 180px');
    expect(textNode.attributes('style')).toContain('height: 72px');
    expect(textNode.attributes('style')).toContain('translate(0px, 0px)');
    expect(textNode.text()).toContain('文本');
    expect(wrapper.find('[data-testid="widget-text-editor"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('provides render context to registered text element views', (): void => {
    const data = createDefaultWidgetData();
    data.metadata = {
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
    };
    data.elements = [
      {
        id: 'text-context-node',
        name: 'text',
        label: '文本',
        icon: 'lucide:type',
        title: '天气文本',
        position: { x: 0, y: 0 },
        size: { width: 180, height: 72 },
        rotation: 0,
        style: {},
        metadata: {
          content: '{{ input.city }} 当前 {{ state.weather.temperature }}°C'
        }
      }
    ];
    const wrapper = mount(BWidget, {
      props: {
        value: data
      },
      attachTo: document.body
    });

    expect(findNodeById(wrapper, 'text-context-node').text()).toContain('上海 当前 28°C');
    wrapper.unmount();
  });

  it('measures text node size from resolved render context content', (): void => {
    const data = createDefaultWidgetData();
    data.metadata = {
      previewContext: {
        input: {},
        state: {
          longText: ['第一行', '第二行', '第三行', '第四行', '第五行', '第六行'].join('\n')
        }
      }
    };
    data.elements = [
      {
        id: 'text-measure-node',
        name: 'text',
        label: '文本',
        icon: 'lucide:type',
        title: '天气文本',
        position: { x: 0, y: 0 },
        size: { width: 120, height: 24 },
        rotation: 0,
        style: {},
        metadata: {
          content: '{{ state.longText }}'
        }
      }
    ];
    const wrapper = mount(BWidget, {
      props: {
        value: data
      },
      attachTo: document.body
    });
    const nodeStyle = (findNodeById(wrapper, 'text-measure-node').element as HTMLElement).style;

    expect(Number.parseFloat(nodeStyle.height)).toBeGreaterThan(72);
    wrapper.unmount();
  });

  it('keeps bound text resize commits on the context-normalized size from Moveable', async (): Promise<void> => {
    const data = createDefaultWidgetData();
    data.metadata = {
      previewContext: {
        input: {},
        state: {
          shortText: 'abcdef'
        }
      }
    };
    data.elements = [
      {
        id: 'text-resize-node',
        name: 'text',
        label: '文本',
        icon: 'lucide:type',
        title: '绑定文本',
        position: { x: 0, y: 0 },
        size: { width: 30, height: 12 },
        rotation: 0,
        style: { fontSize: 10 },
        metadata: {
          content: '{{ state.shortText }}'
        }
      }
    ];
    const wrapper = mount(BWidget, {
      props: {
        value: data
      },
      attachTo: document.body
    });

    wrapper.findComponent({ name: 'MoveableLayerStub' }).vm.$emit('resize', [
      {
        id: 'text-resize-node',
        size: { width: 30, height: 31 }
      }
    ]);
    await flushWidgetUpdates();

    const emitted = wrapper.emitted('update:value') as Array<[WidgetData]> | undefined;
    const latestData = emitted?.at(-1)?.[0];

    expect(latestData?.elements[0]?.size).toEqual({ width: 30, height: 31 });
    wrapper.unmount();
  });

  it('ignores unknown registered element names', async (): Promise<void> => {
    const wrapper = mount(BWidget, {
      props: {
        value: createDefaultWidgetData()
      },
      attachTo: document.body
    });
    setElementRect(wrapper.element, { height: 600, left: 0, top: 0, width: 800 });

    await getWidgetExpose(wrapper).createElementFromClientPoint('unknown-node', { x: 400, y: 300 });
    await flushWidgetUpdates();

    expect(wrapper.findAll('[data-testid="widget-node"]')).toHaveLength(0);
    wrapper.unmount();
  });

  it('emits metadata select target for empty selection without changing widget data', async (): Promise<void> => {
    const data = createDefaultWidgetData();
    const wrapper = mount(BWidget, {
      props: {
        value: data
      },
      attachTo: document.body
    });

    await flushWidgetUpdates();

    const selectedPayload = wrapper.emitted('update:select')?.at(-1)?.[0] as WidgetData['metadata'];

    expect(selectedPayload).toEqual({});
    expect(toRaw(selectedPayload)).toBe(data.metadata);
    expect(wrapper.emitted('update:value')).toBeUndefined();
    wrapper.unmount();
  });
});
