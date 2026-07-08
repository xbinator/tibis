/**
 * @file minimap.component.test.ts
 * @description 验证 BWidget 小地图视口矩形拖拽交互。
 * @vitest-environment jsdom
 */
/* eslint-disable vue/one-component-per-file */
import { defineComponent, nextTick } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Minimap from '@/components/BWidget/components/Minimap.vue';
import type { WidgetData, WidgetPoint } from '@/components/BWidget/types';

/** 原始元素尺寸读取函数。 */
const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;

/**
 * BDropdown 测试替身，直接渲染触发器与浮层内容。
 */
const BDropdownStub = defineComponent({
  name: 'BDropdown',
  props: {
    open: {
      type: Boolean,
      default: false
    }
  },
  template: '<div class="dropdown-stub"><slot :open="open"></slot><slot name="overlay"></slot></div>'
});

/**
 * 创建指针事件。
 * @param type - 事件类型
 * @param clientX - 客户端横坐标
 * @param clientY - 客户端纵坐标
 * @returns 指针事件
 */
function createPointerEvent(type: string, clientX: number, clientY: number): PointerEvent {
  return new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX,
    clientY
  }) as PointerEvent;
}

/**
 * 模拟小地图 SVG 渲染尺寸。
 * @param width - SVG 宽度
 * @param height - SVG 高度
 */
function mockMinimapSvgSize(width: number, height: number): void {
  Element.prototype.getBoundingClientRect = function getBoundingClientRectMock(): DOMRect {
    if (this.classList.contains('b-widget-minimap__svg')) {
      return DOMRect.fromRect({ height, width, x: 0, y: 0 });
    }

    return originalGetBoundingClientRect.call(this);
  };
}

/**
 * 挂载小地图组件。
 * @returns 小地图包装器
 */
function mountMinimap(): VueWrapper {
  return mount(Minimap, {
    props: {
      elements: [] as WidgetData['elements'],
      viewport: {
        center: { x: 0, y: 0 },
        zoom: 1
      },
      viewportSize: {
        width: 100,
        height: 100
      }
    },
    slots: {
      default: '<button type="button">小地图</button>'
    },
    global: {
      stubs: {
        BDropdown: BDropdownStub
      }
    },
    attachTo: document.body
  });
}

describe('Minimap', (): void => {
  afterEach((): void => {
    Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('dampens viewport rectangle dragging before emitting the next center', async (): Promise<void> => {
    mockMinimapSvgSize(100, 100);
    const wrapper = mountMinimap();

    wrapper.find('.b-widget-minimap__viewport').element.dispatchEvent(createPointerEvent('pointerdown', 50, 50));
    await nextTick();
    window.dispatchEvent(createPointerEvent('pointermove', 60, 50));
    await nextTick();

    const emittedCenters = wrapper.emitted('set-center') as Array<[WidgetPoint]> | undefined;

    expect(emittedCenters?.at(-1)?.[0]?.x).toBeCloseTo(28.8);
    expect(emittedCenters?.at(-1)?.[0]?.y).toBe(0);

    wrapper.unmount();
  });
});
