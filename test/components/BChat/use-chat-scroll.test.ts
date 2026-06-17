/**
 * @file use-chat-scroll.test.ts
 * @description BChat 滚动返回底部按钮显示时机测试。
 * @vitest-environment jsdom
 */
import { defineComponent, nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useChatScroll } from '@/components/BChat/hooks/useChatScroll';

/**
 * 暴露给测试断言的聊天滚动宿主实例。
 */
interface ChatScrollHostVm {
  /** 回到底部按钮是否显示 */
  isBackBottom: boolean;
  /** 暂停回到底部按钮自动隐藏 */
  pauseBackBottomHideTimer: () => void;
  /** 恢复回到底部按钮自动隐藏 */
  resumeBackBottomHideTimer: () => void;
}

/**
 * 创建 useChatScroll 测试宿主组件。
 * @returns 测试宿主组件
 */
function createChatScrollHost(): ReturnType<typeof defineComponent> {
  return defineComponent({
    name: 'ChatScrollHost',
    setup() {
      const scrollState = useChatScroll({
        backBottomHeight: 300,
        backBottomIdleHideDelay: 200
      });

      return {
        isBackBottom: scrollState.isBackBottom,
        pauseBackBottomHideTimer: scrollState.pauseBackBottomHideTimer,
        resumeBackBottomHideTimer: scrollState.resumeBackBottomHideTimer
      };
    },
    template: '<div ref="container" style="height: 400px; overflow-y: auto;"><div style="height: 1200px;"></div></div>'
  });
}

/**
 * 设置测试滚动容器的尺寸。
 * @param container - 滚动容器
 */
function mockScrollMetrics(container: Element): void {
  Object.defineProperty(container, 'clientHeight', {
    configurable: true,
    value: 400
  });
  Object.defineProperty(container, 'scrollHeight', {
    configurable: true,
    value: 1200
  });
}

describe('useChatScroll', (): void => {
  afterEach((): void => {
    vi.useRealTimers();
  });

  it('shows back bottom immediately while scrolling and hides it after idle delay', async (): Promise<void> => {
    vi.useFakeTimers();
    const wrapper = mount(createChatScrollHost());
    const vm = wrapper.vm as unknown as ChatScrollHostVm;
    await nextTick();
    const container = wrapper.element;
    mockScrollMetrics(container);

    container.scrollTop = 420;
    container.dispatchEvent(new Event('scroll'));
    await nextTick();

    expect(vm.isBackBottom).toBe(true);

    await vi.advanceTimersByTimeAsync(199);
    expect(vm.isBackBottom).toBe(true);

    await vi.advanceTimersByTimeAsync(1);
    expect(vm.isBackBottom).toBe(false);
  });

  it('resets idle hide delay on continuous scrolling', async (): Promise<void> => {
    vi.useFakeTimers();
    const wrapper = mount(createChatScrollHost());
    const vm = wrapper.vm as unknown as ChatScrollHostVm;
    await nextTick();
    const container = wrapper.element;
    mockScrollMetrics(container);

    container.scrollTop = 420;
    container.dispatchEvent(new Event('scroll'));
    await nextTick();
    await vi.advanceTimersByTimeAsync(150);

    container.scrollTop = 460;
    container.dispatchEvent(new Event('scroll'));
    await nextTick();
    await vi.advanceTimersByTimeAsync(199);

    expect(vm.isBackBottom).toBe(true);

    await vi.advanceTimersByTimeAsync(1);
    expect(vm.isBackBottom).toBe(false);
  });

  it('pauses idle hide timer while hovering and restarts the delay after leaving', async (): Promise<void> => {
    vi.useFakeTimers();
    const wrapper = mount(createChatScrollHost());
    const vm = wrapper.vm as unknown as ChatScrollHostVm;
    await nextTick();
    const container = wrapper.element;
    mockScrollMetrics(container);

    container.scrollTop = 420;
    container.dispatchEvent(new Event('scroll'));
    await nextTick();
    await vi.advanceTimersByTimeAsync(150);

    vm.pauseBackBottomHideTimer();
    await vi.advanceTimersByTimeAsync(200);

    expect(vm.isBackBottom).toBe(true);

    vm.resumeBackBottomHideTimer();
    await vi.advanceTimersByTimeAsync(199);
    expect(vm.isBackBottom).toBe(true);

    await vi.advanceTimersByTimeAsync(1);
    expect(vm.isBackBottom).toBe(false);
  });

  it('hides back bottom immediately when scrolling near the bottom', async (): Promise<void> => {
    vi.useFakeTimers();
    const wrapper = mount(createChatScrollHost());
    const vm = wrapper.vm as unknown as ChatScrollHostVm;
    await nextTick();
    const container = wrapper.element;
    mockScrollMetrics(container);

    container.scrollTop = 420;
    container.dispatchEvent(new Event('scroll'));
    await nextTick();
    expect(vm.isBackBottom).toBe(true);

    container.scrollTop = 80;
    container.dispatchEvent(new Event('scroll'));
    await nextTick();

    expect(vm.isBackBottom).toBe(false);
  });

  it('keeps only one external visibility state for the back bottom button', (): void => {
    const wrapper = mount(createChatScrollHost());

    expect('isBackBottom' in wrapper.vm).toBe(true);
    expect('isBackBottomActive' in wrapper.vm).toBe(false);
  });
});
