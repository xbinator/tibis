/**
 * @file context-estimator.mts
 * @description ChatRuntime 模型消息 token 粗估，复用共享 AI 上下文估算口径。
 */
import type { ModelMessage } from 'ai';
import { estimateModelMessagesTokens, estimateTextTokens as estimateSharedTextTokens } from '../../../../../../shared/ai/context/tokenEstimator.js';

/**
 * 使用固定字符/token 比例估算文本 token 数。
 * @param text - 待估算文本
 * @returns 估算 token 数
 */
export function estimateTextTokens(text: string): number {
  return estimateSharedTextTokens(text);
}

/**
 * 估算 AI SDK ModelMessage 列表的 token 数。
 * @param messages - 即将发送给模型的消息列表
 * @returns 估算 token 数
 */
export function estimateSerializedModelMessages(messages: ModelMessage[]): number {
  return estimateModelMessagesTokens(messages);
}
