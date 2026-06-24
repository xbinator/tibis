/**
 * @file elementCapture.ts
 * @description 计算并绘制 WebView 选中元素截图切片。
 */
import type { WebviewElementCaptureRect } from '@/views/webview/web/utils/screenshot';

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
export interface ElementCaptureSegment {
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
export function buildElementCaptureSegments(rect: WebviewElementCaptureRect): ElementCaptureSegment[] {
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
 * 绘制选中元素截图切片。
 * @param context - 目标画布上下文
 * @param image - 当前视口截图
 * @param segment - 截图切片
 * @param scaleX - 横向缩放比例
 * @param scaleY - 纵向缩放比例
 */
export function drawElementCaptureSegment(
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
