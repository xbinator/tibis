/**
 * @file widgetExecuteMethod.ts
 * @description Widget JS 脚本配置标准化工具。
 */
import { isBoolean, isPlainObject, isString } from 'lodash-es';
import type { WidgetExecuteMethod } from '@/components/BWidget/types';
import { WIDGET_INTERACTION_SCRIPT_DEFAULT_CODE } from '../constants/pageSetter';

/**
 * 判断值是否为普通对象记录。
 * @param value - 待判断值
 * @returns 是否为普通对象记录
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return isPlainObject(value);
}

/**
 * 创建默认 Widget JS 脚本配置。
 * @returns 默认JS 脚本配置
 */
export function createDefaultWidgetExecuteMethod(): WidgetExecuteMethod {
  return {
    enabled: true,
    description: '',
    code: WIDGET_INTERACTION_SCRIPT_DEFAULT_CODE
  };
}

/**
 * 从未知值读取 Widget JS 脚本配置。
 * @param value - 原始配置值
 * @returns 标准JS 脚本配置
 */
export function readWidgetExecuteMethod(value: unknown): WidgetExecuteMethod {
  if (!isRecord(value)) {
    return createDefaultWidgetExecuteMethod();
  }

  return {
    enabled: isBoolean(value.enabled) ? value.enabled : true,
    description: isString(value.description) ? value.description : '',
    code: isString(value.code) ? value.code : WIDGET_INTERACTION_SCRIPT_DEFAULT_CODE
  };
}

/**
 * 基于原始配置创建写入指定代码后的JS 脚本配置。
 * @param value - 原始配置值
 * @param code - 最新脚本代码
 * @returns 写入代码后的标准JS 脚本配置
 */
export function createWidgetExecuteMethodWithCode(value: unknown, code: string): WidgetExecuteMethod {
  return {
    ...readWidgetExecuteMethod(value),
    code
  };
}
