/**
 * @file context-menu.component.test.ts
 * @description 验证 BDrawing 右键菜单的定位与边界约束。
 * @vitest-environment jsdom
 */
import { nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DrawingContextMenu from '@/components/BDrawing/components/ContextMenu.vue';

/** 原始元素尺寸读取函数。 */
const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;

/**
 * 设置测试窗口尺寸。
 * @param width - 窗口宽度
 * @param height - 窗口高度
 */
function setWindowSize(width: number, height: number): void {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: width
  });
  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    value: height
  });
}

/**
 * 模拟菜单尺寸。
 * @param width - 菜单宽度
 * @param height - 菜单高度
 */
function mockMenuSize(width: number, height: number): void {
  HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRectMock(): DOMRect {
    if (this.classList.contains('b-drawing-context-menu')) {
      return DOMRect.fromRect({ height, width, x: 0, y: 0 });
    }

    return originalGetBoundingClientRect.call(this);
  };
}

/**
 * 等待菜单完成 post flush 尺寸同步。
 */
async function flushMenuPosition(): Promise<void> {
  await nextTick();
  await nextTick();
}

describe('DrawingContextMenu', (): void => {
  afterEach((): void => {
    HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    vi.restoreAllMocks();
  });

  it('clamps the menu position inside the viewport when opened near the bottom right edge', async (): Promise<void> => {
    setWindowSize(800, 600);
    mockMenuSize(180, 120);

    const wrapper = mount(DrawingContextMenu, {
      props: {
        open: true,
        position: { x: 790, y: 590 },
        items: [{ key: 'copy', label: '复制', icon: 'lucide:copy' }]
      },
      global: {
        stubs: {
          Icon: true
        }
      },
      attachTo: document.body
    });
    await flushMenuPosition();

    const { style } = wrapper.find<HTMLElement>('.b-drawing-context-menu').element;

    expect(style.left).toBe('612px');
    expect(style.top).toBe('472px');
    wrapper.unmount();
  });
});
