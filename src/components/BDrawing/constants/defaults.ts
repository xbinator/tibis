/**
 * @file defaults.ts
 * @description BDrawing 默认尺寸和类型配置。
 */

/**
 * 默认节点尺寸。
 */
export const DRAWING_DEFAULT_NODE_SIZE = {
  width: 180,
  height: 72
} as const;

/**
 * SVG 画布默认 viewBox 基准尺寸。
 */
export const DRAWING_VIEWBOX_SIZE = {
  width: 1200,
  height: 720
} as const;

/**
 * 拖拽创建形状时触发自定义尺寸的最小边长。
 */
export const DRAWING_MIN_CREATE_SIZE = 8;

/**
 * Moveable 调整元素尺寸时允许的最小尺寸。
 */
export const DRAWING_MIN_ELEMENT_SIZE = {
  width: 16,
  height: 16
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
 * 工具栏和滚轮单次缩放步长。
 */
export const DRAWING_ZOOM_STEP = 0.1;

/**
 * 文本元素默认文案。
 */
export const DRAWING_DEFAULT_TEXT = '文本';
