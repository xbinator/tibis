/**
 * @file messagePart.ts
 * @description 聊天消息片段展示辅助函数。
 */
import { isArray, isEmpty, isNil } from 'lodash-es';

/**
 * 判断结构化值是否有可展示内容。
 * @param value - 待判断的值
 * @returns 是否存在可展示内容
 */
export function hasStructuredValueContent(value: unknown): boolean {
  if (isNil(value)) {
    return false;
  }

  if (typeof value === 'string') {
    return value.trim().length > 0;
  }

  if (isArray(value)) {
    return value.length > 0;
  }

  if (typeof value === 'object') {
    return !isEmpty(value);
  }

  return true;
}

/**
 * 将结构化值格式化为稳定的可读文本。
 * @param value - 待格式化的值
 * @returns 可读文本
 */
export function formatStructuredValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  return JSON.stringify(value, null, 2) ?? '';
}
