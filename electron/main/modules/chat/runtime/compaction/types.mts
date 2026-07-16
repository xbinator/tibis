/**
 * @file types.mts
 * @description 上下文压缩主进程内部类型与版本常量。
 */
import type { ChatMessagePart, StructuredContextSummary } from 'types/chat';

/** source fingerprint 协议版本。 */
export const FINGERPRINT_VERSION = 1;

/** 结构化摘要 schema 版本。 */
export const SUMMARY_SCHEMA_VERSION = 1;

/** 上下文投影算法版本。 */
export const PROJECTOR_VERSION = 1;

/** 压缩预算和边界策略版本。 */
export const COMPACTION_POLICY_VERSION = 1;

/**
 * 已冻结且可进入摘要源的消息 Part。
 */
export interface ImmutableChatPart {
  /** Part 所属消息标识。 */
  messageId: string;
  /** 已进入终态的 Part 快照。 */
  part: ChatMessagePart;
}

/**
 * 插入 pending checkpoint 前冻结的压缩源。
 */
export interface CompactionSourceSnapshot {
  /** 上一个成功 checkpoint 的摘要。 */
  parentCheckpoint?: StructuredContextSummary;
  /** 按原始拓扑顺序排列的 immutable Part。 */
  sourceParts: ImmutableChatPart[];
  /** 被摘要范围内最后一个 Part 标识。 */
  boundaryPartId: string;
  /** 冻结源计算得到的版本化指纹。 */
  sourceFingerprint: string;
}
