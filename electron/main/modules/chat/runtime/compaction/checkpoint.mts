/**
 * @file checkpoint.mts
 * @description 上下文压缩 checkpoint 的基础形状与终态约束校验。
 */
import type { ChatMessageCompactionPart, CompactionBudgetSnapshot, CompactionModelSnapshot, StructuredContextSummary } from 'types/chat';

/** checkpoint 基础校验错误码。 */
export type CheckpointErrorCode = 'INVALID_CHECKPOINT' | 'INVALID_SUCCESS_PAYLOAD' | 'SUMMARY_NOT_ALLOWED' | 'MODEL_SNAPSHOT_NOT_SANITIZED';

/** checkpoint 基础校验结果。 */
export type CheckpointValidationResult = { ok: true } | { ok: false; errorCode: CheckpointErrorCode };

/** 允许持久化的模型快照字段。 */
const MODEL_SNAPSHOT_KEYS = new Set<string>(['providerType', 'providerId', 'modelId', 'contextWindow', 'maxOutputTokens']);

/** 支持的 checkpoint 状态。 */
const CHECKPOINT_STATUSES = new Set<string>(['pending', 'success', 'failed', 'cancelled', 'skipped']);

/** 支持的 checkpoint 触发方式。 */
const CHECKPOINT_TRIGGERS = new Set<string>(['automatic', 'manual']);

/**
 * 判断值是否为普通记录。
 * @param value - 待判断值
 * @returns 是否为记录对象
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 判断值是否为非空字符串。
 * @param value - 待判断值
 * @returns 是否为非空字符串
 */
function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/**
 * 判断值是否为有限非负数字。
 * @param value - 待判断值
 * @returns 是否为有限非负数字
 */
function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/**
 * 校验模型快照只包含脱敏字段。
 * @param value - 待校验值
 * @returns 是否为合法模型快照
 */
function isModelSnapshot(value: unknown): value is CompactionModelSnapshot {
  if (!isRecord(value) || Object.keys(value).some((key: string): boolean => !MODEL_SNAPSHOT_KEYS.has(key))) return false;

  return (
    isNonEmptyString(value.providerType) &&
    isNonEmptyString(value.providerId) &&
    isNonEmptyString(value.modelId) &&
    (value.contextWindow === undefined || isNonNegativeNumber(value.contextWindow)) &&
    (value.maxOutputTokens === undefined || isNonNegativeNumber(value.maxOutputTokens))
  );
}

/**
 * 校验预算快照基础数值字段。
 * @param value - 待校验值
 * @returns 是否为合法预算快照
 */
function isBudgetSnapshot(value: unknown): value is CompactionBudgetSnapshot {
  if (!isRecord(value)) return false;

  return [
    value.outputReserve,
    value.safetyReserve,
    value.usableInputTokens,
    value.triggerTokens,
    value.targetTokens,
    value.summaryMaxTokens,
    value.rawTailMaxTokens
  ].every(isNonNegativeNumber);
}

/**
 * 校验摘要的基础容器形状。
 * 完整字段关系由 summary schema 模块负责。
 * @param value - 待校验值
 * @returns 是否为基础摘要形状
 */
function isSummary(value: unknown): value is StructuredContextSummary {
  if (!isRecord(value) || value.schemaVersion !== 1) return false;

  return ['objectives', 'facts', 'artifacts', 'completedActions', 'pendingActions', 'openQuestions', 'failures'].every((key: string): boolean =>
    Array.isArray(value[key])
  );
}

/**
 * 校验 checkpoint 基础字段。
 * @param value - 待校验值
 * @returns 是否具备 checkpoint 基础形状
 */
function hasCheckpointBase(value: Record<string, unknown>): boolean {
  return (
    isNonEmptyString(value.id) &&
    value.type === 'compaction' &&
    typeof value.status === 'string' &&
    CHECKPOINT_STATUSES.has(value.status) &&
    typeof value.trigger === 'string' &&
    CHECKPOINT_TRIGGERS.has(value.trigger) &&
    isNonNegativeNumber(value.createdAt) &&
    (value.completedAt === undefined || isNonNegativeNumber(value.completedAt))
  );
}

/**
 * 校验 checkpoint 的基础形状与终态字段约束。
 * @param value - 待校验 checkpoint
 * @returns 校验结果
 */
export function validateCheckpoint(value: unknown): CheckpointValidationResult {
  if (!isRecord(value) || !hasCheckpointBase(value)) return { ok: false, errorCode: 'INVALID_CHECKPOINT' };
  if (value.modelSnapshot !== undefined && !isModelSnapshot(value.modelSnapshot)) {
    return { ok: false, errorCode: 'MODEL_SNAPSHOT_NOT_SANITIZED' };
  }
  if (value.status !== 'success' && value.summary !== undefined) return { ok: false, errorCode: 'SUMMARY_NOT_ALLOWED' };
  if (value.status !== 'success') return { ok: true };

  const hasSuccessPayload =
    isNonEmptyString(value.boundaryPartId) &&
    isNonEmptyString(value.sourceFingerprint) &&
    isModelSnapshot(value.modelSnapshot) &&
    isBudgetSnapshot(value.budgetSnapshot) &&
    isSummary(value.summary) &&
    isNonNegativeNumber(value.completedAt);

  return hasSuccessPayload ? { ok: true } : { ok: false, errorCode: 'INVALID_SUCCESS_PAYLOAD' };
}

/**
 * 判断值是否为基础约束合法的 compaction part。
 * @param value - 待判断值
 * @returns 是否为 compaction part
 */
export function isCompactionPart(value: unknown): value is ChatMessageCompactionPart {
  return validateCheckpoint(value).ok;
}

/**
 * 判断 Part 是否为完整成功 checkpoint。
 * @param value - 待判断 Part
 * @returns 是否为成功 checkpoint
 */
export function isSuccessCheckpoint(value: unknown): value is ChatMessageCompactionPart & { status: 'success' } {
  return isCompactionPart(value) && value.status === 'success';
}
