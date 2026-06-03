/**
 * @file useScreenshot.ts
 * @description 封装 WebView 视图截图与完整页面长截屏能力。
 */
import type { Ref } from 'vue';
import { message } from 'ant-design-vue';
import { native } from '@/shared/platform';
import type { WebviewPageState } from '@/views/webview/shared/types';
import {
  buildFixedElementOverlayCaptures,
  buildPageCaptureSlices,
  buildScreenshotDefaultPath,
  createFixedElementCaptureCleanupScript,
  createFixedElementCaptureSetupScript,
  createFixedElementVisibilityScript,
  createPageCaptureMetricsScript,
  createPageScrollScript,
  createPngBlob,
  createVisiblePositionedElementSnapshotScript,
  isWebviewFixedElementSnapshotArray,
  isWebviewPageCaptureMetrics,
  type WebviewFixedElementOverlayCapture,
  type WebviewFixedElementSnapshot,
  type WebviewPageCaptureMetrics,
  type WebviewPageCaptureSlice
} from '../utils/screenshot';

/**
 * 截图 Hook 所需的最小页面状态。
 */
type ScreenshotState = Pick<WebviewPageState, 'title' | 'url'>;

/**
 * 创建截图 Hook 时需要注入的依赖。
 */
export interface UseScreenshotOptions {
  /** 当前 `<webview>` 元素引用 */
  webviewElementRef: Ref<Electron.WebviewTag | null>;
  /** 当前页面标题与地址 */
  webviewState: Ref<ScreenshotState>;
}

/**
 * 渲染后的截图切片。
 */
interface RenderedCaptureSlice {
  /** 原始切片信息 */
  slice: WebviewPageCaptureSlice;
  /** 可绘制图片 */
  image: HTMLImageElement;
}

/**
 * 获取可执行截图脚本的 `<webview>` 实例。
 * @param webviewElementRef - `<webview>` 元素引用
 * @returns 已就绪的 `<webview>` 实例
 */
function getReadyWebviewElement(webviewElementRef: Ref<Electron.WebviewTag | null>): Electron.WebviewTag {
  const instance = webviewElementRef.value;
  if (!instance) {
    throw new Error('当前页面尚未准备好，请稍后重试');
  }

  if (typeof instance.executeJavaScript !== 'function' || typeof instance.capturePage !== 'function') {
    throw new Error('当前环境暂不支持 WebView 截图');
  }

  return instance;
}

/**
 * 读取当前页面的截屏尺寸信息。
 * @param element - `<webview>` 实例
 * @returns 页面截屏尺寸信息
 */
async function readPageCaptureMetrics(element: Electron.WebviewTag): Promise<WebviewPageCaptureMetrics> {
  const metrics = (await element.executeJavaScript(createPageCaptureMetricsScript())) as unknown;

  if (!isWebviewPageCaptureMetrics(metrics)) {
    throw new Error('读取页面尺寸信息失败');
  }

  return metrics;
}

/**
 * 将二进制视图转为独立 ArrayBuffer。
 * @param value - 二进制视图
 * @returns 可安全传输的 ArrayBuffer
 */
function toArrayBuffer(value: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(value.byteLength);
  copy.set(value);
  return copy.buffer;
}

/**
 * 将 PNG 字节加载为可绘制图片。
 * @param pngBytes - PNG 二进制内容
 * @returns 图片元素
 */
async function loadPngImage(pngBytes: ArrayBuffer): Promise<HTMLImageElement> {
  const blob = createPngBlob(pngBytes);
  const url = URL.createObjectURL(blob);

  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('加载截图切片失败'));
      image.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * 将 fixed 元素覆盖区域绘制回最终长图。
 * @param context - 目标画布上下文
 * @param image - 当前滚动位置下的截图
 * @param overlays - 需要绘制的覆盖区域
 * @param scale - CSS 像素到截图像素的缩放比例
 */
function drawFixedElementOverlays(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  overlays: WebviewFixedElementOverlayCapture['overlays'],
  scale: number
): void {
  overlays.forEach((overlay) => {
    const sourceX = Math.round(overlay.sourceX * scale);
    const sourceY = Math.round(overlay.sourceY * scale);
    const drawWidth = Math.max(1, Math.round(overlay.width * scale));
    const drawHeight = Math.max(1, Math.round(overlay.height * scale));
    const targetX = Math.round(overlay.targetX * scale);
    const targetY = Math.round(overlay.targetY * scale);

    context.drawImage(image, sourceX, sourceY, drawWidth, drawHeight, targetX, targetY, drawWidth, drawHeight);
  });
}

/**
 * 将 Canvas 内容导出为 PNG 二进制。
 * @param canvas - 目标画布
 * @returns PNG ArrayBuffer
 */
async function exportCanvasAsPng(canvas: HTMLCanvasElement): Promise<ArrayBuffer> {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => {
      if (value) {
        resolve(value);
        return;
      }

      reject(new Error('导出截图失败'));
    }, 'image/png');
  });

  return blob.arrayBuffer();
}

/**
 * 读取用于截图文件名的页面标题。
 * @param webviewState - 当前页面标题与地址
 * @returns 页面标题或地址
 */
function getScreenshotTitle(webviewState: Ref<ScreenshotState>): string {
  return webviewState.value.title || webviewState.value.url || 'webview';
}

/**
 * 保存 PNG 文件到用户选择的位置。
 * @param webviewState - 当前页面标题与地址
 * @param buffer - PNG 二进制内容
 * @param mode - 截图模式
 * @returns 最终保存路径
 */
async function saveScreenshot(webviewState: Ref<ScreenshotState>, buffer: ArrayBuffer, mode: 'viewport' | 'full-page'): Promise<string | null> {
  return native.saveBinaryFile(buffer, undefined, {
    filters: [{ name: 'PNG Image', extensions: ['png'] }],
    defaultPath: buildScreenshotDefaultPath(getScreenshotTitle(webviewState), mode)
  });
}

/**
 * 采样并拼接完整页面长截屏。
 * @param element - `<webview>` 实例
 * @returns 拼接后的 PNG 二进制
 */
async function captureFullPagePng(element: Electron.WebviewTag): Promise<ArrayBuffer> {
  const metrics = await readPageCaptureMetrics(element);
  const slices = buildPageCaptureSlices(metrics);
  const renderedSlices: RenderedCaptureSlice[] = [];
  const positionedObservationsBySlice: WebviewFixedElementSnapshot[][] = [];
  let fixedOverlayCaptures: WebviewFixedElementOverlayCapture[] = [];
  let pngBuffer: ArrayBuffer | null = null;

  try {
    await element.executeJavaScript(createFixedElementCaptureSetupScript());

    for (const slice of slices) {
      // 长截屏需要串行滚动与采样，避免并发截图读到错位视口。
      // eslint-disable-next-line no-await-in-loop
      await element.executeJavaScript(createPageScrollScript(slice.scrollTop));
      // 先恢复定位层原始状态，确保读取的是这一屏真实可见的吸附元素。
      // eslint-disable-next-line no-await-in-loop
      await element.executeJavaScript(createFixedElementVisibilityScript(true));
      // 先读取当前屏幕中真正吸附住的定位元素，再决定后续是否保留。
      // eslint-disable-next-line no-await-in-loop
      const visiblePositionedElementsRaw = (await element.executeJavaScript(createVisiblePositionedElementSnapshotScript())) as unknown;
      if (!isWebviewFixedElementSnapshotArray(visiblePositionedElementsRaw)) {
        throw new Error('读取定位元素信息失败');
      }
      positionedObservationsBySlice.push(visiblePositionedElementsRaw);
      // 基础长图统一隐藏定位层，最后再按保留规则覆盖回去。
      // eslint-disable-next-line no-await-in-loop
      await element.executeJavaScript(createFixedElementVisibilityScript(false));
      // eslint-disable-next-line no-await-in-loop
      const capturedImage = await element.capturePage();
      const pngBytes = toArrayBuffer(capturedImage.toPNG());
      // eslint-disable-next-line no-await-in-loop
      const image = await loadPngImage(pngBytes);

      renderedSlices.push({ slice, image });
    }

    fixedOverlayCaptures = buildFixedElementOverlayCaptures(
      metrics,
      positionedObservationsBySlice,
      slices.map((slice) => slice.scrollTop)
    );

    const firstSlice = renderedSlices[0];
    if (!firstSlice) {
      throw new Error('当前页面没有可截取的内容');
    }

    const scale = firstSlice.image.width / Math.max(metrics.viewportWidth, 1);
    const canvas = document.createElement('canvas');
    canvas.width = firstSlice.image.width;
    canvas.height = Math.max(1, Math.round(metrics.contentHeight * scale));

    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('创建截图画布失败');
    }

    renderedSlices.forEach(({ slice, image }) => {
      const sourceY = Math.round(slice.sourceY * scale);
      const drawHeight = Math.max(1, Math.round(slice.height * scale));
      const targetY = Math.round(slice.offsetY * scale);

      context.drawImage(image, 0, sourceY, image.width, drawHeight, 0, targetY, image.width, drawHeight);
    });

    for (const capture of fixedOverlayCaptures) {
      // 按锚点滚动到对应位置，再进行一次覆盖采样。
      // eslint-disable-next-line no-await-in-loop
      await element.executeJavaScript(createPageScrollScript(capture.scrollTop));
      // eslint-disable-next-line no-await-in-loop
      await element.executeJavaScript(createFixedElementVisibilityScript(true));
      // eslint-disable-next-line no-await-in-loop
      const capturedImage = await element.capturePage();
      const pngBytes = toArrayBuffer(capturedImage.toPNG());
      // eslint-disable-next-line no-await-in-loop
      const image = await loadPngImage(pngBytes);

      drawFixedElementOverlays(context, image, capture.overlays, scale);
    }

    pngBuffer = await exportCanvasAsPng(canvas);
  } finally {
    await element.executeJavaScript(createFixedElementCaptureCleanupScript()).catch(console.error);
    await element.executeJavaScript(createPageScrollScript(metrics.scrollTop)).catch(console.error);
  }

  if (!pngBuffer) {
    throw new Error('导出完整页面截图失败');
  }

  return pngBuffer;
}

/**
 * 创建 WebView 截图控制器。
 * @param options - Hook 依赖
 * @returns 截图方法
 */
export function useScreenshot(options: UseScreenshotOptions): {
  captureViewportScreenshot: () => Promise<void>;
  captureFullPageScreenshot: () => Promise<void>;
} {
  /**
   * 截取当前视图并保存为 PNG。
   */
  async function captureViewportScreenshot(): Promise<void> {
    try {
      const element = getReadyWebviewElement(options.webviewElementRef);
      const image = await element.capturePage();
      const savedPath = await saveScreenshot(options.webviewState, toArrayBuffer(image.toPNG()), 'viewport');

      if (savedPath) {
        message.success('当前视图截图已保存');
      }
    } catch (error: unknown) {
      message.error(error instanceof Error ? error.message : '截取当前视图失败');
    }
  }

  /**
   * 截取完整页面长图并保存为 PNG。
   */
  async function captureFullPageScreenshot(): Promise<void> {
    try {
      const element = getReadyWebviewElement(options.webviewElementRef);
      const pngBuffer = await captureFullPagePng(element);
      const savedPath = await saveScreenshot(options.webviewState, pngBuffer, 'full-page');

      if (savedPath) {
        message.success('完整页面截图已保存');
      }
    } catch (error: unknown) {
      message.error(error instanceof Error ? error.message : '截取完整页面失败');
    }
  }

  return {
    captureViewportScreenshot,
    captureFullPageScreenshot
  };
}
