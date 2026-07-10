/**
 * @file widgetDataValidation.ts
 * @description WidgetData 严格结构校验器，不执行默认值填充或元素归一化。
 */
import { isPlainObject } from 'lodash-es';
import { getWidgetElementSchema } from '../elements';

/** WidgetData 校验路径片段。 */
export type WidgetDataValidationPathSegment = string | number;

/**
 * WidgetData 校验失败结果。
 */
export interface WidgetDataValidationFailure {
  /** 校验是否成功 */
  valid: false;
  /** 首个非法值路径 */
  path: WidgetDataValidationPathSegment[];
  /** 失败原因 */
  message: string;
}

/** WidgetData 校验结果。 */
export type WidgetDataValidationResult = { valid: true } | WidgetDataValidationFailure;

/** WidgetData 必需且唯一的顶层字段。 */
export const WIDGET_DATA_ROOT_KEYS: readonly string[] = ['name', 'description', 'inputSchema', 'outputSchema', 'dataSchema', 'execute', 'metadata', 'elements'];

/** Widget execute 支持的字段。 */
const WIDGET_EXECUTE_KEYS: readonly string[] = ['enabled', 'description', 'code'];

/** Widget 元素必需字段。 */
const WIDGET_ELEMENT_REQUIRED_KEYS = ['id', 'name', 'label', 'icon', 'title', 'position', 'size', 'rotation', 'style', 'loop', 'metadata'] as const;

/** Widget 元素支持的全部字段。 */
const WIDGET_ELEMENT_KEYS: readonly string[] = [...WIDGET_ELEMENT_REQUIRED_KEYS, 'locked', 'children'];

/** Widget schema 字段支持的类型。 */
const WIDGET_SCHEMA_TYPES: readonly string[] = ['string', 'number', 'boolean', 'object', 'array'];

/** Widget schema property 可选字段。 */
const WIDGET_SCHEMA_PROPERTY_OPTIONAL_KEYS: readonly string[] = ['description', 'properties', 'required', 'items'];

/** Widget 元素样式支持的字段。 */
const WIDGET_STYLE_KEYS: readonly string[] = [
  'backgroundColor',
  'borderColor',
  'borderStyle',
  'borderWidth',
  'borderRadius',
  'padding',
  'color',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'lineHeight',
  'textDecoration',
  'textAlign',
  'textVerticalAlign',
  'opacity'
];

/** Widget 样式枚举字段及其可用值。 */
const WIDGET_STYLE_ENUM_VALUES: Record<string, readonly string[]> = {
  borderStyle: ['none', 'solid', 'dashed', 'dotted'],
  fontStyle: ['normal', 'italic'],
  textDecoration: ['none', 'underline', 'line-through'],
  textAlign: ['left', 'center', 'right', 'justify'],
  textVerticalAlign: ['top', 'middle', 'bottom']
};

/** Widget 样式盒模型字段及其分项字段。 */
const WIDGET_STYLE_BOX_FIELDS = [
  ['borderWidth', ['top', 'right', 'bottom', 'left']],
  ['padding', ['top', 'right', 'bottom', 'left']],
  ['borderRadius', ['topLeft', 'topRight', 'bottomRight', 'bottomLeft']]
] as const;

/**
 * 判断未知值是否为普通对象记录。
 * @param value - 待判断值
 * @returns 是否为普通对象记录
 */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return isPlainObject(value);
}

/**
 * 创建校验失败结果。
 * @param path - 非法值路径
 * @param message - 失败原因
 * @returns 校验失败结果
 */
function createFailure(path: WidgetDataValidationPathSegment[], message: string): WidgetDataValidationFailure {
  return { valid: false, path, message };
}

/**
 * 校验对象字段集合是否与允许列表一致。
 * @param value - 待校验对象
 * @param keys - 允许字段列表
 * @param path - 当前对象路径
 * @returns 首个字段错误，合法时返回 null
 */
function validateExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
  path: WidgetDataValidationPathSegment[]
): WidgetDataValidationFailure | null {
  const missingKey = keys.find((key: string): boolean => !Object.prototype.hasOwnProperty.call(value, key));
  if (missingKey) {
    return createFailure([...path, missingKey], `缺少必需字段：${missingKey}`);
  }

  const unexpectedKey = Object.keys(value).find((key: string): boolean => !keys.includes(key));
  return unexpectedKey ? createFailure([...path, unexpectedKey], `不支持的字段：${unexpectedKey}`) : null;
}

/**
 * 校验对象的必需字段与可选字段集合。
 * @param value - 待校验对象
 * @param requiredKeys - 必需字段
 * @param optionalKeys - 可选字段
 * @param path - 当前对象路径
 * @returns 首个字段错误，合法时返回 null
 */
function validateAllowedKeys(
  value: Record<string, unknown>,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[],
  path: WidgetDataValidationPathSegment[]
): WidgetDataValidationFailure | null {
  const missingKey = requiredKeys.find((key: string): boolean => !Object.prototype.hasOwnProperty.call(value, key));
  if (missingKey) return createFailure([...path, missingKey], `缺少必需字段：${missingKey}`);

  const allowedKeys = [...requiredKeys, ...optionalKeys];
  const unexpectedKey = Object.keys(value).find((key: string): boolean => !allowedKeys.includes(key));
  return unexpectedKey ? createFailure([...path, unexpectedKey], `不支持的字段：${unexpectedKey}`) : null;
}

/**
 * 校验可选字符串数组。
 * @param value - 待校验值
 * @param path - 字段路径
 * @returns 校验结果，合法时返回 null
 */
function validateOptionalStringArray(value: unknown, path: WidgetDataValidationPathSegment[]): WidgetDataValidationFailure | null {
  if (value === undefined) return null;
  return Array.isArray(value) && value.every((item: unknown): boolean => typeof item === 'string') ? null : createFailure(path, '必须是字符串数组');
}

/**
 * 递归校验 Widget schema property。
 * @param value - 待校验值
 * @param path - schema 路径
 * @returns 校验结果，合法时返回 null
 */
function validateSchemaProperty(value: unknown, path: WidgetDataValidationPathSegment[]): WidgetDataValidationFailure | null {
  if (!isPlainRecord(value)) return createFailure(path, 'schema property 必须是普通对象');

  const keyError = validateAllowedKeys(value, ['type'], WIDGET_SCHEMA_PROPERTY_OPTIONAL_KEYS, path);
  if (keyError) return keyError;
  if (typeof value.type !== 'string' || !WIDGET_SCHEMA_TYPES.includes(value.type)) return createFailure([...path, 'type'], '不支持的 schema 类型');
  if (value.description !== undefined && typeof value.description !== 'string') return createFailure([...path, 'description'], '必须是字符串');

  const requiredError = validateOptionalStringArray(value.required, [...path, 'required']);
  if (requiredError) return requiredError;
  if (value.properties !== undefined) {
    if (!isPlainRecord(value.properties)) return createFailure([...path, 'properties'], '必须是普通对象');
    for (const [key, property] of Object.entries(value.properties)) {
      const propertyError = validateSchemaProperty(property, [...path, 'properties', key]);
      if (propertyError) return propertyError;
    }
  }
  if (value.items !== undefined) {
    return validateSchemaProperty(value.items, [...path, 'items']);
  }

  return null;
}

/**
 * 严格校验 Widget 顶层对象 schema。
 * @param value - 待校验值
 * @param path - schema 路径
 * @returns 校验结果，合法时返回 null
 */
function validateSchemaObject(value: unknown, path: WidgetDataValidationPathSegment[]): WidgetDataValidationFailure | null {
  if (!isPlainRecord(value)) return createFailure(path, 'Widget schema 必须是普通对象');

  const keyError = validateAllowedKeys(value, ['type', 'properties'], ['description', 'required'], path);
  if (keyError) return keyError;
  if (value.type !== 'object') return createFailure([...path, 'type'], '顶层 schema 类型必须是 object');
  if (value.description !== undefined && typeof value.description !== 'string') return createFailure([...path, 'description'], '必须是字符串');
  if (!isPlainRecord(value.properties)) return createFailure([...path, 'properties'], '必须是普通对象');

  const requiredError = validateOptionalStringArray(value.required, [...path, 'required']);
  if (requiredError) return requiredError;
  for (const [key, property] of Object.entries(value.properties)) {
    const propertyError = validateSchemaProperty(property, [...path, 'properties', key]);
    if (propertyError) return propertyError;
  }

  return null;
}

/**
 * 校验有限数值字段。
 * @param value - 待校验值
 * @param path - 字段路径
 * @returns 校验结果，合法时返回 null
 */
function validateFiniteNumber(value: unknown, path: WidgetDataValidationPathSegment[]): WidgetDataValidationFailure | null {
  return typeof value === 'number' && Number.isFinite(value) ? null : createFailure(path, '必须是有限数值');
}

/**
 * 校验非负盒模型数值或完整分项对象。
 * @param value - 待校验值
 * @param keys - 分项字段
 * @param path - 字段路径
 * @returns 校验结果，合法时返回 null
 */
function validateBoxValue(value: unknown, keys: readonly string[], path: WidgetDataValidationPathSegment[]): WidgetDataValidationFailure | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 ? null : createFailure(path, '必须是非负有限数值');
  }
  if (!isPlainRecord(value)) return createFailure(path, '必须是非负数值或完整分项对象');

  const keyError = validateExactKeys(value, keys, path);
  if (keyError) return keyError;
  for (const key of keys) {
    if (typeof value[key] !== 'number' || !Number.isFinite(value[key]) || value[key] < 0) {
      return createFailure([...path, key], '必须是非负有限数值');
    }
  }

  return null;
}

/**
 * 严格校验 Widget 元素样式。
 * @param value - 待校验值
 * @param path - 样式路径
 * @returns 校验结果，合法时返回 null
 */
function validateElementStyle(value: unknown, path: WidgetDataValidationPathSegment[]): WidgetDataValidationFailure | null {
  if (!isPlainRecord(value)) return createFailure(path, '样式必须是普通对象');

  const unexpectedKey = Object.keys(value).find((key: string): boolean => !WIDGET_STYLE_KEYS.includes(key));
  if (unexpectedKey) return createFailure([...path, unexpectedKey], `不支持的字段：${unexpectedKey}`);

  for (const key of ['backgroundColor', 'borderColor', 'color'] as const) {
    if (value[key] !== undefined && typeof value[key] !== 'string') return createFailure([...path, key], '必须是字符串');
  }

  for (const [key, options] of Object.entries(WIDGET_STYLE_ENUM_VALUES)) {
    if (value[key] !== undefined && (typeof value[key] !== 'string' || !options.includes(value[key]))) {
      return createFailure([...path, key], '不支持的枚举值');
    }
  }

  for (const key of ['fontSize', 'fontWeight', 'lineHeight'] as const) {
    if (value[key] !== undefined && (typeof value[key] !== 'number' || !Number.isFinite(value[key]) || value[key] < 0)) {
      return createFailure([...path, key], '必须是非负有限数值');
    }
  }
  if (value.opacity !== undefined && (typeof value.opacity !== 'number' || !Number.isFinite(value.opacity) || value.opacity < 0 || value.opacity > 1)) {
    return createFailure([...path, 'opacity'], '必须是 0 到 1 之间的有限数值');
  }

  for (const [key, keys] of WIDGET_STYLE_BOX_FIELDS) {
    if (value[key] === undefined) continue;
    const boxError = validateBoxValue(value[key], keys, [...path, key]);
    if (boxError) return boxError;
  }

  return null;
}

/**
 * 校验 Widget 坐标或尺寸对象。
 * @param value - 待校验值
 * @param keys - 数值字段列表
 * @param path - 对象路径
 * @returns 校验结果，合法时返回 null
 */
function validateNumberRecord(value: unknown, keys: readonly string[], path: WidgetDataValidationPathSegment[]): WidgetDataValidationFailure | null {
  if (!isPlainRecord(value)) {
    return createFailure(path, '必须是普通对象');
  }

  const keyError = validateExactKeys(value, keys, path);
  if (keyError) return keyError;

  for (const key of keys) {
    const numberError = validateFiniteNumber(value[key], [...path, key]);
    if (numberError) return numberError;
  }

  return null;
}

/**
 * 校验 Widget 元素循环配置。
 * @param value - 待校验值
 * @param path - 循环配置路径
 * @returns 校验结果，合法时返回 null
 */
function validateLoop(value: unknown, path: WidgetDataValidationPathSegment[]): WidgetDataValidationFailure | null {
  if (!isPlainRecord(value)) {
    return createFailure(path, '循环配置必须是普通对象');
  }

  const keys = ['enabled', 'source', 'columns', 'columnGap', 'rowGap', 'itemName', 'indexName'] as const;
  const keyError = validateExactKeys(value, keys, path);
  if (keyError) return keyError;
  if (typeof value.enabled !== 'boolean') return createFailure([...path, 'enabled'], '必须是布尔值');
  if (typeof value.source !== 'string') return createFailure([...path, 'source'], '必须是字符串');
  if (typeof value.columns !== 'number' || !Number.isInteger(value.columns) || value.columns <= 0) {
    return createFailure([...path, 'columns'], '必须是正整数');
  }
  if (typeof value.columnGap !== 'number' || !Number.isFinite(value.columnGap) || value.columnGap < 0) {
    return createFailure([...path, 'columnGap'], '必须是非负有限数值');
  }
  if (typeof value.rowGap !== 'number' || !Number.isFinite(value.rowGap) || value.rowGap < 0) {
    return createFailure([...path, 'rowGap'], '必须是非负有限数值');
  }
  if (typeof value.itemName !== 'string') return createFailure([...path, 'itemName'], '必须是字符串');
  if (typeof value.indexName !== 'string') return createFailure([...path, 'indexName'], '必须是字符串');

  return null;
}

/**
 * 校验单个 Widget 元素及其子树。
 * @param value - 待校验元素
 * @param path - 元素路径
 * @param elementIds - 已出现的元素 ID
 * @returns 校验结果，合法时返回 null
 */
function validateElement(value: unknown, path: WidgetDataValidationPathSegment[], elementIds: Set<string>): WidgetDataValidationFailure | null {
  if (!isPlainRecord(value)) {
    return createFailure(path, '元素必须是普通对象');
  }

  const missingKey = WIDGET_ELEMENT_REQUIRED_KEYS.find((key: string): boolean => !Object.prototype.hasOwnProperty.call(value, key));
  if (missingKey) return createFailure([...path, missingKey], `缺少必需字段：${missingKey}`);
  const unexpectedKey = Object.keys(value).find((key: string): boolean => !WIDGET_ELEMENT_KEYS.includes(key));
  if (unexpectedKey) return createFailure([...path, unexpectedKey], `不支持的字段：${unexpectedKey}`);

  for (const key of ['id', 'label', 'icon', 'title'] as const) {
    if (typeof value[key] !== 'string') return createFailure([...path, key], '必须是字符串');
  }
  if (typeof value.name !== 'string') return createFailure([...path, 'name'], '必须是字符串');
  if (value.name !== 'group' && !getWidgetElementSchema(value.name)) {
    return createFailure([...path, 'name'], `元素类型未注册：${value.name}`);
  }

  const elementId = value.id as string;
  if (!elementId) return createFailure([...path, 'id'], '元素 ID 不能为空');
  if (elementIds.has(elementId)) return createFailure([...path, 'id'], `元素 ID 重复：${elementId}`);
  elementIds.add(elementId);

  const positionError = validateNumberRecord(value.position, ['x', 'y'], [...path, 'position']);
  if (positionError) return positionError;
  const sizeError = validateNumberRecord(value.size, ['width', 'height'], [...path, 'size']);
  if (sizeError) return sizeError;
  const rotationError = validateFiniteNumber(value.rotation, [...path, 'rotation']);
  if (rotationError) return rotationError;
  const styleError = validateElementStyle(value.style, [...path, 'style']);
  if (styleError) return styleError;
  if (!isPlainRecord(value.metadata)) return createFailure([...path, 'metadata'], '元信息必须是普通对象');
  if (value.locked !== undefined && typeof value.locked !== 'boolean') return createFailure([...path, 'locked'], '必须是布尔值');

  const loopError = validateLoop(value.loop, [...path, 'loop']);
  if (loopError) return loopError;
  if (value.children === undefined) return null;
  if (value.name !== 'group') return createFailure([...path, 'children'], '只有 group 元素可以包含子元素');
  if (!Array.isArray(value.children)) return createFailure([...path, 'children'], '子元素必须是数组');

  for (const [index, child] of value.children.entries()) {
    const childError = validateElement(child, [...path, 'children', index], elementIds);
    if (childError) return childError;
  }

  return null;
}

/**
 * 校验 Widget execute 配置。
 * @param value - 待校验值
 * @returns 校验结果，合法时返回 null
 */
function validateExecute(value: unknown): WidgetDataValidationFailure | null {
  const path = ['execute'];
  if (!isPlainRecord(value)) return createFailure(path, 'execute 必须是普通对象');

  const unexpectedKey = Object.keys(value).find((key: string): boolean => !WIDGET_EXECUTE_KEYS.includes(key));
  if (unexpectedKey) return createFailure([...path, unexpectedKey], `不支持的字段：${unexpectedKey}`);
  if (typeof value.code !== 'string') return createFailure([...path, 'code'], '必须是字符串');
  if (value.enabled !== undefined && typeof value.enabled !== 'boolean') return createFailure([...path, 'enabled'], '必须是布尔值');
  if (value.description !== undefined && typeof value.description !== 'string') return createFailure([...path, 'description'], '必须是字符串');

  return null;
}

/**
 * 严格校验 WidgetData，不修改输入也不填充默认值。
 * @param value - 待校验值
 * @returns 校验结果
 */
export function validateWidgetData(value: unknown): WidgetDataValidationResult {
  if (!isPlainRecord(value)) {
    return createFailure([], 'WidgetData 必须是普通对象');
  }

  const rootKeyError = validateExactKeys(value, WIDGET_DATA_ROOT_KEYS, []);
  if (rootKeyError) return rootKeyError;
  if (typeof value.name !== 'string') return createFailure(['name'], '必须是字符串');
  if (typeof value.description !== 'string') return createFailure(['description'], '必须是字符串');

  for (const key of ['inputSchema', 'outputSchema', 'dataSchema'] as const) {
    const schemaError = validateSchemaObject(value[key], [key]);
    if (schemaError) return schemaError;
  }

  const executeError = validateExecute(value.execute);
  if (executeError) return executeError;
  if (!isPlainRecord(value.metadata)) return createFailure(['metadata'], '元信息必须是普通对象');
  if (!Array.isArray(value.elements)) return createFailure(['elements'], '元素必须是数组');

  const elementIds = new Set<string>();
  for (const [index, element] of value.elements.entries()) {
    const elementError = validateElement(element, ['elements', index], elementIds);
    if (elementError) return elementError;
  }

  return { valid: true };
}
