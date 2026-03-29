/* eslint-disable no-use-before-define */
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
