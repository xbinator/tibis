/**
 * @file tokenEstimator.ts
 * @description 跨进程共享的 AI 上下文 Token 启发式估算工具。
 */
import type { ModelMessage } from 'ai';

/** ASCII 字符 token 权重。 */
const ASCII_TOKEN_WEIGHT = 0.3;
/** CJK 字符 token 权重。 */
const CJK_TOKEN_WEIGHT = 0.6;
/** 其他 Unicode 字符 token 权重。 */
const OTHER_TOKEN_WEIGHT = 0.5;

/**
 * 判断字符码点是否属于常见 CJK 范围。
 * @param codePoint - Unicode code point
 * @returns 是否为 CJK 字符
 */
function isCjkCodePoint(codePoint: number): boolean {
  return (
    (codePoint >= 0x3400 && codePoint <= 0x4dbf) ||
    (codePoint >= 0x4e00 && codePoint <= 0x9fff) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0x3040 && codePoint <= 0x30ff) ||
    (codePoint >= 0xac00 && codePoint <= 0xd7af)
  );
}

/**
 * 获取单个字符的 token 权重。
 * @param char - 单个 Unicode 字符
 * @returns token 权重
 */
function getCharacterTokenWeight(char: string): number {
  const codePoint = char.codePointAt(0);
  if (codePoint === undefined) return 0;
  if (codePoint <= 0x7f) return ASCII_TOKEN_WEIGHT;
  if (isCjkCodePoint(codePoint)) return CJK_TOKEN_WEIGHT;
  return OTHER_TOKEN_WEIGHT;
}

/**
 * 使用中英字符权重估算文本 token 数。
 * @param text - 待估算文本
 * @returns 估算 token 数
 */
export function estimateTextTokens(text: string): number {
  if (!text) return 0;

  let estimatedTokens = 0;
  for (const char of text) {
    estimatedTokens += getCharacterTokenWeight(char);
  }

  return Math.ceil(estimatedTokens);
}

/**
 * 估算可序列化值的 token 数。
 * @param value - 待序列化值
 * @returns 估算 token 数
 */
function estimateSerializableValueTokens(value: unknown): number {
  try {
    return estimateTextTokens(JSON.stringify(value));
  } catch {
    return 0;
  }
}

/**
 * 估算单个模型消息 content 的 token 数。
 * @param content - AI SDK 模型消息内容
 * @returns 估算 token 数
 */
function estimateModelMessageContentTokens(content: unknown): number {
  if (typeof content === 'string') {
    return estimateTextTokens(content);
  }

  if (Array.isArray(content)) {
    return content.reduce((total: number, part: unknown): number => {
      if (typeof part === 'string') return total + estimateTextTokens(part);
      if (part && typeof part === 'object') return total + estimateSerializableValueTokens(part);
      return total;
    }, 0);
  }

  return 0;
}

/**
 * 估算 AI SDK ModelMessage 列表的 token 数。
 * @param messages - 即将发送给模型的消息列表
 * @returns 估算 token 数
 */
export function estimateModelMessagesTokens(messages: ModelMessage[]): number {
  return messages.reduce((total: number, message: ModelMessage): number => total + estimateModelMessageContentTokens(message.content), 0);
}
