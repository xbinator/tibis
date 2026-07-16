/**
 * @file final-text.mts
 * @description 强制最终回答阶段的内部工具协议泄漏防护。
 */

/** 内部工具协议的稳定起始标记。 */
const TOOL_PROTOCOL_PATTERN = /<(?:tool_calls?|tool_sep|arg_key|arg_value)(?::|>)/u;

/** 协议泄漏被拦截后向用户展示的稳定说明。 */
const TOOL_PROTOCOL_BLOCKED_TEXT = '工具循环因重复调用已停止，模型未能生成有效的最终回答。';

/**
 * 清理强制最终回答中的内部工具协议文本。
 * @param text - 强制最终调用产生的完整文本
 * @returns 不含内部工具协议的用户可见文本
 */
export function sanitizeFinalText(text: string): string {
  const protocolMatch = TOOL_PROTOCOL_PATTERN.exec(text);
  if (!protocolMatch || protocolMatch.index === undefined) return text;

  const visiblePrefix = text.slice(0, protocolMatch.index).trimEnd();
  return visiblePrefix ? `${visiblePrefix}\n\n${TOOL_PROTOCOL_BLOCKED_TEXT}` : TOOL_PROTOCOL_BLOCKED_TEXT;
}
