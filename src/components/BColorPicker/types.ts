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
  /** 输入框占位文本 */
  placeholder?: string;
  /** 是否允许清除 */
  allowClear?: boolean;
  /** 颜色输出格式 */
  format?: ColorFormat;
  /** 是否显示边框 */
  bordered?: boolean;
  /** 是否只读 */
  readonly?: boolean;
  /** 输入框测试 ID */
  inputTestId?: string;
  /** 快捷预设颜色列表 */
  presetColors?: readonly string[];
  /** 下拉菜单位置 */
  placement?: BDropdownProps['placement'];
  /** 对齐方式 */
  align?: BDropdownProps['align'];
}
