/**
 * @file widgetExecuteMethod.ts
 * @description BWidget JS 脚本配置默认值与标准化工具。
 */
import type { WidgetExecuteMethod } from '../types';
import { camelCase, isBoolean, isPlainObject, isString, upperFirst } from 'lodash-es';

/** 默认 Widget 脚本类名。 */
const DEFAULT_WIDGET_SCRIPT_CLASS_NAME = 'Component';

/** Widget 脚本类名匹配表达式。 */
const WIDGET_SCRIPT_CLASS_NAME_PATTERN = /^[A-Z_$][0-9A-Za-z_$]*$/;

/**
 * 判断类名是否可用于默认导出 Widget 类。
 * @param className - 待检查类名
 * @returns 类名是否可用
 */
function isWidgetScriptClassName(className: string): boolean {
  return className !== 'Widget' && WIDGET_SCRIPT_CLASS_NAME_PATTERN.test(className);
}

/**
 * 根据小组件标识符生成默认脚本类名。
 * @param widgetId - 小组件标识符
 * @returns 默认脚本类名
 */
function createWidgetScriptClassName(widgetId: string | undefined): string {
  const className = upperFirst(camelCase(widgetId ?? ''));

  return isWidgetScriptClassName(className) ? className : DEFAULT_WIDGET_SCRIPT_CLASS_NAME;
}

/**
 * 创建 Widget JS 脚本默认代码。
 * @param widgetId - 小组件标识符
 * @returns 默认脚本代码
 */
function createWidgetInteractionScriptDefaultCode(widgetId?: string): string {
  const className = createWidgetScriptClassName(widgetId);

  return [
    `export default class ${className} extends Widget {`,
    "  message = '';",
    '',
    '  mounted() {',
    "    this.message = '';",
    '  }',
    '',
    '  confirm() {',
    '    this.$sendMessage(this.message);',
    '  }',
    '}',
    ''
  ].join('\n');
}

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
 * @param widgetId - 小组件标识符
 * @returns 默认 JS 脚本配置
 */
export function createDefaultWidgetExecuteMethod(widgetId?: string): WidgetExecuteMethod {
  return {
    enabled: true,
    description: '',
    code: createWidgetInteractionScriptDefaultCode(widgetId)
  };
}

/**
 * 判断脚本配置是否是指定小组件标识生成的默认配置。
 * @param value - 待判断脚本配置
 * @param widgetId - 小组件标识符
 * @returns 是否为指定标识的默认脚本配置
 */
export function isDefaultWidgetExecuteMethod(value: WidgetExecuteMethod | undefined, widgetId?: string): boolean {
  const defaultExecute = createDefaultWidgetExecuteMethod(widgetId);

  return Boolean(value && value.enabled === defaultExecute.enabled && value.description === defaultExecute.description && value.code === defaultExecute.code);
}

/**
 * 从未知值读取 Widget JS 脚本配置。
 * @param value - 原始配置值
 * @returns 标准 JS 脚本配置
 */
export function readWidgetExecuteMethod(value: unknown): WidgetExecuteMethod {
  if (!isRecord(value)) {
    return createDefaultWidgetExecuteMethod();
  }

  return {
    enabled: isBoolean(value.enabled) ? value.enabled : true,
    description: isString(value.description) ? value.description : '',
    code: isString(value.code) ? value.code : createDefaultWidgetExecuteMethod().code
  };
}
