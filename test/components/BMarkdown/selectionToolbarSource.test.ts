/**
 * @file selectionToolbarSource.test.ts
 * @description SelectionToolbarSource 浮层边界收敛测试。
 * @vitest-environment jsdom
 */

import { defineComponent, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { SelectionAssistantPosition } from '@/components/BMarkdown/adapters/selectionAssistant';
import SelectionToolbarSource from '@/components/BMarkdown/components/SelectionToolbarSource.vue';

/**
 * 通用空操作函数。
 */
function noop(): void {
  // noop
}

vi.mock('@/hooks/useChat', () => ({
  useChat: () => ({
    agent: {
      abort: vi.fn(),
      stream: vi.fn()
    }
  })
}));

vi.mock('@/hooks/useShortcuts', () => ({
  useShortcuts: () => ({
    registerShortcut: () => noop
  })
}));

vi.mock('@/stores/serviceModel', () => ({
  useServiceModelStore: () => ({
    getAvailableServiceConfig: vi.fn().mockResolvedValue({
      providerId: 'provider',
      modelId: 'model',
      customPrompt: '{{SELECTED_TEXT}} {{USER_INPUT}}'
    })
  })
}));

/**
 * 模拟工具栏内容组件。
 */
const SelectionToolbarStub = defineComponent({
  /**
   * 渲染固定内容，便于宿主测量尺寸。
   * @returns 工具栏占位节点
   */
  setup(): () => string {
    return (): string => 'toolbar';
  },
  template: '<div class="mock-selection-toolbar">toolbar</div>'
});

/**
 * 创建定位信息。
 * @param anchorLeft - 锚点横坐标
 * @param anchorTop - 锚点纵坐标
 * @param selectionHeight - 完整选区高度
 * @returns 测试用定位信息
 */
function createPosition(anchorLeft: number, anchorTop: number, selectionHeight = 20): SelectionAssistantPosition {
  return {
    anchorRect: {
      top: anchorTop,
      left: anchorLeft,
      width: 0,
      height: 20
    },
    selectionRect: {
      top: anchorTop,
      left: anchorLeft,
      width: 0,
      height: selectionHeight
    },
    lineHeight: 20,
    containerRect: {
      top: 0,
      left: 0,
      width: 200,
      height: 160
    }
  };
}

/**
 * 使用 DOMRect 模拟工具栏真实渲染尺寸。
 * @param element - 工具栏宿主元素
 */
function mockToolbarRect(element: HTMLElement): void {
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: (): DOMRect => new DOMRect(0, 0, 120, 40)
  });
}

/**
 * 设置工具栏宿主尺寸，模拟真实布局测量结果。
 * @param element - 工具栏宿主元素
 */
function mockToolbarSize(element: HTMLElement): void {
  Object.defineProperty(element, 'offsetWidth', {
    configurable: true,
    get(): number {
      return 120;
    }
  });
  Object.defineProperty(element, 'offsetHeight', {
    configurable: true,
    get(): number {
      return 40;
    }
  });
  mockToolbarRect(element);
}

/**
 * 设置 overlayRoot 的可用尺寸，模拟编辑器容器宽高。
 * @param element - overlayRoot 容器
 * @param width - 容器宽度
 * @param height - 容器高度
 */
function mockOverlaySize(element: HTMLElement, width: number, height: number): void {
  Object.defineProperty(element, 'clientWidth', {
    configurable: true,
    get(): number {
      return width;
    }
  });
  Object.defineProperty(element, 'clientHeight', {
    configurable: true,
    get(): number {
      return height;
    }
  });
}

/**
 * 读取工具栏 style 中的像素值。
 * @param element - 工具栏宿主元素
 * @param property - 样式属性名
 * @returns 解析后的数字像素值
 */
function readPx(element: HTMLElement, property: 'top' | 'left'): number {
  return Number.parseFloat(element.style[property]);
}

/**
 * 获取被 Teleport 渲染后的工具栏宿主节点。
 * @returns 工具栏宿主元素
 */
function getToolbarElement(): HTMLElement {
  const element = document.body.querySelector('.b-markdown-selsource');
  if (!(element instanceof HTMLElement)) {
    throw new Error('Selection toolbar element was not rendered.');
  }
  return element;
}

describe('SelectionToolbarSource', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  test('keeps the toolbar hidden until the first measured position is ready', async () => {
    const overlayRoot = document.createElement('div');
    document.body.appendChild(overlayRoot);

    mount(SelectionToolbarSource, {
      props: {
        visible: true,
        overlayRoot,
        position: createPosition(80, 60)
      },
      global: {
        stubs: {
          SelectionToolbar: SelectionToolbarStub
        }
      }
    });

    await nextTick();

    const toolbar = getToolbarElement();

    expect(toolbar.style.visibility).toBe('hidden');
  });

  test('hides immediately on overlay pointerdown even before the visible prop changes', async () => {
    const overlayRoot = document.createElement('div');
    const editorSurface = document.createElement('div');
    overlayRoot.appendChild(editorSurface);
    document.body.appendChild(overlayRoot);

    mount(SelectionToolbarSource, {
      props: {
        visible: true,
        overlayRoot,
        position: createPosition(80, 60)
      },
      global: {
        stubs: {
          SelectionToolbar: SelectionToolbarStub
        }
      }
    });

    await nextTick();

    const toolbar = getToolbarElement();
    mockToolbarSize(toolbar);

    window.dispatchEvent(new Event('resize'));
    await nextTick();
    expect(toolbar.style.display).not.toBe('none');

    editorSurface.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    await nextTick();

    expect(toolbar.style.display).toBe('none');
  });

  test('clamps horizontal position when the toolbar would overflow on the right', async () => {
    const overlayRoot = document.createElement('div');
    document.body.appendChild(overlayRoot);

    mount(SelectionToolbarSource, {
      props: {
        visible: true,
        overlayRoot,
        position: createPosition(190, 60)
      },
      global: {
        stubs: {
          SelectionToolbar: SelectionToolbarStub
        }
      }
    });

    await nextTick();

    const toolbar = getToolbarElement();
    mockToolbarSize(toolbar);

    window.dispatchEvent(new Event('resize'));
    await nextTick();

    expect(readPx(toolbar, 'left')).toBe(72);
    expect(toolbar.style.visibility).toBe('visible');
  });

  test('clamps horizontal position within the overlay root when the visible viewport is wider than the editor container', async () => {
    const overlayRoot = document.createElement('div');
    mockOverlaySize(overlayRoot, 160, 160);
    document.body.appendChild(overlayRoot);

    mount(SelectionToolbarSource, {
      props: {
        visible: true,
        overlayRoot,
        position: createPosition(150, 60)
      },
      global: {
        stubs: {
          SelectionToolbar: SelectionToolbarStub
        }
      }
    });

    await nextTick();

    const toolbar = getToolbarElement();
    mockToolbarSize(toolbar);

    window.dispatchEvent(new Event('resize'));
    await nextTick();

    expect(readPx(toolbar, 'left')).toBe(32);
    expect(toolbar.style.visibility).toBe('visible');
  });

  test('uses bounding client rect measurements when offset size is unavailable', async () => {
    const overlayRoot = document.createElement('div');
    document.body.appendChild(overlayRoot);

    mount(SelectionToolbarSource, {
      props: {
        visible: true,
        overlayRoot,
        position: createPosition(190, 60)
      },
      global: {
        stubs: {
          SelectionToolbar: SelectionToolbarStub
        }
      }
    });

    await nextTick();

    const toolbar = getToolbarElement();
    Object.defineProperty(toolbar, 'offsetWidth', {
      configurable: true,
      get(): number {
        return 0;
      }
    });
    Object.defineProperty(toolbar, 'offsetHeight', {
      configurable: true,
      get(): number {
        return 0;
      }
    });
    mockToolbarRect(toolbar);

    window.dispatchEvent(new Event('resize'));
    await nextTick();

    expect(readPx(toolbar, 'left')).toBe(72);
    expect(toolbar.style.visibility).toBe('visible');
  });

  test('renders below the selection when there is not enough space above', async () => {
    const overlayRoot = document.createElement('div');
    document.body.appendChild(overlayRoot);

    mount(SelectionToolbarSource, {
      props: {
        visible: true,
        overlayRoot,
        position: createPosition(80, 10)
      },
      global: {
        stubs: {
          SelectionToolbar: SelectionToolbarStub
        }
      }
    });

    await nextTick();

    const toolbar = getToolbarElement();
    mockToolbarSize(toolbar);

    window.dispatchEvent(new Event('resize'));
    await nextTick();

    expect(readPx(toolbar, 'top')).toBe(38);
  });

  test('prefers rendering below when the selection anchor is above the visible viewport', async () => {
    const overlayRoot = document.createElement('div');
    document.body.appendChild(overlayRoot);

    mount(SelectionToolbarSource, {
      props: {
        visible: true,
        overlayRoot,
        position: createPosition(190, -20, 60)
      },
      global: {
        stubs: {
          SelectionToolbar: SelectionToolbarStub
        }
      }
    });

    await nextTick();

    const toolbar = getToolbarElement();
    mockToolbarSize(toolbar);

    window.dispatchEvent(new Event('resize'));
    await nextTick();

    expect(readPx(toolbar, 'left')).toBe(72);
    expect(readPx(toolbar, 'top')).toBe(48);
  });
});
