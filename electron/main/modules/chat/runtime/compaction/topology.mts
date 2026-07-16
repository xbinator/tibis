/**
 * @file topology.mts
 * @description 上下文压缩 Part 索引、依赖闭包校验与无效 checkpoint 清理。
 */
import type { ChatMessageCompactionPart, ChatMessagePart, ChatMessageRecord, StructuredContextSummary } from 'types/chat';
import { isImmutablePart } from './boundary.mjs';
import { validateCheckpoint } from './checkpoint.mjs';

/**
 * 带消息位置的 Part 索引。
 */
export interface IndexedChatPart {
  /** Part 所属消息标识。 */
  messageId: string;
  /** Part 所属消息索引。 */
  messageIndex: number;
  /** Part 在消息中的索引。 */
  partIndex: number;
  /** 原始 Part。 */
  part: ChatMessagePart;
}

/** checkpoint 拓扑错误码。 */
export type TopologyErrorCode = 'DUPLICATE_PART_ID' | 'INVALID_CHECKPOINT' | 'INVALID_BOUNDARY' | 'INVALID_PARENT' | 'INVALID_EVIDENCE';

/**
 * checkpoint 拓扑错误。
 */
export interface TopologyError {
  /** 无效 checkpoint 标识。 */
  checkpointId: string;
  /** 稳定错误码。 */
  code: TopologyErrorCode;
  /** 关联依赖 Part 标识。 */
  dependencyPartId?: string;
}

/**
 * Part 拓扑校验结果。
 */
export interface TopologyResult {
  /** 依赖闭包完整的成功 checkpoint。 */
  validCheckpointIds: Set<string>;
  /** 依赖缺失或顺序错误的成功 checkpoint。 */
  invalidCheckpointIds: Set<string>;
  /** 具体拓扑错误。 */
  errors: TopologyError[];
}

/**
 * 内部 Part 位置。
 */
interface PartPosition extends IndexedChatPart {
  /** 跨消息的全局 Part 顺序。 */
  absoluteIndex: number;
  /** Part 所属消息。 */
  message: ChatMessageRecord;
}

/**
 * 将消息展开为稳定 Part 索引。
 * @param messages - 原始消息
 * @returns 按拓扑顺序排列的 Part 索引
 */
export function indexMessageParts(messages: readonly ChatMessageRecord[]): IndexedChatPart[] {
  return messages.flatMap((message: ChatMessageRecord, messageIndex: number): IndexedChatPart[] =>
    message.parts.map((part: ChatMessagePart, partIndex: number): IndexedChatPart => ({ messageId: message.id, messageIndex, partIndex, part }))
  );
}

/**
 * 创建包含全局顺序和所属消息的内部索引。
 * @param messages - 原始消息
 * @returns 内部 Part 索引
 */
function createPartPositions(messages: readonly ChatMessageRecord[]): PartPosition[] {
  return indexMessageParts(messages).map(
    (indexed: IndexedChatPart, absoluteIndex: number): PartPosition => ({
      ...indexed,
      absoluteIndex,
      message: messages[indexed.messageIndex]
    })
  );
}

/**
 * 收集摘要中的全部证据 Part 标识。
 * @param summary - 结构化摘要
 * @returns 去重后的证据 Part 标识
 */
function collectEvidenceIds(summary: StructuredContextSummary): string[] {
  const sources = [
    ...summary.objectives,
    ...summary.facts,
    ...summary.artifacts,
    ...summary.completedActions,
    ...summary.pendingActions,
    ...summary.openQuestions,
    ...summary.failures
  ];

  return [...new Set(sources.flatMap((source): string[] => source.sourcePartIds))];
}

/**
 * 记录 checkpoint 错误并标记无效。
 * @param result - 当前校验结果
 * @param checkpointId - checkpoint 标识
 * @param code - 错误码
 * @param dependencyPartId - 关联依赖标识
 */
function addTopologyError(result: TopologyResult, checkpointId: string, code: TopologyErrorCode, dependencyPartId?: string): void {
  result.invalidCheckpointIds.add(checkpointId);
  result.errors.push({ checkpointId, code, dependencyPartId });
}

/**
 * 校验成功 checkpoint 的 boundary。
 * @param checkpoint - 成功 checkpoint
 * @param checkpointPosition - checkpoint 位置
 * @param positionsById - Part 位置索引
 * @returns boundary 位置，非法时返回 undefined
 */
function validateBoundary(
  checkpoint: ChatMessageCompactionPart & { status: 'success' },
  checkpointPosition: PartPosition,
  positionsById: ReadonlyMap<string, PartPosition>
): PartPosition | undefined {
  const boundary = checkpoint.boundaryPartId ? positionsById.get(checkpoint.boundaryPartId) : undefined;
  if (!boundary || boundary.absoluteIndex >= checkpointPosition.absoluteIndex || !isImmutablePart(boundary.part, boundary.message)) return undefined;

  return boundary;
}

/**
 * 校验所有成功 checkpoint 的依赖闭包。
 * @param messages - 按展示顺序排列的完整消息
 * @returns checkpoint 拓扑结果
 */
export function validatePartTopology(messages: readonly ChatMessageRecord[]): TopologyResult {
  const result: TopologyResult = {
    validCheckpointIds: new Set<string>(),
    invalidCheckpointIds: new Set<string>(),
    errors: []
  };
  const positions = createPartPositions(messages);
  const positionsById = new Map<string, PartPosition>();
  const duplicateIds = new Set<string>();

  for (const position of positions) {
    if (positionsById.has(position.part.id)) duplicateIds.add(position.part.id);
    else positionsById.set(position.part.id, position);
  }

  for (const position of positions) {
    const checkpoint = position.part;
    if (checkpoint.type !== 'compaction' || checkpoint.status !== 'success') continue;
    const successCheckpoint = checkpoint as ChatMessageCompactionPart & { status: 'success' };
    if (duplicateIds.has(checkpoint.id)) {
      addTopologyError(result, checkpoint.id, 'DUPLICATE_PART_ID', checkpoint.id);
      continue;
    }
    if (!validateCheckpoint(checkpoint).ok) {
      addTopologyError(result, checkpoint.id, 'INVALID_CHECKPOINT');
      continue;
    }

    const boundary = validateBoundary(successCheckpoint, position, positionsById);
    if (!boundary) {
      addTopologyError(result, checkpoint.id, 'INVALID_BOUNDARY', checkpoint.boundaryPartId);
      continue;
    }

    if (checkpoint.parentCheckpointId) {
      const parent = positionsById.get(checkpoint.parentCheckpointId);
      const validParent =
        parent?.part.type === 'compaction' &&
        parent.part.status === 'success' &&
        parent.absoluteIndex < position.absoluteIndex &&
        result.validCheckpointIds.has(parent.part.id);
      if (!validParent) {
        addTopologyError(result, checkpoint.id, 'INVALID_PARENT', checkpoint.parentCheckpointId);
        continue;
      }
    }

    const invalidEvidenceId = collectEvidenceIds(checkpoint.summary as StructuredContextSummary).find((partId: string): boolean => {
      const evidence = positionsById.get(partId);
      return !evidence || evidence.absoluteIndex > boundary.absoluteIndex || !isImmutablePart(evidence.part, evidence.message);
    });
    if (invalidEvidenceId) {
      addTopologyError(result, checkpoint.id, 'INVALID_EVIDENCE', invalidEvidenceId);
      continue;
    }

    result.validCheckpointIds.add(checkpoint.id);
  }

  return result;
}

/**
 * 从消息 clone 中移除依赖不完整的成功 checkpoint。
 * @param messages - 原始消息
 * @returns 不修改输入的拓扑安全消息 clone
 */
export function removeInvalidCheckpoints(messages: readonly ChatMessageRecord[]): ChatMessageRecord[] {
  const { invalidCheckpointIds } = validatePartTopology(messages);

  return messages.map(
    (message: ChatMessageRecord): ChatMessageRecord => ({
      ...structuredClone(message),
      parts: message.parts
        .filter((part: ChatMessagePart): boolean => !invalidCheckpointIds.has(part.id))
        .map((part: ChatMessagePart): ChatMessagePart => structuredClone(part))
    })
  );
}
