/**
 * @file usageBudget.ts
 * @description 跨进程共享的 AI 上下文预算与用量快照计算工具。
 */

/** 上下文用量视觉状态。 */
export type ContextUsageStatus = 'safe' | 'warning' | 'danger';

/** 上下文预算计算配置。 */
export interface ContextUsageBudgetOptions {
  /** 预留给模型输出的 token 数。 */
  reservedOutputTokens?: number;
  /** 安全缓冲 token 数。 */
  safetyMarginTokens?: number;
  /** warning 状态阈值百分比。 */
  warningPercent?: number;
  /** danger 状态阈值百分比。 */
  dangerPercent?: number;
}

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

/** 默认模型输出预留 token 数。 */
export const DEFAULT_RESERVED_OUTPUT_TOKENS = 8_192;
/** 默认上下文安全缓冲 token 数。 */
export const DEFAULT_SAFETY_MARGIN_TOKENS = 4_000;
/** 默认 warning 阈值百分比。 */
export const DEFAULT_WARNING_USAGE_PERCENT = 80;
/** 默认 danger 阈值百分比。 */
export const DEFAULT_DANGER_USAGE_PERCENT = 90;

/**
 * 将输入数值规整为非负整数。
 * @param value - 待规整数值
 * @returns 非负整数
 */
function toNonNegativeInteger(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

/**
 * 读取有效预算配置。
 * @param options - 预算配置覆盖项
 * @returns 规整后的预算配置
 */
function normalizeBudgetOptions(options: ContextUsageBudgetOptions = {}): Required<ContextUsageBudgetOptions> {
  return {
    reservedOutputTokens: toNonNegativeInteger(options.reservedOutputTokens ?? DEFAULT_RESERVED_OUTPUT_TOKENS),
    safetyMarginTokens: toNonNegativeInteger(options.safetyMarginTokens ?? DEFAULT_SAFETY_MARGIN_TOKENS),
    warningPercent: toNonNegativeInteger(options.warningPercent ?? DEFAULT_WARNING_USAGE_PERCENT),
    dangerPercent: toNonNegativeInteger(options.dangerPercent ?? DEFAULT_DANGER_USAGE_PERCENT)
  };
}

/**
 * 计算预留给输出的 token 数。
 * @param contextWindow - 模型完整上下文窗口
 * @param options - 预算配置覆盖项
 * @returns 输出预留 token 数
 */
export function computeReservedOutputTokens(contextWindow: number, options: ContextUsageBudgetOptions = {}): number {
  toNonNegativeInteger(contextWindow);
  return normalizeBudgetOptions(options).reservedOutputTokens;
}

/**
 * 计算上下文安全边界 token 数。
 * @param contextWindow - 模型完整上下文窗口
 * @param options - 预算配置覆盖项
 * @returns 安全边界 token 数
 */
export function computeSafetyMarginTokens(contextWindow: number, options: ContextUsageBudgetOptions = {}): number {
  toNonNegativeInteger(contextWindow);
  return normalizeBudgetOptions(options).safetyMarginTokens;
}

/**
 * 计算扣除输出预留和安全边界后的可用输入预算。
 * @param contextWindow - 模型完整上下文窗口
 * @param options - 预算配置覆盖项
 * @returns 可用输入预算 token 数
 */
export function computeUsableInputTokens(contextWindow: number, options: ContextUsageBudgetOptions = {}): number {
  const safeContextWindow = toNonNegativeInteger(contextWindow);
  const normalizedOptions = normalizeBudgetOptions(options);
  return Math.max(0, safeContextWindow - normalizedOptions.reservedOutputTokens - normalizedOptions.safetyMarginTokens);
}

/**
 * 根据百分比判断上下文用量状态。
 * @param usagePercent - 当前用量百分比
 * @param options - 预算配置覆盖项
 * @returns 上下文用量视觉状态
 */
function getContextUsageStatus(usagePercent: number, options: Required<ContextUsageBudgetOptions>): ContextUsageStatus {
  if (usagePercent >= options.dangerPercent) return 'danger';
  if (usagePercent >= options.warningPercent) return 'warning';
  return 'safe';
}

/**
 * 计算上下文用量百分比原始值。
 * @param usedTokens - 已使用 token 数
 * @param usableInputTokens - 可用输入预算
 * @returns 未规整的用量百分比
 */
function computeRawUsagePercent(usedTokens: number, usableInputTokens: number): number {
  if (usableInputTokens > 0) return (usedTokens / usableInputTokens) * 100;
  return usedTokens > 0 ? 100 : 0;
}

/**
 * 创建上下文用量预算快照。
 * @param usedTokens - 当前模型消息切片估算 token 数
 * @param contextWindow - 模型完整上下文窗口
 * @param options - 预算配置覆盖项
 * @returns 上下文用量预算快照
 */
export function createContextUsageBudgetSnapshot(
  usedTokens: number,
  contextWindow: number,
  options: ContextUsageBudgetOptions = {}
): ContextUsageBudgetSnapshot {
  const normalizedOptions = normalizeBudgetOptions(options);
  const safeContextWindow = toNonNegativeInteger(contextWindow);
  const usableInputTokens = computeUsableInputTokens(safeContextWindow, normalizedOptions);
  const safeUsedTokens = safeContextWindow === 0 ? 0 : toNonNegativeInteger(usedTokens);
  const rawPercent = computeRawUsagePercent(safeUsedTokens, usableInputTokens);
  const usagePercent = Math.min(100, Math.max(0, Math.round(rawPercent)));
  const remainingInputTokens = Math.max(0, usableInputTokens - safeUsedTokens);

  return {
    usedTokens: safeUsedTokens,
    contextWindow: safeContextWindow,
    reservedOutputTokens: normalizedOptions.reservedOutputTokens,
    safetyMarginTokens: normalizedOptions.safetyMarginTokens,
    usableInputTokens,
    usagePercent,
    remainingInputTokens,
    status: getContextUsageStatus(usagePercent, normalizedOptions)
  };
}
