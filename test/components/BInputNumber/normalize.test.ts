/**
 * @file normalize.test.ts
 * @description 验证 BInputNumber 的 normalizeOutputValue 归一化函数。
 */
import { describe, expect, it } from 'vitest';
import { normalizeOutputValue } from '@@/src/components/BInputNumber/utils/normalize';

describe('normalizeOutputValue', (): void => {
  describe('无归一化配置（defaultValue 和 decimalPrecision 均未设置）', (): void => {
    it('原样返回 number 值', (): void => {
      expect(normalizeOutputValue(42, {})).toBe(42);
    });

    it('原样返回 string 值', (): void => {
      expect(normalizeOutputValue('3.14', {})).toBe('3.14');
    });

    it('将 null 转为 undefined', (): void => {
      expect(normalizeOutputValue(null, {})).toBeUndefined();
    });
  });

  describe('defaultValue 空值兜底', (): void => {
    it('null 时返回 defaultValue', (): void => {
      expect(normalizeOutputValue(null, { defaultValue: 0 })).toBe(0);
    });

    it('undefined 时返回 defaultValue', (): void => {
      expect(normalizeOutputValue(undefined, { defaultValue: 10 })).toBe(10);
    });

    it('空字符串时返回 defaultValue', (): void => {
      expect(normalizeOutputValue('', { defaultValue: 5 })).toBe(5);
    });

    it('NaN 字符串时返回 defaultValue', (): void => {
      expect(normalizeOutputValue('abc', { defaultValue: 0 })).toBe(0);
    });

    it('Infinity 时返回 defaultValue', (): void => {
      expect(normalizeOutputValue(Infinity, { defaultValue: 0 })).toBe(0);
    });

    it('负 Infinity 时返回 defaultValue', (): void => {
      expect(normalizeOutputValue(-Infinity, { defaultValue: 0 })).toBe(0);
    });

    it('正常数值原样返回', (): void => {
      expect(normalizeOutputValue(42, { defaultValue: 0 })).toBe(42);
    });

    it('数值字符串转为数字后返回', (): void => {
      expect(normalizeOutputValue('100', { defaultValue: 0 })).toBe(100);
    });

    it('负数正常返回', (): void => {
      expect(normalizeOutputValue(-5, { defaultValue: 0 })).toBe(-5);
    });

    it('零正常返回（不误判为空值）', (): void => {
      expect(normalizeOutputValue(0, { defaultValue: 99 })).toBe(0);
    });
  });

  describe('decimalPrecision 小数精度', (): void => {
    it('保留两位小数', (): void => {
      expect(normalizeOutputValue(3.14159, { decimalPrecision: 2 })).toBe(3.14);
    });

    it('四舍五入进位', (): void => {
      expect(normalizeOutputValue(3.145, { decimalPrecision: 2 })).toBe(3.15);
    });

    it('零位小数（取整）', (): void => {
      expect(normalizeOutputValue(3.7, { decimalPrecision: 0 })).toBe(4);
    });

    it('整数不受影响', (): void => {
      expect(normalizeOutputValue(42, { decimalPrecision: 2 })).toBe(42);
    });

    it('字符串数值也可以精度化', (): void => {
      expect(normalizeOutputValue('3.14159', { decimalPrecision: 3 })).toBe(3.142);
    });

    it('空值未设置 defaultValue 时原样返回 null', (): void => {
      expect(normalizeOutputValue(null, { decimalPrecision: 2 })).toBeNull();
    });
  });

  describe('defaultValue + decimalPrecision 组合', (): void => {
    it('空值先兜底再精度化', (): void => {
      // null → defaultValue(0) → toFixed(2) → 0
      expect(normalizeOutputValue(null, { defaultValue: 0, decimalPrecision: 2 })).toBe(0);
    });

    it('正常值先精度化', (): void => {
      expect(normalizeOutputValue(3.14159, { defaultValue: 0, decimalPrecision: 2 })).toBe(3.14);
    });

    it('非有限值先兜底', (): void => {
      expect(normalizeOutputValue(Infinity, { defaultValue: 100, decimalPrecision: 2 })).toBe(100);
    });

    it('空字符串先兜底', (): void => {
      expect(normalizeOutputValue('', { defaultValue: 50, decimalPrecision: 0 })).toBe(50);
    });
  });
});
