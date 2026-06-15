/**
 * @file style.ts
 * @description BDrawing 样式面板、颜色和连接线选项常量。
 */
import type { DrawingConnectorCurveType, DrawingConnectorMarkerType, DrawingTextAlign, DrawingTextVerticalAlign } from '../types';

/**
 * 描边宽度选项。
 */
export interface DrawingStrokeWidthOption {
  /** 宽度 ID */
  id: string;
  /** 宽度名称 */
  label: string;
  /** 实际描边宽度 */
  value: number;
  /** 预览线条高度 */
  previewHeight: number;
}

/**
 * 分段按钮选项。
 */
export interface DrawingSegmentOption<TValue extends string> {
  /** 选项值 */
  value: TValue;
  /** 访问性标签 */
  label: string;
  /** 图标名称 */
  icon: string;
}

/**
 * 字号选项。
 */
export interface DrawingFontSizeOption {
  /** 字号值 */
  value: number;
  /** 访问性标签 */
  label: string;
  /** 预览文字 */
  preview: string;
}

/**
 * 默认填充色。
 */
export const DRAWING_DEFAULT_FILL = 'transparent';

/**
 * 默认边框色。
 */
export const DRAWING_DEFAULT_STROKE = '#64748b';

/**
 * 默认文字颜色。
 */
export const DRAWING_DEFAULT_TEXT_COLOR = '#0f172a';

/**
 * 默认边框宽度。
 */
export const DRAWING_DEFAULT_STROKE_WIDTH = 1.5;

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

/**
 * 描边宽度选项。
 */
export const DRAWING_STROKE_WIDTH_OPTIONS: readonly DrawingStrokeWidthOption[] = [
  { id: 'thin', label: '细描边', value: 1.5, previewHeight: 1 },
  { id: 'medium', label: '中描边', value: 3, previewHeight: 2 },
  { id: 'bold', label: '粗描边', value: 5, previewHeight: 4 }
];

/**
 * 连接线端点标记选项。
 */
export const DRAWING_MARKER_OPTIONS: readonly DrawingSegmentOption<DrawingConnectorMarkerType>[] = [
  { value: 'none', label: '无箭头', icon: 'lucide:minus' },
  { value: 'arrow', label: '箭头', icon: 'lucide:arrow-right' }
];

/**
 * 连接线路径选项。
 */
export const DRAWING_CURVE_OPTIONS: readonly DrawingSegmentOption<DrawingConnectorCurveType>[] = [
  { value: 'straight', label: '直线', icon: 'lucide:minus' },
  { value: 'bezier', label: '贝塞尔曲线', icon: 'lucide:spline' }
];

/**
 * 文本字号选项。
 */
export const DRAWING_FONT_SIZE_OPTIONS: readonly DrawingFontSizeOption[] = [
  { value: 12, label: '小字号', preview: '小' },
  { value: 14, label: '中字号', preview: '中' },
  { value: 18, label: '大字号', preview: '大' }
];

/**
 * 文本对齐选项。
 */
export const DRAWING_TEXT_ALIGN_OPTIONS: readonly DrawingSegmentOption<DrawingTextAlign>[] = [
  { value: 'left', label: '左对齐', icon: 'lucide:align-left' },
  { value: 'center', label: '居中对齐', icon: 'lucide:align-center' },
  { value: 'right', label: '右对齐', icon: 'lucide:align-right' }
];

/**
 * 文本垂直对齐选项。
 */
export const DRAWING_TEXT_VERTICAL_ALIGN_OPTIONS: readonly DrawingSegmentOption<DrawingTextVerticalAlign>[] = [
  { value: 'top', label: '顶部对齐', icon: 'lucide:align-vertical-justify-start' },
  { value: 'middle', label: '垂直居中', icon: 'lucide:align-vertical-justify-center' },
  { value: 'bottom', label: '底部对齐', icon: 'lucide:align-vertical-justify-end' }
];
