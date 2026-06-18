/**
 * @file compaction.mts
 * @description ChatRuntime 主进程上下文压缩消息生命周期服务。
 */
import type { ChatRuntimeEventEmitter } from './types.mjs';
import type { ChatMessageRecord, ChatMessageToolPart } from 'types/chat';
import type { ChatRuntimeCompactInput, ChatRuntimeCompactResult } from 'types/chat-runtime';
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

/** 压缩上下文内保留的关键工具结果最大数量。 */
const MAX_KEY_TOOL_RESULT_CONTEXT_COUNT = 5;

/** 对继续任务有高价值的工具结果名称片段。 */
const KEY_TOOL_RESULT_NAME_PATTERNS = ['read', 'write', 'edit', 'file', 'reference', 'ask_user', 'choice', 'settings'];

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
  const modelMessages = messages.filter((item) => item.role === 'user' || item.role === 'assistant');
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
 * @returns 本次实际进入压缩执行器的消息列表
 */
function createCompressionSourceMessages(messages: ChatMessageRecord[], contextWindow?: number): ChatMessageRecord[] {
  const preservedIds = selectRuntimeTailPreservedMessageIds(messages, contextWindow);
  if (!preservedIds.size) return [...messages];

  return messages.filter((item) => !preservedIds.has(item.id));
}

/**
 * 查找最新成功压缩边界索引。
 * @param messages - 消息列表
 * @returns 最新边界索引
 */
function findLatestCompressionBoundaryIndex(messages: ChatMessageRecord[]): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === 'compression' && message.compression?.status === 'success' && message.compression.coveredUntilMessageId) {
      return index;
    }
  }

  return -1;
}

/**
 * 判断最新压缩边界之后是否没有新增模型消息。
 * @param messages - 消息列表
 * @returns 没有新增 user/assistant 消息时返回 true
 */
function isAlreadyCompactWithoutNewModelMessages(messages: ChatMessageRecord[]): boolean {
  const boundaryIndex = findLatestCompressionBoundaryIndex(messages);
  if (boundaryIndex === -1) return false;

  return !messages.slice(boundaryIndex + 1).some((item) => item.role === 'user' || item.role === 'assistant');
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
  status: 'pending' | 'success' | 'failed' | 'cancelled';
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

      const messageId = createMessageId();
      const pendingMessage = createCompressionMessage({
        id: messageId,
        sessionId: input.sessionId,
        runtimeId: input.runtimeId,
        agentId: input.agentId,
        content: input.reason === 'auto' ? '正在自动压缩上下文…' : '正在压缩上下文…',
        status: 'pending',
        createdAt: now()
      });

      await dependencies.persistMessage(pendingMessage);
      emitCompressionMessageEvent(dependencies, input, 'chat:runtime:message-created', pendingMessage);

      const sourceMessages = createCompressionSourceMessages(messages, input.contextWindow);

      try {
        const record = await dependencies.compressor.compressSessionManually({ sessionId: input.sessionId, messages: sourceMessages, signal: input.signal });
        if (isCompactAborted(input)) {
          const cancelledMessage = createCompressionMessage({
            id: messageId,
            sessionId: input.sessionId,
            runtimeId: input.runtimeId,
            agentId: input.agentId,
            content: '压缩已取消',
            status: 'cancelled',
            createdAt: pendingMessage.createdAt
          });
          await dependencies.updateMessage(cancelledMessage);
          emitCompressionMessageEvent(dependencies, input, 'chat:runtime:message-updated', cancelledMessage);
          return { status: 'cancelled', messageId };
        }
        if (!record) {
          const failedMessage = createCompressionMessage({
            id: messageId,
            sessionId: input.sessionId,
            runtimeId: input.runtimeId,
            agentId: input.agentId,
            content: '上下文压缩失败',
            status: 'failed',
            createdAt: pendingMessage.createdAt,
            errorMessage: '没有可压缩的消息'
          });
          await dependencies.updateMessage(failedMessage);
          emitCompressionMessageEvent(dependencies, input, 'chat:runtime:message-updated', failedMessage);
          return { status: 'failed', messageId, errorMessage: '没有可压缩的消息' };
        }

        const boundaryText = renderBoundary(record, sourceMessages);
        const successMessage = createCompressionMessage({
          id: messageId,
          sessionId: input.sessionId,
          runtimeId: input.runtimeId,
          agentId: input.agentId,
          content: boundaryText,
          status: 'success',
          createdAt: pendingMessage.createdAt,
          record,
          sourceMessageIds: record.sourceMessageIds
        });

        await dependencies.updateMessage(successMessage);
        emitCompressionMessageEvent(dependencies, input, 'chat:runtime:message-updated', successMessage);
        return { status: 'success', messageId, recordId: record.id };
      } catch (error: unknown) {
        if (isCompactAborted(input)) {
          const cancelledMessage = createCompressionMessage({
            id: messageId,
            sessionId: input.sessionId,
            runtimeId: input.runtimeId,
            agentId: input.agentId,
            content: '压缩已取消',
            status: 'cancelled',
            createdAt: pendingMessage.createdAt
          });
          await dependencies.updateMessage(cancelledMessage);
          emitCompressionMessageEvent(dependencies, input, 'chat:runtime:message-updated', cancelledMessage);
          return { status: 'cancelled', messageId };
        }
        const errorMessage = error instanceof Error ? error.message : '压缩失败';
        const failedMessage = createCompressionMessage({
          id: messageId,
          sessionId: input.sessionId,
          runtimeId: input.runtimeId,
          agentId: input.agentId,
          content: '上下文压缩失败',
          status: 'failed',
          createdAt: pendingMessage.createdAt,
          errorMessage
        });

        await dependencies.updateMessage(failedMessage);
        emitCompressionMessageEvent(dependencies, input, 'chat:runtime:message-updated', failedMessage);
        return { status: 'failed', messageId, errorMessage };
      }
    }
  };
}
