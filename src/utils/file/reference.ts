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
  /** 渲染起始行号（1-based） */
  renderStartLine: number;
  /** 渲染结束行号（1-based） */
  renderEndLine: number;
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

/** 文件引用 token 正则表达式。行号为可选，无行号时表示引用整个文件。 */
const FILE_REFERENCE_TOKEN_PATTERN = /^#(\S+)(?:\s+(\d+)-(\d+)(?:\|(\d+)-(\d+))?)?$/;

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

  const [, rawPathText, startLineText, endLineText, renderStartLineText, renderEndLineText] = matched;
  const rawPath = rawPathText.trim();
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
    renderStartLine: renderStartLineText ? Number(renderStartLineText) : startLine,
    renderEndLine: renderEndLineText ? Number(renderEndLineText) : endLine,
    lineText: hasLineNumber ? `${startLine}-${endLine}` : '',
    isUnsaved: Boolean(unsavedReference)
  };
}
