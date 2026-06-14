/**
 * @file minimap.ts
 * @description BDrawing 小地图布局和弹层常量。
 */

/**
 * 小地图在空画布时的最小覆盖尺寸。
 */
export const DRAWING_MINIMAP_EMPTY_SIZE = 320;

/**
 * 小地图 viewBox 覆盖范围外扩边距。
 */
export const DRAWING_MINIMAP_VIEWBOX_PADDING = 80;

/**
 * 小地图弹框相对触发按钮的偏移。
 */
export const DRAWING_MINIMAP_DROPDOWN_ALIGN = {
  offset: [0, -8] as [number, number]
} as const;
