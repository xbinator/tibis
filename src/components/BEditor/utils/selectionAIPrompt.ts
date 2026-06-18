/**
 * @file selectionAIPrompt.ts
 * @description BEditor 选区 AI 固定提示词构建工具。
 */

/**
 * 内容编辑助手的内置提示词模板。
 */
const SELECTION_AI_PROMPT_TEMPLATE = `# Role
你是一个 Markdown 内容编辑助手。

# Task
根据用户的指令，对下方 Markdown 内容进行修改。

# Rules
1. 仅输出修改后的 Markdown 内容，不要包含任何分隔符或额外标记
2. 保持原有 Markdown 语法结构
3. 不要新增解释性文字

# Original Content
{{SELECTED_TEXT}}

# User Instruction
{{USER_INPUT}}`;

/**
 * 用于替换选中文本占位符的正则。
 */
const RE_SELECTED_TEXT = /\{\{SELECTED_TEXT\}\}/g;

/**
 * 用于替换用户指令占位符的正则。
 */
const RE_USER_INPUT = /\{\{USER_INPUT\}\}/g;

/**
 * 构建内容编辑助手的固定提示词。
 * @param selectedText - 当前选中的 Markdown 内容
 * @param userInput - 用户本次输入的编辑指令
 * @returns 可直接发送给模型的提示词
 */
export function buildSelectionAIPrompt(selectedText: string, userInput: string): string {
  return SELECTION_AI_PROMPT_TEMPLATE.replace(RE_SELECTED_TEXT, selectedText).replace(RE_USER_INPUT, userInput);
}
