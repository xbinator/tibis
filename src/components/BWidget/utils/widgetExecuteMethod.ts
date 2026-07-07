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
 * 创建 Widget 默认脚本代码。
 * @param widgetId - 小组件标识符
 * @returns 默认脚本代码
 */
function createWidgetScriptDefaultCode(widgetId?: string): string {
  const className = createWidgetScriptClassName(widgetId);

  return [
    `export default class ${className} extends Widget {`,
    '  /**',
    '   * 可直接绑定到元素里的数据字段。',
    '   * 在模板中使用：{{ message }}。',
    '   */',
    "  message = '';",
    '',
    '  /**',
    '   * 大模型调用 open_widget 时先执行。',
    '   * - this.$input：只读入参，例如 this.$input.city。',
    '   * - return 的值会成为 this.$output。',
    '   */',
    '  async onExecute() {}',
    '',
    '  /**',
    '   * 小组件展示后执行。',
    '   * - this.$output 是 onExecute 的返回值；失败或未返回时为 undefined。',
    '   * - 可以在这里把 this.$output 写入可绑定的数据字段。',
    '   */',
    '  onMounted() {}',
    '',
    '  /**',
    '   * 元素交互方法示例，可在按钮点击等事件中调用。',
    '   * - this.$sendMessage 支持字符串、文本 part 数组或 { content, isError }。',
    '   * - this.$http 支持 get/post/put/patch/delete。',
    '   * - this.$logger.info/warn/error 会写入应用日志；console.* 只进 DevTools。',
    '   */',
    '  confirm() {',
    '    ',
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
    code: createWidgetScriptDefaultCode(widgetId)
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
