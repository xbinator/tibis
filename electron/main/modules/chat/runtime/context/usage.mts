/**
 * @file usage.mts
 * @description ChatRuntime provider usage 辅助函数。
 */
import type { AIUsage } from 'types/ai';

/**
 * 汇总多轮模型流的 usage。
 * @param current - 当前累计 usage
 * @param next - 新一轮流式 usage
 * @returns 累加后的 usage
 */
export function addRuntimeUsage(current: AIUsage | undefined, next: AIUsage | undefined): AIUsage | undefined {
  if (!next) return current;

  return {
    inputTokens: (current?.inputTokens ?? 0) + next.inputTokens,
    outputTokens: (current?.outputTokens ?? 0) + next.outputTokens,
    totalTokens: (current?.totalTokens ?? 0) + next.totalTokens
  };
}

/**
 * 判断两份 usage 是否一致。
 * @param left - 左侧 usage
 * @param right - 右侧 usage
 * @returns 是否一致
 */
export function isSameRuntimeUsage(left: AIUsage | undefined, right: AIUsage | undefined): boolean {
  return left?.inputTokens === right?.inputTokens && left?.outputTokens === right?.outputTokens && left?.totalTokens === right?.totalTokens;
}
