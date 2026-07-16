/**
 * @file budget.mts
 * @description 上下文压缩预算公式与阈值判定。
 */
import type { CompactionBudgetSnapshot } from 'types/chat';
import { clamp } from 'lodash-es';

/** 默认模型输出预留。 */
const DEFAULT_OUTPUT_RESERVE = 8_192;

/** 最小模型输出预留。 */
const MIN_OUTPUT_RESERVE = 1_024;

/** 最小安全预留。 */
const MIN_SAFETY_RESERVE = 1_024;

/** 最小可用摘要输出容量。 */
const MIN_SUMMARY_CAPACITY = 1_024;

/**
 * 压缩预算计算输入。
 */
export interface CompactionBudgetInput {
  /** 模型上下文窗口。 */
  contextWindow: number;
  /** 请求最大输出 Token。 */
  maxOutputTokens?: number;
  /** system、tools、当前任务等不可压缩 Token。 */
  noncompressibleTokens: number;
}

/**
 * 摘要请求容量判定输入。
 */
export interface SummaryCapacityInput {
  /** 模型上下文窗口。 */
  contextWindow: number;
  /** 冻结摘要源 Token。 */
  sourceTokens: number;
  /** 压缩提示词 Token。 */
  promptTokens: number;
  /** 当前压缩预算。 */
  budget: CompactionBudgetSnapshot;
}

/**
 * 规范化上下文窗口为正整数。
 * @param value - 原始上下文窗口
 * @returns 正整数上下文窗口
 */
function normalizeContextWindow(value: number): number {
  if (!Number.isFinite(value) || value < 1) return 1;

  return Math.floor(value);
}

/**
 * 按统一公式计算压缩预算。
 * @param input - 模型和不可压缩内容参数
 * @returns 可持久化预算快照
 */
export function createCompactionBudget(input: CompactionBudgetInput): CompactionBudgetSnapshot {
  const contextWindow = normalizeContextWindow(input.contextWindow);
  const maximumOutputReserve = Math.max(1, Math.floor(contextWindow * 0.25));
  const minimumOutputReserve = Math.min(MIN_OUTPUT_RESERVE, maximumOutputReserve);
  const requestedOutputReserve = input.maxOutputTokens ?? DEFAULT_OUTPUT_RESERVE;
  const outputReserve = Math.floor(clamp(requestedOutputReserve, minimumOutputReserve, maximumOutputReserve));
  const safetyReserve = Math.max(MIN_SAFETY_RESERVE, Math.ceil(contextWindow * 0.05));
  const usableInputTokens = Math.max(0, contextWindow - outputReserve - safetyReserve);
  const triggerTokens = Math.floor(usableInputTokens * 0.8);
  const targetTokens = Math.floor(usableInputTokens * 0.55);
  const noncompressibleTokens = Math.max(0, Math.floor(input.noncompressibleTokens));
  const availableTokens = Math.max(0, targetTokens - noncompressibleTokens);
  const summaryCapacity = Math.min(16_384, Math.max(2_048, Math.floor(usableInputTokens * 0.15)));
  const summaryMaxTokens = Math.min(summaryCapacity, Math.floor(availableTokens * 0.4));
  const rawTailMaxTokens = Math.max(0, availableTokens - summaryMaxTokens);

  return {
    outputReserve,
    safetyReserve,
    usableInputTokens,
    triggerTokens,
    targetTokens,
    summaryMaxTokens,
    rawTailMaxTokens
  };
}

/**
 * 判断是否达到自动压缩阈值。
 * @param estimatedTokens - 当前请求估算 Token
 * @param budget - 压缩预算
 * @returns 是否应自动压缩
 */
export function shouldAutoCompact(estimatedTokens: number, budget: CompactionBudgetSnapshot): boolean {
  return estimatedTokens >= budget.triggerTokens;
}

/**
 * 判断当前请求是否达到输入硬限制。
 * @param estimatedTokens - 当前请求估算 Token
 * @param budget - 压缩预算
 * @returns 是否达到硬限制
 */
export function exceedsHardLimit(estimatedTokens: number, budget: CompactionBudgetSnapshot): boolean {
  return estimatedTokens >= budget.usableInputTokens;
}

/**
 * 判断预算是否仍能提供最小摘要输出容量。
 * @param budget - 压缩预算
 * @returns 是否可生成摘要
 */
export function hasSummaryCapacity(budget: CompactionBudgetSnapshot): boolean {
  return budget.summaryMaxTokens >= MIN_SUMMARY_CAPACITY;
}

/**
 * 判断摘要请求是否能落在安全窗口内。
 * @param input - 摘要请求容量参数
 * @returns 是否可安全发起摘要请求
 */
export function canGenerateSummary(input: SummaryCapacityInput): boolean {
  if (!hasSummaryCapacity(input.budget)) return false;

  const safeInputLimit = Math.max(0, normalizeContextWindow(input.contextWindow) - input.budget.safetyReserve);
  return input.sourceTokens + input.promptTokens + input.budget.summaryMaxTokens <= safeInputLimit;
}
