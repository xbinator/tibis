/**
 * @file branch.mts
 * @description 聊天会话分支的数据验证、消息克隆与引用重建工具。
 */
import type { AIUsage } from 'types/ai';
import type { ChatMessageCompactionPart, ChatMessagePart, ChatMessageRecord, ChatSession, StructuredContextSummary } from 'types/chat';
import { buildSourceFingerprint, createFingerprintInput } from './compaction/fingerprint.mjs';
import { indexMessageParts, removeInvalidCheckpoints } from './compaction/topology.mjs';

/** 分支标题末尾的全角括号序号。 */
const BRANCH_TITLE_SUFFIX_RE = /^(.*)（(\d+)）$/u;

/**
 * 创建会话分支所需源数据。
 */
export interface CreateSessionBranchInput {
  /** 源会话。 */
  sourceSession: ChatSession;
  /** 已按展示顺序排列的全部源消息。 */
  sourceMessages: ChatMessageRecord[];
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
}

/**
 * 创建下一个分支标题，仅递增标题末尾的全角括号数字。
 * @param sourceTitle - 源会话标题
 * @returns 带递增分支序号的新标题
 */
export function createBranchTitle(sourceTitle: string): string {
  const match = sourceTitle.match(BRANCH_TITLE_SUFFIX_RE);
  if (!match) return `${sourceTitle}（2）`;

  const currentSequence = Number.parseInt(match[2], 10);
  return `${match[1]}（${currentSequence + 1}）`;
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
 * 重写结构化摘要中的所有证据 Part 引用，同时保留业务 identity。
 * @param summary - 源结构化摘要
 * @param partIds - 源 Part 到分支 Part 的映射
 * @returns 引用已重写的摘要
 */
function rewriteSummarySources(summary: StructuredContextSummary, partIds: ReadonlyMap<string, string>): StructuredContextSummary {
  const cloned = structuredClone(summary);
  const sources: Array<{ sourcePartIds: string[] }> = [
    ...cloned.objectives,
    ...cloned.facts,
    ...cloned.artifacts,
    ...cloned.completedActions,
    ...cloned.pendingActions,
    ...cloned.openQuestions,
    ...cloned.failures
  ];
  for (const source of sources) {
    // 缺失引用保留原 ID，后续统一拓扑校验会移除该 checkpoint 及其后代。
    source.sourcePartIds = source.sourcePartIds.map((sourcePartId: string): string => partIds.get(sourcePartId) ?? sourcePartId);
  }

  return cloned;
}

/**
 * 重写 checkpoint 中所有 Part 引用并丢弃不能复制的旧指纹。
 * @param part - 源 checkpoint
 * @param partIds - 源 Part 到分支 Part 的映射
 * @returns 待重新计算指纹的 checkpoint
 */
function rewriteCheckpoint(part: ChatMessageCompactionPart, partIds: ReadonlyMap<string, string>): ChatMessageCompactionPart {
  const rewritten = structuredClone(part);
  rewritten.boundaryPartId = part.boundaryPartId ? partIds.get(part.boundaryPartId) ?? part.boundaryPartId : undefined;
  rewritten.parentCheckpointId = part.parentCheckpointId ? partIds.get(part.parentCheckpointId) ?? part.parentCheckpointId : undefined;
  rewritten.summary = part.summary ? rewriteSummarySources(part.summary, partIds) : undefined;
  rewritten.sourceFingerprint = undefined;

  return rewritten;
}

/**
 * 克隆消息片段并使用预分配 ID 重写内部引用。
 * @param part - 源消息片段
 * @param partIds - 源 Part 到分支 Part 的映射
 * @returns 新分支消息片段
 */
function clonePart(part: ChatMessagePart, partIds: ReadonlyMap<string, string>): ChatMessagePart {
  const cloned = structuredClone(part);
  const id = partIds.get(part.id);
  if (!id) throw new Error(`会话分支缺少 Part ID 映射: ${part.id}`);
  const rewritten = part.type === 'compaction' ? rewriteCheckpoint(part, partIds) : cloned;

  return { ...rewritten, id };
}

/**
 * 克隆单条消息并重建消息与片段引用。
 * @param message - 源消息
 * @param sessionId - 新会话 ID
 * @param messageId - 新消息 ID
 * @param partIds - 源 Part 到分支 Part 的映射
 * @returns 可写入新会话的消息
 */
function cloneMessage(message: ChatMessageRecord, sessionId: string, messageId: string, partIds: ReadonlyMap<string, string>): ChatMessageRecord {
  const cloned = structuredClone(message);
  const parts = cloned.parts.map((part: ChatMessagePart): ChatMessagePart => clonePart(part, partIds));

  return {
    ...cloned,
    id: messageId,
    sessionId,
    parts,
    runtimeId: undefined,
    parentRuntimeId: undefined
  };
}

/**
 * 使用分支后的实际消息、Part ID 和保存快照重新计算全部可重建指纹。
 * @param messages - 已完成 ID 与引用重写的分支消息
 */
function recomputeFingerprints(messages: ChatMessageRecord[]): void {
  const positions = indexMessageParts(messages);
  const positionsById = new Map(
    positions.map((position, absoluteIndex): [string, { absoluteIndex: number; part: ChatMessagePart }] => [
      position.part.id,
      { absoluteIndex, part: position.part }
    ])
  );

  for (const [checkpointIndex, position] of positions.entries()) {
    const checkpoint = position.part;
    if (checkpoint.type !== 'compaction' || !checkpoint.boundaryPartId || !checkpoint.modelSnapshot || !checkpoint.budgetSnapshot) continue;
    const boundary = positionsById.get(checkpoint.boundaryPartId);
    if (!boundary || boundary.absoluteIndex >= checkpointIndex) continue;

    let sourceStartIndex = -1;
    if (checkpoint.parentCheckpointId) {
      const parentPosition = positionsById.get(checkpoint.parentCheckpointId);
      const parent = parentPosition?.part;
      if (!parent || parent.type !== 'compaction' || parent.status !== 'success' || !parent.boundaryPartId) continue;
      const parentBoundary = positionsById.get(parent.boundaryPartId);
      if (!parentBoundary) continue;
      sourceStartIndex = parentBoundary.absoluteIndex;
    }

    const sources = positions
      .slice(sourceStartIndex + 1, boundary.absoluteIndex + 1)
      .filter((source): boolean => source.part.type !== 'compaction')
      .map((source): { messageId: string; part: ChatMessagePart } => ({ messageId: source.messageId, part: source.part }));
    checkpoint.sourceFingerprint = buildSourceFingerprint(
      createFingerprintInput({
        modelSnapshot: checkpoint.modelSnapshot,
        budgetSnapshot: checkpoint.budgetSnapshot,
        parentCheckpointId: checkpoint.parentCheckpointId,
        boundaryPartId: checkpoint.boundaryPartId,
        sources
      })
    );
  }
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
  const partIds = new Map(
    sourceMessages.flatMap(
      (message: ChatMessageRecord): Array<[string, string]> => message.parts.map((part: ChatMessagePart): [string, string] => [part.id, createId()])
    )
  );
  const clonedMessages = sourceMessages.map((message: ChatMessageRecord): ChatMessageRecord => {
    const messageId = messageIds.get(message.id);
    if (!messageId) throw new Error(`会话分支缺少消息 ID 映射: ${message.id}`);
    return cloneMessage(message, sessionId, messageId, partIds);
  });
  recomputeFingerprints(clonedMessages);
  const messages = removeInvalidCheckpoints(clonedMessages);
  const session: ChatSession = {
    id: sessionId,
    type: input.sourceSession.type,
    title: createBranchTitle(input.sourceSession.title),
    createdAt: input.now,
    updatedAt: input.now,
    lastMessageAt: input.now,
    usage: sumUsage(messages)
  };

  return { session, messages };
}
