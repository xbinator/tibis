/**
 * @file types.ts
 * @description BSection 区块组件类型定义。
 */

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
}

/**
 * BSection Item 组件属性。
 */
export interface BSectionItemProps {
  /** 前缀文字（如 "X"、"名称"）。 */
  label?: string;
  /** 前缀图标（如 "lucide:type"），优先级高于 label。 */
  icon?: string;
  /** 图标大小，默认 16。 */
  iconSize?: number;
  /** 前缀最小宽度，数字按 px 处理。 */
  prefixMinWidth?: number | string;
  /** 布局方向，默认水平。 */
  direction?: 'horizontal' | 'vertical';
}
