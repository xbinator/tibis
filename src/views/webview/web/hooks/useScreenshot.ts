/**
 * @file useScreenshot.ts
 * @description 封装 WebView 视图截图与完整页面长截屏能力。
 */
import type { WebviewTag } from 'electron';
import type { Ref } from 'vue';
import { message } from 'ant-design-vue';
import { native } from '@/shared/platform';
import type { WebviewElementSelection, WebviewPageState } from '@/views/webview/shared/types';
import {
  buildFixedElementOverlayCaptures,
  buildPageCaptureSlices,
  createElementCaptureCleanupScript,
  createElementCaptureMetricsScript,
  createElementCaptureObstructionVisibilityScript,
  createElementCaptureRectScript,
  createElementCaptureScrollScript,
  createElementPickerLayerVisibilityScript,
  createFixedElementCaptureCleanupScript,
  createFixedElementCaptureSetupScript,
  createFixedElementVisibilityScript,
  createPageCaptureMetricsScript,
  createPageScrollScript,
  createPngBlob,
  createVisiblePositionedElementSnapshotScript,
  isWebviewElementCaptureMetrics,
  isWebviewElementCaptureRect,
  isWebviewFixedElementSnapshotArray,
  isWebviewPageCaptureMetrics,
  type WebviewElementCaptureRect,
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
  webviewElementRef: Ref<WebviewTag | null>;
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
 * 选中元素某个轴向上的截图切片。
 */
interface ElementCaptureAxisSegment {
  /** 采样前滚动位置 */
  scrollOffset: number;
  /** 当前截图中的源起点 */
  sourceOffset: number;
  /** 最终元素截图中的目标起点 */
  targetOffset: number;
  /** 当前切片长度 */
  length: number;
}

/**
 * 选中元素截图切片。
 */
interface ElementCaptureSegment {
  /** 横向滚动位置 */
  scrollLeft: number;
  /** 纵向滚动位置 */
  scrollTop: number;
  /** 当前视口截图中的横向源起点 */
  sourceX: number;
  /** 当前视口截图中的纵向源起点 */
  sourceY: number;
  /** 最终元素截图中的横向目标起点 */
  targetX: number;
  /** 最终元素截图中的纵向目标起点 */
  targetY: number;
  /** 当前切片宽度 */
  width: number;
  /** 当前切片高度 */
  height: number;
}

/**
 * 获取可执行截图脚本的 `<webview>` 实例。
 * @param webviewElementRef - `<webview>` 元素引用
 * @returns 已就绪的 `<webview>` 实例
 */
function getReadyWebviewElement(webviewElementRef: Ref<WebviewTag | null>): WebviewTag {
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
async function readPageCaptureMetrics(element: WebviewTag): Promise<WebviewPageCaptureMetrics> {
  const metrics = (await element.executeJavaScript(createPageCaptureMetricsScript())) as unknown;

  if (!isWebviewPageCaptureMetrics(metrics)) {
    throw new Error('读取页面尺寸信息失败');
  }

  return metrics;
}

/**
 * 判断选择结果是否包含选择时缓存的页面坐标。
 * @param selection - 当前选中元素
 * @returns 是否包含可用于 fallback 的页面坐标
 */
function hasCachedElementPageRect(
  selection: WebviewElementSelection
): selection is WebviewElementSelection & { rect: WebviewElementSelection['rect'] & { pageX: number; pageY: number } } {
  return (
    typeof selection.rect.pageX === 'number' &&
    Number.isFinite(selection.rect.pageX) &&
    typeof selection.rect.pageY === 'number' &&
    Number.isFinite(selection.rect.pageY)
  );
}

/**
 * 读取元素截图所需的页面指标。
 * @param element - `<webview>` 实例
 * @returns 页面与视口指标
 */
async function readElementCaptureMetrics(element: WebviewTag): Promise<Omit<WebviewElementCaptureRect, 'pageX' | 'pageY' | 'width' | 'height'>> {
  const metrics = (await element.executeJavaScript(createElementCaptureMetricsScript())) as unknown;

  if (!isWebviewElementCaptureMetrics(metrics)) {
    throw new Error('读取页面截图指标失败');
  }

  return metrics;
}

/**
 * 从选择时缓存的页面坐标恢复元素截图区域。
 * @param element - `<webview>` 实例
 * @param selection - 当前选中元素
 * @returns 元素当前可截图区域
 */
async function readCachedElementCaptureRect(element: WebviewTag, selection: WebviewElementSelection): Promise<WebviewElementCaptureRect> {
  if (!hasCachedElementPageRect(selection)) {
    throw new Error('读取选中元素位置失败');
  }

  const metrics = await readElementCaptureMetrics(element);
  return {
    pageX: selection.rect.pageX,
    pageY: selection.rect.pageY,
    width: selection.rect.width,
    height: selection.rect.height,
    ...metrics
  };
}

/**
 * 将元素截图区域裁剪到页面实际可截图边界内。
 * @param rect - 元素完整截图区域
 * @returns 页面实际可采样的元素区域
 */
function clampElementCaptureRect(rect: WebviewElementCaptureRect): WebviewElementCaptureRect {
  if (rect.isViewportAnchored) {
    const visibleLeft = Math.max(0, rect.pageX);
    const visibleTop = Math.max(0, rect.pageY);
    const visibleRight = Math.min(rect.captureViewportWidth, rect.pageX + rect.width);
    const visibleBottom = Math.min(rect.captureViewportHeight, rect.pageY + rect.height);
    const width = Math.max(0, visibleRight - visibleLeft);
    const height = Math.max(0, visibleBottom - visibleTop);

    if (width <= 0 || height <= 0) {
      throw new Error('选中的元素不在当前页面可截图范围内');
    }

    return {
      ...rect,
      pageX: visibleLeft,
      pageY: visibleTop,
      width,
      height
    };
  }

  const maxCapturableX = rect.maxScrollLeft + rect.viewportWidth;
  const maxCapturableY = rect.maxScrollTop + rect.viewportHeight;
  const width = Math.max(0, Math.min(rect.width, maxCapturableX - rect.pageX));
  const height = Math.max(0, Math.min(rect.height, maxCapturableY - rect.pageY));

  if (width <= 0 || height <= 0) {
    throw new Error('选中的元素不在当前页面可截图范围内');
  }

  return {
    ...rect,
    width,
    height
  };
}

/**
 * 按某个轴向构建覆盖元素完整范围的截图切片。
 * @param start - 元素在页面中的轴向起点
 * @param length - 元素轴向长度
 * @param viewportLength - 视口轴向长度
 * @param maxScrollOffset - 页面最大滚动距离
 * @returns 轴向截图切片
 */
function buildElementCaptureAxisSegments(start: number, length: number, viewportLength: number, maxScrollOffset: number): ElementCaptureAxisSegment[] {
  const normalizedStart = Math.max(0, Math.floor(start));
  const normalizedLength = Math.max(1, Math.ceil(length));
  const normalizedViewportLength = Math.max(1, Math.floor(viewportLength));
  const normalizedMaxScrollOffset = Math.max(0, Math.floor(maxScrollOffset));
  const segments: ElementCaptureAxisSegment[] = [];
  let capturedLength = 0;

  while (capturedLength < normalizedLength) {
    const pageOffset = normalizedStart + capturedLength;
    const scrollOffset = Math.min(Math.max(pageOffset, 0), normalizedMaxScrollOffset);
    const sourceOffset = Math.max(0, pageOffset - scrollOffset);
    const availableLength = Math.min(normalizedViewportLength - sourceOffset, normalizedLength - capturedLength);

    if (availableLength <= 0) {
      throw new Error('选中的元素超出当前页面可截图范围');
    }

    segments.push({
      scrollOffset,
      sourceOffset,
      targetOffset: capturedLength,
      length: availableLength
    });
    capturedLength += availableLength;
  }

  return segments;
}

/**
 * 构建选中元素完整截图需要的二维切片。
 * @param rect - 元素可截图区域
 * @returns 二维截图切片
 */
function buildElementCaptureSegments(rect: WebviewElementCaptureRect): ElementCaptureSegment[] {
  if (rect.isViewportAnchored) {
    return [
      {
        scrollLeft: rect.scrollLeft,
        scrollTop: rect.scrollTop,
        sourceX: rect.viewportX + rect.pageX,
        sourceY: rect.viewportY + rect.pageY,
        targetX: 0,
        targetY: 0,
        width: rect.width,
        height: rect.height
      }
    ];
  }

  const xSegments = buildElementCaptureAxisSegments(rect.pageX, rect.width, rect.viewportWidth, rect.maxScrollLeft);
  const ySegments = buildElementCaptureAxisSegments(rect.pageY, rect.height, rect.viewportHeight, rect.maxScrollTop);
  const segments: ElementCaptureSegment[] = [];

  ySegments.forEach((ySegment) => {
    xSegments.forEach((xSegment) => {
      segments.push({
        scrollLeft: xSegment.scrollOffset,
        scrollTop: ySegment.scrollOffset,
        sourceX: rect.viewportX + xSegment.sourceOffset,
        sourceY: rect.viewportY + ySegment.sourceOffset,
        targetX: xSegment.targetOffset,
        targetY: ySegment.targetOffset,
        width: xSegment.length,
        height: ySegment.length
      });
    });
  });

  return segments;
}

/**
 * 读取选中元素当前可截图区域。
 * @param element - `<webview>` 实例
 * @param selection - 当前选中元素
 * @returns 元素当前可截图区域
 */
async function readSelectedElementCaptureRect(element: WebviewTag, selection: WebviewElementSelection): Promise<WebviewElementCaptureRect> {
  const rect = (await element.executeJavaScript(createElementCaptureRectScript(selection.selector))) as unknown;

  if (!isWebviewElementCaptureRect(rect)) {
    return readCachedElementCaptureRect(element, selection);
  }

  if (rect.width <= 0 || rect.height <= 0) {
    throw new Error('选中的元素不在当前视图中');
  }

  return rect;
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
 * 绘制选中元素截图切片。
 * @param context - 目标画布上下文
 * @param image - 当前视口截图
 * @param segment - 截图切片
 * @param scaleX - 横向缩放比例
 * @param scaleY - 纵向缩放比例
 */
function drawElementCaptureSegment(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  segment: ElementCaptureSegment,
  scaleX: number,
  scaleY: number
): void {
  const sourceX = Math.round(segment.sourceX * scaleX);
  const sourceY = Math.round(segment.sourceY * scaleY);
  const width = Math.max(1, Math.round(segment.width * scaleX));
  const height = Math.max(1, Math.round(segment.height * scaleY));
  const targetX = Math.round(segment.targetX * scaleX);
  const targetY = Math.round(segment.targetY * scaleY);

  context.drawImage(image, sourceX, sourceY, width, height, targetX, targetY, width, height);
}

/**
 * 采样并拼接选中元素完整截图。
 * @param element - `<webview>` 实例
 * @param rect - 选中元素完整页面区域
 * @param selector - 当前选中元素选择器
 * @returns 选中元素截图 PNG
 */
async function captureSelectedElementPng(element: WebviewTag, rect: WebviewElementCaptureRect, selector: string): Promise<ArrayBuffer> {
  let captureRect = rect;
  let canvas: HTMLCanvasElement | null = null;
  let context: CanvasRenderingContext2D | null = null;
  let scaleX = 1;
  let scaleY = 1;

  try {
    captureRect = clampElementCaptureRect(rect);
    const segments = buildElementCaptureSegments(captureRect);

    for (const segment of segments) {
      // 选中元素可能跨多个视口，必须按切片顺序滚动、截图、绘制。
      // eslint-disable-next-line no-await-in-loop
      await element.executeJavaScript(createElementCaptureScrollScript(captureRect.scrollTarget, segment.scrollTop, segment.scrollLeft));
      // 隐藏与选中元素无关的 fixed/sticky 遮挡层，避免截到顶部导航等覆盖物。
      // eslint-disable-next-line no-await-in-loop
      await element.executeJavaScript(
        createElementCaptureObstructionVisibilityScript(selector, false, {
          x: segment.sourceX,
          y: segment.sourceY,
          width: segment.width,
          height: segment.height
        })
      );
      // 滚动会触发选择器脚本重新显示选中框，截图前需要再次隐藏。
      // eslint-disable-next-line no-await-in-loop
      await element.executeJavaScript(createElementPickerLayerVisibilityScript(false));
      // eslint-disable-next-line no-await-in-loop
      const capturedImage = await element.capturePage();
      const pngBytes = toArrayBuffer(capturedImage.toPNG());
      // eslint-disable-next-line no-await-in-loop
      const image = await loadPngImage(pngBytes);

      if (!canvas) {
        scaleX = image.width / Math.max(captureRect.captureViewportWidth, 1);
        scaleY = image.height / Math.max(captureRect.captureViewportHeight, 1);
        canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(captureRect.width * scaleX));
        canvas.height = Math.max(1, Math.round(captureRect.height * scaleY));
        context = canvas.getContext('2d');
        if (!context) {
          throw new Error('创建选中元素截图画布失败');
        }
      }

      if (!context) {
        throw new Error('创建选中元素截图画布失败');
      }

      drawElementCaptureSegment(context, image, segment, scaleX, scaleY);
    }
  } finally {
    await element.executeJavaScript(createElementCaptureScrollScript(rect.scrollTarget, rect.scrollTop, rect.scrollLeft)).catch(console.error);
    await element
      .executeJavaScript(
        createElementCaptureObstructionVisibilityScript(selector, true, { x: 0, y: 0, width: rect.captureViewportWidth, height: rect.captureViewportHeight })
      )
      .catch(console.error);
    await element.executeJavaScript(createElementPickerLayerVisibilityScript(true)).catch(console.error);
    await element.executeJavaScript(createElementCaptureCleanupScript(rect.scrollTarget)).catch(console.error);
  }

  if (!canvas) {
    throw new Error('当前页面没有可截取的选中元素');
  }

  return exportCanvasAsPng(canvas);
}

/**
 * 采样并拼接完整页面长截屏。
 * @param element - `<webview>` 实例
 * @returns 拼接后的 PNG 二进制
 */
async function captureFullPagePng(element: WebviewTag): Promise<ArrayBuffer> {
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
  captureSelectedElementScreenshot: (selection: WebviewElementSelection | null) => Promise<void>;
} {
  /**
   * 截取当前视图并复制为剪贴板 PNG。
   */
  async function captureViewportScreenshot(): Promise<void> {
    try {
      const element = getReadyWebviewElement(options.webviewElementRef);
      const image = await element.capturePage();
      await native.copyImageToClipboard(toArrayBuffer(image.toPNG()));

      message.success('截图已保存到剪贴板');
    } catch (error: unknown) {
      message.error(error instanceof Error ? error.message : '截取当前视图失败');
    }
  }

  /**
   * 截取完整页面长图并复制为剪贴板 PNG。
   */
  async function captureFullPageScreenshot(): Promise<void> {
    try {
      const element = getReadyWebviewElement(options.webviewElementRef);
      const pngBuffer = await captureFullPagePng(element);
      await native.copyImageToClipboard(pngBuffer);

      message.success('截图已保存到剪贴板');
    } catch (error: unknown) {
      message.error(error instanceof Error ? error.message : '截取完整页面失败');
    }
  }

  /**
   * 截取当前选中的页面元素并复制为剪贴板 PNG。
   * @param selection - 当前选中的页面元素
   */
  async function captureSelectedElementScreenshot(selection: WebviewElementSelection | null): Promise<void> {
    try {
      if (!selection) {
        throw new Error('请先选择页面元素');
      }

      const element = getReadyWebviewElement(options.webviewElementRef);
      const rect = await readSelectedElementCaptureRect(element, selection);
      const pngBuffer = await captureSelectedElementPng(element, rect, selection.selector);
      await native.copyImageToClipboard(pngBuffer);

      message.success('截图已保存到剪贴板');
    } catch (error: unknown) {
      message.error(error instanceof Error ? error.message : '截取选中元素失败');
    }
  }

  return {
    captureViewportScreenshot,
    captureFullPageScreenshot,
    captureSelectedElementScreenshot
  };
}
