/**
 * @file tool-output-prune.mts
 * @description ChatRuntime 旧工具结果剪枝辅助函数。
 */
import type { ChatMessageRecord, ChatMessageToolPart } from 'types/chat';
import { USER_CHOICE_TOOL_NAMES } from '../messages/user-choice.mjs';

/** Tool output prune 至少保护的最近用户轮数。 */
const TOOL_OUTPUT_PRUNE_PROTECTED_USER_TURNS = 2;

/** 超过该 JSON 长度的旧 tool result 会被软剪枝。 */
const TOOL_OUTPUT_PRUNE_MIN_JSON_LENGTH = 4_000;

/** 剪枝摘要最大长度。 */
const TOOL_OUTPUT_PRUNE_SUMMARY_LENGTH = 500;

/** 不参与 tool output prune 的工具。 */
const TOOL_OUTPUT_PRUNE_PROTECTED_TOOL_NAMES = new Set(['skill', ...USER_CHOICE_TOOL_NAMES]);

/** 剪枝后保留的工具结果字段。 */
const TOOL_OUTPUT_PRUNE_PRESERVED_DATA_KEYS = [
  'path',
  'filePath',
  'url',
  'title',
  'totalLines',
  'readLines',
  'returnedCount',
  'count',
  'status',
  'summary',
  'message'
];

/**
 * 安全序列化 JSON。
 * @param value - 待序列化值
 * @returns JSON 字符串
 */
function safeStringifyJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * 查找 tool output prune 的保护区起点。
 * @param messages - 完整消息列表
 * @returns 最近用户轮保护区起点
 */
export function findToolOutputPruneProtectedStartIndex(messages: ChatMessageRecord[]): number {
  let seenUserTurns = 0;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role !== 'user') continue;

    seenUserTurns += 1;
    if (seenUserTurns >= TOOL_OUTPUT_PRUNE_PROTECTED_USER_TURNS) return index;
  }

  return 0;
}

/**
 * 判断工具结果是否可剪枝。
 * @param part - 工具片段
 * @returns 是否可剪枝
 */
function shouldPruneToolResult(part: ChatMessageToolPart): boolean {
  if (part.status !== 'done' || part.result?.status !== 'success') return false;
  if (TOOL_OUTPUT_PRUNE_PROTECTED_TOOL_NAMES.has(part.toolName)) return false;

  return safeStringifyJson(part.result.data).length > TOOL_OUTPUT_PRUNE_MIN_JSON_LENGTH;
}

/**
 * 提取剪枝后仍应保留的工具结果字段。
 * @param data - 原始工具结果数据
 * @returns 可保留字段
 */
function pickPrunedToolResultFields(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== 'object') return {};

  const source = data as Record<string, unknown>;
  const picked: Record<string, unknown> = {};
  for (const key of TOOL_OUTPUT_PRUNE_PRESERVED_DATA_KEYS) {
    const value = source[key];
    if (value === undefined) continue;
    picked[key] =
      typeof value === 'string' && value.length > TOOL_OUTPUT_PRUNE_SUMMARY_LENGTH ? `${value.slice(0, TOOL_OUTPUT_PRUNE_SUMMARY_LENGTH)}...` : value;
  }

  return picked;
}

/**
 * 创建剪枝后的工具结果摘要数据。
 * @param data - 原始工具结果数据
 * @param serializedData - 原始序列化数据
 * @returns 剪枝摘要数据
 */
function createPrunedToolResultData(data: unknown, serializedData: string): Record<string, unknown> {
  const preservedFields = pickPrunedToolResultFields(data);
  const fallbackSummary = serializedData.slice(0, TOOL_OUTPUT_PRUNE_SUMMARY_LENGTH);
  const summary =
    typeof preservedFields.summary === 'string' && preservedFields.summary.trim()
      ? preservedFields.summary
      : `Large tool result pruned. Preview: ${fallbackSummary}`;

  return {
    ...preservedFields,
    pruned: true,
    summary,
    originalBytes: serializedData.length
  };
}

/**
 * 剪枝单个工具片段。
 * @param part - 工具片段
 * @returns 剪枝后的工具片段，未剪枝时返回原片段
 */
function pruneToolPartIfNeeded(part: ChatMessageToolPart): ChatMessageToolPart {
  if (!shouldPruneToolResult(part) || part.result?.status !== 'success') return part;

  const serializedData = safeStringifyJson(part.result.data);
  return {
    ...part,
    result: {
      ...part.result,
      data: createPrunedToolResultData(part.result.data, serializedData)
    }
  };
}

/**
 * 剪枝单条消息中的旧 tool output。
 * @param message - 消息
 * @returns 剪枝后的消息，无需更新时返回 undefined
 */
export function pruneMessageToolOutputs(message: ChatMessageRecord): ChatMessageRecord | undefined {
  if (message.role !== 'assistant') return undefined;

  let changed = false;
  const parts = message.parts.map((part) => {
    if (part.type !== 'tool') return part;

    const nextPart = pruneToolPartIfNeeded(part);
    if (nextPart !== part) changed = true;
    return nextPart;
  });
  if (!changed) return undefined;

  return { ...message, parts };
}
