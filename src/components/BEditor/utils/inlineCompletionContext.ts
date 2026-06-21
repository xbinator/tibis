/**
 * @file inlineCompletionContext.ts
 * @description BEditor 内联补全上下文提取、Prompt 组装与输出清洗工具。
 */
import type { InlineCompletionPane } from '../adapters/inlineCompletionAdapter';

const MIN_DISPLAY_CHARS = 2;
const MAX_DISPLAY_CHARS = 160;
const PREFIX_CHAR_BUDGET = 2400;
const SUFFIX_CHAR_BUDGET = 900;

/**
 * Prompt 输入上下文。
 */
export interface InlineCompletionPromptInput {
  /** 文件名 */
  filename: string;
  /** 文件类型 */
  fileType: string;
  /** 写作模式 */
  writingMode: InlineCompletionPane;
  /** 当前标题路径 */
  headingPath: string[];
  /** 光标前文本 */
  prefix: string;
  /** 光标后文本 */
  suffix: string;
}

/**
 * 提取光标附近上下文。
 * @param documentText - 完整文档文本
 * @param cursorPosition - 光标绝对位置
 * @returns prefix 与 suffix 上下文
 */
export function extractInlineCompletionContext(documentText: string, cursorPosition: number): { prefix: string; suffix: string } {
  const safePosition = Math.min(Math.max(0, cursorPosition), documentText.length);
  const prefix = documentText.slice(Math.max(0, safePosition - PREFIX_CHAR_BUDGET), safePosition);
  const suffix = documentText.slice(safePosition, safePosition + SUFFIX_CHAR_BUDGET);
  return { prefix, suffix };
}

/**
 * 从 Markdown 文本中解析当前标题路径。
 * @param prefix - 光标前文本
 * @returns 标题路径，最多 6 级
 */
export function resolveInlineCompletionHeadingPath(prefix: string): string[] {
  const headings: string[] = [];
  prefix.split(/\r?\n/).forEach((line: string): void => {
    const match = /^(#{1,6})\s+(.+)$/.exec(line.trim());
    if (!match) {
      return;
    }

    const level = match[1].length;
    headings.splice(level - 1);
    headings[level - 1] = match[2].trim();
  });
  return headings.filter(Boolean).slice(0, 6);
}

/**
 * 构建内联补全 prompt。
 * @param input - prompt 输入上下文
 * @returns 完整 prompt
 */
export function buildInlineCompletionPrompt(input: InlineCompletionPromptInput): string {
  const headingPath = input.headingPath.length > 0 ? input.headingPath.join(' > ') : '(none)';
  return [
    "You are an inline completion engine. Predict a short ghost-text continuation at the user's cursor.",
    '',
    '## Document metadata',
    `- Filename: ${input.filename || 'Untitled'}`,
    `- File type: ${input.fileType || '.md'}`,
    `- Writing mode: ${input.writingMode}`,
    '',
    '## Current heading path',
    headingPath,
    '',
    '## Text before cursor',
    `${input.prefix}<cursor>`,
    '',
    '## Text after cursor',
    input.suffix,
    '',
    '## Rules',
    '- Continue directly after `<cursor>` with a short inline completion. Do not repeat any text already before `<cursor>`.',
    '- Do not output the literal string `<cursor>`.',
    '- Do not wrap the output in markdown code blocks.',
    '- Return at most one logical line. Do not generate full sections, full tables, long lists, summaries, or explanations.',
    '- If the cursor is inside a heading, list item, or table row, complete only that current heading, item, or row.',
    '- Do not expand lists unless the cursor is already inside a list item.',
    '- Keep the same writing style, tone, and markdown formatting.',
    '- Output only the continuation text, normally no more than 80 Chinese characters or 120 English characters.'
  ].join('\n');
}

/**
 * 清洗模型输出，避免污染编辑器。
 * @param text - 原始模型输出
 * @returns 可显示的补全文本
 */
export function normalizeInlineCompletionText(text: string): string {
  return text
    .replace(/^```(?:markdown|md)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .replace(/<cursor>/gi, '')
    .replace(/^---[\s\S]*?---\s*/, '')
    .trimEnd();
}

/**
 * 截断 ghost text 到可显示范围。
 * @param text - 清洗后的补全文本
 * @returns 截断后的文本
 */
export function truncateInlineCompletionText(text: string): string {
  const firstLineBreak = /\r?\n/.exec(text);
  const inlineText = firstLineBreak ? text.slice(0, firstLineBreak.index) : text;
  return inlineText.length > MAX_DISPLAY_CHARS ? inlineText.slice(0, MAX_DISPLAY_CHARS).trimEnd() : inlineText;
}

/**
 * 判断 ghost text 是否值得显示。
 * @param text - 补全文本
 * @param suffix - 光标后文本
 * @returns 是否显示
 */
export function shouldDisplayInlineCompletion(text: string, suffix: string): boolean {
  if (text.trim().length < MIN_DISPLAY_CHARS) {
    return false;
  }

  const normalizedText = text.trim().toLowerCase();
  const normalizedSuffix = suffix.trim().toLowerCase();
  if (!normalizedSuffix) {
    return true;
  }

  const overlapPrefix = normalizedText.slice(0, Math.max(4, Math.floor(normalizedText.length * 0.8)));
  return !normalizedSuffix.startsWith(overlapPrefix);
}
