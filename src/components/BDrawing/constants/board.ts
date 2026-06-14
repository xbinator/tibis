/**
 * @file board.ts
 * @description BDrawing 画板元素创建和几何约束常量。
 */

/**
 * 默认节点尺寸。
 */
export const DRAWING_DEFAULT_NODE_SIZE = {
  width: 180,
  height: 72
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
