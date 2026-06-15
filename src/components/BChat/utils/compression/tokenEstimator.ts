/**
 * @file tokenEstimator.ts
 * @description provider-aware token 估算器，根据模型类型选择对应的 tokenizer 进行 token 计数。
 * 支持懒加载和降级到字符级估算。
 */
import type { ModelMessage } from 'ai';
import type { TiktokenEncoding } from 'js-tiktoken';
import { convert } from '@/components/BChat/utils/messageHelper';
import type { Message } from '@/components/BChat/utils/types';

/**
 * token 估算器接口。
 */
export interface TokenEstimator {
  /** 估算 ModelMessage[] 的 token 数 */
  estimate(messages: ModelMessage[]): number;
  /** 估算纯文本的 token 数 */
  estimateText(text: string): number;
}

/**
 * 轻量 encoder 接口，避免在模块初始化阶段静态加载 js-tiktoken。
 */
interface TextEncoderLike {
  /** 把文本编码为 token 序列。 */
  encode(text: string): number[];
}

/**
 * 模型到 tokenizer encoding 的映射。
 */
const MODEL_TOKENIZER_MAP: Record<string, string> = {
  'gpt-4o': 'o200k_base',
  'gpt-4-turbo': 'cl100k_base',
  'gpt-4': 'cl100k_base',
  'gpt-3.5-turbo': 'cl100k_base',
  'claude-3': 'cl100k_base',
  claude: 'cl100k_base',
  deepseek: 'cl100k_base'
};

/** 默认 tokenizer */
const DEFAULT_TOKENIZER = 'cl100k_base';

/** encoder 缓存 */
const encoderCache = new Map<string, TextEncoderLike>();

/** js-tiktoken 模块缓存 */
let cachedTiktokenModule: typeof import('js-tiktoken') | null = null;

/** 是否已发出过降级警告 */
let fallbackWarningShown = false;

/**
 * 获取模型对应的 encoding 名称。
 * @param modelId - 模型 ID
 * @returns encoding 名称
 */
function getEncodingForModel(modelId: string): string {
  const lowerModel = modelId.toLowerCase();
  for (const [pattern, encoding] of Object.entries(MODEL_TOKENIZER_MAP)) {
    if (lowerModel.includes(pattern)) {
      return encoding;
    }
  }
  return DEFAULT_TOKENIZER;
}

/**
 * 懒加载 js-tiktoken 模块。
 * @returns js-tiktoken 模块
 */
async function loadTiktokenModule(): Promise<typeof import('js-tiktoken')> {
  if (cachedTiktokenModule) {
    return cachedTiktokenModule;
  }

  cachedTiktokenModule = await import('js-tiktoken');
  return cachedTiktokenModule;
}

/**
 * 获取 encoder（懒加载 + 缓存）。
 * @param encodingName - encoding 名称
 * @returns encoder 对象，加载失败返回 null
 */
async function getEncoder(encodingName: string): Promise<TextEncoderLike | null> {
  const cached = encoderCache.get(encodingName);
  if (cached) return cached;

  try {
    const { getEncoding } = await loadTiktokenModule();
    const encoder = getEncoding(encodingName as TiktokenEncoding);
    encoderCache.set(encodingName, encoder);
    return encoder;
  } catch (err) {
    console.error(`[TokenEstimator] Failed to load encoder "${encodingName}":`, err);
    return null;
  }
}

/**
 * 估算单条 ModelMessage 的 token 数。
 * @param msg - 模型消息
 * @param encoder - tokenizer encoder
 * @returns token 数
 */
function estimateMessageTokens(msg: ModelMessage, encoder: TextEncoderLike): number {
  if (typeof msg.content === 'string') {
    return encoder.encode(msg.content).length;
  }
  if (Array.isArray(msg.content)) {
    let count = 0;
    for (const part of msg.content) {
      if (part && typeof part === 'object') {
        count += encoder.encode(JSON.stringify(part)).length;
      }
    }
    return count;
  }
  return 0;
}

/**
 * 字符级降级估算（当 tokenizer 加载失败时使用）。
 * 平均英文 1 token ≈ 4 字符，中文 1 token ≈ 1.5 字符。
 * 使用保守系数 0.5（即 2 字符 ≈ 1 token）。
 */
function charLevelEstimate(text: string): number {
  return Math.ceil(text.length / 2);
}

/**
 * 创建 token 估算器。
 * @param modelId - 模型 ID（用于选择 tokenizer）
 * @returns TokenEstimator 实例
 */
export async function createTokenEstimator(modelId: string): Promise<TokenEstimator | null> {
  const encodingName = getEncodingForModel(modelId);
  const encoder = await getEncoder(encodingName);

  if (!encoder) {
    if (!fallbackWarningShown) {
      console.warn(`[TokenEstimator] Encoder "${encodingName}" not available, falling back to char-level estimation`);
      fallbackWarningShown = true;
    }
    return null;
  }

  return {
    estimate(messages: ModelMessage[]): number {
      let total = 0;
      for (const msg of messages) {
        total += estimateMessageTokens(msg, encoder);
      }
      return total;
    },
    estimateText(text: string): number {
      return encoder.encode(text).length;
    }
  };
}

/**
 * 创建字符级降级估算器（当 js-tiktoken 不可用时使用）。
 * @returns 字符级 TokenEstimator
 */
export function createCharLevelEstimator(): TokenEstimator {
  return {
    estimate(messages: ModelMessage[]): number {
      let total = 0;
      for (const msg of messages) {
        if (typeof msg.content === 'string') {
          total += charLevelEstimate(msg.content);
        } else if (Array.isArray(msg.content)) {
          for (const part of msg.content) {
            if (part && typeof part === 'object') {
              total += charLevelEstimate(JSON.stringify(part));
            }
          }
        }
      }
      return total;
    },
    estimateText(text: string): number {
      return charLevelEstimate(text);
    }
  };
}

/**
 * 构建消息内容哈希，用于 per-message token 缓存失效判断。
 * 基于消息的 content、parts 和 references 生成简单哈希。
 * @param msg - 消息对象
 * @returns 内容哈希字符串
 */
export function buildMessageContentHash(msg: Message): string {
  const normalizedContent = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
  const parts = msg.parts
    .map((p) => {
      if (p.type === 'text') return p.text;
      if (p.type === 'tool') return p.result ? `tr:${p.toolName}` : `tc:${p.toolName}`;
      return p.type;
    })
    .join('|');
  const refs = msg.references?.map((r) => `${r.path}:${r.startLine}-${r.endLine}:${r.selectedContent ?? ''}`).join(',') ?? '';
  return `${normalizedContent}|${parts}|${refs}`;
}

/**
 * 估算总 token 数，支持 per-message 缓存。
 * @param messages - 历史消息列表
 * @param currentUserMessage - 当前用户消息
 * @param currentModelId - 当前模型 ID
 * @param tokenEstimator - token 估算器
 * @returns 总 token 数
 */
export function estimateTotalTokens(messages: Message[], currentUserMessage: Message, currentModelId: string, tokenEstimator: TokenEstimator): number {
  let total = 0;

  for (const msg of messages) {
    const canReuseEstimate =
      msg.tokenCount !== undefined &&
      msg.tokenCountSource === 'estimated' &&
      msg.tokenCountModelId === currentModelId &&
      msg.tokenCountContentHash === buildMessageContentHash(msg);

    if (canReuseEstimate) {
      total += msg.tokenCount!;
    } else {
      total += tokenEstimator.estimate(convert.toModelMessages([msg]));
    }
  }

  total += tokenEstimator.estimate(convert.toModelMessages([currentUserMessage]));

  return total;
}
