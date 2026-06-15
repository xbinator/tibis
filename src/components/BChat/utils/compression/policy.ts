/**
 * @file policy.ts
 * @description 压缩策略判断：上下文字符体积估算、双阈值触发判断。
 */
import type { CompressionPolicyResult, ContextBudgetSnapshot, TriggerReason } from './types';
import type { ModelMessage } from 'ai';
import { sumBy } from 'lodash-es';
import type { Message } from '@/components/BChat/utils/types';
import { computeUsableInputTokens } from '../contextUsageBudget';
import { COMPRESSION_CHAR_THRESHOLD, COMPRESSION_ROUND_THRESHOLD } from './constant';

/** 自动压缩触发——上下文体积阈值（token 数），优先按模型上下文窗口动态计算 */
export const COMPRESSION_TOKEN_THRESHOLD = 8_000;

/**
 * 按模型可用输入预算动态计算压缩阈值。
 * @param contextWindow - 模型上下文窗口大小
 * @returns 用于触发压缩的 token 阈值
 */
export function computeCompressionTokenThreshold(contextWindow: number): number {
  if (contextWindow <= 0) {
    return COMPRESSION_TOKEN_THRESHOLD;
  }

  return Math.max(1, Math.floor(computeUsableInputTokens(contextWindow) * 0.65));
}

/**
 * 判断发送前是否应该自动压缩当前上下文。
 * 自动触发只看当前 token 用量，避免历史轮数在压缩后仍持续触发。
 * @param usedTokens - 当前上下文已使用 token 数
 * @param contextWindow - 模型上下文窗口大小
 * @returns 是否应触发自动压缩
 */
export function shouldAutoCompactByContextUsage(usedTokens: number, contextWindow: number): boolean {
  return usedTokens >= computeCompressionTokenThreshold(contextWindow);
}

/**
 * 估算单条 ModelMessage 的字符数。
 */
function estimateMessageCharCount(msg: ModelMessage): number {
  if (typeof msg.content === 'string') {
    return msg.content.length;
  }
  if (Array.isArray(msg.content)) {
    let count = 0;
    for (const part of msg.content) {
      if (part && typeof part === 'object') {
        count += JSON.stringify(part).length;
      }
    }
    return count;
  }
  return 0;
}

/**
 * 估算 ModelMessage[] 的字符体积。
 * 遍历所有消息的 content，将其序列化为字符串后累加字符数。
 * @param modelMessages - 模型消息列表
 * @returns 总字符数
 */
export function estimateContextSize(modelMessages: ModelMessage[]): number {
  return sumBy(modelMessages, estimateMessageCharCount);
}

/**
 * 计算会话中有效的消息轮数。
 * 一轮定义为一条 user 消息 + 一条 assistant 消息。
 * @param messages - 全量消息列表
 * @returns 消息轮数
 */
export function countMessageRounds(messages: Message[]): number {
  const userAndAssistant = messages.filter((m) => m.role === 'user' || m.role === 'assistant');
  // 每对 user+assistant 算一轮
  return Math.ceil(userAndAssistant.length / 2);
}

/**
 * 基于 ContextBudgetSnapshot 判断是否应该触发压缩。
 * @param snapshot - 上下文预算快照
 * @returns 压缩策略判断结果
 */
export function evaluateFromSnapshot(snapshot: ContextBudgetSnapshot): CompressionPolicyResult {
  const roundExceeded = snapshot.roundCount >= COMPRESSION_ROUND_THRESHOLD;
  const tokenThreshold = snapshot.tokenThreshold ?? COMPRESSION_TOKEN_THRESHOLD;

  // 优先使用 token 阈值（如果可用），否则降级到字符阈值
  let charExceeded = false;
  if (snapshot.tokenCount !== undefined) {
    charExceeded = snapshot.tokenCount >= tokenThreshold;
  } else {
    charExceeded = snapshot.charCount >= COMPRESSION_CHAR_THRESHOLD;
  }

  let shouldCompress = false;
  let triggerReason: TriggerReason = 'message_count';

  if (roundExceeded) {
    shouldCompress = true;
    triggerReason = 'message_count';
  } else if (charExceeded) {
    shouldCompress = true;
    triggerReason = 'context_size';
  }

  return {
    shouldCompress,
    triggerReason,
    roundCount: snapshot.roundCount,
    charCount: snapshot.charCount,
    tokenCount: snapshot.tokenCount
  };
}
