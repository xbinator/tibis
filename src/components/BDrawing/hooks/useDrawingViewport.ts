/**
 * @file useDrawingViewport.ts
 * @description BDrawing 视口缩放和平移状态管理。
 */
import type { UseDrawingBoardReturn } from './useDrawingBoard';

const MIN_ZOOM = 0.4;
const MAX_ZOOM = 2;
const ZOOM_STEP = 0.1;

/**
 * BDrawing 视口 hook 返回值。
 */
export interface UseDrawingViewportReturn {
  /** 放大 */
  zoomIn: () => void;
  /** 缩小 */
  zoomOut: () => void;
  /** 重置缩放 */
  resetZoom: () => void;
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
   */
  function setZoom(nextZoom: number): void {
    board.state.value = {
      ...board.state.value,
      viewport: {
        ...board.state.value.viewport,
        zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(nextZoom.toFixed(2))))
      }
    };
  }

  return {
    zoomIn: (): void => setZoom(board.state.value.viewport.zoom + ZOOM_STEP),
    zoomOut: (): void => setZoom(board.state.value.viewport.zoom - ZOOM_STEP),
    resetZoom: (): void => setZoom(1)
  };
}
