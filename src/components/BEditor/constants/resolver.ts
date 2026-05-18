/**
 * @file resolver.ts
 * @description 根据扩展名解析 BEditor 内部实现类型。
 */

/**
 * BEditor 内部实现类型。
 */
export type EditorKind = 'markdown' | 'monaco';

const MARKDOWN_EXTENSIONS = new Set(['', 'md', 'markdown']);
const MONACO_EXTENSIONS = new Set(['json']);

/**
 * 根据文件扩展名解析当前应使用的编辑器实现。
 * @param ext - 文件扩展名
 * @returns 编辑器实现类型
 */
export function resolveEditorKind(ext: string | null | undefined): EditorKind {
  const normalizedExt = String(ext ?? '')
    .trim()
    .toLowerCase();

  if (MARKDOWN_EXTENSIONS.has(normalizedExt)) {
    return 'markdown';
  }

  if (MONACO_EXTENSIONS.has(normalizedExt)) {
    return 'monaco';
  }

  return 'markdown';
}
