/**
 * @file selector.ts
 * @description 记忆相关性选择器，根据当前请求上下文筛选需要注入的记忆条目。
 */
import type { MemoryCategory, MemoryDoc, MemoryItem, MemorySection, MemorySelectionContext } from './types';
import { uniq } from 'lodash-es';
import { MEMORY_CATEGORIES } from './types';

/** 核心偏好在无命中时最多保留的条目数。 */
const CORE_PREFERENCE_LIMIT = 3;

/** 中文关键词滑窗最小长度。 */
const CJK_KEYWORD_MIN_LENGTH = 2;

/** 中文关键词滑窗最大长度，避免长句生成过多低价值关键词。 */
const CJK_KEYWORD_MAX_LENGTH = 4;

/** 相关性分区基础权重，越大表示命中后越优先。 */
const RELEVANCE_CATEGORY_WEIGHT: Record<MemoryCategory, number> = {
  Instructions: 0,
  Preferences: 2,
  Habits: 1,
  Facts: 2,
  Projects: 3,
  'Current Context': 3
};

/** 记忆候选条目。 */
interface MemoryItemCandidate {
  /** 分区名称。 */
  category: MemoryCategory;
  /** 原始条目。 */
  item: MemoryItem;
  /** 相关性分数。 */
  score: number;
  /** 条目原始顺序。 */
  itemIndex: number;
}

/**
 * 归一化记忆匹配文本。
 * @param value - 原始文本
 * @returns 归一化后的文本
 */
export function normalizeMemoryText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\w\s./@_\u4e00-\u9fff-]/g, ' ')
    .replace(/[./@_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 判断关键词是否完全由中文字符组成。
 * @param keyword - 待判断关键词
 * @returns 是否为纯中文关键词
 */
function isPureCjkKeyword(keyword: string): boolean {
  return /^[\u4e00-\u9fff]+$/.test(keyword);
}

/**
 * 从连续中文文本中生成短关键词滑窗。
 * @param value - 已归一化文本
 * @returns 中文关键词列表
 */
function extractCjkNgramKeywords(value: string): string[] {
  const sequences = value.match(/[\u4e00-\u9fff]+/g) ?? [];
  const keywords: string[] = [];

  sequences.forEach((sequence) => {
    const maxLength = Math.min(CJK_KEYWORD_MAX_LENGTH, sequence.length);
    for (let length = CJK_KEYWORD_MIN_LENGTH; length <= maxLength; length += 1) {
      for (let start = 0; start <= sequence.length - length; start += 1) {
        keywords.push(sequence.slice(start, start + length));
      }
    }
  });

  return keywords;
}

/**
 * 从普通文本中提取关键词。
 * @param value - 原始文本
 * @returns 关键词列表
 */
function extractTextKeywords(value: string): string[] {
  const normalized = normalizeMemoryText(value);
  if (!normalized) return [];

  const wordKeywords = normalized.split(/\s+/).filter((keyword) => keyword.length >= 2 && !isPureCjkKeyword(keyword));
  return uniq([...wordKeywords, ...extractCjkNgramKeywords(normalized)]);
}

/**
 * 从路径中提取关键词。
 * @param path - 文件路径
 * @returns 路径关键词
 */
function extractPathKeywords(path: string): string[] {
  const fileName = path.split('/').pop() ?? path;
  return [...extractTextKeywords(path), ...extractTextKeywords(fileName)];
}

/**
 * 提取记忆召回关键词。
 * @param context - 当前请求上下文
 * @returns 去重后的关键词列表
 */
export function extractMemoryKeywords(context: MemorySelectionContext): string[] {
  const workspaceName = context.workspaceRoot?.split('/').filter(Boolean).pop() ?? '';
  return uniq([...extractTextKeywords(context.userMessage), ...context.references.flatMap(extractPathKeywords), ...extractTextKeywords(workspaceName)]);
}

/**
 * 计算记忆条目相关性分数。
 * @param item - 记忆条目
 * @param category - 分区名称
 * @param keywords - 当前请求关键词
 * @returns 相关性分数
 */
export function scoreMemoryItemRelevance(item: MemoryItem, category: MemoryCategory, keywords: string[]): number {
  const normalizedContent = normalizeMemoryText(item.content);
  const hitCount = keywords.reduce((count, keyword) => (normalizedContent.includes(keyword) ? count + 1 : count), 0);
  if (hitCount === 0) return 0;

  return hitCount + RELEVANCE_CATEGORY_WEIGHT[category];
}

/**
 * 将候选条目恢复为分区结构。
 * @param candidates - 候选条目
 * @returns 按原始分区顺序组织的分区列表
 */
function candidatesToSections(candidates: MemoryItemCandidate[]): MemorySection[] {
  return MEMORY_CATEGORIES.map((category) => {
    const items = candidates
      .filter((candidate) => candidate.category === category)
      .sort((a, b) => b.score - a.score || a.itemIndex - b.itemIndex)
      .map((candidate) => ({ content: candidate.item.content }));

    return { category, items };
  }).filter((section) => section.items.length > 0);
}

/**
 * 选择与当前请求相关的记忆分区。
 * @param doc - 完整记忆文档
 * @param context - 当前请求上下文
 * @returns 筛选后的记忆分区
 */
export function selectRelevantMemorySections(doc: MemoryDoc, context: MemorySelectionContext): MemorySection[] {
  const keywords = extractMemoryKeywords(context);
  const candidates: MemoryItemCandidate[] = [];

  doc.sections.forEach((section) => {
    section.items.forEach((item, itemIndex) => {
      if (section.category === 'Instructions') {
        candidates.push({ category: section.category, item, score: Number.MAX_SAFE_INTEGER, itemIndex });
        return;
      }

      const score = scoreMemoryItemRelevance(item, section.category, keywords);
      if (score > 0) {
        candidates.push({ category: section.category, item, score, itemIndex });
      }
    });
  });

  const hasPreferenceMatch = candidates.some((candidate) => candidate.category === 'Preferences');
  if (!hasPreferenceMatch) {
    const preferenceSection = doc.sections.find((section) => section.category === 'Preferences');
    preferenceSection?.items.slice(0, CORE_PREFERENCE_LIMIT).forEach((item, itemIndex) => {
      candidates.push({ category: 'Preferences', item, score: 1, itemIndex });
    });
  }

  return candidatesToSections(candidates);
}
