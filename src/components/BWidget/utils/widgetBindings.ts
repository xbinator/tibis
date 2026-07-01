/**
 * @file widgetBindings.ts
 * @description BWidget 动态绑定表达式解析工具。
 */
import type { WidgetMetadata } from '../types';
import type { WidgetRenderContext } from 'types/widget';

/** 支持的绑定上下文根名称。 */
export type WidgetBindingContextRoot = 'input' | 'state';

/**
 * 绑定表达式路径。
 */
interface WidgetBindingPath {
  /** 上下文根名称 */
  root: WidgetBindingContextRoot;
  /** 根之后的路径片段 */
  segments: string[];
}

/**
 * 单次绑定表达式解析结果。
 */
interface WidgetBindingEvaluationResult {
  /** 表达式是否成功解析到有效值 */
  resolved: boolean;
  /** 表达式解析结果 */
  value: unknown;
}

/**
 * JSON 序列化替换函数。
 */
type WidgetDisplayJsonReplacer = (this: unknown, key: string, value: unknown) => unknown;

/** 绑定插值匹配表达式。 */
const WIDGET_BINDING_PATTERN = /\{\{\s*([^{}]+?)\s*\}\}/g;
/** 整个字段都是单个绑定插值时的匹配表达式。 */
const WIDGET_WHOLE_BINDING_PATTERN = /^\s*\{\{\s*([^{}]+?)\s*\}\}\s*$/;
/** 绑定路径根名称匹配表达式。 */
const WIDGET_BINDING_ROOT_PATTERN = /^(input|state)/;
/** 点路径标识符匹配表达式。 */
const WIDGET_BINDING_IDENTIFIER_PATTERN = /^[A-Za-z_$][\w$]*$/;
/** 点路径标识符前缀匹配表达式。 */
const WIDGET_BINDING_IDENTIFIER_PREFIX_PATTERN = /^[A-Za-z_$][\w$]*/;
/** 数组下标路径片段匹配表达式。 */
const WIDGET_BINDING_INDEX_PATTERN = /^\[(\d+)\]/;
/** 禁止读取的对象路径片段，避免原型链相关访问。 */
const WIDGET_UNSAFE_PATH_SEGMENTS = new Set<string>(['__proto__', 'prototype', 'constructor']);

/**
 * 判断未知值是否可继续读取路径片段。
 * @param value - 当前路径值
 * @returns 是否可读取属性
 */
function isPathReadable(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

/**
 * 创建表达式求值使用的根作用域。
 * @param context - Widget渲染上下文
 * @returns 绑定表达式根作用域
 */
function createBindingScope(context: WidgetRenderContext): Record<WidgetBindingContextRoot, unknown> {
  return {
    input: context.input,
    state: context.state
  };
}

/**
 * 判断路径片段是否允许读取。
 * @param segment - 路径片段
 * @returns 是否允许读取
 */
export function isWidgetBindingPathSegmentAllowed(segment: string): boolean {
  return !WIDGET_UNSAFE_PATH_SEGMENTS.has(segment);
}

/**
 * 读取转义字符对应的真实字符。
 * @param character - 转义后的字符
 * @returns 真实字符
 */
function readEscapedPathCharacter(character: string): string {
  if (character === 'n') {
    return '\n';
  }

  if (character === 'r') {
    return '\r';
  }

  if (character === 't') {
    return '\t';
  }

  if (character === 'b') {
    return '\b';
  }

  if (character === 'f') {
    return '\f';
  }

  return character;
}

/**
 * 解析括号路径中的字符串字面量。
 * @param expression - 完整表达式
 * @param startIndex - 字符串起始下标
 * @returns 字符串值和下一个下标，解析失败时返回 null
 */
function parseQuotedPathSegment(expression: string, startIndex: number): { nextIndex: number; value: string } | null {
  const quote = expression[startIndex];

  if (quote !== '"' && quote !== "'") {
    return null;
  }

  let index = startIndex + 1;
  let value = '';

  while (index < expression.length) {
    const character = expression[index];

    if (character === '\\') {
      const nextCharacter = expression[index + 1];

      if (nextCharacter === undefined) {
        return null;
      }

      if (nextCharacter === 'u') {
        const hex = expression.slice(index + 2, index + 6);
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
          return null;
        }

        value += String.fromCharCode(Number.parseInt(hex, 16));
        index += 6;
        continue;
      }

      value += readEscapedPathCharacter(nextCharacter);
      index += 2;
      continue;
    }

    if (character === quote) {
      return {
        value,
        nextIndex: index + 1
      };
    }

    value += character;
    index += 1;
  }

  return null;
}

/**
 * 解析括号路径片段。
 * @param expression - 完整表达式
 * @param startIndex - 片段起始下标
 * @returns 路径片段和下一个下标，解析失败时返回 null
 */
function parseBracketPathSegment(expression: string, startIndex: number): { nextIndex: number; value: string } | null {
  const indexMatch = expression.slice(startIndex).match(WIDGET_BINDING_INDEX_PATTERN);

  if (indexMatch) {
    return {
      value: indexMatch[1],
      nextIndex: startIndex + indexMatch[0].length
    };
  }

  const quotedSegment = parseQuotedPathSegment(expression, startIndex + 1);

  if (!quotedSegment || expression[quotedSegment.nextIndex] !== ']') {
    return null;
  }

  return {
    value: quotedSegment.value,
    nextIndex: quotedSegment.nextIndex + 1
  };
}

/**
 * 解析绑定表达式路径。
 * @param expression - 绑定表达式
 * @returns 绑定路径，非法时返回 null
 */
function parseWidgetBindingPath(expression: string): WidgetBindingPath | null {
  const rootMatch = expression.match(WIDGET_BINDING_ROOT_PATTERN);

  if (!rootMatch) {
    return null;
  }

  const root = rootMatch[1] as WidgetBindingContextRoot;
  const segments: string[] = [];
  let index = root.length;

  while (index < expression.length) {
    const character = expression[index];

    if (character === '.') {
      const identifierMatch = expression.slice(index + 1).match(WIDGET_BINDING_IDENTIFIER_PREFIX_PATTERN);
      if (!identifierMatch) {
        return null;
      }

      segments.push(identifierMatch[0]);
      index += identifierMatch[0].length + 1;
      continue;
    }

    if (character === '[') {
      const bracketSegment = parseBracketPathSegment(expression, index);
      if (!bracketSegment) {
        return null;
      }

      segments.push(bracketSegment.value);
      index = bracketSegment.nextIndex;
      continue;
    }

    return null;
  }

  if (segments.some((segment: string): boolean => !isWidgetBindingPathSegmentAllowed(segment))) {
    return null;
  }

  return {
    root,
    segments
  };
}

/**
 * 读取绑定路径对应的值。
 * @param scope - 绑定根作用域
 * @param path - 绑定路径
 * @returns 路径值，无法读取时返回 undefined
 */
function readBindingPathValue(scope: Record<WidgetBindingContextRoot, unknown>, path: WidgetBindingPath): unknown {
  let currentValue = scope[path.root];

  for (const segment of path.segments) {
    if (!isPathReadable(currentValue)) {
      return undefined;
    }

    currentValue = currentValue[segment];
  }

  return currentValue;
}

/**
 * 创建展示值 JSON 序列化替换函数。
 * @returns JSON 序列化替换函数
 */
function createWidgetDisplayJsonReplacer(): WidgetDisplayJsonReplacer {
  const seenObjects = new WeakSet<object>();

  return (_key: string, value: unknown): unknown => {
    if (typeof value === 'bigint') {
      return value.toString();
    }

    if (value !== null && typeof value === 'object') {
      if (seenObjects.has(value)) {
        return '[Circular]';
      }

      seenObjects.add(value);
    }

    return value;
  };
}

/**
 * 将绑定值格式化为展示文本。
 * @param value - 绑定解析值
 * @returns 展示文本
 */
function formatWidgetDisplayTextValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value !== 'object') {
    return String(value);
  }

  return JSON.stringify(value, createWidgetDisplayJsonReplacer(), 2) ?? '';
}

/**
 * 格式化单个绑定路径片段。
 * @param segment - 路径片段
 * @returns 路径片段文本
 */
function formatBindingPathSegment(segment: string): string {
  if (WIDGET_BINDING_IDENTIFIER_PATTERN.test(segment)) {
    return `.${segment}`;
  }

  if (/^\d+$/.test(segment)) {
    return `[${segment}]`;
  }

  return `[${JSON.stringify(segment)}]`;
}

/**
 * 格式化绑定路径。
 * @param root - 上下文根名称
 * @param segments - 路径片段
 * @returns 可插入模板的绑定路径
 */
export function formatWidgetBindingPath(root: WidgetBindingContextRoot, segments: string[] = []): string {
  return segments.reduce((path: string, segment: string): string => `${path}${formatBindingPathSegment(segment)}`, root);
}

/**
 * 解析单个绑定表达式。
 * @param expression - 去掉双花括号后的表达式
 * @param context - Widget渲染上下文
 * @returns 表达式解析结果
 */
export function evaluateWidgetBindingExpression(expression: string, context: WidgetRenderContext): WidgetBindingEvaluationResult {
  const path = parseWidgetBindingPath(expression.trim());

  if (!path) {
    return {
      resolved: false,
      value: undefined
    };
  }

  const value = readBindingPathValue(createBindingScope(context), path);

  return {
    resolved: value !== undefined,
    value
  };
}

/**
 * 解析绑定模板。
 * @param template - 绑定模板文本
 * @param context - Widget渲染上下文
 * @param fallback - 解析失败时使用的静态回退值
 * @returns 解析后的绑定值
 */
export function resolveWidgetBindingTemplate(template: string, context: WidgetRenderContext, fallback: unknown): unknown {
  const wholeMatch = template.match(WIDGET_WHOLE_BINDING_PATTERN);

  if (wholeMatch) {
    const result = evaluateWidgetBindingExpression(wholeMatch[1], context);

    return result.resolved ? result.value : fallback;
  }

  let hasBinding = false;
  let hasUnresolvedBinding = false;
  const resolvedText = template.replace(WIDGET_BINDING_PATTERN, (_matchedText: string, expression: string): string => {
    hasBinding = true;
    const result = evaluateWidgetBindingExpression(expression, context);

    if (!result.resolved) {
      hasUnresolvedBinding = true;
      return '';
    }

    return formatWidgetDisplayTextValue(result.value);
  });

  if (!hasBinding) {
    return template;
  }

  return hasUnresolvedBinding ? fallback : resolvedText;
}

/**
 * 解析字段模板值。
 * @param template - 字段模板文本
 * @param context - Widget渲染上下文
 * @returns 字段模板值
 */
export function resolveWidgetTemplateValue(template: string, context: WidgetRenderContext | undefined): unknown {
  if (!context) {
    return template;
  }

  return resolveWidgetBindingTemplate(template, context, template);
}

/**
 * 解析元素元数据字段为展示文本。
 * @param metadata - 元素元数据
 * @param fieldName - 字段名称
 * @param defaultValue - 字段缺省文本
 * @param context - Widget渲染上下文
 * @returns 字段展示文本
 */
export function resolveWidgetTemplateFieldText(metadata: WidgetMetadata, fieldName: string, context?: WidgetRenderContext): string {
  const fieldValue = metadata[fieldName];
  const template = typeof fieldValue === 'string' ? fieldValue : '';
  const resolvedValue = resolveWidgetTemplateValue(template, context);

  return formatWidgetDisplayTextValue(resolvedValue);
}
