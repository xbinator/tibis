/**
 * @file summaryAdapter.ts
 * @description 将不同版本的压缩摘要转换为通用长聊天摘要视图。
 */
import type { CompressionRecord, GeneralConversationSummary, StructuredConversationSummary } from './types';

/**
 * 判断摘要列表项是否为用户原始需求。
 * @param value - 摘要列表项
 * @returns 是否为用户原始需求
 */
function isRawRequirement(value: string): boolean {
  return value.startsWith('用户原始需求：');
}

/**
 * 移除用户原始需求前缀。
 * @param value - 摘要列表项
 * @returns 去掉前缀后的文本
 */
function stripRawRequirementPrefix(value: string): string {
  return value.replace(/^用户原始需求：/, '').trim();
}

/**
 * 从 v2 摘要构建 v3 对话连续性字段。
 * @param summary - v2 结构化摘要
 * @returns 对话连续性列表
 */
function buildConversationContinuity(summary: StructuredConversationSummary): string[] {
  return [summary.goal, summary.recentTopic].filter((item) => item.trim().length > 0);
}

/**
 * 将 v2 结构化摘要转换为 v3 通用摘要视图。
 * @param summary - v2 结构化摘要
 * @returns v3 通用摘要视图
 */
export function fromStructuredConversationSummary(summary: StructuredConversationSummary): GeneralConversationSummary {
  return {
    conversationContinuity: buildConversationContinuity(summary),
    goal: summary.goal,
    recentTopic: summary.recentTopic,
    userPreferences: summary.userPreferences,
    constraints: summary.constraints,
    decisions: summary.decisions,
    criticalFacts: summary.importantFacts.filter((item) => !isRawRequirement(item)),
    rawUserRequirements: summary.importantFacts.filter(isRawRequirement).map(stripRawRequirementPrefix),
    openLoops: [...summary.openQuestions, ...summary.pendingActions],
    recentDirection: summary.recentTopic ? [summary.recentTopic] : [],
    fileContext: summary.fileContext
  };
}

/**
 * 获取压缩记录的通用摘要视图。
 * @param record - 压缩记录或压缩记录视图
 * @returns v3 通用摘要视图
 */
export function toGeneralConversationSummary(record: Pick<CompressionRecord, 'structuredSummary' | 'generalSummary'>): GeneralConversationSummary {
  if (record.generalSummary) {
    return record.generalSummary;
  }

  return fromStructuredConversationSummary(record.structuredSummary);
}
