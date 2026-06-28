/**
 * @file types.ts
 * @description BColorPicker 组件类型定义。
 */
import type { BDropdownProps } from '@/components/BDropdown/type';

/** 颜色输出格式 */
export type ColorFormat = 'rgb' | 'hex';

/** BColorPicker 组件属性 */
export interface BColorPickerProps {
  /** 颜色值（v-model 绑定） */
  value?: string;
  /** 默认颜色 */
  defaultValue?: string;
  /** 颜色输出格式 */
  format?: ColorFormat;
  /** 面板宽度，默认取 trigger 元素宽度 */
  width?: number | string;
  /** 下拉菜单位置 */
  placement?: BDropdownProps['placement'];
  /** 对齐方式 */
  align?: BDropdownProps['align'];
  /** 输入框占位提示 */
  placeholder?: string;
  /** 是否允许清空 */
  allowClear?: boolean;
  /** 是否只读 */
  readonly?: boolean;
  /** 是否禁用 */
  disabled?: boolean;
  /** 输入框是否有边框 */
  bordered?: boolean;
}
