/**
 * @file protocol.ts
 * @description 小组件与聊天、工具层共享的协议归一化工具。
 */
import type { WidgetDisplayPayload, WidgetRuntimeSendMessage, WidgetSendMessageTextPart, WidgetSubmitSuccessResult } from 'types/widget';
import { isArray, mapValues } from 'lodash-es';
import { isPlainRecord, stringifyRuntimeTextValue } from '@/utils/json';

/**
 * 判断值是否为 open_widget 工具返回的小组件展示载荷。
 * @param value - 待判断的值
 * @returns 是否为小组件展示载荷
 */
export function isWidgetDisplayPayload(value: unknown): value is WidgetDisplayPayload {
  return (
    isPlainRecord(value) &&
    value.kind === 'widget_display' &&
    typeof value.sessionId === 'string' &&
    typeof value.widgetId === 'string' &&
    isPlainRecord(value.value) &&
    isPlainRecord(value.renderContext)
  );
}

/**
 * 将小组件原始提交值转为成功结果。
 * @param output - 小组件原始提交值
 * @returns 小组件提交成功结果
 */
export function createWidgetSubmitSuccessResult(output: unknown): WidgetSubmitSuccessResult {
  if (!isPlainRecord(output)) {
    return {
      status: 'success',
      data: { value: stringifyRuntimeTextValue(output) }
    };
  }

  const data = mapValues(output, stringifyRuntimeTextValue);

  return { status: 'success', data };
}

/**
 * 归一化小组件脚本上行文本片段数组。
 * @param value - 原始 content 值
 * @returns 文本片段数组；不匹配时返回 null
 */
export function normalizeWidgetSendMessageTextParts(value: unknown): WidgetSendMessageTextPart[] | null {
  if (!isArray(value)) return null;

  const textParts: WidgetSendMessageTextPart[] = [];
  for (const item of value) {
    if (!isPlainRecord(item) || item.type !== 'text' || typeof item.text !== 'string') return null;
    textParts.push({ type: 'text', text: item.text });
  }

  return textParts;
}

/**
 * 归一化 this.$sendMessage 的调用参数。
 * @param value - 原始调用参数
 * @returns 上行消息；不匹配时返回 null
 */
export function normalizeWidgetSendMessage(value: unknown): WidgetRuntimeSendMessage | null {
  if (typeof value === 'string') {
    return { content: value, isError: false };
  }

  if (!isPlainRecord(value)) return null;

  const rawContent = value.content;
  const content = typeof rawContent === 'string' ? rawContent : normalizeWidgetSendMessageTextParts(rawContent);
  if (content === null) return null;

  return {
    content,
    isError: typeof value.isError === 'boolean' ? value.isError : false
  };
}
