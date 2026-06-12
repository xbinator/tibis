/**
 * @file types.ts
 * @description BColorPicker 组件类型定义。
 */

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
}
