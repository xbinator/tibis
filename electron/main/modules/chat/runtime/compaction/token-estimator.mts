/**
 * @file token-estimator.mts
 * @description 上下文压缩使用的跨 Provider 确定性 Token 估算器。
 */
import type { AITransportTool } from 'types/ai';
import type { ChatMessagePart, ChatMessageRecord } from 'types/chat';
import { toRuntimeModelMessages } from '../context/model-message.mjs';

/** ASCII 字符保守权重，覆盖随机标识、JSON 标点和压缩字符串。 */
const ASCII_TOKEN_WEIGHT = 0.5;

/** CJK 字符跨 Provider 保守权重。 */
const CJK_TOKEN_WEIGHT = 1.2;

/** emoji 与其他 Unicode 字符跨 Provider 保守权重。 */
const OTHER_TOKEN_WEIGHT = 2;

/** 单条模型消息的协议包装开销。 */
const MODEL_MESSAGE_OVERHEAD = 4;

/** 单个工具 schema 的协议包装开销。 */
const TOOL_SCHEMA_OVERHEAD = 8;

/**
 * 模型请求 Token 估算输入。
 */
export interface TokenRequestInput {
  /** 系统提示词。 */
  system?: string;
  /** 模型可用工具 schema。 */
  tools?: AITransportTool[];
  /** 进入模型投影前的聊天消息。 */
  messages: ChatMessageRecord[];
  /** 当前 Skill 内容版本。 */
  skillContentHashes?: Record<string, string>;
}

/**
 * 判断字符是否属于常用 CJK 区段。
 * @param codePoint - Unicode code point
 * @returns 是否为 CJK 字符
 */
function isCjkCodePoint(codePoint: number): boolean {
  return (codePoint >= 0x3400 && codePoint <= 0x4dbf) || (codePoint >= 0x4e00 && codePoint <= 0x9fff) || (codePoint >= 0xf900 && codePoint <= 0xfaff);
}

/**
 * 将未知值转换为可估算的 JSON 文本。
 * @param value - 待序列化值
 * @returns JSON 文本，无法序列化时返回字符串表示
 */
function stringifyTokenValue(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/**
 * 估算文本 Token 数量。
 * @param text - 待估算文本
 * @returns 确定性 Token 估算
 */
export function estimateTextTokens(text: string): number {
  if (!text) return 0;

  let weightedCharacters = 0;
  for (const character of text) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 0x7f) {
      weightedCharacters += ASCII_TOKEN_WEIGHT;
    } else if (isCjkCodePoint(codePoint)) {
      weightedCharacters += CJK_TOKEN_WEIGHT;
    } else {
      weightedCharacters += OTHER_TOKEN_WEIGHT;
    }
  }

  return Math.max(1, Math.ceil(weightedCharacters));
}

/**
 * 估算结构化值 Token 数量。
 * @param value - 待估算值
 * @returns Token 估算
 */
function estimateValueTokens(value: unknown): number {
  return estimateTextTokens(stringifyTokenValue(value));
}

/**
 * 估算单个持久化 Part 的模型相关 Token。
 * @param part - 消息 Part
 * @returns Token 估算
 */
export function estimatePartTokens(part: ChatMessagePart): number {
  if (part.type === 'text' || part.type === 'error') return estimateTextTokens(part.text);
  if (part.type === 'file') {
    return estimateTextTokens(part.path) + estimateTextTokens(part.snapshot.content) + MODEL_MESSAGE_OVERHEAD;
  }
  if (part.type === 'widget_result') return estimateValueTokens(part);
  if (part.type === 'skill_reference') return estimateTextTokens(`$${part.name}`);
  if (part.type === 'tool') {
    return (
      estimateTextTokens(part.toolName) +
      estimateValueTokens(part.input) +
      estimateTextTokens(part.inputText ?? '') +
      estimateValueTokens(part.result ?? null) +
      estimateValueTokens(part.shellOutput ?? []) +
      MODEL_MESSAGE_OVERHEAD
    );
  }

  // thinking、confirmation 和 compaction 不直接进入模型请求。
  return 0;
}

/**
 * 估算完整模型请求 Token 数量。
 * @param input - 请求上下文
 * @returns Token 估算
 */
export function estimateRequestTokens(input: TokenRequestInput): number {
  const modelMessages = toRuntimeModelMessages(input.messages, { skillContentHashes: input.skillContentHashes });
  const systemTokens = input.system ? estimateTextTokens(input.system) + MODEL_MESSAGE_OVERHEAD : 0;
  const toolTokens =
    input.tools?.reduce(
      (total: number, tool: AITransportTool): number =>
        total + estimateTextTokens(tool.name) + estimateTextTokens(tool.description) + estimateValueTokens(tool.parameters) + TOOL_SCHEMA_OVERHEAD,
      0
    ) ?? 0;
  const messageTokens = modelMessages.reduce((total: number, message): number => total + estimateValueTokens(message) + MODEL_MESSAGE_OVERHEAD, 0);

  return systemTokens + toolTokens + messageTokens;
}
