/**
 * @file branch.mts
 * @description 聊天会话分支的数据验证、消息克隆与引用重建工具。
 */
import type { AIUsage } from 'types/ai';
import type { ChatMessagePart, ChatMessageRecord, ChatSession } from 'types/chat';
import type { ChatMessageCompactionPart, ChatMessageRuntimeMeta } from 'types/chat-runtime';
import type { CompressionRecord } from 'types/compression';

/**
 * 创建会话分支所需源数据。
 */
export interface CreateSessionBranchInput {
  /** 源会话。 */
  sourceSession: ChatSession;
  /** 已按展示顺序排列的全部源消息。 */
  sourceMessages: ChatMessageRecord[];
  /** 源会话全部压缩记录。 */
  compressionRecords: CompressionRecord[];
  /** 目标已完成助手消息 ID。 */
  targetMessageId: string;
  /** 新会话时间。 */
  now: string;
  /** 唯一 ID 工厂。 */
  createId: () => string;
}

/**
 * 可在单一事务中写入的会话分支数据。
 */
export interface SessionBranchData {
  /** 新会话。 */
  session: ChatSession;
  /** 重建后的消息。 */
  messages: ChatMessageRecord[];
  /** 重建后的压缩记录。 */
  compressionRecords: CompressionRecord[];
}

/**
 * 创建带源数据和本次生成结果冲突检测的 ID 工厂。
 * @param input - 分支源数据与底层 ID 工厂
 * @returns 每次调用生成未被占用的新 ID
 */
function createUniqueId(input: CreateSessionBranchInput): () => string {
  const usedIds = new Set<string>([input.sourceSession.id]);
  for (const message of input.sourceMessages) {
    usedIds.add(message.id);
    for (const part of message.parts) {
      if (part.id) usedIds.add(part.id);
    }
  }
  for (const record of input.compressionRecords) {
    usedIds.add(record.id);
    if (record.recordSetId) usedIds.add(record.recordSetId);
  }

  return (): string => {
    const id = input.createId();
    if (usedIds.has(id)) throw new Error(`会话分支 ID 冲突: ${id}`);
    usedIds.add(id);
    return id;
  };
}

/**
 * 汇总复制消息的 Token 用量。
 * @param messages - 新分支消息
 * @returns 汇总用量，没有用量记录时返回 undefined
 */
function sumUsage(messages: ChatMessageRecord[]): AIUsage | undefined {
  let usage: AIUsage | undefined;

  for (const message of messages) {
    if (!message.usage) continue;
    usage = {
      inputTokens: (usage?.inputTokens ?? 0) + message.usage.inputTokens,
      outputTokens: (usage?.outputTokens ?? 0) + message.usage.outputTokens,
      totalTokens: (usage?.totalTokens ?? 0) + message.usage.totalTokens
    };
  }

  return usage;
}

/**
 * 严格映射消息 ID，避免新分支保留源会话引用。
 * @param messageId - 可选源消息 ID
 * @param messageIds - 消息 ID 映射
 * @param fieldName - 引用字段名称
 * @returns 对应的新消息 ID
 */
function remapMessageId(messageId: string | undefined, messageIds: ReadonlyMap<string, string>, fieldName: string): string | undefined {
  if (!messageId) return undefined;
  const mappedId = messageIds.get(messageId);
  if (!mappedId) throw new Error(`无法重建消息引用 ${fieldName}: ${messageId}`);
  return mappedId;
}

/**
 * 严格映射一组消息 ID。
 * @param sourceIds - 可选源消息 ID 列表
 * @param messageIds - 消息 ID 映射
 * @param fieldName - 引用字段名称
 * @returns 对应的新消息 ID 列表
 */
function remapMessageIds(sourceIds: string[] | undefined, messageIds: ReadonlyMap<string, string>, fieldName: string): string[] | undefined {
  return sourceIds?.map((messageId: string): string => remapMessageId(messageId, messageIds, fieldName) as string);
}

/**
 * 严格映射压缩记录 ID。
 * @param recordId - 可选源记录 ID
 * @param recordIds - 压缩记录 ID 映射
 * @param fieldName - 引用字段名称
 * @returns 对应的新压缩记录 ID
 */
function remapRecordId(recordId: string | undefined, recordIds: ReadonlyMap<string, string>, fieldName: string): string | undefined {
  if (!recordId) return undefined;
  const mappedId = recordIds.get(recordId);
  if (!mappedId) throw new Error(`无法重建压缩记录引用 ${fieldName}: ${recordId}`);
  return mappedId;
}

/**
 * 克隆消息片段并更新压缩边界引用。
 * @param part - 源消息片段
 * @param messageIds - 消息 ID 映射
 * @param recordIds - 压缩记录 ID 映射
 * @param createId - 唯一 ID 工厂
 * @returns 新分支消息片段
 */
function clonePart(
  part: ChatMessagePart,
  messageIds: ReadonlyMap<string, string>,
  recordIds: ReadonlyMap<string, string>,
  createId: () => string
): ChatMessagePart {
  const cloned = structuredClone(part);
  if (cloned.type !== 'compaction') {
    return { ...cloned, id: createId() };
  }

  const compactionPart: ChatMessageCompactionPart = {
    ...cloned,
    id: createId(),
    tailStartMessageId: remapMessageId(cloned.tailStartMessageId, messageIds, 'compaction.tailStartMessageId'),
    recordId: remapRecordId(cloned.recordId, recordIds, 'compaction.recordId'),
    coveredUntilMessageId: remapMessageId(cloned.coveredUntilMessageId, messageIds, 'compaction.coveredUntilMessageId'),
    sourceMessageIds: remapMessageIds(cloned.sourceMessageIds, messageIds, 'compaction.sourceMessageIds')
  };

  return compactionPart;
}

/**
 * 克隆 Runtime 压缩元数据并更新消息引用。
 * @param meta - 源 Runtime 元数据
 * @param messageIds - 消息 ID 映射
 * @returns 新分支 Runtime 元数据
 */
function cloneRuntimeMeta(meta: ChatMessageRuntimeMeta | undefined, messageIds: ReadonlyMap<string, string>): ChatMessageRuntimeMeta | undefined {
  if (!meta) return undefined;
  const cloned = structuredClone(meta);
  if (!cloned.compaction) return cloned;

  return {
    ...cloned,
    compaction: {
      ...cloned.compaction,
      previousSummaryMessageId: remapMessageId(cloned.compaction.previousSummaryMessageId, messageIds, 'meta.compaction.previousSummaryMessageId'),
      hiddenMessageIds: remapMessageIds(cloned.compaction.hiddenMessageIds, messageIds, 'meta.compaction.hiddenMessageIds')
    }
  };
}

/**
 * 克隆单条消息并重建消息、片段和压缩引用。
 * @param message - 源消息
 * @param sessionId - 新会话 ID
 * @param messageId - 新消息 ID
 * @param messageIds - 消息 ID 映射
 * @param recordIds - 压缩记录 ID 映射
 * @param createId - 唯一 ID 工厂
 * @returns 可写入新会话的消息
 */
function cloneMessage(
  message: ChatMessageRecord,
  sessionId: string,
  messageId: string,
  messageIds: ReadonlyMap<string, string>,
  recordIds: ReadonlyMap<string, string>,
  createId: () => string
): ChatMessageRecord {
  const cloned = structuredClone(message);
  const parts = cloned.parts.map((part: ChatMessagePart): ChatMessagePart => clonePart(part, messageIds, recordIds, createId));
  const compression = cloned.compression
    ? {
        ...cloned.compression,
        recordId: remapRecordId(cloned.compression.recordId, recordIds, 'compression.recordId'),
        coveredUntilMessageId: remapMessageId(cloned.compression.coveredUntilMessageId, messageIds, 'compression.coveredUntilMessageId'),
        sourceMessageIds: remapMessageIds(cloned.compression.sourceMessageIds, messageIds, 'compression.sourceMessageIds')
      }
    : undefined;

  return {
    ...cloned,
    id: messageId,
    sessionId,
    parts,
    compression,
    meta: cloneRuntimeMeta(cloned.meta, messageIds),
    runtimeId: undefined,
    parentRuntimeId: undefined
  };
}

/**
 * 收集复制消息引用的压缩记录及其祖先记录。
 * @param messages - 被复制的消息
 * @param compressionRecords - 源会话压缩记录
 * @returns 按源记录顺序排列的记录闭包
 */
function collectCompressionRecords(messages: ChatMessageRecord[], compressionRecords: CompressionRecord[]): CompressionRecord[] {
  const recordsById = new Map(compressionRecords.map((record: CompressionRecord): [string, CompressionRecord] => [record.id, record]));
  const requiredIds = new Set<string>();

  /**
   * 递归加入压缩记录及其派生祖先。
   * @param recordId - 当前压缩记录 ID
   */
  function includeRecord(recordId: string): void {
    if (requiredIds.has(recordId)) return;
    const record = recordsById.get(recordId);
    if (!record) throw new Error(`找不到源会话压缩记录: ${recordId}`);
    requiredIds.add(recordId);
    if (record.derivedFromRecordId) includeRecord(record.derivedFromRecordId);
  }

  for (const message of messages) {
    if (message.compression?.recordId) includeRecord(message.compression.recordId);
    for (const part of message.parts) {
      if (part.type === 'compaction' && part.recordId) includeRecord(part.recordId);
    }
  }

  return compressionRecords.filter((record: CompressionRecord): boolean => requiredIds.has(record.id));
}

/**
 * 克隆压缩记录并更新会话、消息和派生记录引用。
 * @param records - 需要复制的源记录
 * @param sessionId - 新会话 ID
 * @param messageIds - 消息 ID 映射
 * @param recordIds - 记录 ID 映射
 * @param recordSetIds - 记录集合 ID 映射
 * @returns 新分支压缩记录
 */
function cloneCompressionRecords(
  records: CompressionRecord[],
  sessionId: string,
  messageIds: ReadonlyMap<string, string>,
  recordIds: ReadonlyMap<string, string>,
  recordSetIds: ReadonlyMap<string, string>
): CompressionRecord[] {
  return records.map(
    (record: CompressionRecord): CompressionRecord => ({
      ...structuredClone(record),
      id: remapRecordId(record.id, recordIds, 'compressionRecord.id') as string,
      sessionId,
      derivedFromRecordId: remapRecordId(record.derivedFromRecordId, recordIds, 'compressionRecord.derivedFromRecordId'),
      coveredStartMessageId: remapMessageId(record.coveredStartMessageId, messageIds, 'compressionRecord.coveredStartMessageId') as string,
      coveredEndMessageId: remapMessageId(record.coveredEndMessageId, messageIds, 'compressionRecord.coveredEndMessageId') as string,
      coveredUntilMessageId: remapMessageId(record.coveredUntilMessageId, messageIds, 'compressionRecord.coveredUntilMessageId') as string,
      sourceMessageIds: remapMessageIds(record.sourceMessageIds, messageIds, 'compressionRecord.sourceMessageIds') as string[],
      preservedMessageIds: remapMessageIds(record.preservedMessageIds, messageIds, 'compressionRecord.preservedMessageIds') as string[],
      recordSetId: record.recordSetId ? recordSetIds.get(record.recordSetId) : undefined
    })
  );
}

/**
 * 创建独立会话分支所需的完整数据。
 * @param input - 源会话、源消息和 ID 工厂
 * @returns 新会话及其独立消息数据
 */
export function createSessionBranchData(input: CreateSessionBranchInput): SessionBranchData {
  const targetIndex = input.sourceMessages.findIndex((message: ChatMessageRecord): boolean => message.id === input.targetMessageId);
  const targetMessage = input.sourceMessages[targetIndex];
  if (!targetMessage || targetMessage.role !== 'assistant' || targetMessage.finished !== true) {
    throw new Error('无法从该助手消息创建会话分支');
  }

  const createId = createUniqueId(input);
  const sessionId = createId();
  const sourceMessages = input.sourceMessages.slice(0, targetIndex + 1);
  const messageIds = new Map(sourceMessages.map((message: ChatMessageRecord): [string, string] => [message.id, createId()]));
  const requiredCompressionRecords = collectCompressionRecords(sourceMessages, input.compressionRecords);
  const recordIds = new Map(requiredCompressionRecords.map((record: CompressionRecord): [string, string] => [record.id, createId()]));
  const recordSetIds = new Map<string, string>();
  for (const record of requiredCompressionRecords) {
    if (record.recordSetId && !recordSetIds.has(record.recordSetId)) recordSetIds.set(record.recordSetId, createId());
  }
  const messages = sourceMessages.map(
    (message: ChatMessageRecord): ChatMessageRecord => cloneMessage(message, sessionId, messageIds.get(message.id) as string, messageIds, recordIds, createId)
  );
  const compressionRecords = cloneCompressionRecords(requiredCompressionRecords, sessionId, messageIds, recordIds, recordSetIds);
  const session: ChatSession = {
    id: sessionId,
    type: input.sourceSession.type,
    title: input.sourceSession.title,
    createdAt: input.now,
    updatedAt: input.now,
    lastMessageAt: input.now,
    usage: sumUsage(messages)
  };

  return { session, messages, compressionRecords };
}
