/**
 * @file index.test.ts
 * @description BPanelSplitter 组件测试
 */
/* @vitest-environment jsdom */

import { nextTick } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import BPanelSplitter from '@/components/BPanelSplitter/index.vue';

/**
 * 固定元素布局宽度，模拟浏览器中的父容器尺寸。
 * @param element - 需要设置布局尺寸的元素
 * @param width - 布局宽度，单位 px
 * @returns 清理布局模拟的函数
 */
function mockElementWidth(element: HTMLElement, width: number | (() => number)): () => void {
  const getBoundingClientRect = vi.spyOn(element, 'getBoundingClientRect');

  getBoundingClientRect.mockImplementation(() => {
    const resolvedWidth = typeof width === 'function' ? width() : width;

    return {
      width: resolvedWidth,
      height: 400,
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: resolvedWidth,
      bottom: 400,
      toJSON: () => ({})
    };
  });

  return () => getBoundingClientRect.mockRestore();
}

/**
 * 模拟 ResizeObserver，并暴露触发 resize 回调的方法。
 * @returns resize 触发器和清理函数
 */
function mockResizeObserver(): { triggerResize: () => void; restoreResizeObserver: () => void } {
  const originalResizeObserver = globalThis.ResizeObserver;
  let resizeObserverCallback: ResizeObserverCallback | undefined;

  class TestResizeObserver implements ResizeObserver {
    /**
     * 创建测试用 ResizeObserver。
     * @param callback - resize 回调
     */
    constructor(callback: ResizeObserverCallback) {
      resizeObserverCallback = callback;
    }

    /**
     * 记录监听目标，测试中无需额外行为。
     */
    observe(): void {
      return undefined;
    }

    /**
     * 取消监听目标，测试中无需额外行为。
     */
    unobserve(): void {
      return undefined;
    }

    /**
     * 断开监听，测试中无需额外行为。
     */
    disconnect(): void {
      return undefined;
    }
  }

  globalThis.ResizeObserver = TestResizeObserver;

  return {
    triggerResize: () => {
      if (resizeObserverCallback) {
        resizeObserverCallback([], new TestResizeObserver(resizeObserverCallback));
      }
    },
    restoreResizeObserver: () => {
      globalThis.ResizeObserver = originalResizeObserver;
    }
  };
}

/**
 * 触发一次面板拖拽操作。
 * @param wrapper - BPanelSplitter 测试包装器
 * @param startX - 鼠标按下时的横坐标
 * @param moveX - 鼠标移动后的横坐标
 */
async function dragPanel(wrapper: VueWrapper<InstanceType<typeof BPanelSplitter>>, startX: number, moveX: number): Promise<void> {
  await wrapper.find('.b-panel-splitter__line').trigger('mousedown', { clientX: startX });
  window.dispatchEvent(new MouseEvent('mousemove', { clientX: moveX }));
  window.dispatchEvent(new MouseEvent('mouseup'));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('BPanelSplitter', () => {
  it('minWidth 和 maxWidth 支持相对父容器宽度的百分数', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);

    const wrapper = mount(BPanelSplitter, {
      attachTo: host,
      props: {
        size: 300,
        position: 'right',
        minWidth: '25%',
        maxWidth: '50%',
        closable: false
      },
      slots: { default: '<div>content</div>' }
    });
    const restoreWidth = mockElementWidth(host, 1000);

    await dragPanel(wrapper, 0, -500);
    await dragPanel(wrapper, 0, 500);

    expect(wrapper.emitted('update:size')).toEqual([[250], [500]]);

    restoreWidth();
    wrapper.unmount();
  });

  it('父容器尺寸变化后重新按百分比约束当前宽度', async () => {
    const { triggerResize, restoreResizeObserver } = mockResizeObserver();
    const host = document.createElement('div');
    let hostWidth = 1000;
    document.body.appendChild(host);

    const wrapper = mount(BPanelSplitter, {
      attachTo: host,
      props: {
        size: 450,
        position: 'right',
        minWidth: '40%',
        maxWidth: '50%',
        closable: false
      },
      slots: { default: '<div>content</div>' }
    });
    const restoreWidth = mockElementWidth(host, () => hostWidth);

    hostWidth = 800;
    triggerResize();
    await nextTick();

    expect(wrapper.emitted('update:size')).toEqual([[400]]);

    restoreWidth();
    restoreResizeObserver();
    wrapper.unmount();
  });
});
