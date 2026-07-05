/**
 * @file types.ts
 * @description BSection 区块组件类型定义。
 */
import type { BSectionLabelMinWidth } from './context';

/**
 * BSection Block 组件属性。
 */
export interface BSectionBlockProps {
  /** 区块标题。 */
  title: string;
  /** 是否可折叠。 */
  collapsible?: boolean;
  /** 初始是否折叠（仅 collapsible 时生效）。 */
  defaultCollapsed?: boolean;
  /** 字段行标签最小宽度，数字按 px 处理。 */
  labelMinWidth?: BSectionLabelMinWidth;
  /** 标题鼠标移入时展示的提示文本，传入即启用 tooltip 与 hover 下划线。 */
  tooltip?: string;
  /** 标题右侧问号图标的提示文本，传入即展示 ? icon 并启用鼠标移入提示。 */
  tips?: string;
}

/**
 * BSection Item 标签水平对齐方式。
 */
export type BSectionItemLabelAlign = 'left' | 'center' | 'right';

/**
 * BSection Item 组件属性。
 */
export interface BSectionItemProps {
  /** 标签文字（如 "X"、"名称"）。 */
  label?: string;
  /** 标签图标（如 "lucide:type"），优先级高于 label。 */
  icon?: string;
  /** 图标大小，默认 16。 */
  iconSize?: number;
  /** 标签最小宽度，数字按 px 处理。 */
  labelMinWidth?: BSectionLabelMinWidth;
  /** 布局方向，默认水平。 */
  direction?: 'horizontal' | 'vertical';
  /** 标签鼠标移入时展示的提示文本，传入即启用 ATooltip 与虚线下划线视觉提示。 */
  tooltip?: string;
  /** 标签鼠标移入时展示的提示文本，仅启用 ATooltip，不加虚线下划线视觉提示。 */
  tips?: string;
  /** 标签水平对齐方式，配合 labelMinWidth 在剩余空间内对齐，默认 left。 */
  labelAlign?: BSectionItemLabelAlign;
  /**
   * 默认插槽内容（控件区）的水平对齐方式：
   * - `left`（默认）：保持原行为，控件紧跟在 label 之后。
   * - `right`：控件区贴右排列（horizontal 下用 margin-left:auto，
   *   vertical 下用 align-self:flex-end）。
   */
  contentAlign?: 'left' | 'right';
}
