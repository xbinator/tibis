/**
 * @file auto-name.mts
 * @description ChatRuntime 自动命名 prompt 与标题清理辅助函数。
 */
import type { ChatRuntimeAutoNameInput } from 'types/chat-runtime';

/** 自动命名默认 Prompt 模板。 */
const AUTONAME_DEFAULT_PROMPT = `# Role
你是一个会话标题生成器。

# Task
根据用户与 AI 的对话内容，生成一个简洁准确的会话标题。

# Rules
1. 标题长度不超过 20 个汉字
2. 标题应概括对话的核心主题，而非描述对话格式
3. 只输出标题文本，不要包含引号、标点或任何额外说明
4. 使用用户使用的语言（中文对话输出中文标题，英文对话输出英文标题）

# Conversation
用户: {{USER_MESSAGE}}

AI: {{AI_RESPONSE}}

# Title
`;

/**
 * 构建自动命名 prompt。
 * @param input - 自动命名输入
 * @returns prompt 文本
 */
export function createAutoNamePrompt(input: ChatRuntimeAutoNameInput): string {
  return AUTONAME_DEFAULT_PROMPT.replace(/\{\{USER_MESSAGE\}\}/g, input.userMessage).replace(/\{\{AI_RESPONSE\}\}/g, input.aiResponse);
}

/**
 * 清理模型输出的标题文本。
 * @param text - 原始模型输出
 * @returns 标题文本
 */
export function normalizeAutoNameTitle(text: string): string {
  return text.replace(/(^["'\u201c\u201d\u2018\u2019]+)|(["'\u201c\u201d\u2018\u2019]+$)/g, '').trim();
}
