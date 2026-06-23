/**
 * @file compaction.mts
 * @description ChatRuntime 主进程上下文压缩消息生命周期服务。
 */
import type { ChatRuntimeEventEmitter } from '../types.mjs';
import type { ChatMessageRecord, ChatMessageToolPart } from 'types/chat';
import type { ChatMessageCompactionPart, ChatRuntimeCompactInput, ChatRuntimeCompactResult } from 'types/chat-runtime';
import type { CompressionRecord, GeneralConversationSummary, StructuredConversationSummary } from 'types/compression';
import { nanoid } from 'nanoid';

/** tail 预算占模型上下文窗口比例。 */
const TAIL_CONTEXT_WINDOW_RATIO = 0.25;

/** tail 预算下限。 */
const MIN_TAIL_BUDGET_TOKENS = 2_000;

/** tail 预算上限。 */
const MAX_TAIL_BUDGET_TOKENS = 8_000;

/** 至少保留最近用户轮数。 */
const MIN_RECENT_USER_TURNS = 2;

/** tail 吃空时，单轮消息达到该估算 token 数才回退压缩完整模型快照。 */
const MIN_FALLBACK_COMPRESSION_TOKENS = 800;

/** 压缩上下文内保留的关键工具结果最大数量。 */
const MAX_KEY_TOOL_RESULT_CONTEXT_COUNT = 5;

/** 对继续任务有高价值的工具结果名称片段。 */
const KEY_TOOL_RESULT_NAME_PATTERNS = ['read', 'write', 'edit', 'file', 'reference', 'ask_user', 'choice', 'settings'];

/** 短内容无需压缩时的用户可见提示。 */
const SKIPPED_COMPRESSION_CONTENT = '内容较少，无需压缩';

/** Runtime 压缩执行器。 */
export interface RuntimeCompressionExecutor {
  /**
   * 手动方式压缩会话消息。
   * @param input - 会话、消息与取消信号
   * @returns 新压缩记录，无可压缩内容时返回 undefined
   */
  compressSessionManually(input: { sessionId: string; messages: ChatMessageRecord[]; signal?: AbortSignal }): Promise<CompressionRecord | undefined>;
}

/** Runtime compaction 服务依赖项。 */
export interface RuntimeCompactionServiceDependencies {
  /** 发送 runtime 事件。 */
  emit: ChatRuntimeEventEmitter;
  /** 持久化新建压缩消息。 */
  persistMessage: (message: ChatMessageRecord) => Promise<void> | void;
  /** 持久化更新后的压缩消息。 */
  updateMessage: (message: ChatMessageRecord) => Promise<void> | void;
  /** 压缩执行器。 */
  compressor: RuntimeCompressionExecutor;
  /** 创建消息 ID。 */
  createMessageId?: () => string;
  /** 获取当前 ISO 时间。 */
  now?: () => string;
  /** 渲染压缩边界文本。 */
  renderBoundary?: (record: CompressionRecord, sourceMessages: ChatMessageRecord[]) => string;
}

/** Runtime 压缩请求。 */
export type RuntimeCompactRequest = ChatRuntimeCompactInput & {
  /** 取消信号。 */
  signal?: AbortSignal;
};

/** Runtime compaction 服务。 */
export interface RuntimeCompactionService {
  /**
   * 执行一次上下文压缩。
   * @param input - 压缩命令参数
   * @returns 压缩结果
   */
  compact(input: RuntimeCompactRequest): Promise<ChatRuntimeCompactResult>;
}

/** Runtime 模型消息。 */
type RuntimeModelMessageRecord = ChatMessageRecord & { role: 'user' | 'assistant' };

/** 压缩源消息选择结果。 */
type CompressionSourceSelection =
  | {
      /** 应继续执行压缩。 */
      status: 'compress';
      /** 本次实际进入压缩执行器的消息列表。 */
      messages: ChatMessageRecord[];
    }
  | {
      /** 应跳过压缩并展示友好提示。 */
      status: 'skipped';
      /** 跳过原因。 */
      reason: 'not_enough_content';
    };

/** 压缩状态更新目标。 */
type CompressionStatusTarget =
  | {
      /** 使用独立 compression 消息展示状态。 */
      kind: 'message';
      /** compression 消息 ID。 */
      messageId: string;
      /** compression 消息创建时间。 */
      createdAt: string;
    }
  | {
      /** 使用当前 assistant 的 compaction part 展示状态。 */
      kind: 'part';
      /** 目标 assistant 消息。 */
      message: ChatMessageRecord;
    };

/** 最近成功压缩边界。 */
type SuccessfulCompressionBoundary =
  | {
      /** 独立 compression 消息边界。 */
      kind: 'message';
      /** 边界消息索引。 */
      index: number;
    }
  | {
      /** assistant 消息内 compaction part 边界。 */
      kind: 'part';
      /** 持有边界 part 的消息索引。 */
      index: number;
      /** 持有边界 part 的消息。 */
      message: ChatMessageRecord;
      /** 边界 part 索引。 */
      partIndex: number;
    };

/**
 * 渲染 Markdown bullet 列表。
 * @param values - 列表项
 * @returns Markdown bullet 列表
 */
function renderBullets(values: string[]): string {
  if (!values.length) return '- (none)';

  return values.map((value) => `- ${value}`).join('\n');
}

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
 * 将旧结构化摘要转换为通用摘要视图。
 * @param summary - 结构化摘要
 * @returns 通用长聊天摘要视图
 */
function fromStructuredConversationSummary(summary: StructuredConversationSummary): GeneralConversationSummary {
  return {
    conversationContinuity: [summary.goal, summary.recentTopic].filter((item) => item.trim().length > 0),
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
 * 获取通用摘要视图。
 * @param record - 压缩记录
 * @returns 通用摘要视图
 */
function toGeneralConversationSummary(record: CompressionRecord): GeneralConversationSummary {
  return record.generalSummary ?? fromStructuredConversationSummary(record.structuredSummary);
}

/**
 * 格式化文件上下文。
 * @param fileContext - 文件上下文摘要
 * @returns Markdown bullet 列表项
 */
function renderFileContext(fileContext: GeneralConversationSummary['fileContext']): string[] {
  return fileContext.map((item) => {
    const lineRange = item.startLine ? `:${item.startLine}-${item.endLine ?? item.startLine}` : '';
    const reloadHint = item.shouldReloadOnDemand ? 'yes' : 'no';
    return `${item.filePath}${lineRange} - intent: ${item.userIntent}; summary: ${item.keySnippetSummary}; reload_on_demand: ${reloadHint}`;
  });
}

/**
 * 判断通用摘要是否包含可渲染信息。
 * @param summary - 通用摘要视图
 * @returns 是否有内容
 */
function hasGeneralSummaryContent(summary: GeneralConversationSummary): boolean {
  return Boolean(
    summary.conversationContinuity.length ||
      summary.goal.trim() ||
      summary.recentTopic.trim() ||
      summary.userPreferences.length ||
      summary.constraints.length ||
      summary.decisions.length ||
      summary.criticalFacts.length ||
      summary.rawUserRequirements.length ||
      summary.openLoops.length ||
      summary.recentDirection.length ||
      summary.fileContext.length
  );
}

/**
 * 将工具结果数据压缩为短文本。
 * @param data - 工具结果数据
 * @returns 工具结果摘要
 */
function summarizeToolResultData(data: unknown): string {
  if (typeof data === 'string') return data.slice(0, 400);
  if (!data || typeof data !== 'object') return String(data ?? '');

  const source = data as Record<string, unknown>;
  const preferred = [source.path, source.filePath, source.summary, source.message, source.error, source.status].filter(
    (item): item is string => typeof item === 'string' && item.trim().length > 0
  );

  if (preferred.length) return preferred.join('; ').slice(0, 400);

  try {
    return JSON.stringify(data).slice(0, 400);
  } catch {
    return '[unserializable tool result]';
  }
}

/**
 * 判断工具结果是否值得作为压缩上下文中的关键事实保留。
 * @param part - 工具结果片段
 * @returns 是否保留该工具结果摘要
 */
function isKeyToolResult(part: ChatMessageToolPart): boolean {
  const toolName = part.toolName.toLowerCase();
  return KEY_TOOL_RESULT_NAME_PATTERNS.some((pattern) => toolName.includes(pattern));
}

/**
 * 从被压缩消息中提取关键工具结果摘要。
 * @param sourceMessages - 进入压缩的源消息
 * @returns 工具结果摘要列表
 */
function extractKeyToolResultContext(sourceMessages: ChatMessageRecord[]): string[] {
  const results: string[] = [];

  for (const sourceMessage of sourceMessages) {
    for (const part of sourceMessage.parts) {
      if (part.type !== 'tool' || !part.result || !isKeyToolResult(part)) continue;

      results.push(`tool: ${part.toolName}; status: ${part.result.status}; result: ${summarizeToolResultData(part.result.data)}`);
      if (results.length >= MAX_KEY_TOOL_RESULT_CONTEXT_COUNT) return results;
    }
  }

  return results;
}

/**
 * 渲染压缩记录为模型可读的 Markdown 交接稿。
 * @param record - 压缩记录
 * @param sourceMessages - 本次进入压缩的源消息
 * @returns Markdown 压缩上下文
 */
export function renderRuntimeCompressionBoundary(record: CompressionRecord, sourceMessages: ChatMessageRecord[] = []): string {
  const summary = toGeneralConversationSummary(record);
  const summarySnapshot = !hasGeneralSummaryContent(summary) && record.recordText.trim() ? [record.recordText.trim()] : [];
  const continuity = summary.conversationContinuity.length
    ? summary.conversationContinuity
    : [summary.goal, summary.recentTopic].filter((item) => item.trim().length > 0);
  const keyToolResults = extractKeyToolResultContext(sourceMessages);

  return [
    'COMPRESSED_CONTEXT',
    '以下内容是较早对话的压缩记忆，用于保持连续性。请把它当作历史事实和对话状态，不要向用户复述这段说明。',
    '',
    ...(summarySnapshot.length ? ['## Summary Snapshot', renderBullets(summarySnapshot), ''] : []),
    '## Conversation Continuity',
    renderBullets(continuity),
    '',
    '## User Preferences',
    renderBullets(summary.userPreferences),
    '',
    '## Constraints',
    renderBullets(summary.constraints),
    '',
    '## Key Decisions',
    renderBullets(summary.decisions),
    '',
    '## Critical Facts',
    renderBullets(summary.criticalFacts),
    '',
    '## Raw User Requirements',
    renderBullets(summary.rawUserRequirements),
    '',
    '## Open Loops',
    renderBullets(summary.openLoops),
    '',
    '## Recent Direction',
    renderBullets(summary.recentDirection),
    '',
    '## Relevant Files',
    renderBullets(renderFileContext(summary.fileContext)),
    '',
    '## Key Tool Results',
    renderBullets(keyToolResults)
  ].join('\n');
}

/**
 * 计算 tail token 预算。
 * @param contextWindow - 当前模型上下文窗口
 * @returns tail token 预算
 */
function computeTailTokenBudget(contextWindow?: number): number {
  if (!contextWindow || contextWindow <= 0) return MIN_TAIL_BUDGET_TOKENS;

  const proportionalBudget = Math.floor(contextWindow * TAIL_CONTEXT_WINDOW_RATIO);
  return Math.min(MAX_TAIL_BUDGET_TOKENS, Math.max(MIN_TAIL_BUDGET_TOKENS, proportionalBudget));
}

/**
 * 粗略估算单条消息 token 数。
 * @param message - 聊天消息
 * @returns 估算 token 数
 */
function estimateMessageTokens(message: ChatMessageRecord): number {
  if (message.content) return Math.ceil(message.content.length / 2);

  const partsText = message.parts
    .map((part) => {
      if (part.type === 'text') return part.text;
      if (part.type === 'tool') return `${part.toolName} ${part.status}`;
      return part.type;
    })
    .join(' ');

  return Math.ceil(partsText.length / 2);
}

/**
 * 估算消息片段对压缩价值的贡献。
 * @param message - 聊天消息
 * @returns 估算 token 数
 */
function estimateMessagePartsCompressionTokens(message: ChatMessageRecord): number {
  const partTextLength = message.parts.reduce((total, part) => {
    if (part.type === 'text') {
      return total + part.text.length;
    }

    if (part.type === 'thinking') {
      return total + part.thinking.length;
    }

    if (part.type === 'tool') {
      const resultText = part.result ? summarizeToolResultData(part.result.data) : '';
      return total + `${part.toolName} ${part.status} ${resultText}`.length;
    }

    return total + part.type.length;
  }, 0);

  return Math.ceil(partTextLength / 2);
}

/**
 * 估算 tail 吃空时是否值得回退压缩完整模型快照。
 * @param messages - 模型消息列表
 * @returns 估算 token 数
 */
function estimateFallbackCompressionTokens(messages: ChatMessageRecord[]): number {
  return messages.reduce((total, message) => total + Math.max(estimateMessageTokens(message), estimateMessagePartsCompressionTokens(message)), 0);
}

/**
 * 获取可进入模型上下文的 user/assistant 消息。
 * @param messages - 当前完整消息列表
 * @returns 模型消息列表
 */
function getRuntimeModelMessages(messages: ChatMessageRecord[]): RuntimeModelMessageRecord[] {
  return messages.filter((item): item is RuntimeModelMessageRecord => item.role === 'user' || item.role === 'assistant');
}

/**
 * 找到 mandatory tail 起点。
 * @param modelMessages - user/assistant 消息列表
 * @param minRecentUserTurns - 至少保留最近用户轮数
 * @returns 起点索引
 */
function findMandatoryTailStartIndex(modelMessages: ChatMessageRecord[], minRecentUserTurns: number): number {
  let seenUserTurns = 0;

  for (let index = modelMessages.length - 1; index >= 0; index -= 1) {
    if (modelMessages[index].role === 'user') {
      seenUserTurns += 1;
      if (seenUserTurns >= minRecentUserTurns) return index;
    }
  }

  return 0;
}

/**
 * 查找指定索引之前最近的 user turn 起点。
 * @param modelMessages - user/assistant 消息列表
 * @param beforeIndex - 当前 tail 起点索引
 * @returns 上一个 user turn 起点索引
 */
function findPreviousUserTurnStartIndex(modelMessages: ChatMessageRecord[], beforeIndex: number): number {
  for (let index = beforeIndex - 1; index >= 0; index -= 1) {
    if (modelMessages[index].role === 'user') return index;
  }

  return -1;
}

/**
 * 估算消息片段 token 数。
 * @param messages - 消息片段
 * @returns 估算 token 数
 */
function estimateMessagesTokens(messages: ChatMessageRecord[]): number {
  return messages.reduce((total, message) => total + estimateMessageTokens(message), 0);
}

/**
 * 选择压缩时需要原文保留的 tail 消息 ID。
 * @param messages - 当前消息列表
 * @param contextWindow - 当前模型上下文窗口
 * @returns tail 消息 ID 集合
 */
export function selectRuntimeTailPreservedMessageIds(messages: ChatMessageRecord[], contextWindow?: number): Set<string> {
  const modelMessages = getRuntimeModelMessages(messages);
  if (!modelMessages.length) return new Set<string>();

  const budget = computeTailTokenBudget(contextWindow);
  const mandatoryStartIndex = findMandatoryTailStartIndex(modelMessages, MIN_RECENT_USER_TURNS);
  const selectedIndexes = new Set<number>();
  let usedTokens = 0;

  for (let index = mandatoryStartIndex; index < modelMessages.length; index += 1) {
    selectedIndexes.add(index);
    usedTokens += estimateMessageTokens(modelMessages[index]);
  }

  let currentStartIndex = mandatoryStartIndex;
  let candidateStartIndex = findPreviousUserTurnStartIndex(modelMessages, currentStartIndex);

  while (candidateStartIndex >= 0) {
    if (candidateStartIndex === 0) break;

    const candidateMessages = modelMessages.slice(candidateStartIndex, currentStartIndex);
    const candidateTokens = estimateMessagesTokens(candidateMessages);
    if (usedTokens + candidateTokens > budget) break;

    for (let index = candidateStartIndex; index < currentStartIndex; index += 1) {
      selectedIndexes.add(index);
    }
    usedTokens += candidateTokens;
    currentStartIndex = candidateStartIndex;
    candidateStartIndex = findPreviousUserTurnStartIndex(modelMessages, currentStartIndex);
  }

  return new Set([...selectedIndexes].sort((left, right) => left - right).map((index) => modelMessages[index].id));
}

/**
 * 创建手动压缩使用的消息快照。
 * @param messages - 当前完整消息列表
 * @param contextWindow - 当前模型上下文窗口
 * @returns 压缩源消息选择结果
 */
function createCompressionSourceSelection(messages: ChatMessageRecord[], contextWindow?: number): CompressionSourceSelection {
  const preservedIds = selectRuntimeTailPreservedMessageIds(messages, contextWindow);
  if (!preservedIds.size) return { status: 'compress', messages: [...messages] };

  const sourceMessages = messages.filter((item) => !preservedIds.has(item.id));
  const hasSourceModelMessages = sourceMessages.some((item) => item.role === 'user' || item.role === 'assistant');
  if (hasSourceModelMessages) {
    return { status: 'compress', messages: sourceMessages };
  }

  const modelMessages = getRuntimeModelMessages(messages);
  if (!modelMessages.length) {
    return { status: 'compress', messages: sourceMessages };
  }

  if (estimateFallbackCompressionTokens(modelMessages) < MIN_FALLBACK_COMPRESSION_TOKENS) {
    return { status: 'skipped', reason: 'not_enough_content' };
  }

  // 单轮长任务也需要可被压缩；当 tail 策略吃空模型消息时，回退压缩完整模型快照。
  return { status: 'compress', messages: modelMessages };
}

/**
 * 判断消息片段是否为成功 compaction 边界。
 * @param part - 消息片段
 * @returns 是否为成功 compaction 边界
 */
function isSuccessfulCompactionBoundaryPart(part: ChatMessageRecord['parts'][number]): part is ChatMessageCompactionPart {
  return part.type === 'compaction' && part.status === 'success' && Boolean(part.recordText) && Boolean(part.coveredUntilMessageId);
}

/**
 * 查找消息中最后一个成功 compaction 边界。
 * @param message - 聊天消息
 * @returns 成功 compaction 边界索引，不存在时返回 -1
 */
function findLastSuccessfulCompactionPartIndex(message: ChatMessageRecord): number {
  for (let index = message.parts.length - 1; index >= 0; index -= 1) {
    if (isSuccessfulCompactionBoundaryPart(message.parts[index])) {
      return index;
    }
  }

  return -1;
}

/**
 * 查找最新成功压缩边界。
 * @param messages - 消息列表
 * @returns 最新边界
 */
function findLatestCompressionBoundary(messages: ChatMessageRecord[]): SuccessfulCompressionBoundary | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === 'compression' && message.compression?.status === 'success' && message.compression.coveredUntilMessageId) {
      return { kind: 'message', index };
    }

    const partIndex = findLastSuccessfulCompactionPartIndex(message);
    if (partIndex >= 0) {
      return { kind: 'part', index, message, partIndex };
    }
  }

  return undefined;
}

/**
 * 判断 compaction part 之后是否已有新的 assistant 进展。
 * @param message - 持有 compaction part 的消息
 * @param partIndex - compaction part 索引
 * @returns 是否存在新的模型进展
 */
function hasModelProgressAfterCompactionPart(message: ChatMessageRecord, partIndex: number): boolean {
  return message.parts.slice(partIndex + 1).some((part) => part.type !== 'compaction');
}

/**
 * 判断最新压缩边界之后是否没有新增模型消息。
 * @param messages - 消息列表
 * @returns 没有新增 user/assistant 消息时返回 true
 */
function isAlreadyCompactWithoutNewModelMessages(messages: ChatMessageRecord[]): boolean {
  const boundary = findLatestCompressionBoundary(messages);
  if (!boundary) return false;

  if (boundary.kind === 'part' && hasModelProgressAfterCompactionPart(boundary.message, boundary.partIndex)) {
    return false;
  }

  return !messages.slice(boundary.index + 1).some((item) => item.role === 'user' || item.role === 'assistant');
}

/**
 * 创建压缩状态消息。
 * @param input - 压缩消息输入
 * @returns 压缩消息
 */
function createCompressionMessage(input: {
  id: string;
  sessionId: string;
  runtimeId: string;
  agentId: string;
  content: string;
  status: 'pending' | 'success' | 'failed' | 'cancelled' | 'skipped';
  createdAt: string;
  record?: CompressionRecord;
  sourceMessageIds?: string[];
  errorMessage?: string;
}): ChatMessageRecord {
  return {
    id: input.id,
    sessionId: input.sessionId,
    role: 'compression',
    content: input.content,
    parts: input.content ? [{ type: 'text', text: input.content }] : [],
    createdAt: input.createdAt,
    loading: input.status === 'pending',
    finished: input.status !== 'pending',
    runtimeId: input.runtimeId,
    agentId: input.agentId,
    summary: input.status === 'success',
    compression: {
      status: input.status,
      recordText: input.content,
      recordId: input.record?.id,
      coveredUntilMessageId: input.record?.coveredUntilMessageId,
      sourceMessageIds: input.sourceMessageIds,
      errorMessage: input.errorMessage
    },
    meta:
      input.status === 'success' && input.record
        ? {
            compaction: {
              anchorSummary: input.record.recordText,
              hiddenMessageIds: input.sourceMessageIds
            }
          }
        : undefined
  };
}

/**
 * 创建 compaction part。
 * @param input - compaction part 输入
 * @returns compaction part
 */
function createCompactionPart(input: {
  reason: 'manual' | 'auto';
  status: ChatMessageCompactionPart['status'];
  recordText?: string;
  record?: CompressionRecord;
  sourceMessageIds?: string[];
  errorMessage?: string;
}): ChatMessageCompactionPart {
  return {
    type: 'compaction',
    auto: input.reason === 'auto',
    reason: input.reason,
    status: input.status,
    recordId: input.record?.id,
    recordText: input.recordText,
    coveredUntilMessageId: input.record?.coveredUntilMessageId,
    sourceMessageIds: input.sourceMessageIds,
    errorMessage: input.errorMessage
  };
}

/**
 * 判断 compaction part 是否属于自动压缩生命周期。
 * @param part - 消息片段
 * @returns 是否为自动压缩 part
 */
function isAutoCompactionPart(part: ChatMessageRecord['parts'][number]): part is ChatMessageCompactionPart {
  return part.type === 'compaction' && part.auto === true;
}

/**
 * 判断旧自动压缩 part 是否应在写入新状态时保留。
 * @param part - 旧消息片段
 * @param nextPart - 即将写入的新 compaction part
 * @returns 是否保留旧 part
 */
function shouldKeepExistingAutoCompactionPart(part: ChatMessageRecord['parts'][number], nextPart: ChatMessageCompactionPart): boolean {
  if (!isAutoCompactionPart(part)) {
    return true;
  }

  return nextPart.status !== 'success' && part.status === 'success';
}

/**
 * 在目标 assistant 上替换自动 compaction part。
 * @param message - 目标 assistant 消息
 * @param part - 新 compaction part
 * @param meta - 可选 runtime meta
 * @returns 更新后的 assistant 消息
 */
function withAutoCompactionPart(message: ChatMessageRecord, part: ChatMessageCompactionPart, meta?: ChatMessageRecord['meta']): ChatMessageRecord {
  const nextParts: ChatMessageRecord['parts'] = message.parts.filter((item) => shouldKeepExistingAutoCompactionPart(item, part));
  nextParts.push(part);

  return {
    ...message,
    parts: nextParts,
    meta: meta ? { ...message.meta, ...meta } : message.meta
  };
}

/**
 * 将 part 模式下的状态消息同步回运行中的 assistant 引用。
 * @param target - part 模式压缩状态目标
 * @param message - 更新后的 assistant 消息
 * @returns 已同步的 assistant 消息
 */
function applyCompactionTargetMessageUpdate(target: Extract<CompressionStatusTarget, { kind: 'part' }>, message: ChatMessageRecord): ChatMessageRecord {
  Object.assign(target.message, message);
  return target.message;
}

/**
 * 判断压缩请求是否已取消。
 * @param input - 压缩请求
 * @returns 是否已取消
 */
function isCompactAborted(input: RuntimeCompactRequest): boolean {
  return input.signal?.aborted === true;
}

/**
 * 发送压缩消息生命周期事件。
 * 避免把 messages、AbortSignal 等命令字段放进 Electron IPC payload。
 * @param dependencies - 压缩服务依赖
 * @param input - 压缩请求
 * @param name - runtime 事件名
 * @param message - 压缩消息
 */
function emitCompressionMessageEvent(
  dependencies: RuntimeCompactionServiceDependencies,
  input: RuntimeCompactRequest,
  name: 'chat:runtime:message-created' | 'chat:runtime:message-updated',
  message: ChatMessageRecord
): void {
  dependencies.emit(name, {
    runtimeId: input.runtimeId,
    sessionId: input.sessionId,
    clientId: input.clientId,
    agentId: input.agentId,
    parentRuntimeId: input.parentRuntimeId,
    message
  });
}

/**
 * 创建 ChatRuntime 压缩服务。
 * @param dependencies - 服务依赖项
 * @returns runtime compaction 服务
 */
export function createRuntimeCompactionService(dependencies: RuntimeCompactionServiceDependencies): RuntimeCompactionService {
  const createMessageId = dependencies.createMessageId ?? (() => `compression-${nanoid()}`);
  const now = dependencies.now ?? (() => new Date().toISOString());
  const renderBoundary = dependencies.renderBoundary ?? renderRuntimeCompressionBoundary;

  return {
    async compact(input: RuntimeCompactRequest): Promise<ChatRuntimeCompactResult> {
      const messages = input.messages ?? [];
      if (messages.length === 0) {
        return { status: 'skipped', reason: 'no_messages' };
      }

      if (isAlreadyCompactWithoutNewModelMessages(messages)) {
        return { status: 'skipped', reason: 'already_compact' };
      }

      const target: CompressionStatusTarget =
        input.reason === 'auto' && input.targetMessage
          ? { kind: 'part', message: input.targetMessage }
          : { kind: 'message', messageId: createMessageId(), createdAt: now() };

      if (target.kind === 'message') {
        const pendingMessage = createCompressionMessage({
          id: target.messageId,
          sessionId: input.sessionId,
          runtimeId: input.runtimeId,
          agentId: input.agentId,
          content: input.reason === 'auto' ? '正在自动压缩上下文…' : '正在压缩上下文…',
          status: 'pending',
          createdAt: target.createdAt
        });

        await dependencies.persistMessage(pendingMessage);
        emitCompressionMessageEvent(dependencies, input, 'chat:runtime:message-created', pendingMessage);
      } else {
        const pendingTargetMessage = applyCompactionTargetMessageUpdate(
          target,
          withAutoCompactionPart(target.message, createCompactionPart({ reason: input.reason, status: 'pending' }))
        );
        await dependencies.updateMessage(pendingTargetMessage);
        emitCompressionMessageEvent(dependencies, input, 'chat:runtime:message-updated', pendingTargetMessage);
      }

      const sourceSelection = createCompressionSourceSelection(messages, input.contextWindow);
      if (sourceSelection.status === 'skipped') {
        if (target.kind === 'part') {
          const skippedTargetMessage = applyCompactionTargetMessageUpdate(
            target,
            withAutoCompactionPart(target.message, createCompactionPart({ reason: input.reason, status: 'skipped' }))
          );
          await dependencies.updateMessage(skippedTargetMessage);
          emitCompressionMessageEvent(dependencies, input, 'chat:runtime:message-updated', skippedTargetMessage);
          return { status: 'skipped', reason: sourceSelection.reason, messageId: skippedTargetMessage.id };
        }

        const skippedMessage = createCompressionMessage({
          id: target.messageId,
          sessionId: input.sessionId,
          runtimeId: input.runtimeId,
          agentId: input.agentId,
          content: SKIPPED_COMPRESSION_CONTENT,
          status: 'skipped',
          createdAt: target.createdAt
        });
        await dependencies.updateMessage(skippedMessage);
        emitCompressionMessageEvent(dependencies, input, 'chat:runtime:message-updated', skippedMessage);
        return { status: 'skipped', reason: sourceSelection.reason, messageId: target.messageId };
      }

      const sourceMessages = sourceSelection.messages;

      try {
        const record = await dependencies.compressor.compressSessionManually({ sessionId: input.sessionId, messages: sourceMessages, signal: input.signal });
        if (isCompactAborted(input)) {
          if (target.kind === 'part') {
            const cancelledTargetMessage = applyCompactionTargetMessageUpdate(
              target,
              withAutoCompactionPart(target.message, createCompactionPart({ reason: input.reason, status: 'cancelled' }))
            );
            await dependencies.updateMessage(cancelledTargetMessage);
            emitCompressionMessageEvent(dependencies, input, 'chat:runtime:message-updated', cancelledTargetMessage);
            return { status: 'cancelled', messageId: cancelledTargetMessage.id };
          }

          const cancelledMessage = createCompressionMessage({
            id: target.messageId,
            sessionId: input.sessionId,
            runtimeId: input.runtimeId,
            agentId: input.agentId,
            content: '压缩已取消',
            status: 'cancelled',
            createdAt: target.createdAt
          });
          await dependencies.updateMessage(cancelledMessage);
          emitCompressionMessageEvent(dependencies, input, 'chat:runtime:message-updated', cancelledMessage);
          return { status: 'cancelled', messageId: target.messageId };
        }
        if (!record) {
          if (target.kind === 'part') {
            const skippedTargetMessage = applyCompactionTargetMessageUpdate(
              target,
              withAutoCompactionPart(target.message, createCompactionPart({ reason: input.reason, status: 'skipped' }))
            );
            await dependencies.updateMessage(skippedTargetMessage);
            emitCompressionMessageEvent(dependencies, input, 'chat:runtime:message-updated', skippedTargetMessage);
            return { status: 'skipped', reason: 'no_compressible_messages', messageId: skippedTargetMessage.id };
          }

          const skippedMessage = createCompressionMessage({
            id: target.messageId,
            sessionId: input.sessionId,
            runtimeId: input.runtimeId,
            agentId: input.agentId,
            content: SKIPPED_COMPRESSION_CONTENT,
            status: 'skipped',
            createdAt: target.createdAt
          });
          await dependencies.updateMessage(skippedMessage);
          emitCompressionMessageEvent(dependencies, input, 'chat:runtime:message-updated', skippedMessage);
          return { status: 'skipped', reason: 'no_compressible_messages', messageId: target.messageId };
        }

        const boundaryText = renderBoundary(record, sourceMessages);
        if (target.kind === 'part') {
          const successTargetMessage = applyCompactionTargetMessageUpdate(
            target,
            withAutoCompactionPart(
              target.message,
              createCompactionPart({
                reason: input.reason,
                status: 'success',
                record,
                recordText: boundaryText,
                sourceMessageIds: record.sourceMessageIds
              }),
              {
                compaction: {
                  anchorSummary: record.recordText,
                  hiddenMessageIds: record.sourceMessageIds
                }
              }
            )
          );
          await dependencies.updateMessage(successTargetMessage);
          emitCompressionMessageEvent(dependencies, input, 'chat:runtime:message-updated', successTargetMessage);
          return { status: 'success', messageId: successTargetMessage.id, recordId: record.id };
        }

        const successMessage = createCompressionMessage({
          id: target.messageId,
          sessionId: input.sessionId,
          runtimeId: input.runtimeId,
          agentId: input.agentId,
          content: boundaryText,
          status: 'success',
          createdAt: target.createdAt,
          record,
          sourceMessageIds: record.sourceMessageIds
        });

        await dependencies.updateMessage(successMessage);
        emitCompressionMessageEvent(dependencies, input, 'chat:runtime:message-updated', successMessage);
        return { status: 'success', messageId: target.messageId, recordId: record.id };
      } catch (error: unknown) {
        if (isCompactAborted(input)) {
          if (target.kind === 'part') {
            const cancelledTargetMessage = applyCompactionTargetMessageUpdate(
              target,
              withAutoCompactionPart(target.message, createCompactionPart({ reason: input.reason, status: 'cancelled' }))
            );
            await dependencies.updateMessage(cancelledTargetMessage);
            emitCompressionMessageEvent(dependencies, input, 'chat:runtime:message-updated', cancelledTargetMessage);
            return { status: 'cancelled', messageId: cancelledTargetMessage.id };
          }

          const cancelledMessage = createCompressionMessage({
            id: target.messageId,
            sessionId: input.sessionId,
            runtimeId: input.runtimeId,
            agentId: input.agentId,
            content: '压缩已取消',
            status: 'cancelled',
            createdAt: target.createdAt
          });
          await dependencies.updateMessage(cancelledMessage);
          emitCompressionMessageEvent(dependencies, input, 'chat:runtime:message-updated', cancelledMessage);
          return { status: 'cancelled', messageId: target.messageId };
        }
        const errorMessage = error instanceof Error ? error.message : '压缩失败';
        if (target.kind === 'part') {
          const failedTargetMessage = applyCompactionTargetMessageUpdate(
            target,
            withAutoCompactionPart(target.message, createCompactionPart({ reason: input.reason, status: 'failed', errorMessage }))
          );
          await dependencies.updateMessage(failedTargetMessage);
          emitCompressionMessageEvent(dependencies, input, 'chat:runtime:message-updated', failedTargetMessage);
          return { status: 'failed', messageId: failedTargetMessage.id, errorMessage };
        }

        const failedMessage = createCompressionMessage({
          id: target.messageId,
          sessionId: input.sessionId,
          runtimeId: input.runtimeId,
          agentId: input.agentId,
          content: '上下文压缩失败',
          status: 'failed',
          createdAt: target.createdAt,
          errorMessage
        });

        await dependencies.updateMessage(failedMessage);
        emitCompressionMessageEvent(dependencies, input, 'chat:runtime:message-updated', failedMessage);
        return { status: 'failed', messageId: target.messageId, errorMessage };
      }
    }
  };
}
