/**
 * @file web-capture-mask.test.ts
 * @description 验证 WebView 页面入口将截图能力交给 useScreenshot。
 * @vitest-environment jsdom
 */
import type { VueWrapper } from '@vue/test-utils';
import type { WebviewTag } from 'electron';
import type { Ref } from 'vue';
import { shallowMount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WebviewPageState } from '@/views/webview/shared/types';
import WebviewPage from '@/views/webview/web/index.vue';

/**
 * 测试用 WebView 元素最小能力集合。
 */
interface TestWebviewElement extends HTMLElement {
  /** 是否可后退。 */
  canGoBack: () => boolean;
  /** 是否可前进。 */
  canGoForward: () => boolean;
  /** 加载目标 URL。 */
  loadURL: (url: string) => void;
  /** 后退。 */
  goBack: () => void;
  /** 前进。 */
  goForward: () => void;
  /** 刷新。 */
  reload: () => void;
  /** 停止加载。 */
  stop: () => void;
  /** 设置 User-Agent。 */
  setUserAgent: (userAgent: string) => void;
}

/**
 * 测试用截图 Hook 入参。
 */
interface TestUseScreenshotOptions {
  /** 当前 WebView 元素引用 */
  webviewElementRef: Ref<WebviewTag | null>;
  /** 当前页面状态 */
  webviewState: Ref<Pick<WebviewPageState, 'title' | 'url'>>;
  /** 截图遮罩显隐回调 */
  onCaptureMaskVisibleChange?: (visible: boolean) => void | Promise<void>;
}

const hostLayerHolder = vi.hoisted<{ value: HTMLDivElement | null }>(() => ({ value: null }));
const screenshotOptionsHolder = vi.hoisted<{ value: TestUseScreenshotOptions | null }>(() => ({ value: null }));
const registerToolContextMock = vi.hoisted(() => vi.fn());
const unregisterToolContextMock = vi.hoisted(() => vi.fn());
const setCurrentToolContextMock = vi.hoisted(() => vi.fn());
const clearCurrentToolContextMock = vi.hoisted(() => vi.fn());

vi.mock('vue-router', () => ({
  useRoute: () => ({
    fullPath: '/webview?url=https%3A%2F%2Fexample.com',
    query: {
      url: 'https%3A%2F%2Fexample.com'
    }
  })
}));

vi.mock('@/stores/workspace/recent', () => ({
  useRecentStore: () => ({
    addWebviewRecord: vi.fn().mockResolvedValue(undefined)
  })
}));

vi.mock('@/ai/tools/context/webview', () => ({
  webviewToolContextRegistry: {
    register: registerToolContextMock,
    unregister: unregisterToolContextMock,
    setCurrent: setCurrentToolContextMock,
    clearCurrent: clearCurrentToolContextMock
  }
}));

vi.mock('@/shared/platform', () => ({
  native: {
    openExternal: vi.fn()
  }
}));

vi.mock('@/views/webview/shared/hooks/useWebviewTabTitle', () => ({
  useWebviewTabTitle: vi.fn()
}));

vi.mock('@/views/webview/web/hooks/useScreenshot.ts', () => ({
  useScreenshot: (options: TestUseScreenshotOptions) => {
    screenshotOptionsHolder.value = options;
    return {
      isCapturing: { value: false },
      captureViewportScreenshot: vi.fn().mockResolvedValue(undefined),
      captureFullPageScreenshot: vi.fn().mockResolvedValue(undefined),
      captureSelectedElementScreenshot: vi.fn().mockResolvedValue(undefined)
    };
  }
}));

vi.mock('@/views/webview/web/components/AddressBar.vue', () => ({
  default: {
    name: 'AddressBar',
    template: '<div />'
  }
}));

vi.mock('@/views/webview/web/components/DeviceToolbar.vue', () => ({
  default: {
    name: 'DeviceToolbar',
    template: '<div />'
  }
}));

vi.mock('@/views/webview/web/components/InspectorPanel.vue', () => ({
  default: {
    name: 'InspectorPanel',
    template: '<div />'
  }
}));

vi.mock('@/views/webview/web/hooks/useHostLayer.ts', () => ({
  useHostLayer: () => ({
    requestSyncHostLayerBounds: vi.fn()
  })
}));

vi.mock('@/views/webview/web/utils/hosting', () => ({
  ensureWebviewHostLayer: () => {
    const hostLayer = document.createElement('div');
    document.body.appendChild(hostLayer);
    hostLayerHolder.value = hostLayer;
    return hostLayer;
  },
  ensureHostedWebviewElement: (hostLayer: HTMLElement) => {
    const element = document.createElement('webview') as TestWebviewElement;
    element.canGoBack = vi.fn(() => false);
    element.canGoForward = vi.fn(() => false);
    element.loadURL = vi.fn();
    element.goBack = vi.fn();
    element.goForward = vi.fn();
    element.reload = vi.fn();
    element.stop = vi.fn();
    element.setUserAgent = vi.fn();
    hostLayer.appendChild(element);
    return element;
  }
}));

/**
 * 挂载 WebView 页面。
 * @returns Vue Test Utils 包装器
 */
function mountWebviewPage(): VueWrapper {
  return shallowMount(WebviewPage, {
    global: {
      stubs: {
        AddressBar: true,
        BPanelSplitter: true,
        DeviceToolbar: true,
        InspectorPanel: true
      }
    }
  });
}

describe('webview screenshot wiring', () => {
  beforeEach((): void => {
    hostLayerHolder.value = null;
    screenshotOptionsHolder.value = null;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback): number => {
      callback(0);
      return 0;
    });
  });

  afterEach((): void => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('lets useScreenshot own the hosted capture mask', (): void => {
    const wrapper = mountWebviewPage();
    const screenshotOptions = screenshotOptionsHolder.value;

    expect(screenshotOptions?.webviewElementRef.value).toBe(hostLayerHolder.value?.querySelector('webview'));
    expect(screenshotOptions?.onCaptureMaskVisibleChange).toBeUndefined();

    wrapper.unmount();
  });
});
