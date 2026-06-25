/**
 * @file useDrawingViewport.ts
 * @description BDrawing 视口缩放和平移状态管理。
 */
import type { DrawingPoint, DrawingSize } from '../types';
import type { UseDrawingBoardReturn } from './useDrawingBoard';
import { DRAWING_MAX_ZOOM, DRAWING_MIN_ZOOM, DRAWING_ZOOM_STEP } from '../constants/viewport';
import { clientDeltaToDrawingDelta, getDrawingResponsiveViewBoxSize } from '../utils/drawingGeometry';

/**
 * 缩放锚点信息。
 */
interface DrawingZoomAnchor {
  /** 鼠标当前指向的画板坐标 */
  boardPoint: DrawingPoint;
  /** 鼠标在画布渲染区域中的比例坐标 */
  viewportRatio: DrawingPoint;
  /** 鼠标所在画布的渲染尺寸 */
  viewportSize: DrawingSize;
}

/**
 * BDrawing 视口 hook 返回值。
 */
interface UseDrawingViewportReturn {
  /** 设置视口中心 */
  setCenter: (center: DrawingPoint) => void;
  /** 按浏览器像素位移平移视口 */
  panByClientDelta: (delta: DrawingPoint, viewportSize: DrawingSize) => void;
  /** 放大 */
  zoomIn: () => void;
  /** 缩小 */
  zoomOut: () => void;
  /** 围绕指定锚点放大 */
  zoomInAt: (anchor: DrawingZoomAnchor) => void;
  /** 围绕指定锚点缩小 */
  zoomOutAt: (anchor: DrawingZoomAnchor) => void;
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
  return Math.min(DRAWING_MAX_ZOOM, Math.max(DRAWING_MIN_ZOOM, Number(nextZoom.toFixed(2))));
}

/**
 * 根据锚点计算缩放后的视口中心。
 * @param anchor - 缩放锚点
 * @param zoom - 目标缩放比例
 * @returns 新视口中心
 */
function getAnchoredCenter(anchor: DrawingZoomAnchor, zoom: number): DrawingPoint {
  const viewBoxSize = getDrawingResponsiveViewBoxSize(zoom, anchor.viewportSize);

  return {
    x: anchor.boardPoint.x + viewBoxSize.width / 2 - anchor.viewportRatio.x * viewBoxSize.width,
    y: anchor.boardPoint.y + viewBoxSize.height / 2 - anchor.viewportRatio.y * viewBoxSize.height
  };
}

/**
 * 创建视口 hook。
 * @param board - 画板 hook
 * @returns 视口操作
 */
export function useDrawingViewport(board: UseDrawingBoardReturn): UseDrawingViewportReturn {
  /**
   * 设置缩放比例。
   * @param nextZoom - 新缩放比例
   * @param anchor - 可选缩放锚点
   */
  function setZoom(nextZoom: number, anchor?: DrawingZoomAnchor): void {
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
  function setCenter(center: DrawingPoint): void {
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
   * @param viewportSize - 画布渲染尺寸
   */
  function panByClientDelta(delta: DrawingPoint, viewportSize: DrawingSize): void {
    const currentViewport = board.state.value.viewport;
    const boardDelta = clientDeltaToDrawingDelta(delta, viewportSize, currentViewport.zoom);
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
    zoomIn: (): void => setZoom(board.state.value.viewport.zoom + DRAWING_ZOOM_STEP),
    zoomOut: (): void => setZoom(board.state.value.viewport.zoom - DRAWING_ZOOM_STEP),
    zoomInAt: (anchor: DrawingZoomAnchor): void => setZoom(board.state.value.viewport.zoom + DRAWING_ZOOM_STEP, anchor),
    zoomOutAt: (anchor: DrawingZoomAnchor): void => setZoom(board.state.value.viewport.zoom - DRAWING_ZOOM_STEP, anchor),
    resetZoom: (): void => setZoom(1),
    setZoom
  };
}
