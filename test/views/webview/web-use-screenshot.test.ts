/**
 * @file web-use-screenshot.test.ts
 * @description 验证 WebView 截图输出到剪贴板。
 * @vitest-environment jsdom
 */
import { Script } from 'node:vm';
import type { WebviewTag } from 'electron';
import { ref } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { native } from '@/shared/platform/native';
import type { WebviewElementSelection } from '@/views/webview/shared/types';
import { useScreenshot } from '@/views/webview/web/hooks/useScreenshot';
import { createElementCaptureRectScript } from '@/views/webview/web/utils/screenshot';

const croppedPngBytes = new Uint8Array([137, 80, 78, 71, 2]);
const drawImageMock = vi.fn();
const toBlobMock = vi.fn<(callback: BlobCallback, type?: string) => void>();
const originalCanvasGetContext = HTMLCanvasElement.prototype.getContext;
const originalCanvasToBlob = HTMLCanvasElement.prototype.toBlob;
const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

vi.mock('ant-design-vue', () => ({
  message: {
    success: vi.fn(),
    error: vi.fn()
  }
}));

vi.mock('@/shared/platform/native', () => ({
  native: {
    copyImageToClipboard: vi.fn().mockResolvedValue(undefined),
    saveBinaryFile: vi.fn().mockResolvedValue('/tmp/webview.png')
  }
}));

/**
 * 创建可截图的 WebView 测试替身。
 * @param pngBytes - 截图 PNG 字节
 * @returns WebView 测试替身
 */
function createScreenshotWebview(pngBytes: Uint8Array, executeJavaScriptResult: unknown | unknown[] = undefined): WebviewTag {
  const element = document.createElement('webview') as unknown as WebviewTag;
  if (Array.isArray(executeJavaScriptResult)) {
    const results = [...executeJavaScriptResult];
    element.executeJavaScript = vi.fn().mockImplementation(() => Promise.resolve(results.shift() ?? null));
  } else {
    element.executeJavaScript = vi.fn().mockResolvedValue(executeJavaScriptResult);
  }
  element.capturePage = vi.fn().mockResolvedValue({
    toPNG: () => pngBytes
  });
  return element;
}

/**
 * 创建测试用的元素选择结果。
 * @returns 元素选择结果
 */
function createElementSelection(): WebviewElementSelection {
  return {
    tagName: 'BUTTON',
    id: 'submit',
    className: 'primary-action',
    text: '提交',
    selector: 'button#submit',
    attributes: [],
    ancestors: [],
    computedStyles: {},
    rect: {
      x: 12,
      y: 16,
      width: 120,
      height: 40
    }
  };
}

/**
 * 创建带页面坐标缓存的测试选择结果。
 * @returns 元素选择结果
 */
function createCachedElementSelection(): WebviewElementSelection {
  const selection = createElementSelection();
  return {
    ...selection,
    rect: {
      ...selection.rect,
      pageX: 12,
      pageY: 90
    }
  } as unknown as WebviewElementSelection;
}

/**
 * 执行元素截图区域读取脚本。
 * @param selector - 目标元素选择器
 * @returns 脚本读取到的截图区域
 */
function runElementCaptureRectScript(selector: string): unknown {
  return new Script(createElementCaptureRectScript(selector)).runInThisContext() as unknown;
}

/**
 * 判断脚本是否包含元素选择器层控制。
 * @param script - 执行脚本
 * @param visible - 是否恢复可见性
 * @returns 是否为元素选择器层控制脚本
 */
function isElementPickerVisibilityScript(script: unknown, visible: boolean): boolean {
  const scriptText = String(script);
  return (
    scriptText.includes('tibis-element-picker-selected') &&
    scriptText.includes('tibis-element-picker-highlight') &&
    scriptText.includes(visible ? 'const handler = restoreElementPickerLayer' : 'const handler = hideElementPickerLayer')
  );
}

/**
 * 判断脚本是否包含元素截图遮挡层控制。
 * @param script - 执行脚本
 * @param visible - 是否恢复可见性
 * @returns 是否为截图遮挡层控制脚本
 */
function isElementCaptureObstructionScript(script: unknown, visible: boolean): boolean {
  const scriptText = String(script);
  return (
    scriptText.includes('data-tibis-element-capture-obstruction-hidden') &&
    scriptText.includes(visible ? 'const handler = restoreElementCaptureObstruction' : 'const handler = hideElementCaptureObstruction')
  );
}

describe('useScreenshot', () => {
  beforeEach((): void => {
    vi.clearAllMocks();
    drawImageMock.mockClear();
    toBlobMock.mockImplementation((callback: BlobCallback): void => {
      callback(new Blob([croppedPngBytes], { type: 'image/png' }));
    });
    URL.createObjectURL = vi.fn(() => 'blob:webview-screenshot');
    URL.revokeObjectURL = vi.fn();
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      value: ((contextId: string): CanvasRenderingContext2D | null => {
        if (contextId !== '2d') {
          return null;
        }

        return {
          drawImage: drawImageMock
        } as unknown as CanvasRenderingContext2D;
      }) as HTMLCanvasElement['getContext'],
      configurable: true
    });
    Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
      value: toBlobMock as HTMLCanvasElement['toBlob'],
      configurable: true
    });
    vi.stubGlobal(
      'Image',
      class {
        /** 视口截图位图宽度。 */
        width = 400;

        /** 视口截图位图高度。 */
        height = 200;

        /** 图片加载完成回调。 */
        onload: (() => void) | null = null;

        /** 图片加载失败回调。 */
        onerror: (() => void) | null = null;

        /**
         * 设置图片地址后触发加载完成。
         */
        set src(_value: string) {
          this.onload?.();
        }
      }
    );
  });

  afterEach((): void => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      value: originalCanvasGetContext,
      configurable: true
    });
    Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
      value: originalCanvasToBlob,
      configurable: true
    });
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
  });

  it('copies viewport screenshot PNG to clipboard without saving a file', async (): Promise<void> => {
    const pngBytes = new Uint8Array([137, 80, 78, 71]);
    const webviewElement = createScreenshotWebview(pngBytes);
    const screenshot = useScreenshot({
      webviewElementRef: ref<WebviewTag | null>(webviewElement),
      webviewState: ref({ title: 'Example', url: 'https://example.com' })
    });

    await screenshot.captureViewportScreenshot();

    expect(native.copyImageToClipboard).toHaveBeenCalledTimes(1);
    const copiedBuffer = vi.mocked(native.copyImageToClipboard).mock.calls[0]?.[0];

    expect(copiedBuffer).toBeInstanceOf(ArrayBuffer);
    expect(Array.from(new Uint8Array(copiedBuffer ?? new ArrayBuffer(0)))).toEqual(Array.from(pngBytes));
    expect(native.saveBinaryFile).not.toHaveBeenCalled();
  });

  it('stitches selected element screenshot across viewport boundaries', async (): Promise<void> => {
    const pngBytes = new Uint8Array([137, 80, 78, 71, 1]);
    const webviewElement = createScreenshotWebview(pngBytes, {
      pageX: 12,
      pageY: 90,
      width: 120,
      height: 160,
      viewportX: 0,
      viewportY: 0,
      viewportWidth: 200,
      viewportHeight: 100,
      captureViewportWidth: 200,
      captureViewportHeight: 100,
      maxScrollLeft: 0,
      maxScrollTop: 200,
      scrollLeft: 0,
      scrollTop: 0,
      scrollTarget: {
        type: 'window'
      }
    });
    const screenshot = useScreenshot({
      webviewElementRef: ref<WebviewTag | null>(webviewElement),
      webviewState: ref({ title: 'Example', url: 'https://example.com' })
    });

    await screenshot.captureSelectedElementScreenshot(createElementSelection());

    expect(webviewElement.executeJavaScript).toHaveBeenCalledWith(expect.stringContaining('button#submit'));
    expect(webviewElement.capturePage).toHaveBeenCalledTimes(2);
    const executeJavaScriptMock = vi.mocked(webviewElement.executeJavaScript);
    const hideCallOrders = executeJavaScriptMock.mock.calls
      .map(([script], index) => (isElementPickerVisibilityScript(script, false) ? executeJavaScriptMock.mock.invocationCallOrder[index] : null))
      .filter((order): order is number => typeof order === 'number');
    const obstructionHideCallOrders = executeJavaScriptMock.mock.calls
      .map(([script], index) => (isElementCaptureObstructionScript(script, false) ? executeJavaScriptMock.mock.invocationCallOrder[index] : null))
      .filter((order): order is number => typeof order === 'number');
    const restoreCallOrders = executeJavaScriptMock.mock.calls
      .map(([script], index) => (isElementPickerVisibilityScript(script, true) ? executeJavaScriptMock.mock.invocationCallOrder[index] : null))
      .filter((order): order is number => typeof order === 'number');
    const obstructionRestoreCallOrders = executeJavaScriptMock.mock.calls
      .map(([script], index) => (isElementCaptureObstructionScript(script, true) ? executeJavaScriptMock.mock.invocationCallOrder[index] : null))
      .filter((order): order is number => typeof order === 'number');

    expect(hideCallOrders).toHaveLength(2);
    expect(obstructionHideCallOrders).toHaveLength(2);
    expect(restoreCallOrders).toHaveLength(1);
    expect(obstructionRestoreCallOrders).toHaveLength(1);
    expect(obstructionHideCallOrders[0]).toBeLessThan(vi.mocked(webviewElement.capturePage).mock.invocationCallOrder[0] ?? 0);
    expect(obstructionHideCallOrders[1]).toBeLessThan(vi.mocked(webviewElement.capturePage).mock.invocationCallOrder[1] ?? 0);
    expect(hideCallOrders[0]).toBeLessThan(vi.mocked(webviewElement.capturePage).mock.invocationCallOrder[0] ?? 0);
    expect(hideCallOrders[1]).toBeLessThan(vi.mocked(webviewElement.capturePage).mock.invocationCallOrder[1] ?? 0);
    expect(drawImageMock).toHaveBeenNthCalledWith(1, expect.any(Object), 24, 0, 240, 200, 0, 0, 240, 200);
    expect(drawImageMock).toHaveBeenNthCalledWith(2, expect.any(Object), 24, 0, 240, 120, 0, 200, 240, 120);
    expect(native.copyImageToClipboard).toHaveBeenCalledTimes(1);
    const copiedBuffer = vi.mocked(native.copyImageToClipboard).mock.calls[0]?.[0];

    expect(Array.from(new Uint8Array(copiedBuffer ?? new ArrayBuffer(0)))).toEqual(Array.from(croppedPngBytes));
  });

  it('uses cached selected element position when selected element is outside queryable viewport', async (): Promise<void> => {
    const pngBytes = new Uint8Array([137, 80, 78, 71, 3]);
    const webviewElement = createScreenshotWebview(pngBytes, [
      null,
      {
        viewportX: 0,
        viewportY: 0,
        viewportWidth: 200,
        viewportHeight: 100,
        captureViewportWidth: 200,
        captureViewportHeight: 100,
        maxScrollLeft: 0,
        maxScrollTop: 200,
        scrollLeft: 0,
        scrollTop: 0,
        scrollTarget: {
          type: 'window'
        }
      }
    ]);
    const screenshot = useScreenshot({
      webviewElementRef: ref<WebviewTag | null>(webviewElement),
      webviewState: ref({ title: 'Example', url: 'https://example.com' })
    });

    await screenshot.captureSelectedElementScreenshot(createCachedElementSelection());

    expect(webviewElement.capturePage).toHaveBeenCalledTimes(1);
    expect(drawImageMock).toHaveBeenCalledWith(expect.any(Object), 24, 0, 240, 80, 0, 0, 240, 80);
    expect(native.copyImageToClipboard).toHaveBeenCalledTimes(1);
  });

  it('clips oversized selected element screenshot to the capturable page bounds', async (): Promise<void> => {
    const pngBytes = new Uint8Array([137, 80, 78, 71, 4]);
    const webviewElement = createScreenshotWebview(pngBytes, {
      pageX: 12,
      pageY: 90,
      width: 120,
      height: 220,
      viewportX: 0,
      viewportY: 0,
      viewportWidth: 200,
      viewportHeight: 100,
      captureViewportWidth: 200,
      captureViewportHeight: 100,
      maxScrollLeft: 0,
      maxScrollTop: 100,
      scrollLeft: 0,
      scrollTop: 0,
      scrollTarget: {
        type: 'window'
      }
    });
    const screenshot = useScreenshot({
      webviewElementRef: ref<WebviewTag | null>(webviewElement),
      webviewState: ref({ title: 'Example', url: 'https://example.com' })
    });

    await screenshot.captureSelectedElementScreenshot(createElementSelection());

    expect(webviewElement.capturePage).toHaveBeenCalledTimes(2);
    expect(drawImageMock).toHaveBeenNthCalledWith(1, expect.any(Object), 24, 0, 240, 200, 0, 0, 240, 200);
    expect(drawImageMock).toHaveBeenNthCalledWith(2, expect.any(Object), 24, 180, 240, 20, 0, 200, 240, 20);
    expect(native.copyImageToClipboard).toHaveBeenCalledTimes(1);
  });

  it('stitches selected element screenshot inside an internal scroll container', async (): Promise<void> => {
    const pngBytes = new Uint8Array([137, 80, 78, 71, 5]);
    const webviewElement = createScreenshotWebview(pngBytes, {
      pageX: 12,
      pageY: 90,
      width: 120,
      height: 160,
      viewportX: 20,
      viewportY: 30,
      viewportWidth: 200,
      viewportHeight: 100,
      captureViewportWidth: 400,
      captureViewportHeight: 200,
      maxScrollLeft: 0,
      maxScrollTop: 200,
      scrollLeft: 0,
      scrollTop: 0,
      scrollTarget: {
        type: 'element',
        marker: 'tibis-scroll-container-1'
      }
    });
    const screenshot = useScreenshot({
      webviewElementRef: ref<WebviewTag | null>(webviewElement),
      webviewState: ref({ title: 'Example', url: 'https://example.com' })
    });

    await screenshot.captureSelectedElementScreenshot(createElementSelection());

    expect(webviewElement.capturePage).toHaveBeenCalledTimes(2);
    expect(drawImageMock).toHaveBeenNthCalledWith(1, expect.any(Object), 32, 30, 120, 100, 0, 0, 120, 100);
    expect(drawImageMock).toHaveBeenNthCalledWith(2, expect.any(Object), 32, 30, 120, 60, 0, 100, 120, 60);
    expect(vi.mocked(webviewElement.executeJavaScript).mock.calls.some(([script]) => String(script).includes('tibis-scroll-container-1'))).toBe(true);
    expect(native.copyImageToClipboard).toHaveBeenCalledTimes(1);
  });

  it('captures viewport-anchored selected elements without scrolling them away', async (): Promise<void> => {
    const pngBytes = new Uint8Array([137, 80, 78, 71, 6]);
    const webviewElement = createScreenshotWebview(pngBytes, {
      pageX: 40,
      pageY: 30,
      width: 100,
      height: 40,
      viewportX: 0,
      viewportY: 0,
      viewportWidth: 200,
      viewportHeight: 100,
      captureViewportWidth: 200,
      captureViewportHeight: 100,
      maxScrollLeft: 0,
      maxScrollTop: 500,
      scrollLeft: 0,
      scrollTop: 260,
      scrollTarget: {
        type: 'window'
      },
      isViewportAnchored: true
    });
    const screenshot = useScreenshot({
      webviewElementRef: ref<WebviewTag | null>(webviewElement),
      webviewState: ref({ title: 'Example', url: 'https://example.com' })
    });

    await screenshot.captureSelectedElementScreenshot(createElementSelection());

    expect(webviewElement.capturePage).toHaveBeenCalledTimes(1);
    expect(vi.mocked(webviewElement.executeJavaScript).mock.calls.some(([script]) => String(script).includes('window.scrollTo(0, 260)'))).toBe(true);
    expect(vi.mocked(webviewElement.executeJavaScript).mock.calls.some(([script]) => String(script).includes('window.scrollTo(0, 30)'))).toBe(false);
    expect(drawImageMock).toHaveBeenCalledWith(expect.any(Object), 80, 60, 200, 80, 0, 0, 200, 80);
    expect(native.copyImageToClipboard).toHaveBeenCalledTimes(1);
  });

  it('treats sticky elements as viewport anchored only when they are pinned', (): void => {
    document.body.innerHTML = '<div id="sticky-target" style="position: sticky; top: 0; width: 100px; height: 40px;"></div>';
    const stickyElement = document.querySelector('#sticky-target');

    if (!(stickyElement instanceof HTMLElement)) {
      throw new Error('sticky target should exist');
    }

    Object.defineProperty(stickyElement, 'getBoundingClientRect', {
      value: (): DOMRect =>
        ({
          x: 0,
          y: 120,
          left: 0,
          top: 120,
          right: 100,
          bottom: 160,
          width: 100,
          height: 40,
          toJSON: () => ({})
        } as DOMRect),
      configurable: true
    });

    const rect = runElementCaptureRectScript('#sticky-target') as { isViewportAnchored?: boolean };

    expect(rect.isViewportAnchored).toBe(false);
  });

  it('clips viewport-anchored selected elements to visible viewport bounds', async (): Promise<void> => {
    const pngBytes = new Uint8Array([137, 80, 78, 71, 7]);
    const webviewElement = createScreenshotWebview(pngBytes, {
      pageX: -20,
      pageY: -10,
      width: 100,
      height: 40,
      viewportX: 0,
      viewportY: 0,
      viewportWidth: 200,
      viewportHeight: 100,
      captureViewportWidth: 200,
      captureViewportHeight: 100,
      maxScrollLeft: 0,
      maxScrollTop: 0,
      scrollLeft: 0,
      scrollTop: 260,
      scrollTarget: {
        type: 'window'
      },
      isViewportAnchored: true
    });
    const screenshot = useScreenshot({
      webviewElementRef: ref<WebviewTag | null>(webviewElement),
      webviewState: ref({ title: 'Example', url: 'https://example.com' })
    });

    await screenshot.captureSelectedElementScreenshot(createElementSelection());

    expect(webviewElement.capturePage).toHaveBeenCalledTimes(1);
    expect(drawImageMock).toHaveBeenCalledWith(expect.any(Object), 0, 0, 160, 60, 0, 0, 160, 60);
    expect(native.copyImageToClipboard).toHaveBeenCalledTimes(1);
  });

  it('cleans internal scroll container marker when selected element capture bounds are invalid', async (): Promise<void> => {
    const pngBytes = new Uint8Array([137, 80, 78, 71, 8]);
    const webviewElement = createScreenshotWebview(pngBytes, {
      pageX: 320,
      pageY: 90,
      width: 120,
      height: 40,
      viewportX: 20,
      viewportY: 30,
      viewportWidth: 200,
      viewportHeight: 100,
      captureViewportWidth: 400,
      captureViewportHeight: 200,
      maxScrollLeft: 0,
      maxScrollTop: 100,
      scrollLeft: 0,
      scrollTop: 0,
      scrollTarget: {
        type: 'element',
        marker: 'tibis-scroll-container-error'
      }
    });
    const screenshot = useScreenshot({
      webviewElementRef: ref<WebviewTag | null>(webviewElement),
      webviewState: ref({ title: 'Example', url: 'https://example.com' })
    });

    await screenshot.captureSelectedElementScreenshot(createElementSelection());

    expect(webviewElement.capturePage).not.toHaveBeenCalled();
    expect(
      vi
        .mocked(webviewElement.executeJavaScript)
        .mock.calls.some(([script]) => String(script).includes('tibis-scroll-container-error') && String(script).includes('removeAttribute(markerAttribute)'))
    ).toBe(true);
    expect(native.copyImageToClipboard).not.toHaveBeenCalled();
  });
});
