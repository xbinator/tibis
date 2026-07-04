/**
 * @file widgetExecuteMethod.ts
 * @description BWidget JS 脚本配置默认值与标准化工具。
 */
import type { WidgetExecuteMethod } from '../types';
import { isBoolean, isPlainObject, isString } from 'lodash-es';

/** Widget JS 脚本默认代码。 */
export const WIDGET_INTERACTION_SCRIPT_DEFAULT_CODE = [
  '// Widget 会为生命周期和 methods 注入 this 上下文，无需自行创建。',
  '// 在这里可以读取 this.$input，并通过 this.message 这类 data 字段读写数据。',
  '// 需要请求数据时，可以使用 this.$http；request 超时和队列由系统统一控制。',
  '// 当需要向聊天上行消息时，通过 this.$sendMessage 上行一条聊天消息，并结束当前小组件运行态。',
  '// 如果交互代码没有调用 this.$sendMessage，小组件会在脚本执行完成后结束运行态但不发送消息。',
  '',
  'Widget({',
  '  data: {',
  '    // 可以在 data 中定义自定义字段，用于存储状态',
  '  },',
  '',
  '  async mounted() {',
  '    // 小组件创建或展示时执行，可以直接读写 data 和 methods 中的字段',
  '  },',
  '',
  '  async unmounted() {',
  '    // 小组件运行完成后执行一次',
  '  },',
  '',
  '  methods: {',
  '    // 可以在 methods 中定义自定义方法，用于处理用户操作',
  '  }',
  '})',
  ''
].join('\n');

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
 * @returns 默认 JS 脚本配置
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
 * @returns 标准 JS 脚本配置
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
