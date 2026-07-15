/**
 * @file filePartParser.ts
 * @description 将 BChat 输入文本解析为有序 runtime user parts。
 */
import type { ChatMessageFilePartInput, ChatMessageTextPart } from 'types/chat';
import { nanoid } from 'nanoid';
import { findFileReferenceTokens, type FileReferenceTokenMatch } from '@/utils/file/reference';
import { isUnsavedPath } from '@/utils/file/unsaved';
import { workspace } from '@/utils/file/workspace';

/** Renderer 发送给 ChatRuntime 的用户输入片段。 */
export type BChatUserInputPart = ChatMessageTextPart | ChatMessageFilePartInput;

/**
 * 追加非空文本片段。
 * @param parts - 输出片段列表
 * @param text - 文本内容
 */
function appendTextPart(parts: BChatUserInputPart[], text: string): void {
  if (!text) return;

  parts.push({ id: nanoid(), type: 'text', text });
}

/**
 * 解析 file URL 查询行号。
 * @param match - token 匹配结果
 * @returns URLSearchParams
 */
function createLineSearchParams(match: FileReferenceTokenMatch): URLSearchParams {
  const params = new URLSearchParams();
  if (match.reference.startLine > 0) params.set('start', String(match.reference.startLine));
  if (match.reference.endLine > 0) params.set('end', String(match.reference.endLine));
  return params;
}

/**
 * 拼接工作区路径。
 * @param rawPath - 输入路径
 * @param workspaceRoot - 工作区根路径
 * @returns 可用于 file URL 的文件路径
 */
function createAbsoluteFilePath(rawPath: string, workspaceRoot: string | undefined): string {
  if (workspace.isAbsoluteFilePath(rawPath) || !workspaceRoot) return rawPath;
  return `${workspaceRoot.replace(/[\\/]+$/, '')}/${rawPath.replace(/^[\\/]+/, '')}`;
}

/**
 * 在 renderer 环境中创建 file URL，避免依赖 Node path/url。
 * @param filePath - 文件路径
 * @returns file URL
 */
function createFileUrl(filePath: string): string {
  const normalizedPath = filePath.replace(/\\/g, '/');
  const absolutePath = normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`;
  const encodedPath = absolutePath
    .split('/')
    .map((segment, index): string => (index === 0 ? '' : encodeURIComponent(segment)))
    .join('/');
  return `file://${encodedPath}`;
}

/**
 * 将输入路径转成 runtime 使用的 canonical URL。
 * @param rawPath - 文件路径或 unsaved 路径
 * @param workspaceRoot - 工作区根路径
 * @param match - token 匹配结果
 * @returns canonical URL
 */
function createRuntimeFileUrl(rawPath: string, workspaceRoot: string | undefined, match: FileReferenceTokenMatch): string {
  const params = createLineSearchParams(match);
  const query = params.toString();
  if (isUnsavedPath(rawPath)) {
    return query ? `${rawPath}?${query}` : rawPath;
  }

  const url = createFileUrl(createAbsoluteFilePath(rawPath, workspaceRoot));
  return query ? `${url}?${query}` : url;
}

/**
 * 从用户输入文本构建有序 runtime input parts。
 * @param content - 用户输入文本
 * @param workspaceRoot - 当前工作区根路径
 * @returns 有序输入片段
 */
export function buildUserInputParts(content: string, workspaceRoot?: string): BChatUserInputPart[] {
  const matches = findFileReferenceTokens(content);
  if (!matches.length) return content ? [{ id: nanoid(), type: 'text', text: content }] : [];

  const parts: BChatUserInputPart[] = [];
  let cursor = 0;
  for (const match of matches) {
    appendTextPart(parts, content.slice(cursor, match.start));
    parts.push({
      type: 'file',
      id: `file-part-${nanoid()}`,
      filename: match.reference.fileName,
      mime: 'text/plain',
      url: createRuntimeFileUrl(match.reference.rawPath, workspaceRoot, match),
      path: match.reference.rawPath,
      sourceText: {
        start: match.start,
        end: match.end,
        value: match.token
      }
    });
    cursor = match.end;
  }
  appendTextPart(parts, content.slice(cursor));
  return parts;
}
