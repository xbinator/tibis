/**
 * @file contextUsageBudget.ts
 * @description 聊天上下文可用输入预算计算工具，统一 UI 与压缩策略的上下文用量口径。
 */

/** 上下文用量视觉状态。 */
export type ContextUsageStatus = 'safe' | 'warning' | 'danger';

/**
 * 上下文用量预算快照。
 */
export interface ContextUsageBudgetSnapshot {
  /** 当前模型消息切片估算 token 数。 */
  usedTokens: number;
  /** 模型完整上下文窗口。 */
  contextWindow: number;
  /** 预留给输出的 token 数。 */
  reservedOutputTokens: number;
  /** 安全边界 token 数。 */
  safetyMarginTokens: number;
  /** 扣除预留后的真实可用输入预算。 */
  usableInputTokens: number;
  /** usedTokens / usableInputTokens，范围 0-100。 */
  usagePercent: number;
  /** 剩余可用输入预算。 */
  remainingInputTokens: number;
  /** 视觉状态。 */
  status: ContextUsageStatus;
}

/** 默认最大输出预留 token 数。 */
const DEFAULT_RESERVED_OUTPUT_TOKENS = 4_096;
/** 最大安全边界 token 数。 */
const MAX_SAFETY_MARGIN_TOKENS = 1_024;
/** warning 状态阈值百分比。 */
const WARNING_USAGE_PERCENT = 65;
/** danger 状态阈值百分比。 */
const DANGER_USAGE_PERCENT = 90;

/**
 * 将输入数值规整为非负有限数。
 * @param value - 待规整数值
 * @returns 非负有限数
 */
function safeNonNegativeNumber(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

/**
 * 计算预留给输出的 token 数。
 * @param contextWindow - 模型完整上下文窗口
 * @returns 输出预留 token 数
 */
export function computeReservedOutputTokens(contextWindow: number): number {
  const safeContextWindow = safeNonNegativeNumber(contextWindow);
  return Math.min(DEFAULT_RESERVED_OUTPUT_TOKENS, Math.floor(safeContextWindow * 0.5));
}

/**
 * 计算上下文安全边界 token 数。
 * @param contextWindow - 模型完整上下文窗口
 * @returns 安全边界 token 数
 */
export function computeSafetyMarginTokens(contextWindow: number): number {
  const safeContextWindow = safeNonNegativeNumber(contextWindow);
  return Math.min(MAX_SAFETY_MARGIN_TOKENS, Math.floor(safeContextWindow * 0.15));
}

/**
 * 计算扣除输出预留和安全边界后的可用输入预算。
 * @param contextWindow - 模型完整上下文窗口
 * @returns 可用输入预算 token 数，最小为 1
 */
export function computeUsableInputTokens(contextWindow: number): number {
  const safeContextWindow = safeNonNegativeNumber(contextWindow);
  const reservedOutputTokens = computeReservedOutputTokens(safeContextWindow);
  const safetyMarginTokens = computeSafetyMarginTokens(safeContextWindow);
  return Math.max(1, safeContextWindow - reservedOutputTokens - safetyMarginTokens);
}

/**
 * 根据百分比判断上下文用量状态。
 * @param usagePercent - 当前用量百分比
 * @returns 上下文用量视觉状态
 */
function getContextUsageStatus(usagePercent: number): ContextUsageStatus {
  if (usagePercent >= DANGER_USAGE_PERCENT) {
    return 'danger';
  }
  if (usagePercent >= WARNING_USAGE_PERCENT) {
    return 'warning';
  }
  return 'safe';
}

/**
 * 创建上下文用量预算快照。
 * @param usedTokens - 当前模型消息切片估算 token 数
 * @param contextWindow - 模型完整上下文窗口
 * @returns 上下文用量预算快照
 */
export function createContextUsageBudgetSnapshot(usedTokens: number, contextWindow: number): ContextUsageBudgetSnapshot {
  const safeUsedTokens = safeNonNegativeNumber(usedTokens);
  const safeContextWindow = safeNonNegativeNumber(contextWindow);
  const reservedOutputTokens = computeReservedOutputTokens(safeContextWindow);
  const safetyMarginTokens = computeSafetyMarginTokens(safeContextWindow);
  const usableInputTokens = computeUsableInputTokens(safeContextWindow);
  const rawPercent = usableInputTokens <= 0 ? 0 : (safeUsedTokens / usableInputTokens) * 100;
  const usagePercent = Math.min(100, Math.max(0, Math.round(rawPercent)));
  const remainingInputTokens = Math.max(0, usableInputTokens - safeUsedTokens);

  return {
    usedTokens: safeUsedTokens,
    contextWindow: safeContextWindow,
    reservedOutputTokens,
    safetyMarginTokens,
    usableInputTokens,
    usagePercent,
    remainingInputTokens,
    status: getContextUsageStatus(usagePercent)
  };
}
