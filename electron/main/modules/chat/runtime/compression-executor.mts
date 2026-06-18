/**
 * @file compression-executor.mts
 * @description ChatRuntime 主进程压缩记录执行器。
 */
import type { RuntimeCompressionExecutor } from './compaction.mjs';
import type { RuntimeStructuredSummaryGenerator, RuntimeTrimmedMessageItem } from './structured-summary-generator.mjs';
import type { ChatMessageRecord } from 'types/chat';
import type { CompressionRecord, CompressionRecordStorage, StructuredConversationSummary } from 'types/compression';
import { createRuntimeStructuredSummaryGenerator } from './structured-summary-generator.mjs';

/** 当前压缩记录 schema 版本。 */
const CURRENT_SCHEMA_VERSION = 3;

/** Runtime 压缩执行器配置。 */
export interface RuntimeCompressionExecutorOptions {
  /** 结构化摘要生成器。 */
  summaryGenerator?: RuntimeStructuredSummaryGenerator;
}

/**
 * 获取可进入压缩记录的模型消息。
 * @param messages - 原始消息列表
 * @returns user/assistant 消息列表
 */
function getModelMessages(messages: ChatMessageRecord[]): ChatMessageRecord[] {
  return messages.filter((message) => message.role === 'user' || message.role === 'assistant');
}

/**
 * 提取用户原始需求文本。
 * @param messages - 模型消息列表
 * @returns 用户需求文本列表
 */
/**
 * 生成可读压缩摘要文本。
 * @param summary - 结构化摘要
 * @returns 摘要文本
 */
function createSummaryText(summary: StructuredConversationSummary): string {
  const parts: string[] = [`目标：${summary.goal}`, `话题：${summary.recentTopic}`];

  if (summary.importantFacts.length) {
    parts.push(`重要事实：${summary.importantFacts.join('、')}`);
  }

  if (summary.pendingActions.length) {
    parts.push(`待处理操作：${summary.pendingActions.join('、')}`);
  }

  return parts.join('\n');
}

/**
 * 估算消息字符快照。
 * @param messages - 模型消息列表
 * @returns 字符数量
 */
function countMessageChars(messages: ChatMessageRecord[]): number {
  return messages.reduce((total, message) => total + message.content.length, 0);
}

/**
 * 将聊天消息转换为摘要生成器输入项。
 * @param messages - 模型消息列表
 * @returns 摘要生成输入项
 */
function toTrimmedItems(messages: ChatMessageRecord[]): RuntimeTrimmedMessageItem[] {
  return messages.map((message) => ({
    messageId: message.id,
    role: message.role as 'user' | 'assistant',
    trimmedText: message.content
  }));
}

/**
 * 创建主进程压缩执行器。
 * @param storage - 压缩记录存储层
 * @returns 压缩执行器
 */
export function createRuntimeCompressionExecutor(
  storage: CompressionRecordStorage,
  options: RuntimeCompressionExecutorOptions = {}
): RuntimeCompressionExecutor {
  const summaryGenerator = options.summaryGenerator ?? createRuntimeStructuredSummaryGenerator();

  return {
    async compressSessionManually(input: { sessionId: string; messages: ChatMessageRecord[]; signal?: AbortSignal }): Promise<CompressionRecord | undefined> {
      if (input.signal?.aborted) return undefined;

      const modelMessages = getModelMessages(input.messages);
      if (!modelMessages.length) return undefined;

      const currentRecord = await storage.getLatestValidRecord(input.sessionId);
      if (input.signal?.aborted) return undefined;

      const firstMessage = modelMessages[0];
      const lastMessage = modelMessages[modelMessages.length - 1];
      const structuredSummary = await summaryGenerator.generate({
        items: toTrimmedItems(modelMessages),
        previousRecord: currentRecord
          ? {
              recordText: currentRecord.recordText,
              structuredSummary: currentRecord.structuredSummary,
              generalSummary: currentRecord.generalSummary
            }
          : undefined
      });
      const record = await storage.createRecord({
        sessionId: input.sessionId,
        buildMode: 'full_rebuild',
        derivedFromRecordId: currentRecord?.id,
        coveredStartMessageId: firstMessage.id,
        coveredEndMessageId: lastMessage.id,
        coveredUntilMessageId: lastMessage.id,
        sourceMessageIds: modelMessages.map((message) => message.id),
        preservedMessageIds: [],
        recordText: createSummaryText(structuredSummary),
        structuredSummary,
        triggerReason: 'manual',
        messageCountSnapshot: Math.ceil(modelMessages.length / 2),
        charCountSnapshot: countMessageChars(modelMessages),
        schemaVersion: CURRENT_SCHEMA_VERSION,
        status: 'valid',
        invalidReason: undefined
      });

      if (currentRecord && currentRecord.id !== record.id) {
        await storage.updateRecordStatus(currentRecord.id, 'superseded');
      }

      return record;
    }
  };
}
