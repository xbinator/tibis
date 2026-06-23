/**
 * @file context-budget.mts
 * @description ChatRuntime 上下文预算与压缩阈值计算，复用共享 AI 上下文预算口径。
 */
import type { ChatRuntimeContextUsageSnapshot, ChatRuntimeContextUsageStatus } from 'types/chat-runtime';
import type { ContextUsageBudgetOptions } from '../../../../../../shared/ai/context/usageBudget.js';
import { createContextUsageBudgetSnapshot } from '../../../../../../shared/ai/context/usageBudget.js';

/** 上下文预算计算参数。 */
export interface ContextBudgetCalculateInput {
  /** Runtime id。 */
  runtimeId: string;
  /** Session id。 */
  sessionId: string;
  /** Agent id。 */
  agentId: string;
  /** 完整模型上下文窗口。 */
  contextWindow: number;
  /** 序列化模型消息估算 token 数。 */
  estimatedInputTokens: number;
  /** Provider 上报 token 数。 */
  providerUsageTokens?: number;
}

/** 上下文预算服务配置。 */
export interface ContextBudgetServiceOptions {
  /** 模型输出预留 token 数。 */
  reservedOutputTokens?: number;
  /** 压缩安全缓冲 token 数。 */
  compactionBufferTokens?: number;
  /** warning 阈值百分比。 */
  warningPercent?: number;
  /** danger 阈值百分比。 */
  dangerPercent?: number;
}

/** 上下文预算服务。 */
export interface ContextBudgetService {
  /**
   * 计算当前 runtime 的上下文用量快照。
   * @param input - 上下文窗口、估算 token 与 runtime 标识
   * @returns 可直接发送给 renderer 的用量快照
   */
  calculate(input: ContextBudgetCalculateInput): ChatRuntimeContextUsageSnapshot;
}

/**
 * 将数字规整为非负整数。
 * @param value - 原始数值
 * @returns 非负整数
 */
function toNonNegativeInteger(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;

  return Math.max(0, Math.floor(value));
}

/**
 * 创建上下文预算服务。
 * @param options - 预算与阈值配置
 * @returns 上下文预算服务
 */
export function createContextBudgetService(options: ContextBudgetServiceOptions = {}): ContextBudgetService {
  const budgetOptions: ContextUsageBudgetOptions = {
    reservedOutputTokens: options.reservedOutputTokens,
    safetyMarginTokens: options.compactionBufferTokens,
    warningPercent: options.warningPercent,
    dangerPercent: options.dangerPercent
  };

  return {
    calculate(input: ContextBudgetCalculateInput): ChatRuntimeContextUsageSnapshot {
      const contextWindow = toNonNegativeInteger(input.contextWindow);
      const providerUsageTokens = input.providerUsageTokens === undefined ? undefined : toNonNegativeInteger(input.providerUsageTokens);
      const estimatedInputTokens = Math.max(toNonNegativeInteger(input.estimatedInputTokens), providerUsageTokens ?? 0);
      const snapshot = createContextUsageBudgetSnapshot(estimatedInputTokens, contextWindow, budgetOptions);

      return {
        runtimeId: input.runtimeId,
        sessionId: input.sessionId,
        agentId: input.agentId,
        contextWindow: snapshot.contextWindow,
        reservedOutputTokens: snapshot.reservedOutputTokens,
        compactionBufferTokens: snapshot.safetyMarginTokens,
        usableInputTokens: snapshot.usableInputTokens,
        estimatedInputTokens: snapshot.usedTokens,
        providerUsageTokens,
        usagePercent: snapshot.usagePercent,
        remainingInputTokens: snapshot.remainingInputTokens,
        status: snapshot.status as ChatRuntimeContextUsageStatus,
        shouldCompactBeforeSend: snapshot.status === 'danger'
      };
    }
  };
}
