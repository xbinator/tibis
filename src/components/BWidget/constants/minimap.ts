/**
 * @file minimap.ts
 * @description BWidget 小地图布局和弹层常量。
 */

/**
 * 小地图在空Widget时的最小覆盖尺寸。
 */
export const WIDGET_MINIMAP_EMPTY_SIZE = 320;

/**
 * 小地图 viewBox 覆盖范围外扩边距。
 */
export const WIDGET_MINIMAP_VIEWBOX_PADDING = 80;

/**
 * 小地图视口矩形拖拽阻尼系数，降低拖拽时的视口移动灵敏度。
 */
export const WIDGET_MINIMAP_VIEWPORT_DRAG_DAMPING = 0.6;

/**
 * 小地图弹框相对触发按钮的偏移。
 */
export const WIDGET_MINIMAP_DROPDOWN_ALIGN = {
  offset: [0, -8] as [number, number]
} as const;
