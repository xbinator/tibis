/**
 * @file fingerprint.mts
 * @description 上下文压缩源拓扑的稳定序列化与版本化 SHA-256 指纹。
 */
import { createHash } from 'node:crypto';
import type { ChatMessagePart, CompactionBudgetSnapshot, CompactionModelSnapshot } from 'types/chat';
import { isPlainObject } from 'lodash-es';
import { COMPACTION_POLICY_VERSION, FINGERPRINT_VERSION, PROJECTOR_VERSION, SUMMARY_SCHEMA_VERSION } from './types.mjs';

/**
 * 进入 source fingerprint 的 Part 摘要。
 */
export interface FingerprintSource {
  /** Part 所属消息标识。 */
  messageId: string;
  /** Part 稳定标识。 */
  partId: string;
  /** Part 类型。 */
  type: ChatMessagePart['type'];
  /** 不含 Part ID 的内容哈希。 */
  contentHash: string;
}

/**
 * source fingerprint 的完整协议输入。
 */
export interface CompactionFingerprintInput {
  /** fingerprint 序列化协议版本。 */
  fingerprintVersion: number;
  /** 结构化摘要 schema 版本。 */
  summarySchemaVersion: number;
  /** 上下文投影算法版本。 */
  projectorVersion: number;
  /** 压缩预算和边界策略版本。 */
  compactionPolicyVersion: number;
  /** 生成 checkpoint 的脱敏模型快照。 */
  modelSnapshot: CompactionModelSnapshot;
  /** 生成 checkpoint 的预算快照。 */
  budgetSnapshot: CompactionBudgetSnapshot;
  /** 上一个成功 checkpoint 标识。 */
  parentCheckpointId?: string;
  /** 当前压缩范围的最后一个 Part 标识。 */
  boundaryPartId: string;
  /** 按实际拓扑顺序排列的源 Part。 */
  sources: FingerprintSource[];
}

/**
 * 从实际 Part 创建 fingerprint 的输入。
 */
export interface CreateFingerprintInput {
  /** 生成 checkpoint 的脱敏模型快照。 */
  modelSnapshot: CompactionModelSnapshot;
  /** 生成 checkpoint 的预算快照。 */
  budgetSnapshot: CompactionBudgetSnapshot;
  /** 上一个成功 checkpoint 标识。 */
  parentCheckpointId?: string;
  /** 当前压缩范围的最后一个 Part 标识。 */
  boundaryPartId: string;
  /** 按实际拓扑顺序排列的源 Part。 */
  sources: Array<{ messageId: string; part: ChatMessagePart }>;
}

/**
 * 递归规范化对象键顺序并保留数组顺序。
 * @param value - 待规范化值
 * @returns 可稳定 JSON 序列化的值
 */
function normalizeStableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeStableValue);
  if (!isPlainObject(value)) return value;

  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(record)
      .filter((key: string): boolean => record[key] !== undefined)
      .sort((left: string, right: string): number => left.localeCompare(right))
      .map((key: string): [string, unknown] => [key, normalizeStableValue(record[key])])
  );
}

/**
 * 稳定序列化 JSON 值。
 * @param value - 待序列化值
 * @returns 键顺序稳定的 JSON 文本
 */
function stableStringify(value: unknown): string {
  return JSON.stringify(normalizeStableValue(value)) ?? 'null';
}

/**
 * 计算稳定值的 SHA-256。
 * @param value - 待哈希值
 * @returns 带算法前缀的哈希
 */
function hashStableValue(value: unknown): string {
  return `sha256:${createHash('sha256').update(stableStringify(value)).digest('hex')}`;
}

/**
 * 计算不包含 Part ID 的内容哈希。
 * @param part - 实际消息 Part
 * @returns Part 内容哈希
 */
function hashPartContent(part: ChatMessagePart): string {
  const content = Object.fromEntries(Object.entries(part).filter(([key]: [string, unknown]): boolean => key !== 'id'));
  return hashStableValue(content);
}

/**
 * 从实际消息 Part 创建版本化 fingerprint 输入。
 * @param input - 模型、预算、拓扑和实际 Part
 * @returns 不复用旧 contentHash 的 fingerprint 输入
 */
export function createFingerprintInput(input: CreateFingerprintInput): CompactionFingerprintInput {
  return {
    fingerprintVersion: FINGERPRINT_VERSION,
    summarySchemaVersion: SUMMARY_SCHEMA_VERSION,
    projectorVersion: PROJECTOR_VERSION,
    compactionPolicyVersion: COMPACTION_POLICY_VERSION,
    modelSnapshot: structuredClone(input.modelSnapshot),
    budgetSnapshot: structuredClone(input.budgetSnapshot),
    parentCheckpointId: input.parentCheckpointId,
    boundaryPartId: input.boundaryPartId,
    sources: input.sources.map(
      ({ messageId, part }): FingerprintSource => ({
        messageId,
        partId: part.id,
        type: part.type,
        contentHash: hashPartContent(part)
      })
    )
  };
}

/**
 * 计算完整 source fingerprint。
 * @param input - 版本化 fingerprint 输入
 * @returns 带算法前缀的 SHA-256
 */
export function buildSourceFingerprint(input: CompactionFingerprintInput): string {
  return hashStableValue(input);
}
