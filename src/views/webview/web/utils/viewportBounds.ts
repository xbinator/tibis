/**
 * @file viewportBounds.ts
 * @description 解析 WebView 设备视口在滚动容器中的可见宿主层范围。
 */

/**
 * WebView 可见宿主层范围。
 */
export interface VisibleWebviewBounds {
  /** 宿主层左上角 x 坐标 */
  x: number;
  /** 宿主层左上角 y 坐标 */
  y: number;
  /** 宿主层可见宽度 */
  width: number;
  /** 宿主层可见高度 */
  height: number;
  /** 原始 WebView 视口宽度 */
  contentWidth: number;
  /** 原始 WebView 视口高度 */
  contentHeight: number;
  /** 可见区域相对原始视口的横向偏移 */
  offsetX: number;
  /** 可见区域相对原始视口的纵向偏移 */
  offsetY: number;
}

/**
 * 用于计算可见范围的矩形。
 */
export interface ViewportRectLike {
  /** 左侧坐标 */
  left: number;
  /** 顶部坐标 */
  top: number;
  /** 右侧坐标 */
  right: number;
  /** 底部坐标 */
  bottom: number;
  /** 宽度 */
  width: number;
  /** 高度 */
  height: number;
}

/**
 * 解析滚动容器内 WebView 视口的可见宿主层范围。
 * @param viewportRect - 设备视口完整矩形
 * @param scrollFrameRect - 滚动容器可见矩形
 * @returns 可见宿主层范围，完全不可见时返回 null
 */
export function resolveVisibleWebviewBounds(viewportRect: ViewportRectLike, scrollFrameRect: ViewportRectLike): VisibleWebviewBounds | null {
  const left = Math.max(viewportRect.left, scrollFrameRect.left);
  const top = Math.max(viewportRect.top, scrollFrameRect.top);
  const right = Math.min(viewportRect.right, scrollFrameRect.right);
  const bottom = Math.min(viewportRect.bottom, scrollFrameRect.bottom);
  const width = right - left;
  const height = bottom - top;

  if (width <= 0 || height <= 0 || viewportRect.width <= 0 || viewportRect.height <= 0) {
    return null;
  }

  return {
    x: left,
    y: top,
    width,
    height,
    contentWidth: viewportRect.width,
    contentHeight: viewportRect.height,
    offsetX: left - viewportRect.left,
    offsetY: top - viewportRect.top
  };
}
