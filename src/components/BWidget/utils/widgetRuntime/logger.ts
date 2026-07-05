/**
 * @file widgetRuntime/logger.ts
 * @description BWidget 运行态日志参数序列化工具。
 */

/**
 * 把单个日志参数格式化为单行字符串。
 * - Error 输出 name + message
 * - 对象/数组用 JSON.stringify（循环引用 fallback 到 String）
 * - 其他用 String()
 * @param value - 原始参数
 * @returns 单行字符串
 */
function formatWidgetLogArg(value: unknown): string {
  if (value instanceof Error) {
    return `${value.name}: ${value.message}`;
  }

  if (typeof value === 'object' && value !== null) {
    try {
      return JSON.stringify(value);
    } catch {
      // 循环引用或含 BigInt 时 JSON.stringify 会抛错，退化为 String 兜底。
      return String(value);
    }
  }

  return String(value);
}

/**
 * 把日志参数数组格式化为单行字符串。
 * @param args - 原始参数数组
 * @returns 单行字符串，参数间以空格分隔
 */
export function formatWidgetLogArgs(args: unknown[]): string {
  return args.map(formatWidgetLogArg).join(' ');
}
