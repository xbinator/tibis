/**
 * @file types.ts
 * @description BInputNumber 数字输入组件类型定义。
 */
import type { InputNumberProps } from 'ant-design-vue';

/**
 * AInputNumber 值类型，重新导出以替代从 ant-design-vue 内部路径导入。
 */
export type ValueType = string | number;

/**
 * BInputNumber 组件属性。
 * 继承 AInputNumber 常用 props，默认隐藏增减按钮（controls=false），
 * 支持 defaultValue（空值兜底）和 decimalPrecision（输出小数精度）归一化。
 */
export interface BInputNumberProps {
  /** 当前值，支持 v-model:value 双向绑定。 */
  value?: ValueType;
  /**
   * 空值兜底数值。
   * 当输入为 null、undefined、空字符串或非有限值时，emit 此值而非空值。
   * 设置后 update:value 事件始终 emit number 类型。
   */
  defaultValue?: number;
  /** 占位文本。 */
  placeholder?: string;
  /** 是否禁用。 */
  disabled?: boolean;
  /** 是否显示增减按钮，默认 false（项目绝大多数场景不需要）。 */
  controls?: boolean;
  /** 最小值。 */
  min?: ValueType;
  /** 最大值。 */
  max?: ValueType;
  /** 步长。 */
  step?: ValueType;
  /** 数值精度。 */
  precision?: number;
  /** 输入框大小。 */
  size?: InputNumberProps['size'];
  /** 是否只读。 */
  readonly?: boolean;
  /** 是否自动聚焦。 */
  autofocus?: boolean;
  /** 是否支持键盘操作。 */
  keyboard?: boolean;
  /** 状态，用于表单校验反馈。 */
  status?: '' | 'error' | 'warning';
  /** 是否显示边框。 */
  bordered?: boolean;
  /** 格式化展示函数。 */
  formatter?: InputNumberProps['formatter'];
  /** 解析用户输入的函数。 */
  parser?: InputNumberProps['parser'];
  /** 小数点分隔符。 */
  decimalSeparator?: string;
  /** 是否为字符串模式（大数精度）。 */
  stringMode?: boolean;
  /**
   * 输出值小数精度（位数）。
   * 设置后 emit 的数值将按 toFixed(decimalPrecision) 四舍五入。
   * 与 precision 不同：precision 控制输入框行为，decimalPrecision 控制输出值精度。
   */
  decimalPrecision?: number;
}
