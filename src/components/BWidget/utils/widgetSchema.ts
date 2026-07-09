/**
 * @file widgetSchema.ts
 * @description BWidget schema 形状校验工具。
 */
import type { WidgetSchemaObject, WidgetSchemaProperty, WidgetSchemaPropertyType } from '../types';
import { every, includes, isArray, isPlainObject, isString, isUndefined } from 'lodash-es';

/** 可归一化为 WidgetData 对象 schema 的候选值。 */
export type WidgetSchemaObjectCandidate = Record<string, unknown> & {
  /** 顶层 schema 类型 */
  type: 'object';
};

/** Widget schema 字段支持的类型。 */
const WIDGET_SCHEMA_PROPERTY_TYPES: readonly WidgetSchemaPropertyType[] = ['string', 'number', 'boolean', 'object', 'array'];

/**
 * 判断值是否为普通对象字典。
 * @param value - 待判断值
 * @returns 是否为普通对象字典
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return isPlainObject(value);
}

/**
 * 判断值是否为可归一化的 WidgetData 对象 schema 候选值。
 * @param value - 待检查值
 * @returns 是否为对象 schema 候选值
 */
export function isWidgetSchemaObjectCandidate(value: unknown): value is WidgetSchemaObjectCandidate {
  return isRecord(value) && value.type === 'object';
}

/**
 * 判断值是否为可选字符串。
 * @param value - 待判断值
 * @returns 是否为字符串或未设置
 */
function isOptionalString(value: unknown): value is string | undefined {
  return isUndefined(value) || isString(value);
}

/**
 * 判断值是否为可用 schema required 列表。
 * @param value - 待判断值
 * @returns 是否为字符串数组或未设置
 */
function isRequiredList(value: unknown): value is string[] | undefined {
  return isUndefined(value) || (isArray(value) && every(value, isString));
}

/**
 * 判断值是否为 Widget schema 字段。
 * @param value - 待判断值
 * @returns 是否为 schema 字段
 */
function isSchemaProperty(value: unknown): value is WidgetSchemaProperty {
  if (!isRecord(value)) {
    return false;
  }

  const { description, items, properties, required, type } = value;
  const isKnownType = includes(WIDGET_SCHEMA_PROPERTY_TYPES, type as WidgetSchemaPropertyType);

  return (
    isKnownType &&
    isOptionalString(description) &&
    isRequiredList(required) &&
    (isUndefined(properties) || (isRecord(properties) && every(Object.values(properties), isSchemaProperty))) &&
    (isUndefined(items) || isSchemaProperty(items))
  );
}

/**
 * 判断值是否为 Widget schema 属性集合。
 * @param value - 待判断值
 * @returns 是否为 schema 属性集合
 */
function isSchemaProperties(value: unknown): value is Record<string, WidgetSchemaProperty> {
  return isRecord(value) && every(Object.values(value), isSchemaProperty);
}

/**
 * 判断值是否为可保存的 Widget 对象 schema。
 * @param value - 待判断值
 * @returns 是否为可保存的对象 schema
 */
export function isWidgetSchemaObject(value: unknown): value is WidgetSchemaObject {
  if (!isWidgetSchemaObjectCandidate(value)) {
    return false;
  }

  const { description, properties, required } = value;

  return isOptionalString(description) && isSchemaProperties(properties) && isRequiredList(required);
}
