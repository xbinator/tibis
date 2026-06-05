/**
 * @file types.ts
 * @description 上下文压缩模块类型定义，包含压缩记录结构、策略结果与存储接口。
 */
import type { CompressionRecord, TriggerReason } from 'types/compression';
import type { Message } from '@/components/BChatSidebar/utils/types';

// 核心类型从共享类型目录 re-export
export type {
  CompressionBuildMode,
  CompressionRecordStatus,
  TriggerReason,
  FileContextSummary,
  GeneralConversationSummary,
  StructuredConversationSummary,
  CompressionRecord,
  CompressionRecordStorage
} from 'types/compression';

// ─── 上下文预算快照 ─────────────────────────────────────────────────────────

/**
 * 上下文预算快照，用于 policy 判断。
 */
export interface ContextBudgetSnapshot {
  /** 字符级体积估算 */
  charCount: number;
  /** token 级体积估算（可选，tokenizer 不可用时为 undefined） */
  tokenCount?: number;
  /** 本次评估使用的 token 阈值（可选，优先于默认固定阈值） */
  tokenThreshold?: number;
  /** token 估算精度等级 */
  tokenAccuracy?: 'native_like' | 'approximate' | 'char_fallback';
  /** 消息轮数 */
  roundCount: number;
}

// ─── 压缩计划 ─────────────────────────────────────────────────────────────────

/**
 * Policy 模块输出的压缩策略判断结果。
 */
export interface CompressionPolicyResult {
  /** 是否应该触发压缩 */
  shouldCompress: boolean;
  /** 触发原因 */
  triggerReason: TriggerReason;
  /** 当前消息轮数 */
  roundCount: number;
  /** 当前上下文字符估算体积 */
  charCount: number;
  /** 当前上下文 token 估算体积（第三阶段） */
  tokenCount?: number;
  /** 当前有效压缩记录（若有） */
  currentRecord?: CompressionRecord;
}

// ─── 消息分类 ─────────────────────────────────────────────────────────────────

/**
 * Planner 模块输出的消息切分结果。
 */
export interface MessageClassificationResult {
  /** 必须保留原文的消息列表（最近窗口 + 未完成交互） */
  preservedMessages: Message[];
  /** 保留轻量文件语义的历史消息列表 */
  fileSemanticMessages: Message[];
  /** 可进入摘要的消息列表 */
  compressibleMessages: Message[];
  /** 必须原文穿透的消息 ID 列表（在压缩覆盖区间内但必须保留原文） */
  preservedMessageIds: string[];
}

// ─── 摘要构建结果 ─────────────────────────────────────────────────────────────

/**
 * buildCompressionRecord / buildMultiSegmentSummary 的返回值类型。
 */
export interface BuildCompressionRecordResult {
  /** 新生成的压缩记录 */
  compressionRecord: CompressionRecord;
  /** 消息分类结果 */
  classification: MessageClassificationResult;
}

// ─── 规则裁剪 ─────────────────────────────────────────────────────────────────

/**
 * 规则裁剪后的一条压缩消息项。
 */
export interface TrimmedMessageItem {
  /** 原始消息 ID */
  messageId: string;
  /** 消息角色 */
  role: 'user' | 'assistant';
  /** 裁剪后的文本内容 */
  trimmedText: string;
}

/**
 * 结构化摘要生成器的输入参数。
 */
export interface GenerateStructuredSummaryInput {
  /** 规则裁剪后的消息项列表 */
  items: TrimmedMessageItem[];
  /** 上一条压缩记录（增量模式下传入） */
  previousRecord?: Pick<CompressionRecord, 'recordText' | 'structuredSummary' | 'generalSummary'>;
}

/**
 * Summarizer 规则裁剪阶段的输出。
 */
export interface RuleTrimResult {
  /** 裁剪后的消息项列表 */
  items: TrimmedMessageItem[];
  /** 裁剪后的总字符数 */
  charCount: number;
  /** 是否触发了硬截断 */
  truncated: boolean;
}
