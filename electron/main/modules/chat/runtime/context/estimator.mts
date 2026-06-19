/**
 * @file context-estimator.mts
 * @description ChatRuntime 模型消息序列化 token 粗估。
 */
import type { ModelMessage } from 'ai';

/** 序列化文本平均每 token 字符数。 */
const SERIALIZED_CHARS_PER_TOKEN = 4;

/**
 * 使用固定字符/token 比例估算文本 token 数。
 * @param text - 待估算文本
 * @returns 估算 token 数
 */
export function estimateTextTokens(text: string): number {
  if (!text) return 0;

  return Math.ceil(text.length / SERIALIZED_CHARS_PER_TOKEN);
}

/**
 * 估算 AI SDK ModelMessage 列表序列化后的 token 数。
 * @param messages - 即将发送给模型的消息列表
 * @returns 估算 token 数
 */
export function estimateSerializedModelMessages(messages: ModelMessage[]): number {
  if (messages.length === 0) return 0;

  return estimateTextTokens(JSON.stringify(messages));
}
