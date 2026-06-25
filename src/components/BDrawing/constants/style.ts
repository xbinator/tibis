/**
 * @file style.ts
 * @description BDrawing 颜色和文本样式选项常量。
 */

/**
 * 默认快捷预设颜色。
 */
export const DRAWING_DEFAULT_PRESET_COLORS = ['#1e293b', '#dc2626', '#f97316', '#16a34a', '#2563eb'] as const;

/**
 * 颜色选择器默认弹层位置。
 */
export const DRAWING_COLOR_PICKER_DEFAULT_PLACEMENT = 'rightTop';

/**
 * 颜色选择器默认弹层偏移。
 */
export const DRAWING_COLOR_PICKER_DEFAULT_ALIGN = {
  offset: [20, 0] as [number, number]
} as const;
