/* eslint-disable no-use-before-define */
import type { DropdownProps } from 'ant-design-vue';

/**
 * BDropdown 组件 Props 类型定义
 */
export interface BDropdownProps {
  /** 是否禁用 */
  disabled?: boolean;
  /** 弹出位置 */
  placement?: 'bottomLeft' | 'bottomRight' | 'topLeft' | 'topRight' | 'rightTop';
  /** 对齐方式 */
  align?: DropdownProps['align'];
  /** 弹出容器 */
  getPopupContainer?: DropdownProps['getPopupContainer'];
}

export interface DropdownOptionItem {
  /** 选项类型 */
  type?: 'item';
  /** 选项唯一值 */
  value: string | number;
  /** 选项展示文案 */
  label: string;
  /** 选项图标标识 */
  icon?: string;
  /** 选项图标尺寸 */
  iconSize?: number;
  /** 选项自定义类名 */
  class?: string;
  /** 是否禁用当前项 */
  disabled?: boolean;
  /** 是否处于选中态（显示勾选图标） */
  checked?: boolean;
  /** 是否使用危险态样式 */
  danger?: boolean;
  /** 选项主题色 */
  color?: 'warn';
  /** 点击事件 */
  onClick?: () => void | Promise<void>;
  /** 子菜单选项 */
  children?: DropdownOption[];
}

export interface DropdownOptionDivider {
  type: 'divider';
}

export type DropdownOption = DropdownOptionItem | DropdownOptionDivider;
