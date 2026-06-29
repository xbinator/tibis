/**
 * @file useWidgetViewport.ts
 * @description BWidget 视口缩放和平移状态管理。
 */
import type { WidgetPoint, WidgetSize } from '../types';
import type { UseWidgetBoardReturn } from './useWidgetBoard';
import { WIDGET_MAX_ZOOM, WIDGET_MIN_ZOOM, WIDGET_ZOOM_STEP } from '../constants/viewport';
import { clientDeltaToWidgetDelta, getWidgetResponsiveViewBoxSize } from '../utils/widgetGeometry';

/**
 * 缩放锚点信息。
 */
interface WidgetZoomAnchor {
  /** 鼠标当前指向的Widget坐标 */
  boardPoint: WidgetPoint;
  /** 鼠标在Widget渲染区域中的比例坐标 */
  viewportRatio: WidgetPoint;
  /** 鼠标所在Widget的渲染尺寸 */
  viewportSize: WidgetSize;
}

/**
 * BWidget 视口 hook 返回值。
 */
interface UseWidgetViewportReturn {
  /** 设置视口中心 */
  setCenter: (center: WidgetPoint) => void;
  /** 按浏览器像素位移平移视口 */
  panByClientDelta: (delta: WidgetPoint, viewportSize: WidgetSize) => void;
  /** 放大 */
  zoomIn: () => void;
  /** 缩小 */
  zoomOut: () => void;
  /** 围绕指定锚点放大 */
  zoomInAt: (anchor: WidgetZoomAnchor) => void;
  /** 围绕指定锚点缩小 */
  zoomOutAt: (anchor: WidgetZoomAnchor) => void;
  /** 重置缩放 */
  resetZoom: () => void;
  /** 设置缩放比例 */
  setZoom: (zoom: number) => void;
}

/**
 * 限制缩放比例范围。
 * @param nextZoom - 待设置缩放比例
 * @returns 归一化后的缩放比例
 */
function clampZoom(nextZoom: number): number {
  return Math.min(WIDGET_MAX_ZOOM, Math.max(WIDGET_MIN_ZOOM, Number(nextZoom.toFixed(2))));
}

/**
 * 根据锚点计算缩放后的视口中心。
 * @param anchor - 缩放锚点
 * @param zoom - 目标缩放比例
 * @returns 新视口中心
 */
function getAnchoredCenter(anchor: WidgetZoomAnchor, zoom: number): WidgetPoint {
  const viewBoxSize = getWidgetResponsiveViewBoxSize(zoom, anchor.viewportSize);

  return {
    x: anchor.boardPoint.x + viewBoxSize.width / 2 - anchor.viewportRatio.x * viewBoxSize.width,
    y: anchor.boardPoint.y + viewBoxSize.height / 2 - anchor.viewportRatio.y * viewBoxSize.height
  };
}

/**
 * 创建视口 hook。
 * @param board - Widget hook
 * @returns 视口操作
 */
export function useWidgetViewport(board: UseWidgetBoardReturn): UseWidgetViewportReturn {
  /**
   * 设置缩放比例。
   * @param nextZoom - 新缩放比例
   * @param anchor - 可选缩放锚点
   */
  function setZoom(nextZoom: number, anchor?: WidgetZoomAnchor): void {
    const currentViewport = board.state.value.viewport;
    const zoom = clampZoom(nextZoom);

    board.state.value = {
      ...board.state.value,
      viewport: {
        ...currentViewport,
        center: anchor && zoom !== currentViewport.zoom ? getAnchoredCenter(anchor, zoom) : currentViewport.center,
        zoom
      }
    };
  }

  /**
   * 设置视口中心点。
   * @param center - 新视口中心点
   */
  function setCenter(center: WidgetPoint): void {
    board.state.value = {
      ...board.state.value,
      viewport: {
        ...board.state.value.viewport,
        center
      }
    };
  }

  /**
   * 按浏览器像素位移平移视口。
   * @param delta - 浏览器像素位移
   * @param viewportSize - Widget渲染尺寸
   */
  function panByClientDelta(delta: WidgetPoint, viewportSize: WidgetSize): void {
    const currentViewport = board.state.value.viewport;
    const boardDelta = clientDeltaToWidgetDelta(delta, viewportSize, currentViewport.zoom);
    if (!boardDelta) {
      return;
    }

    setCenter({
      x: currentViewport.center.x + boardDelta.x,
      y: currentViewport.center.y + boardDelta.y
    });
  }

  return {
    setCenter,
    panByClientDelta,
    zoomIn: (): void => setZoom(board.state.value.viewport.zoom + WIDGET_ZOOM_STEP),
    zoomOut: (): void => setZoom(board.state.value.viewport.zoom - WIDGET_ZOOM_STEP),
    zoomInAt: (anchor: WidgetZoomAnchor): void => setZoom(board.state.value.viewport.zoom + WIDGET_ZOOM_STEP, anchor),
    zoomOutAt: (anchor: WidgetZoomAnchor): void => setZoom(board.state.value.viewport.zoom - WIDGET_ZOOM_STEP, anchor),
    resetZoom: (): void => setZoom(1),
    setZoom
  };
}
