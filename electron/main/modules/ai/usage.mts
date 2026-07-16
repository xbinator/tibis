/**
 * @file usage.mts
 * @description AI SDK token 使用量到 Tibis 稳定结构的归一化工具。
 */
import type { AIUsage } from 'types/ai';

/**
 * 将 Provider 的可选 token 字段补齐为稳定 usage。
 * @param usage - Provider 返回的 token 使用量
 * @returns Tibis 稳定 token 使用量
 */
export function normalizeAIUsage(usage: Partial<AIUsage>): AIUsage {
  return {
    inputTokens: typeof usage.inputTokens === 'number' ? usage.inputTokens : 0,
    outputTokens: typeof usage.outputTokens === 'number' ? usage.outputTokens : 0,
    totalTokens: typeof usage.totalTokens === 'number' ? usage.totalTokens : 0
  };
}
