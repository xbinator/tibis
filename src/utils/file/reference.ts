/**
 * @file reference.ts
 * @description 聊天与输入框共用的文件引用 token 解析及类型定义。
 */

import { parseUnsavedPath } from './unsaved';

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

/** 文件引用 token 正则表达式。行号为可选，兼容历史渲染行号片段。 */
const FILE_REFERENCE_TOKEN_PATTERN = /^#(\S+)(?:\s+(\d+)-(\d+)(?:\|\d+-\d+)?)?$/;
/** 消息中的文件引用 token 正则表达式。 */
export const FILE_REFERENCE_MESSAGE_TOKEN_PATTERN = /\{\{(#\S+(?:\s+\d+-\d+(?:\|\d+-\d+)?)?)\}\}/g;
/** 编码路径 token 片段，形如 [](%2Fworkspace%2Fnote.md)。 */
const ENCODED_PATH_TOKEN_PATTERN = /^\[\]\((.*)\)$/;

/**
 * 将文件路径编码为可安全放入 file-ref token 的路径片段。
 * @param rawPath - 原始文件路径或文件名
 * @returns 编码后的路径片段
 */
export function encodeFileReferencePath(rawPath: string): string {
  return `[](${encodeURIComponent(rawPath)})`;
}

/**
 * 解码 file-ref token 中的路径片段。
 * @param rawPath - token 内路径片段
 * @returns 解码后的原始路径
 */
export function decodeFileReferencePath(rawPath: string): string {
  const matched = rawPath.match(ENCODED_PATH_TOKEN_PATTERN);
  if (!matched) return rawPath;

  const [, encodedPath] = matched;
  try {
    return decodeURIComponent(encodedPath);
  } catch {
    return encodedPath;
  }
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
 * @param tokenContent - token 内容，包含 `#`
 * @returns 结构化解析结果；非法格式返回 null
 */
export function parseFileReferenceToken(tokenContent: string): ParsedFileReference | null {
  const matched = tokenContent.match(FILE_REFERENCE_TOKEN_PATTERN);
  if (!matched) {
    return null;
  }

  const [, rawPathText, startLineText, endLineText] = matched;
  const rawPath = decodeFileReferencePath(rawPathText.trim());
  const unsavedReference = parseUnsavedPath(rawPath);
  const hasLineNumber = startLineText !== undefined;
  const startLine = hasLineNumber ? Number(startLineText) : 0;
  const endLine = hasLineNumber ? Number(endLineText) : 0;

  return {
    rawPath,
    filePath: unsavedReference ? null : rawPath,
    fileId: unsavedReference?.fileId ?? null,
    fileName: unsavedReference?.fileName ?? extractFileName(rawPath),
    startLine,
    endLine,
    lineText: hasLineNumber ? `${startLine}-${endLine}` : '',
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
