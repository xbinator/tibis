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
}
