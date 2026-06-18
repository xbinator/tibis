/**
 * @file context-budget.mts
 * @description ChatRuntime 上下文预算与压缩阈值计算。
 */
import type { ChatRuntimeContextUsageSnapshot, ChatRuntimeContextUsageStatus } from 'types/chat-runtime';

/** 默认模型输出预留 token 数。 */
const DEFAULT_RESERVED_OUTPUT_TOKENS = 8_192;

/** 默认压缩安全缓冲 token 数。 */
const DEFAULT_COMPACTION_BUFFER_TOKENS = 4_000;

/** 进入 warning 状态的用量百分比。 */
const DEFAULT_WARNING_PERCENT = 80;

/** 进入 danger 状态并触发发送前压缩的用量百分比。 */
const DEFAULT_DANGER_PERCENT = 90;

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
 * 根据用量百分比计算视觉状态。
 * @param usagePercent - 当前用量百分比
 * @param warningPercent - warning 阈值
 * @param dangerPercent - danger 阈值
 * @returns 用量状态
 */
function getUsageStatus(usagePercent: number, warningPercent: number, dangerPercent: number): ChatRuntimeContextUsageStatus {
  if (usagePercent >= dangerPercent) return 'danger';
  if (usagePercent >= warningPercent) return 'warning';

  return 'safe';
}

/**
 * 创建上下文预算服务。
 * @param options - 预算与阈值配置
 * @returns 上下文预算服务
 */
export function createContextBudgetService(options: ContextBudgetServiceOptions = {}): ContextBudgetService {
  const reservedOutputTokens = toNonNegativeInteger(options.reservedOutputTokens ?? DEFAULT_RESERVED_OUTPUT_TOKENS);
  const compactionBufferTokens = toNonNegativeInteger(options.compactionBufferTokens ?? DEFAULT_COMPACTION_BUFFER_TOKENS);
  const warningPercent = toNonNegativeInteger(options.warningPercent ?? DEFAULT_WARNING_PERCENT);
  const dangerPercent = toNonNegativeInteger(options.dangerPercent ?? DEFAULT_DANGER_PERCENT);

  return {
    calculate(input: ContextBudgetCalculateInput): ChatRuntimeContextUsageSnapshot {
      const contextWindow = toNonNegativeInteger(input.contextWindow);
      const providerUsageTokens = input.providerUsageTokens === undefined ? undefined : toNonNegativeInteger(input.providerUsageTokens);
      const estimatedInputTokens = Math.max(toNonNegativeInteger(input.estimatedInputTokens), providerUsageTokens ?? 0);
      const usableInputTokens = Math.max(0, contextWindow - reservedOutputTokens - compactionBufferTokens);

      if (contextWindow === 0 || usableInputTokens === 0) {
        return {
          runtimeId: input.runtimeId,
          sessionId: input.sessionId,
          agentId: input.agentId,
          contextWindow,
          reservedOutputTokens,
          compactionBufferTokens,
          usableInputTokens,
          estimatedInputTokens: 0,
          providerUsageTokens,
          usagePercent: 0,
          remainingInputTokens: 0,
          status: 'safe',
          shouldCompactBeforeSend: false
        };
      }

      const usagePercent = Math.min(100, Math.round((estimatedInputTokens / usableInputTokens) * 100));
      const remainingInputTokens = Math.max(0, usableInputTokens - estimatedInputTokens);
      const status = getUsageStatus(usagePercent, warningPercent, dangerPercent);

      return {
        runtimeId: input.runtimeId,
        sessionId: input.sessionId,
        agentId: input.agentId,
        contextWindow,
        reservedOutputTokens,
        compactionBufferTokens,
        usableInputTokens,
        estimatedInputTokens,
        providerUsageTokens,
        usagePercent,
        remainingInputTokens,
        status,
        shouldCompactBeforeSend: status === 'danger'
      };
    }
  };
}
