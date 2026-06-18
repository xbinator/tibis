/**
 * @file tokenEstimator.ts
 * @description 本地 token 启发式估算器，用于上下文窗口用量与压缩预算预估。
 */
import type { ModelMessage } from 'ai';
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

/** 按模型 ID 缓存本地估算器，避免 watcher 重复创建对象。 */
const estimatorCache = new Map<string, TokenEstimator>();

/**
 * 字符级 token 启发式估算。
 * 平均英文 1 token ≈ 4 字符，中文 1 token ≈ 1.5 字符。
 * 使用保守系数 0.5（即 2 字符 ≈ 1 token）。
 * @param text - 待估算文本
 * @returns 估算 token 数
 */
function charLevelEstimate(text: string): number {
  return Math.ceil(text.length / 2);
}

/**
 * 创建字符级 token 估算器。
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
 * 创建 token 估算器。
 * @param modelId - 模型 ID，用于缓存调用方的当前模型估算器。
 * @returns TokenEstimator 实例
 */
export async function createTokenEstimator(modelId: string): Promise<TokenEstimator> {
  const cachedEstimator = estimatorCache.get(modelId);
  if (cachedEstimator) return cachedEstimator;

  const estimator = createCharLevelEstimator();
  estimatorCache.set(modelId, estimator);
  return estimator;
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
