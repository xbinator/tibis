/**
 * @file coordinator.ts
 * @description 压缩流程协调层：串联 planner、recordPreprocessor 与存储层，管理手动压缩任务。
 */
import type { TopicSegment } from './topicSegmenter';
import type {
  BuildCompressionRecordResult,
  CompressionBuildMode,
  CompressionRecord,
  CompressionRecordStorage,
  StructuredConversationSummary,
  TriggerReason
} from './types';
import { findLast } from 'lodash-es';
import type { Message } from '@/components/BChatSidebar/utils/types';
import { asyncTo } from '@/utils/asyncTo';
import { CURRENT_SCHEMA_VERSION, RECENT_ROUND_PRESERVE } from './constant';
import { CompressionCancelledError, CompressionError } from './error';
import { planCompression } from './planner';
import { ruleTrim, truncateSummaryText } from './recordPreprocessor';
import { generateStructuredSummary, generateSummaryText } from './structuredSummaryGenerator';
import { fromStructuredConversationSummary } from './summaryAdapter';
import { detectTopicBoundaries, segmentMessages } from './topicSegmenter';

/**
 * 会话级压缩锁，防止同一会话并发触发压缩。
 */
const sessionLocks = new Map<string, Promise<void>>();

/**
 * 获取多段压缩记录生成中的前置上下文记录。
 * 当存在上一段记录时，返回其摘要信息；否则使用当前记录作为前置上下文。
 *
 * @param currentIndex - 当前处理的分段索引
 * @param records - 已生成的摘要记录列表
 * @param currentRecord - 当前有效压缩记录（用于继承上下文）
 * @returns 前置上下文记录，优先使用上一段记录，否则使用当前记录
 */
function getPreviousRecordForSegment(
  currentIndex: number,
  records: CompressionRecord[],
  currentRecord?: CompressionRecord
): Pick<CompressionRecord, 'recordText' | 'structuredSummary' | 'generalSummary'> | undefined {
  if (currentIndex > 0 && records.length > 0) {
    const lastRecord = records[records.length - 1];
    return { recordText: lastRecord.recordText, structuredSummary: lastRecord.structuredSummary, generalSummary: lastRecord.generalSummary };
  }
  return currentRecord;
}

/**
 * 获取会话级互斥锁。若锁已被占用，则等待其释放后再继续。
 * @param sessionId - 会话 ID
 * @returns 释放锁的回调函数
 */
async function acquireSessionLock(sessionId: string): Promise<() => void> {
  const existingLock = sessionLocks.get(sessionId);
  if (existingLock) {
    await asyncTo(existingLock);
  }

  let releaseLock: () => void;
  const lockPromise = new Promise<void>((resolve) => {
    releaseLock = () => {
      sessionLocks.delete(sessionId);
      resolve();
    };
  });
  sessionLocks.set(sessionId, lockPromise);
  return () => {
    sessionLocks.delete(sessionId);
    releaseLock!();
  };
}

/**
 * 解析待压缩消息窗口参数
 */
interface ResolveIncrementalWindowOptions {
  /** 全量消息列表 */
  messages: Message[];
  /** 是否为增量模式 */
  isIncrementalMode: boolean;
  /** 当前有效压缩记录（增量模式必需） */
  currentRecord?: CompressionRecord;
  /** 当前用户消息 ID（从结果中排除） */
  currentUserMessageId?: string;
}

/**
 * 解析待压缩消息窗口。
 *
 * - 增量模式：根据当前压缩记录边界截取增量消息
 * - 非增量模式：返回除当前用户消息外的所有消息
 *
 * @param options - 解析参数选项
 * @returns 待压缩的消息窗口
 */
function resolveIncrementalWindow(options: ResolveIncrementalWindowOptions): Message[] {
  const { messages, isIncrementalMode, currentRecord, currentUserMessageId } = options;

  if (!isIncrementalMode) {
    return messages.filter((m) => m.id !== currentUserMessageId);
  }

  if (!currentRecord) {
    return messages.filter((m) => m.id !== currentUserMessageId);
  }

  const startIndex = messages.findIndex((m) => m.id === currentRecord.coveredEndMessageId);
  const tailMessages = startIndex >= 0 ? messages.slice(startIndex + 1) : messages;
  return tailMessages.filter((m) => m.id !== currentUserMessageId);
}
// ─────────────────────────────────────────────────────────────
// 多段摘要构建
// ─────────────────────────────────────────────────────────────

/**
 * buildMultiSegmentSummary 的入参集合。
 */
interface BuildMultiSegmentSummaryParams {
  /** 压缩记录存储层 */
  storage: CompressionRecordStorage;
  /** 会话 ID */
  sessionId: string;
  /** 全量消息列表 */
  messages: Message[];
  /** 压缩记录构建模式 */
  buildMode: CompressionBuildMode;
  /** 触发原因 */
  triggerReason: TriggerReason;
  /** 当前有效压缩记录（用于继承上下文） */
  currentRecord?: CompressionRecord;
  /** 消息分类结果 */
  classification: ReturnType<typeof planCompression>;
  /** 话题分段列表 */
  segments: TopicSegment[];
  /** 当前用户消息 ID（排除后不进入压缩记录） */
  currentUserMessageId?: string;
  /** 降级原因：全量重建被截断时降级为增量 */
  degradeReason?: 'degraded_to_incremental';
  /** 压缩取消信号 */
  signal?: AbortSignal;
}

/**
 * 在关键阶段边界检查压缩任务是否已被用户取消。
 * @param signal - 压缩取消信号
 */
function throwIfCompressionCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new CompressionCancelledError();
  }
}

/**
 * 按话题分段顺序生成并持久化多段摘要记录。
 *
 * 各段独立生成压缩文本，共享同一个 recordSetId。
 * 若中途任一段失败，已写入的 draft 记录将全部回收为 invalid。
 *
 * @param params - 构建参数
 * @returns 新摘要集合的首条记录及消息分类结果；无可压缩内容时返回 undefined
 */
async function buildMultiSegmentSummary(params: BuildMultiSegmentSummaryParams): Promise<BuildCompressionRecordResult | undefined> {
  const { storage, sessionId, messages, buildMode, triggerReason, currentRecord, classification, segments, degradeReason, signal } = params;

  const recordSetId = `record-set-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const segmentCount = segments.length;
  const records: CompressionRecord[] = [];

  try {
    for (let i = 0; i < segments.length; i += 1) {
      const segment = segments[i];
      throwIfCompressionCancelled(signal);

      let trimmed: ReturnType<typeof ruleTrim>;
      try {
        trimmed = ruleTrim(segment.messages);
      } catch (error) {
        throw new CompressionError('消息裁剪失败', 'rule_trim', error);
      }

      // 增量段落：以上一段压缩记录作为前置上下文，保持多段之间的连贯性
      const previousRecord = getPreviousRecordForSegment(i, records, currentRecord);

      let structuredSummary: StructuredConversationSummary;
      try {
        throwIfCompressionCancelled(signal);
        /* eslint-disable-next-line no-await-in-loop -- 多段摘要需按顺序生成，每段依赖前一段上下文 */
        structuredSummary = await generateStructuredSummary({ items: trimmed.items, previousRecord });
        throwIfCompressionCancelled(signal);
      } catch (error) {
        throw new CompressionError('AI 摘要生成失败', 'ai_summary', error);
      }

      const generalSummary = fromStructuredConversationSummary(structuredSummary);
      const recordText = truncateSummaryText(generateSummaryText(structuredSummary));

      try {
        throwIfCompressionCancelled(signal);
        /* eslint-disable-next-line no-await-in-loop -- 按顺序持久化每段摘要，保证 segmentIndex 与生成顺序一致 */
        const record = await storage.createRecord({
          sessionId,
          buildMode,
          derivedFromRecordId: currentRecord?.id,
          coveredStartMessageId: segment.startMessageId,
          coveredEndMessageId: segment.endMessageId,
          coveredUntilMessageId: segment.endMessageId,
          sourceMessageIds: segment.messages.map((m) => m.id),
          preservedMessageIds: classification.preservedMessageIds,
          recordText,
          structuredSummary,
          generalSummary,
          triggerReason,
          messageCountSnapshot: Math.ceil(messages.filter((m) => m.role === 'user' || m.role === 'assistant').length / 2),
          charCountSnapshot: trimmed.charCount,
          schemaVersion: CURRENT_SCHEMA_VERSION,
          status: 'draft',
          invalidReason: undefined,
          degradeReason,
          recordSetId,
          segmentIndex: i,
          segmentCount,
          topicTags: []
        });
        records.push(record);
      } catch (error) {
        throw new CompressionError('压缩记录保存失败', 'storage', error);
      }
    }

    // 所有段写入完毕后，统一提升为 valid 状态
    for (const record of records) {
      /* eslint-disable-next-line no-await-in-loop -- 按顺序提升摘要集状态，保证一致性 */
      await storage.updateRecordStatus(record.id, 'valid');
      record.status = 'valid';
    }

    if (currentRecord) {
      await storage.updateRecordStatus(currentRecord.id, 'superseded');
    }

    return { compressionRecord: records[0], classification };
  } catch (error) {
    // 构建失败：将已写入的 draft 记录全部标记为 invalid，忽略回收失败以保留原始错误
    for (const record of records) {
      /* eslint-disable-next-line no-await-in-loop -- 逐条回收 draft 记录 */
      await asyncTo(storage.updateRecordStatus(record.id, 'invalid', 'incomplete_summary_set'));
    }
    throw error;
  }
}

// ─────────────────────────────────────────────────────────────
// 单次摘要构建
// ─────────────────────────────────────────────────────────────

/**
 * buildSummaryRecord 的入参集合。
 */
interface BuildSummaryRecordOptions {
  /** 压缩记录存储层 */
  storage: CompressionRecordStorage;
  /** 会话 ID */
  sessionId: string;
  /** 全量消息列表 */
  messages: Message[];
  /** 压缩记录构建模式 */
  buildMode: CompressionBuildMode;
  /** 触发原因 */
  triggerReason: TriggerReason;
  /** 当前有效压缩记录 */
  currentRecord?: CompressionRecord;
  /** 当前用户消息 ID（自动发送时排除） */
  currentUserMessageId?: string;
  /** 需要显式排除的消息 ID 列表 */
  excludeMessageIds?: string[];
  /** 降级原因 */
  degradeReason?: 'degraded_to_incremental';
  /** 压缩取消信号 */
  signal?: AbortSignal;
}

/**
 * 生成并持久化摘要记录。
 *
 * - 增量模式（incremental）或降级为增量的全量重建：仅压缩上次摘要未覆盖的新消息。
 * - 话题分段数 ≥ 3 且消息数 > 20 时，自动切换至多段摘要构建。
 *
 * @param options - 构建选项
 * @returns 新摘要记录及对应的消息分类结果；无可压缩内容时返回 undefined
 */
async function buildSummaryRecord(options: BuildSummaryRecordOptions): Promise<BuildCompressionRecordResult | undefined> {
  const { storage, sessionId, messages, buildMode, triggerReason, currentRecord, currentUserMessageId, excludeMessageIds, degradeReason, signal } = options;
  throwIfCompressionCancelled(signal);

  const isIncrementalMode = buildMode === 'incremental' || degradeReason === 'degraded_to_incremental';
  const windowMessages = resolveIncrementalWindow({
    messages,
    isIncrementalMode,
    currentRecord,
    currentUserMessageId
  });

  const classification = planCompression(windowMessages, RECENT_ROUND_PRESERVE, currentUserMessageId, excludeMessageIds);
  if (!classification.compressibleMessages.length) return undefined;

  // 合并文件语义消息与可压缩消息，按原始顺序排列，确保 coveredStart/EndMessageId 正确
  const summarizedIdSet = new Set([...classification.fileSemanticMessages.map((m) => m.id), ...classification.compressibleMessages.map((m) => m.id)]);
  const orderedSummarizedMessages = windowMessages.filter((m) => summarizedIdSet.has(m.id));

  // 话题分段检测：满足条件时切换至多段摘要构建
  const segments = segmentMessages(orderedSummarizedMessages, detectTopicBoundaries(orderedSummarizedMessages));
  if (segments.length >= 3 && orderedSummarizedMessages.length > 20) {
    return buildMultiSegmentSummary({
      storage,
      sessionId,
      messages,
      buildMode,
      triggerReason,
      currentRecord,
      classification,
      segments,
      currentUserMessageId,
      degradeReason,
      signal
    });
  }

  let trimmed: ReturnType<typeof ruleTrim>;
  try {
    throwIfCompressionCancelled(signal);
    trimmed = ruleTrim(orderedSummarizedMessages);
    throwIfCompressionCancelled(signal);
  } catch (error) {
    throw new CompressionError('消息裁剪失败', 'rule_trim', error);
  }

  // 增量模式下将上一条压缩记录作为上下文传入，以保持摘要连贯性
  throwIfCompressionCancelled(signal);
  const structuredSummary = await generateStructuredSummary({
    items: trimmed.items,
    previousRecord: isIncrementalMode ? currentRecord : undefined
  });
  throwIfCompressionCancelled(signal);

  const generalSummary = fromStructuredConversationSummary(structuredSummary);
  const recordText = truncateSummaryText(generateSummaryText(structuredSummary));
  const allSummarizedIds = orderedSummarizedMessages.map((m) => m.id);

  // 增量模式下，覆盖起点从上次压缩记录边界之后开始
  const coveredStartMessageId = isIncrementalMode ? allSummarizedIds[0] ?? currentRecord?.coveredEndMessageId ?? '' : allSummarizedIds[0] ?? '';
  const coveredEndMessageId = allSummarizedIds[allSummarizedIds.length - 1];

  // coveredUntilMessageId 取最后一条非保留消息，标记摘要实际覆盖的边界
  const preservedSet = new Set(classification.preservedMessageIds);
  const lastNonPreserved = findLast(allSummarizedIds, (id) => !preservedSet.has(id));
  const coveredUntilMessageId = lastNonPreserved ?? coveredEndMessageId;

  let compressionRecord: CompressionRecord;
  try {
    throwIfCompressionCancelled(signal);
    compressionRecord = await storage.createRecord({
      sessionId,
      buildMode,
      derivedFromRecordId: currentRecord?.id,
      coveredStartMessageId,
      coveredEndMessageId,
      coveredUntilMessageId,
      sourceMessageIds: allSummarizedIds.filter((id) => !preservedSet.has(id)),
      preservedMessageIds: classification.preservedMessageIds,
      recordText,
      structuredSummary,
      generalSummary,
      triggerReason,
      messageCountSnapshot: Math.ceil(messages.filter((m) => m.role === 'user' || m.role === 'assistant').length / 2),
      charCountSnapshot: trimmed.charCount,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      status: 'valid',
      invalidReason: undefined,
      degradeReason
    });
  } catch (error) {
    throw new CompressionError('压缩记录保存失败', 'storage', error);
  }

  if (currentRecord && currentRecord.id !== compressionRecord.id) {
    await storage.updateRecordStatus(currentRecord.id, 'superseded');
  }

  return { compressionRecord, classification };
}

// ─────────────────────────────────────────────────────────────
// 压缩协调器
// ─────────────────────────────────────────────────────────────

/**
 * 创建压缩协调器。
 *
 * 协调器负责串联压缩策略判断、摘要生成与上下文组装，
 * 并通过会话级互斥锁防止并发压缩导致的状态冲突。
 *
 * @param storage - 压缩记录存储层接口
 * @returns 协调器对象
 */
export function createCompressionCoordinator(storage: CompressionRecordStorage) {
  return {
    /**
     * 手动触发会话全量压缩。
     *
     * 若输入消息被截断，buildMode 仍记为 full_rebuild（体现用户意图），
     * 但通过 degradeReason 标记执行层实际降级为增量模式。
     *
     * @param input - 压缩输入参数
     * @returns 新生成的压缩记录；无可压缩内容时返回 undefined
     */
    async compressSessionManually(input: { sessionId: string; messages: Message[]; signal?: AbortSignal }): Promise<CompressionRecord | undefined> {
      const { sessionId, messages, signal } = input;
      const releaseLock = await acquireSessionLock(sessionId);

      try {
        throwIfCompressionCancelled(signal);
        const currentRecord = await storage.getLatestValidRecord(sessionId);
        throwIfCompressionCancelled(signal);

        const fullRebuildTrim = ruleTrim(messages);
        const degradeReason = fullRebuildTrim.truncated ? ('degraded_to_incremental' as const) : undefined;
        throwIfCompressionCancelled(signal);

        const compressionResult = await buildSummaryRecord({
          storage,
          sessionId,
          messages,
          buildMode: 'full_rebuild',
          triggerReason: 'manual',
          currentRecord,
          degradeReason,
          signal
        });

        return compressionResult?.compressionRecord;
      } finally {
        releaseLock();
      }
    }
  };
}
