/**
 * @file types.ts
 * @description BButton 组件公开类型定义。
 */

/**
 * 按钮视觉类型。
 */
export type BButtonType = 'primary' | 'secondary' | 'outline' | 'text' | 'ghost' | 'soft';

/**
 * 按钮尺寸。
 */
export type BButtonSize = 'mini' | 'small' | 'middle' | 'large';

/**
 * Tooltip 弹出位置。
 */
export type BButtonTooltipPlacement =
  | 'top'
  | 'bottom'
  | 'left'
  | 'right'
  | 'topLeft'
  | 'topRight'
  | 'bottomLeft'
  | 'bottomRight'
  | 'leftTop'
  | 'leftBottom'
  | 'rightTop'
  | 'rightBottom';

/**
 * BButton 组件 Props。
 */
export interface BButtonProps {
  /** 按钮类型 */
  type?: BButtonType;
  /** 按钮大小 */
  size?: BButtonSize;
  /** 是否禁用 */
  disabled?: boolean;
  /** 是否加载中 */
  loading?: boolean;
  /** 是否全宽 */
  block?: boolean;
  /** 是否圆角 */
  rounded?: boolean;
  /** 是否方形按钮 */
  square?: boolean;
  /** 图标名称 */
  icon?: string;
  /** 文本文案 */
  text?: string;
  /** 是否使用危险状态样式 */
  danger?: boolean;
  /** 提示信息 */
  tooltip?: string;
  /** 是否显示 Tooltip 箭头 */
  arrow?: boolean;
  /** Tooltip 弹出位置 */
  placement?: BButtonTooltipPlacement;
}
