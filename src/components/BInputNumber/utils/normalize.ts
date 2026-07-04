/**
 * @file normalize.ts
 * @description BInputNumber 输出值归一化工具函数。
 */
import type { ValueType } from '../types';

/**
 * 归一化配置。
 */
interface NormalizeOptions {
  /**
   * 空值兜底数值。
   * 当输入为 null、undefined、空字符串或非有限值时，返回此值。
   */
  defaultValue?: number;
  /**
   * 输出值小数精度（位数）。
   * 设置后返回值将按 toFixed(decimalPrecision) 四舍五入。
   */
  decimalPrecision?: number;
}

/**
 * 归一化输出值。
 * 1. 当 defaultValue 已设置时，null/undefined/空字符串/非有限值替换为 defaultValue。
 * 2. 当 decimalPrecision 已设置时，对有限数值执行 toFixed 四舍五入。
 * 3. 均未设置时原样返回，保持 AInputNumber 原生行为。
 * @param value - AInputNumber emit 的原始值
 * @param options - 归一化配置
 * @returns 归一化后的值
 */
export function normalizeOutputValue(value: ValueType | null | undefined, options: NormalizeOptions): ValueType {
  // 未配置归一化，直接透传（null 视为 undefined）
  if (options.defaultValue === undefined && options.decimalPrecision === undefined) {
    return (value ?? undefined) as ValueType;
  }

  // 空值或非有限值兜底
  if (value === null || value === undefined || value === '') {
    return options.defaultValue ?? (value as ValueType);
  }

  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return options.defaultValue ?? (value as ValueType);
  }

  // 小数精度四舍五入
  if (options.decimalPrecision !== undefined) {
    return Number(numericValue.toFixed(options.decimalPrecision));
  }

  return numericValue;
}
