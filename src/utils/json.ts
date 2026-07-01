/**
 * @file json.ts
 * @description JSON 相关工具函数
 */
import { isPlainObject } from 'lodash-es';

/**
 * JSON 文本转换选项。
 */
interface JsonValueStringifyOptions {
  /** 转换失败或无返回时使用的兜底文本 */
  fallback?: string;
  /** JSON 缩进空格数 */
  space?: number;
}

/**
 * 安全地解析 JSON 字符串，并返回对应的对象
 * 如果解析失败，则返回默认值
 *
 * @param data - 要解析的 JSON 字符串
 * @param defaultValue - 如果解析失败要返回的默认值
 * @returns 如果解析成功则返回解析后的对象，否则返回默认值
 */
export function safeJsonParse<T = null>(data: string, defaultValue: T = null as T): T {
  try {
    return JSON.parse(data) as T;
  } catch {
    return defaultValue;
  }
}

/**
 * 判断值是否为普通对象记录。
 * @param value - 待判断的值
 * @returns 是否为普通对象记录
 */
export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return isPlainObject(value);
}

/**
 * 将值转换为 JSON 文本，失败时返回兜底文本。
 * @param value - 待转换的值
 * @param options - 文本转换选项
 * @returns JSON 文本或兜底文本
 */
export function stringifyJsonValue(value: unknown, options: JsonValueStringifyOptions = {}): string {
  const fallback = options.fallback ?? '';

  try {
    return JSON.stringify(value, null, options.space) ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * 将运行态值转换为可展示的字符串。
 * @param value - 待转换的值
 * @returns 字符串文本，undefined 返回空字符串
 */
export function stringifyRuntimeTextValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (value === undefined) {
    return '';
  }

  return stringifyJsonValue(value, { fallback: String(value) });
}
