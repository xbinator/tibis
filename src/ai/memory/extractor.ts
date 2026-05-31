/**
 * @file extractor.ts
 * @description AI 记忆提取 prompt 构建，将对话消息转为结构化提取请求
 */
import type { ExtractionMessage, MemoryDoc } from './types';
import { MEMORY_CATEGORIES } from './types';

/** AI 提取结果的严格输出格式约束 */
const OUTPUT_FORMAT = `Output ONLY valid JSON array. Each item must have:
- "action": "add" | "update" | "remove"
- "section": "Instructions" | "Preferences" | "Habits" | "Facts" | "Projects" | "Current Context"
- "content": string (single line, no markdown formatting)
- "reason": string (brief explanation, for debugging)

Action rules:
- "add": new information not covered by any existing memory item
- "update": existing memory item needs correction/refinement (e.g., name changed, habit updated).
  Use this when the new info contradicts or supersedes an existing item.
  Mention which item you are updating in the reason.
- "remove": existing memory item is no longer true or relevant

Example:
[
  {"action": "add", "section": "Facts", "content": "用户正在开发记忆系统功能", "reason": "对话中明确提及"},
  {"action": "update", "section": "Facts", "content": "助手名为小宝", "reason": "更新助手名称，替代旧的"},
  {"action": "remove", "section": "Facts", "content": "用户使用 Windows", "reason": "用户已切换到 macOS"}
]

Do NOT wrap in markdown code blocks. Output raw JSON array only.
If nothing worth remembering, output empty array: []`;

/**
 * 将对话消息格式化为文本
 * @param messages - 对话消息列表
 * @returns 格式化后的对话文本
 */
function formatConversation(messages: ExtractionMessage[]): string {
  return messages.map((msg) => `[${msg.role}]: ${msg.content}`).join('\n\n');
}

/**
 * 将现有记忆格式化为完整摘要（展示所有条目，让 AI 能判断 update vs add）
 * @param doc - 当前记忆文档
 * @returns 摘要文本
 */
function formatMemorySummary(doc: MemoryDoc): string {
  if (!doc.sections.length) return '(empty)';

  return doc.sections
    .filter((section) => section.items.length > 0)
    .map((section) => {
      const items = section.items.map((item) => `  - ${item.content}`).join('\n');
      return `## ${section.category}\n${items}`;
    })
    .join('\n\n');
}

/**
 * 构建发送给 AI 的记忆提取 prompt
 * @param messages - 本次对话的用户和助手消息
 * @param existingMemory - 当前已有的记忆文档（供 AI 参考，避免重复提取）
 * @returns 完整的 prompt 字符串
 */
export function buildExtractionPrompt(messages: ExtractionMessage[], existingMemory: MemoryDoc): string {
  const conversationText = formatConversation(messages);
  const memorySummaryText = formatMemorySummary(existingMemory);

  return `You are a memory extraction assistant. Analyze the conversation and extract user information that should be remembered for future conversations.

Categories:
- Instructions: Long-term rules the user wants AI to always follow (e.g., "always use TypeScript")
- Preferences: Output style preferences (e.g., "prefer functional programming style")
- Habits: Work habits and patterns (e.g., "writes tests before implementation")
- Facts: Long-term facts about the user or their environment (e.g., "project uses Vue 3 + Pinia")
- Projects: Long-term project descriptions the user is involved in
- Current Context: Recent or ongoing work items

Existing memory summary (avoid duplicating these):
${memorySummaryText}

Conversation to analyze:
${conversationText}

${OUTPUT_FORMAT}`;
}

/**
 * 获取记忆提取的系统 prompt（用于 aiInvoke 调用）
 * @returns 系统 prompt 字符串
 */
export function getExtractionSystemPrompt(): string {
  const categoryList = MEMORY_CATEGORIES.map((c) => `- ${c}`).join('\n');

  return `You are a memory extraction assistant. You analyze conversations and extract user information into structured memory items.

Valid sections:
${categoryList}

${OUTPUT_FORMAT}`;
}
