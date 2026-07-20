/**
 * @file prompt-region.mts
 * @description 从当前 Screen Snapshot 提取并哈希稳定 prompt region。
 */
import { createHash } from 'node:crypto';
import type { ShellScreenSnapshot, StablePromptRegion } from './types.mjs';
import { classifyBooleanPrompt } from './boolean-prompt.mjs';

/**
 * 规范化 prompt 文本但保留选项缩进。
 * @param content - 原始 prompt 文本
 * @returns 规范化文本
 */
function normalizePrompt(content: string): string {
  const lines = content
    .replace(/\r\n?/g, '\n')
    .normalize('NFC')
    .replace(/\u00a0/g, ' ')
    .split('\n')
    .map((line: string): string => line.replace(/[\t ]+$/g, ''));
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines.join('\n');
}

/**
 * 判断一行是否为显式默认布尔提示。
 * @param line - 当前行
 * @returns 是否匹配
 */
function isBooleanPrompt(line: string): boolean {
  return classifyBooleanPrompt(line) !== null;
}

/**
 * 判断一行是否为 wizard 选项。
 * @param line - 当前行
 * @returns 是否匹配
 */
function isOptionLine(line: string): boolean {
  return /^\s*(?:❯|>|●|○|◉)\s+\S/.test(line) || /^\s{2,}\S/.test(line);
}

/**
 * 判断一行是否为已选中的 wizard 选项。
 * @param line - 当前行
 * @returns 是否包含唯一选择标记
 */
function isSelectedLine(line: string): boolean {
  return /^\s*(?:❯|>|●|◉)\s+\S/.test(line);
}

/** 已提取提示块及其屏幕位置。 */
interface ExtractedPrompt {
  /** 提示块文本。 */
  content: string;
  /** 提示块在规范化屏幕中的起始行。 */
  startLine: number;
  /** wizard 当前选择索引。 */
  selectedIndex?: number;
}

/**
 * 从规范化屏幕中提取当前提示块。
 * @param content - 规范化屏幕文本
 * @returns 提示块或 null
 */
function extractPrompt(content: string): ExtractedPrompt | null {
  const lines = content.split('\n');
  const lastLine = lines[lines.length - 1] ?? '';
  if (isBooleanPrompt(lastLine)) return { content: lastLine, startLine: lines.length - 1 };

  // Wizard 必须位于屏幕底部，并由问题头、至少两个选项和唯一选择标记组成。
  let optionStart = lines.length;
  while (optionStart > 0 && isOptionLine(lines[optionStart - 1] ?? '')) optionStart -= 1;
  const optionLines = lines.slice(optionStart);
  const selectedRows = optionLines
    .map((line: string, index: number): number => (isSelectedLine(line) ? index : -1))
    .filter((index: number): boolean => index >= 0);
  const headerIndex = optionStart - 1;
  const header = lines[headerIndex] ?? '';
  if (optionLines.length >= 2 && selectedRows.length === 1 && /(?:\?|:)\s*$/.test(header)) {
    return {
      content: lines.slice(headerIndex).join('\n'),
      startLine: headerIndex,
      selectedIndex: selectedRows[0]
    };
  }

  // 裸输入光标必须连同上一行返回，才能优先识别路径、账号或秘密输入。
  if (/^\s*(?:>|›)\s*$/.test(lastLine) && lines.length >= 2) {
    const startLine = lines.length - 2;
    return { content: lines.slice(startLine).join('\n'), startLine };
  }
  return /(?:\?|:)\s*$/.test(lastLine) ? { content: lastLine, startLine: lines.length - 1 } : null;
}

/**
 * 创建稳定 prompt region。
 * @param snapshot - 当前 Screen Snapshot
 * @returns 可哈希提示区域，无提示时返回 null
 */
export function createPromptRegion(snapshot: ShellScreenSnapshot): StablePromptRegion | null {
  const normalized = normalizePrompt(snapshot.content);
  const extracted = extractPrompt(normalized);
  if (!extracted) return null;
  const cursor = {
    row: Math.max(0, snapshot.cursor.row - extracted.startLine),
    column: snapshot.cursor.column,
    visible: snapshot.cursor.visible
  };
  const hashInput = JSON.stringify({ content: extracted.content, cursor, selectedIndex: extracted.selectedIndex });
  return {
    content: extracted.content,
    cursor,
    selectedIndex: extracted.selectedIndex,
    screenHash: createHash('sha256').update(hashInput).digest('hex')
  };
}
