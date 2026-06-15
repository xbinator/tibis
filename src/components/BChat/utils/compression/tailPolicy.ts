/**
 * @file tailPolicy.ts
 * @description 压缩 tail 原文保留策略，按上下文窗口预算选择最近消息。
 */
import type { Message } from '@/components/BChat/utils/types';

/** tail 预算占模型上下文窗口比例。 */
const TAIL_CONTEXT_WINDOW_RATIO = 0.25;
/** tail 预算下限。 */
const MIN_TAIL_BUDGET_TOKENS = 2_000;
/** tail 预算上限。 */
const MAX_TAIL_BUDGET_TOKENS = 8_000;
/** 至少保留最近用户轮数。 */
const MIN_RECENT_USER_TURNS = 2;

/**
 * tail 策略选项。
 */
export interface TailPolicyOptions {
  /** 当前模型上下文窗口 */
  contextWindow?: number;
  /** 至少保留的最近用户轮数 */
  minRecentUserTurns?: number;
}

/**
 * 计算 tail token 预算。
 * @param contextWindow - 当前模型上下文窗口
 * @returns tail token 预算
 */
export function computeTailTokenBudget(contextWindow?: number): number {
  if (!contextWindow || contextWindow <= 0) {
    return MIN_TAIL_BUDGET_TOKENS;
  }

  const proportionalBudget = Math.floor(contextWindow * TAIL_CONTEXT_WINDOW_RATIO);
  return Math.min(MAX_TAIL_BUDGET_TOKENS, Math.max(MIN_TAIL_BUDGET_TOKENS, proportionalBudget));
}

/**
 * 粗略估算单条消息 token 数。
 * @param message - 聊天消息
 * @returns 估算 token 数
 */
function estimateMessageTokens(message: Message): number {
  if (message.content) {
    return Math.ceil(message.content.length / 2);
  }

  const partsText = message.parts
    .map((part) => {
      if (part.type === 'text') return part.text;
      if (part.type === 'tool') return `${part.toolName} ${part.status}`;
      return part.type;
    })
    .join(' ');
  const text = [message.content, partsText].filter(Boolean).join(' ');
  return Math.ceil(text.length / 2);
}

/**
 * 找到 mandatory tail 起点：最近 N 个 user turn 中最早一个 user 消息。
 * @param modelMessages - user/assistant 消息列表
 * @param minRecentUserTurns - 至少保留的最近用户轮数
 * @returns mandatory tail 起点索引
 */
function findMandatoryTailStartIndex(modelMessages: Message[], minRecentUserTurns: number): number {
  let seenUserTurns = 0;

  for (let index = modelMessages.length - 1; index >= 0; index -= 1) {
    if (modelMessages[index].role === 'user') {
      seenUserTurns += 1;
      if (seenUserTurns >= minRecentUserTurns) {
        return index;
      }
    }
  }

  return 0;
}

/**
 * 查找指定索引之前最近的 user turn 起点。
 * @param modelMessages - user/assistant 消息列表
 * @param beforeIndex - 当前 tail 起点索引
 * @returns 上一个 user turn 起点索引，不存在时返回 -1
 */
function findPreviousUserTurnStartIndex(modelMessages: Message[], beforeIndex: number): number {
  for (let index = beforeIndex - 1; index >= 0; index -= 1) {
    if (modelMessages[index].role === 'user') {
      return index;
    }
  }

  return -1;
}

/**
 * 估算消息片段 token 数。
 * @param messages - 消息片段
 * @returns 估算 token 数
 */
function estimateMessagesTokens(messages: Message[]): number {
  return messages.reduce((total, message) => total + estimateMessageTokens(message), 0);
}

/**
 * 选择压缩时需要保留为原文的 tail 消息 ID。
 * @param messages - 当前消息列表
 * @param options - tail 策略选项
 * @returns 需要保留原文的消息 ID 集合，插入顺序为时间顺序
 */
export function selectTailPreservedMessageIds(messages: Message[], options: TailPolicyOptions = {}): Set<string> {
  const modelMessages = messages.filter((item) => item.role === 'user' || item.role === 'assistant');
  if (!modelMessages.length) {
    return new Set<string>();
  }

  const minRecentUserTurns = options.minRecentUserTurns ?? MIN_RECENT_USER_TURNS;
  const budget = computeTailTokenBudget(options.contextWindow);
  const mandatoryStartIndex = findMandatoryTailStartIndex(modelMessages, minRecentUserTurns);
  const selectedIndexes = new Set<number>();
  let usedTokens = 0;

  for (let index = mandatoryStartIndex; index < modelMessages.length; index += 1) {
    selectedIndexes.add(index);
    usedTokens += estimateMessageTokens(modelMessages[index]);
  }

  let currentStartIndex = mandatoryStartIndex;
  let candidateStartIndex = findPreviousUserTurnStartIndex(modelMessages, currentStartIndex);

  while (candidateStartIndex >= 0) {
    if (candidateStartIndex === 0) {
      break;
    }

    const candidateMessages = modelMessages.slice(candidateStartIndex, currentStartIndex);
    const nextTokens = estimateMessagesTokens(candidateMessages);
    if (usedTokens + nextTokens > budget) {
      break;
    }

    for (let index = candidateStartIndex; index < currentStartIndex; index += 1) {
      selectedIndexes.add(index);
    }
    usedTokens += nextTokens;
    currentStartIndex = candidateStartIndex;
    candidateStartIndex = findPreviousUserTurnStartIndex(modelMessages, currentStartIndex);
  }

  return new Set([...selectedIndexes].sort((a, b) => a - b).map((index) => modelMessages[index].id));
}
