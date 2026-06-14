/**
 * @file viewport.ts
 * @description BDrawing 视口尺寸和缩放常量。
 */

/**
 * SVG 画布默认 viewBox 基准尺寸。
 */
export const DRAWING_VIEWBOX_SIZE = {
  width: 1200,
  height: 720
} as const;

/**
 * 画布最小缩放比例。
 */
export const DRAWING_MIN_ZOOM = 0.4;

/**
 * 画布最大缩放比例。
 */
export const DRAWING_MAX_ZOOM = 2;

/**
 * 工具栏、滚轮和小地图单次缩放步长。
 */
export const DRAWING_ZOOM_STEP = 0.1;
