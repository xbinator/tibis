/**
 * @file types.ts
 * @description BSegmented 分段控制组件类型定义。
 */

/**
 * BSegmented 选项值。
 */
export type BSegmentedValue = string | number;

/**
 * BSegmented 单个选项。
 */
export interface BSegmentedOption {
  /** 展示文案。 */
  label: string;
  /** 选项值。 */
  value: BSegmentedValue;
  /** 是否禁用该选项。 */
  disabled?: boolean;
  /** 附加到选项根节点的自定义类名。 */
  className?: string;
  /** 调用方可挂载的扩展数据。 */
  payload?: unknown;
}

/**
 * BSegmented 组件属性。
 */
export interface BSegmentedProps<T extends BSegmentedOption> {
  /** 当前选中值。 */
  value?: BSegmentedValue;
  /** 分段选项列表。 */
  options: T[];
  /** 是否撑满父容器宽度。 */
  block?: boolean;
}
