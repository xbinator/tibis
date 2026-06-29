/**
 * @file style.ts
 * @description BWidget 颜色和文本样式选项常量。
 */
import type { WidgetElementStyle } from '../types';

/**
 * 默认元素样式。
 */
export const WIDGET_DEFAULT_ELEMENT_STYLE: WidgetElementStyle = {
  backgroundColor: '#ffffff',
  borderColor: '#d9d9d9',
  borderRadius: 6,
  borderStyle: 'solid',
  borderWidth: 1,
  color: '#1f2937',
  fontSize: 14,
  fontWeight: 400,
  textAlign: 'center',
  textVerticalAlign: 'middle'
};

/**
 * 默认快捷预设颜色。
 */
export const WIDGET_DEFAULT_PRESET_COLORS = ['#1e293b', '#dc2626', '#f97316', '#16a34a', '#2563eb'] as const;

/**
 * 颜色选择器默认弹层位置。
 */
export const WIDGET_COLOR_PICKER_DEFAULT_PLACEMENT = 'rightTop';
