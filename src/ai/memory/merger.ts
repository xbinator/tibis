/**
 * @file merger.ts
 * @description 记忆去重合并逻辑，将 AI 提取结果合并到现有记忆文档
 */
import type { ExtractedMemory, ExtractedMemoryItem, MemoryDoc } from './types';
import { intersection } from 'lodash-es';

/**
 * 从文本中提取关键词（分词 + 去停用词）
 * @param text - 输入文本
 * @returns 关键词数组（小写）
 */
export function extractKeywords(text: string): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fff]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1);

  const stopWords = new Set([
    'the',
    'a',
    'an',
    'is',
    'are',
    'was',
    'were',
    'be',
    'been',
    'being',
    'have',
    'has',
    'had',
    'do',
    'does',
    'did',
    'will',
    'would',
    'could',
    'should',
    'may',
    'might',
    'can',
    'shall',
    'to',
    'of',
    'in',
    'for',
    'on',
    'with',
    'at',
    'by',
    'from',
    'as',
    'into',
    'through',
    'during',
    'before',
    'after',
    'above',
    'below',
    'between',
    'out',
    'off',
    'over',
    'under',
    'again',
    'further',
    'then',
    'once',
    'and',
    'but',
    'or',
    'nor',
    'not',
    'so',
    'yet',
    'both',
    'either',
    'neither',
    'each',
    'every',
    'all',
    'any',
    'few',
    'more',
    'most',
    'other',
    'some',
    'such',
    'no',
    'only',
    'own',
    'same',
    'than',
    'too',
    'very',
    'just',
    'because',
    'if',
    'when',
    'where',
    'how',
    'what',
    'which',
    'who',
    'whom',
    'this',
    'that',
    'these',
    'those',
    'it',
    'its',
    '的',
    '了',
    '在',
    '是',
    '我',
    '有',
    '和',
    '就',
    '不',
    '人',
    '都',
    '一',
    '一个',
    '上',
    '也',
    '很',
    '到',
    '说',
    '要',
    '去',
    '你',
    '会',
    '着',
    '没有',
    '看',
    '好',
    '自己',
    '这'
  ]);

  return words.filter((w) => !stopWords.has(w));
}

/**
 * 检查两条记忆是否相似
 * @param newItem - 新记忆内容
 * @param existingItem - 已有记忆内容
 * @param threshold - 相似度阈值，默认 0.5
 * @returns 是否相似
 */
export function isSimilar(newItem: string, existingItem: string, threshold = 0.5): boolean {
  if (newItem === existingItem) return true;

  if (newItem.includes(existingItem) || existingItem.includes(newItem)) return true;

  const newKeywords = extractKeywords(newItem);
  const existingKeywords = extractKeywords(existingItem);
  if (newKeywords.length === 0 || existingKeywords.length === 0) return false;

  const overlap = intersection(newKeywords, existingKeywords);
  return overlap.length / Math.max(newKeywords.length, existingKeywords.length) > threshold;
}

/**
 * 在分区内查找与指定内容相似的条目索引
 * @param items - 现有条目列表
 * @param content - 要匹配的内容
 * @param threshold - 相似度阈值
 * @returns 相似条目的索引，未找到返回 -1
 */
function findSimilarIndex(items: { content: string }[], content: string, threshold: number): number {
  return items.findIndex((item) => isSimilar(content, item.content, threshold));
}

/**
 * 按内容匹配删除条目（AI remove 操作）
 * @param section - 目标分区
 * @param content - 要删除的内容
 */
function removeByMatch(section: { items: { content: string }[] }, content: string): void {
  const index = section.items.findIndex((item) => isSimilar(content, item.content, 0.5));
  if (index !== -1) {
    section.items.splice(index, 1);
  }
}

/**
 * 按内容匹配替换条目（AI update 操作）
 * @param section - 目标分区
 * @param content - 新内容
 */
function replaceByMatch(section: { items: { content: string }[] }, content: string): void {
  const index = section.items.findIndex((item) => isSimilar(content, item.content, 0.5));
  if (index !== -1) {
    section.items[index] = { content };
  } else {
    section.items.push({ content });
  }
}

/**
 * 校验 AI 提取结果的每一项，过滤无效条目
 * @param items - 原始解析结果
 * @returns 有效的提取条目
 */
function validateExtractedItems(items: unknown[]): ExtractedMemoryItem[] {
  const validActions = new Set(['add', 'update', 'remove']);
  const validSections = new Set(['Instructions', 'Preferences', 'Habits', 'Facts', 'Projects', 'Current Context']);

  return items.filter(
    (item): item is ExtractedMemoryItem =>
      typeof item === 'object' &&
      item !== null &&
      validActions.has((item as ExtractedMemoryItem).action) &&
      validSections.has((item as ExtractedMemoryItem).section) &&
      typeof (item as ExtractedMemoryItem).content === 'string' &&
      (item as ExtractedMemoryItem).content.trim().length > 0
  );
}

/**
 * 解析 AI 提取结果，支持 4 级降级处理
 * @param raw - AI 返回的原始文本
 * @returns 解析后的提取结果，全部失败返回空数组
 */
export function parseExtractionResult(raw: string): ExtractedMemory {
  // 1. 尝试直接解析
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return { items: validateExtractedItems(parsed) };
  } catch {
    // JSON 解析失败，尝试下一级降级
  }

  // 2. 尝试从 markdown code block 中提取
  const codeBlockMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    try {
      const parsed = JSON.parse(codeBlockMatch[1]);
      if (Array.isArray(parsed)) return { items: validateExtractedItems(parsed) };
    } catch {
      // code block 内 JSON 解析失败，尝试下一级降级
    }
  }

  // 3. 尝试正则提取 JSON 数组
  const arrayMatch = raw.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    try {
      const parsed = JSON.parse(arrayMatch[0]);
      if (Array.isArray(parsed)) return { items: validateExtractedItems(parsed) };
    } catch {
      // 正则提取的 JSON 解析失败，全部降级失败
    }
  }

  // 4. 全部失败 → 跳过本次提取（不破坏现有记忆）
  return { items: [] };
}

/**
 * 将 AI 提取的记忆合并到现有记忆文档中
 *
 * 合并优先级：
 * - AI 的 remove/update → 无条件执行（AI 做了语义判断）
 * - AI 的 add → 做字符串相似度安全检查（相似度 > 0.5 则用新内容替换旧条目），不相似则追加
 *
 * @param current - 当前记忆文档
 * @param extracted - AI 提取的记忆操作列表
 * @returns 合并后的记忆文档
 */
export function mergeMemory(current: MemoryDoc, extracted: ExtractedMemory): MemoryDoc {
  const result: MemoryDoc = {
    sections: current.sections.map((section) => ({
      category: section.category,
      items: [...section.items]
    }))
  };

  for (const item of extracted.items) {
    const sectionIndex = result.sections.findIndex((s) => s.category === item.section);
    if (sectionIndex === -1) continue;

    const section = result.sections[sectionIndex];

    switch (item.action) {
      case 'remove':
        removeByMatch(section, item.content);
        break;

      case 'update':
        replaceByMatch(section, item.content);
        break;

      case 'add': {
        const similarIndex = findSimilarIndex(section.items, item.content, 0.5);
        if (similarIndex !== -1) {
          section.items[similarIndex] = { content: item.content };
        } else {
          section.items.push({ content: item.content });
        }
        break;
      }

      default:
        break;
    }
  }

  return result;
}
