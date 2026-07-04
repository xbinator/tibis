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
}

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
  /** 标签鼠标移入时展示的提示文本，传入即启用 tooltip 与 hover 下划线。 */
  tooltip?: string;
}
