/**
 * @file reference.ts
 * @description 聊天与输入框共用的文件引用 token 解析及类型定义。
 */

import { isDocumentRecord, recentFilesStorage } from '@/shared/storage';
import type { StoredDocumentRecord } from '@/shared/storage/files/types';
import { isUnsavedPath, parseUnsavedPath } from './unsaved';

/**
 * 文件引用解析结果
 */
export interface ParsedFileReference {
  /** 原始路径字符串 */
  rawPath: string;
  /** 已保存文件的绝对路径；未保存草稿时为 null */
  filePath: string | null;
  /** 未保存草稿的文件 ID；已保存文件时为 null */
  fileId: string | null;
  /** 展示用文件名 */
  fileName: string;
  /** 源码起始行号（1-based） */
  startLine: number;
  /** 源码结束行号（1-based） */
  endLine: number;
  /** 展示用源码行号文本 */
  lineText: string;
  /** 是否为未保存草稿引用 */
  isUnsaved: boolean;
}

/**
 * 文件引用导航目标
 */
export interface FileReferenceNavigationTarget {
  /** 原始路径字符串 */
  rawPath: string;
  /** 已保存文件的绝对路径；未保存草稿时为 null */
  filePath: string | null;
  /** 未保存草稿的文件 ID；已保存文件时为 null */
  fileId: string | null;
  /** 展示用文件名 */
  fileName: string;
  /** 源码起始行号（1-based） */
  startLine: number;
  /** 源码结束行号（1-based） */
  endLine: number;
}

/**
 * 文件引用 token 匹配结果。
 */
export interface FileReferenceTokenMatch {
  /** 原始完整 token，含双花括号 */
  token: string;
  /** token 起始 offset */
  start: number;
  /** token 结束 offset */
  end: number;
  /** 结构化文件引用 */
  reference: ParsedFileReference;
}

/**
 * 文件引用内容提取结果。
 */
export interface FileReference {
  /** 原始文件引用令牌 */
  token: string;
  /** 文件路径 */
  path: string;
  /** 源码起始行号（1-based），0 表示无行号 */
  startLine: number;
  /** 源码结束行号（1-based），0 表示无行号 */
  endLine: number;
  /** 指定行号范围的内容 */
  selectedContent: string;
  /** 文件完整内容 */
  fullContent: string;
}

/** 文件引用 token 前缀。 */
const FILE_REFERENCE_TOKEN_PREFIX = '@';
/** 文件引用行号后缀，支持单行 `#L644`、新格式范围 `#L644-685` 与旧格式范围 `#L644-L685`（解析时兼容历史消息）。 */
const FILE_REFERENCE_LINE_SUFFIX_PATTERN = /#L(\d+)(?:-L?(\d+))?$/;
/** 消息中的文件引用 token 正则表达式。路径允许空格，行号后缀由解析器校验。 */
export const FILE_REFERENCE_MESSAGE_TOKEN_PATTERN = /\{\{(@[^{}\n]+?)\}\}/g;

/**
 * 格式化文件引用行号展示文本。
 * @param startLine - 起始行号
 * @param endLine - 结束行号
 * @returns 行号展示文本，无行号时返回空字符串
 */
function formatFileReferenceLineText(startLine: number, endLine: number): string {
  if (startLine <= 0 || endLine <= 0) return '';
  return startLine === endLine ? `${startLine}` : `${startLine}-${endLine}`;
}

/**
 * 构建统一的文件引用 token。
 * @param rawPath - 原始文件路径或 unsaved:// 引用
 * @param startLine - 起始行号，0 表示引用整个文件
 * @param endLine - 结束行号，默认等于 startLine
 * @returns 文件引用 token
 */
export function buildFileReferenceToken(rawPath: string, startLine?: number, endLine?: number): string {
  const normalizedStartLine = startLine ?? 0;
  const inputEndLine = endLine ?? normalizedStartLine;

  if (normalizedStartLine <= 0 || inputEndLine <= 0) {
    return `{{@${rawPath}}}`;
  }

  const normalizedEndLine = inputEndLine < normalizedStartLine ? normalizedStartLine : inputEndLine;
  // 新格式：范围行号用 `#L{start}-{end}`；旧格式 `#L{start}-L{end}` 仍由解析器兼容。
  const lineSuffix = normalizedStartLine === normalizedEndLine ? `#L${normalizedStartLine}` : `#L${normalizedStartLine}-${normalizedEndLine}`;
  return `{{@${rawPath}${lineSuffix}}}`;
}

/**
 * 从路径字符串中提取展示用文件名。
 * @param rawPath - 原始路径字符串
 * @returns 文件名
 */
function extractFileName(rawPath: string): string {
  return rawPath.split(/[\\/]/).filter(Boolean).at(-1) ?? rawPath;
}

/**
 * 解析文件引用 token。
 * @param tokenContent - token 内容，包含 `@`
 * @returns 结构化解析结果；非法格式返回 null
 */
export function parseFileReferenceToken(tokenContent: string): ParsedFileReference | null {
  if (!tokenContent.startsWith(FILE_REFERENCE_TOKEN_PREFIX)) {
    return null;
  }

  const referenceText = tokenContent.slice(FILE_REFERENCE_TOKEN_PREFIX.length).trim();
  if (!referenceText) {
    return null;
  }

  const lineSuffixMatch = referenceText.match(FILE_REFERENCE_LINE_SUFFIX_PATTERN);
  const lineSuffixStartIndex = lineSuffixMatch?.index;
  const rawPathText = lineSuffixStartIndex === undefined ? referenceText : referenceText.slice(0, lineSuffixStartIndex);
  const rawPath = rawPathText.trim();
  if (!rawPath) {
    return null;
  }

  const unsavedReference = parseUnsavedPath(rawPath);
  const hasLineNumber = lineSuffixMatch !== null;
  const startLine = hasLineNumber ? Number(lineSuffixMatch[1]) : 0;
  const endLine = hasLineNumber ? Number(lineSuffixMatch[2] ?? lineSuffixMatch[1]) : 0;
  if (hasLineNumber && (!Number.isInteger(startLine) || !Number.isInteger(endLine) || startLine <= 0 || endLine < startLine)) {
    return null;
  }

  return {
    rawPath,
    filePath: unsavedReference ? null : rawPath,
    fileId: unsavedReference?.fileId ?? null,
    fileName: unsavedReference?.fileName ?? extractFileName(rawPath),
    startLine,
    endLine,
    lineText: formatFileReferenceLineText(startLine, endLine),
    isUnsaved: Boolean(unsavedReference)
  };
}

/**
 * 查找文本中的文件引用 token，并保留源码位置。
 * @param content - 输入文本
 * @returns 文件引用 token 列表
 */
export function findFileReferenceTokens(content: string): FileReferenceTokenMatch[] {
  return [...content.matchAll(FILE_REFERENCE_MESSAGE_TOKEN_PATTERN)]
    .map((match): FileReferenceTokenMatch | null => {
      const [token, tokenContent] = match;
      const reference = parseFileReferenceToken(tokenContent);
      if (!reference || match.index === undefined) return null;

      return {
        token,
        start: match.index,
        end: match.index + token.length,
        reference
      };
    })
    .filter((item): item is FileReferenceTokenMatch => item !== null);
}

/**
 * 从最近记录中查找文件引用对应的文件。
 * @param path - 文件路径或 unsaved:// 引用
 * @returns 命中的文件记录，不存在时返回 null
 */
async function findStoredFileByReferencePath(path: string): Promise<StoredDocumentRecord | null> {
  if (isUnsavedPath(path)) {
    const unsavedReference = parseUnsavedPath(path);
    const record = unsavedReference ? await recentFilesStorage.getRecentFile(unsavedReference.fileId) : null;

    return isDocumentRecord(record) ? record : null;
  }

  const files = await recentFilesStorage.getAllRecentFiles();
  return files.find((item): item is StoredDocumentRecord => isDocumentRecord(item) && item.path === path) ?? null;
}

/**
 * 从文件中提取指定行号范围的内容和完整内容。
 * 支持已保存文件路径与 unsaved:// 未保存草稿引用。
 * @param match - 文件引用 token 匹配结果
 * @returns 文件引用解析结果，文件不存在时返回空内容
 */
export async function extractFileReferenceLines(match: FileReferenceTokenMatch): Promise<FileReference> {
  const { token, reference } = match;
  const path = reference.rawPath;

  if (!path) {
    return { token, path: '', startLine: 0, endLine: 0, selectedContent: '', fullContent: '' };
  }

  const storedFile = await findStoredFileByReferencePath(path);
  if (!storedFile) {
    return { token, path, startLine: 0, endLine: 0, selectedContent: '', fullContent: '' };
  }

  const hasLineNumber = reference.startLine > 0 && reference.endLine > 0;
  const lines = storedFile.content.split('\n');
  const selectedContent = hasLineNumber
    ? lines.slice(Math.max(0, reference.startLine - 1), Math.min(lines.length, reference.endLine)).join('\n')
    : storedFile.content;

  return {
    token,
    selectedContent,
    fullContent: storedFile.content,
    path,
    startLine: reference.startLine,
    endLine: reference.endLine
  };
}
