/**
 * @file fileReferenceContext.ts
 * @description 基于结构化文件引用片段构建模型可读的引用索引上下文。
 */
import type { FileReference } from '../types';
import { recentFilesStorage } from '@/shared/storage';
import type { StoredFile } from '@/shared/storage/files/types';
import { decodeFileReferencePath } from '@/utils/file/reference';
import { isUnsavedPath, parseUnsavedPath } from '@/utils/file/unsaved';

// ─── 常量定义 ────────────────────────────────────────────────────────────────

/** 消息中的文件引用正则表达式（含双花括号），行号可选，兼容历史渲染行号片段。 */
export const MESSAGE_REF_PATTERN = /\{\{#(\S+)(?:\s+(\d+)-(\d+)(?:\|\d+-\d+)?)?\}\}/g;

// ─── 内部工具函数 ────────────────────────────────────────────────────────────

/**
 * 从文件中提取指定行号范围的内容和完整内容
 * 支持两种格式：
 * - unsaved://id/fileName - 未保存文件，从虚拟路径中提取 id
 * - 实际文件路径 - 已保存文件，通过路径查找
 * @param path - 文件路径或 unsaved:// 引用
 * @param startLine - 起始行号（从 1 开始）
 * @param endLine - 结束行号
 * @returns 文件引用解析结果，文件不存在时返回空内容
 */
export async function extractFileReferenceLines(token: string, references: string[]): Promise<FileReference> {
  const [rawPath, startLine, endLine] = references;
  const path = rawPath ? decodeFileReferencePath(rawPath) : rawPath;

  if (!path) return { token, path: '', startLine: 0, endLine: 0, selectedContent: '', fullContent: '' };

  let storedFile: StoredFile | null = null;

  // 检查是否为未保存文档虚拟路径。
  if (isUnsavedPath(path)) {
    const unsavedReference = parseUnsavedPath(path);
    const record = unsavedReference ? await recentFilesStorage.getRecentFile(unsavedReference.fileId) : null;
    storedFile = record?.type === 'file' ? record : null;
  } else {
    // 通过文件路径查找（仅 file 类型记录有 path 字段）
    const files = await recentFilesStorage.getAllRecentFiles();
    storedFile = (files.find((item) => item.type === 'file' && item.path === path) as StoredFile | undefined) || null;
  }

  if (!storedFile) return { token, path, startLine: 0, endLine: 0, selectedContent: '', fullContent: '' };

  const _startLine = startLine ? parseInt(startLine, 10) : 0;
  const _endLine = endLine ? parseInt(endLine, 10) : 0;
  const hasLineNumber = _startLine > 0 && _endLine > 0;

  const lines = storedFile.content.split('\n');

  // 无行号时提取整个文件内容
  const selectedContent = hasLineNumber ? lines.slice(Math.max(0, _startLine - 1), Math.min(lines.length, _endLine)).join('\n') : storedFile.content;

  return {
    token,
    selectedContent,
    fullContent: storedFile.content,
    path,
    startLine: _startLine,
    endLine: _endLine
  };
}
