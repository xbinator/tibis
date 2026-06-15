/**
 * @file compressionMetrics.ts
 * @description 聊天压缩质量指标计算与日志格式化。
 */
import type { CompressionRecord } from './types';
import type { Message } from '@/components/BChat/utils/types';
import { toGeneralConversationSummary } from './summaryAdapter';

/**
 * 压缩指标输入。
 */
export interface CreateCompressionMetricsInput {
  /** 压缩记录 */
  record: CompressionRecord;
  /** 实际注入模型的压缩边界文本 */
  boundaryText: string;
  /** 进入摘要生成的源消息 */
  sourceMessages: Message[];
}

/**
 * 压缩质量指标。
 */
export interface CompressionMetrics {
  /** 压缩记录 ID */
  recordId: string;
  /** 摘要 schema 版本 */
  schemaVersion: number;
  /** 进入摘要的源消息数 */
  sourceMessageCount: number;
  /** 进入摘要的源消息字符数 */
  sourceCharCount: number;
  /** 实际压缩边界字符数 */
  boundaryCharCount: number;
  /** 压缩后/压缩前字符比例 */
  compressionRatio: number;
  /** 原始用户需求数量 */
  rawUserRequirementCount: number;
  /** 未完成事项数量 */
  openLoopCount: number;
}

/**
 * 估算消息字符数。
 * @param message - 聊天消息
 * @returns 消息字符数
 */
function estimateMessageChars(message: Message): number {
  if (message.content) {
    return message.content.length;
  }

  return message.parts
    .map((part) => {
      if (part.type === 'text') return part.text;
      if (part.type === 'tool') return `${part.toolName} ${part.status}`;
      return part.type;
    })
    .join(' ').length;
}

/**
 * 计算聊天压缩质量指标。
 * @param input - 指标输入
 * @returns 压缩质量指标
 */
export function createCompressionMetrics(input: CreateCompressionMetricsInput): CompressionMetrics {
  const { record, boundaryText, sourceMessages } = input;
  const generalSummary = toGeneralConversationSummary(record);
  const sourceCharCount = sourceMessages.reduce((total, message) => total + estimateMessageChars(message), 0);
  const boundaryCharCount = boundaryText.length;

  return {
    recordId: record.id,
    schemaVersion: record.schemaVersion,
    sourceMessageCount: sourceMessages.length,
    sourceCharCount,
    boundaryCharCount,
    compressionRatio: sourceCharCount > 0 ? Number((boundaryCharCount / sourceCharCount).toFixed(4)) : 0,
    rawUserRequirementCount: generalSummary.rawUserRequirements.length,
    openLoopCount: generalSummary.openLoops.length
  };
}

/**
 * 格式化压缩指标日志。
 * @param metrics - 压缩质量指标
 * @returns 单行日志文本
 */
export function formatCompressionMetricsLog(metrics: CompressionMetrics): string {
  return [
    '[BChatCompression]',
    `record=${metrics.recordId}`,
    `schema=${metrics.schemaVersion}`,
    `source_messages=${metrics.sourceMessageCount}`,
    `source_chars=${metrics.sourceCharCount}`,
    `boundary_chars=${metrics.boundaryCharCount}`,
    `ratio=${metrics.compressionRatio}`,
    `raw_requirements=${metrics.rawUserRequirementCount}`,
    `open_loops=${metrics.openLoopCount}`
  ].join(' ');
}
