/**
 * @file injector.ts
 * @description 记忆注入到 system prompt 的构建器，控制 token 预算和裁剪策略
 */
import type { MemoryDoc, MemorySection } from './types';

/** 裁剪优先级：数字越小越优先保留 */
const PRUNE_PRIORITY: Record<string, number> = {
  Instructions: 1,
  Preferences: 2,
  'Current Context': 3,
  Facts: 4,
  Habits: 5,
  Projects: 6
};

/** 默认最大字符数（约 1000 tokens） */
const DEFAULT_MAX_CHARS = 4000;

/**
 * 将分区列表格式化为 Markdown 文本
 * @param sections - 非空分区列表
 * @returns 格式化后的文本
 */
function formatSections(sections: MemorySection[]): string {
  return sections
    .map((section) => {
      const items = section.items.map((item) => `- ${item.content}`).join('\n');
      return `# ${section.category}\n${items}`;
    })
    .join('\n\n');
}

/**
 * 按 token 预算裁剪分区，优先保留高优先级分区
 * @param sections - 非空分区列表
 * @param header - XML 标签内的头部文本
 * @param maxChars - 最大字符数
 * @returns 裁剪后的完整注入文本
 */
function pruneToBudget(sections: MemorySection[], header: string, maxChars: number): string {
  const sorted = [...sections].sort((a, b) => (PRUNE_PRIORITY[a.category] ?? 99) - (PRUNE_PRIORITY[b.category] ?? 99));

  const keptSections: MemorySection[] = [];
  const overhead = `<user_memory>\n${header}\n\n\n</user_memory>`.length;
  let remaining = maxChars - overhead;

  for (const section of sorted) {
    const sectionText = formatSections([section]);
    if (sectionText.length <= remaining) {
      keptSections.push(section);
      remaining -= sectionText.length + 2;
    } else {
      continue;
    }
  }

  if (keptSections.length === 0) return '';

  const content = formatSections(keptSections);
  return `<user_memory>\n${header}\n\n${content}\n</user_memory>`;
}

/**
 * 构建要注入到 System Prompt 的记忆上下文
 *
 * 格式：<user_memory>...</user_memory>
 * 包含所有分区内容，控制在 token 预算内
 *
 * @param doc - 记忆文档
 * @param maxChars - 最大字符数，默认 4000
 * @returns 注入到 system prompt 的字符串，无记忆时返回空字符串
 */
export function buildSystemPromptContext(doc: MemoryDoc, maxChars: number = DEFAULT_MAX_CHARS): string {
  const nonEmptySections = doc.sections.filter((section) => section.items.length > 0);
  if (nonEmptySections.length === 0) return '';

  const header = '以下是关于该用户的已知信息，请在回应中自然地参考这些信息，不要刻意提及"根据记忆..."。';
  const fullContent = formatSections(nonEmptySections);

  const fullText = `<user_memory>\n${header}\n\n${fullContent}\n</user_memory>`;

  if (fullText.length <= maxChars) return fullText;

  return pruneToBudget(nonEmptySections, header, maxChars);
}
