/**
 * @file parser.ts
 * @description MEMORY.md 文件解析与序列化，将 Markdown 文本与 MemoryDoc 结构互转
 */
import type { MemoryCategory, MemoryDoc, MemoryItem, MemorySection } from './types';
import { MEMORY_CATEGORIES } from './types';

/** MEMORY.md 文件头注释 */
const FILE_HEADER = `# User Memory
`;

/**
 * 从 Markdown 文本中提取指定分区的条目
 * @param text - Markdown 原始文本
 * @param category - 分区名称
 * @returns 该分区下的所有记忆条目
 */
function extractSectionItems(text: string, category: MemoryCategory): MemoryItem[] {
  const lines = text.split('\n');
  const items: MemoryItem[] = [];
  let inTargetSection = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === `## ${category}`) {
      inTargetSection = true;
      continue;
    }

    // 遇到下一个二级标题，结束当前分区
    if (trimmed.startsWith('## ') && inTargetSection) {
      break;
    }

    // 在目标分区内，提取 bullet point
    if (inTargetSection && trimmed.startsWith('- ')) {
      const content = trimmed.slice(2).trim();
      if (content) {
        items.push({ content });
      }
    }
  }

  return items;
}

/**
 * 将 MEMORY.md 文本解析为 MemoryDoc 结构
 * @param text - MEMORY.md 原始文本
 * @returns 解析后的记忆文档
 */
export function parseMemoryDoc(text: string): MemoryDoc {
  const sections: MemorySection[] = [];

  for (const category of MEMORY_CATEGORIES) {
    const items = extractSectionItems(text, category);
    sections.push({ category, items });
  }

  return { sections };
}

/**
 * 将 MemoryDoc 序列化为 MEMORY.md 文本
 * @param doc - 记忆文档结构
 * @returns 序列化后的 Markdown 文本
 */
export function serializeMemoryDoc(doc: MemoryDoc): string {
  const parts: string[] = [FILE_HEADER];

  for (const section of doc.sections) {
    if (section.items.length === 0) continue;
    parts.push(`## ${section.category}`);
    for (const item of section.items) {
      parts.push(`- ${item.content}`);
    }
    parts.push('');
  }

  return parts.join('\n');
}

/**
 * 创建空的记忆文档
 * @returns 包含所有分区但无条目的空文档
 */
export function createEmptyMemoryDoc(): MemoryDoc {
  return {
    sections: MEMORY_CATEGORIES.map((category) => ({ category, items: [] }))
  };
}
