/**
 * @file viewport.ts
 * @description BWidget 视口尺寸和缩放常量。
 */

/**
 * SVG Widget默认 viewBox 基准尺寸。
 */
export const WIDGET_VIEWBOX_SIZE = {
  width: 1200,
  height: 720
} as const;

/**
 * Widget最小缩放比例。
 */
export const WIDGET_MIN_ZOOM = 0.4;

/**
 * Widget最大缩放比例。
 */
export const WIDGET_MAX_ZOOM = 2;

/**
 * 工具栏、滚轮和小地图单次缩放步长。
 */
export const WIDGET_ZOOM_STEP = 0.1;
