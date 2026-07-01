/**
 * @file use-viewport-size.test.ts
 * @description 验证 BWidget 视口尺寸 hook 的 DOM 尺寸同步。
 * @vitest-environment jsdom
 */
import { defineComponent, nextTick } from 'vue';
import type { Ref } from 'vue';
import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useViewportSize } from '@/components/BWidget/hooks/useViewportSize';
import type { WidgetSize } from '@/components/BWidget/types';

/**
 * 暴露给测试断言的宿主组件实例。
 */
interface ViewportSizeHostVm {
  /** 视口尺寸 */
  viewportSize: WidgetSize;
  /** 视口是否完成首轮稳定 */
  isViewportReady: boolean;
  /** 从根元素同步尺寸 */
  syncViewportSizeFromRoot: () => void;
  /** KeepAlive 激活后的尺寸同步 */
  scheduleViewportSizeSyncFromRoot: () => void;
}

/**
 * 命名模板引用模式下暴露给测试断言的宿主组件实例。
 */
type NamedViewportSizeHostVm = ViewportSizeHostVm;

/**
 * 命名模板引用模式下 setup 暴露的响应式状态。
 */
interface NamedViewportSizeHostSetup {
  /** 视口尺寸 */
  viewportSize: Ref<WidgetSize>;
  /** 视口是否完成首轮稳定 */
  isViewportReady: Ref<boolean>;
  /** 从根元素同步尺寸 */
  syncViewportSizeFromRoot: () => void;
  /** KeepAlive 激活后的尺寸同步 */
  scheduleViewportSizeSyncFromRoot: () => void;
}

/**
 * 设置元素的浏览器矩形。
 * @param element - DOM 元素
 * @param size - 矩形尺寸
 */
function setElementRect(element: Element, size: WidgetSize): void {
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: (): DOMRect => ({
      bottom: size.height,
      height: size.height,
      left: 0,
      right: size.width,
      top: 0,
      width: size.width,
      x: 0,
      y: 0,
      toJSON: (): Record<string, number> => ({})
    })
  });
}

/**
 * 创建视口尺寸 hook 测试宿主。
 * @returns Vue 测试宿主组件
 */
function createViewportSizeHost(): ReturnType<typeof defineComponent> {
  return defineComponent({
    setup(): ReturnType<typeof useViewportSize> {
      return useViewportSize();
    },
    template: '<div ref="rootRef"></div>'
  });
}

/**
 * 创建命名模板引用模式的视口尺寸 hook 测试宿主。
 * @returns Vue 测试宿主组件
 */
function createNamedViewportSizeHost(): ReturnType<typeof defineComponent> {
  return defineComponent({
    setup(): NamedViewportSizeHostSetup {
      const { viewportSize, isViewportReady, syncViewportSizeFromRoot, scheduleViewportSizeSyncFromRoot } = useViewportSize('rootRef');

      return {
        viewportSize,
        isViewportReady,
        syncViewportSizeFromRoot,
        scheduleViewportSizeSyncFromRoot
      };
    },
    template: '<div ref="rootRef"></div>'
  });
}

describe('useViewportSize', (): void => {
  beforeEach((): void => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback): number => window.setTimeout((): void => callback(0), 16));
    vi.stubGlobal('cancelAnimationFrame', (id: number): void => window.clearTimeout(id));
  });

  afterEach((): void => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('syncs viewport size from the root element and marks it ready after two frames', async (): Promise<void> => {
    const wrapper = mount(createViewportSizeHost());
    const vm = wrapper.vm as unknown as ViewportSizeHostVm;

    setElementRect(wrapper.element, { width: 640, height: 360 });
    vm.syncViewportSizeFromRoot();

    expect(vm.viewportSize).toEqual({ width: 640, height: 360 });
    expect(vm.isViewportReady).toBe(false);

    await vi.advanceTimersByTimeAsync(32);
    await nextTick();

    expect(vm.isViewportReady).toBe(true);
  });

  it('resets readiness before scheduling a KeepAlive size sync', async (): Promise<void> => {
    const wrapper = mount(createViewportSizeHost());
    const vm = wrapper.vm as unknown as ViewportSizeHostVm;

    setElementRect(wrapper.element, { width: 800, height: 420 });
    vm.syncViewportSizeFromRoot();
    await vi.advanceTimersByTimeAsync(32);
    await nextTick();

    setElementRect(wrapper.element, { width: 720, height: 400 });
    vm.scheduleViewportSizeSyncFromRoot();

    expect(vm.isViewportReady).toBe(false);

    await nextTick();
    await vi.advanceTimersByTimeAsync(16);

    expect(vm.viewportSize).toEqual({ width: 720, height: 400 });
  });

  it('syncs viewport size when the root element is bound by template ref name', (): void => {
    const wrapper = mount(createNamedViewportSizeHost());
    const vm = wrapper.vm as unknown as NamedViewportSizeHostVm;

    setElementRect(wrapper.element, { width: 320, height: 180 });
    vm.syncViewportSizeFromRoot();

    expect(vm.viewportSize).toEqual({ width: 320, height: 180 });
  });
});
