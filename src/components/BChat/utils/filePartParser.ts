/**
 * @file filePartParser.ts
 * @description 将 BChat 输入文本解析为有序 runtime user parts。
 */
import type { ChatMessageFilePartInput, ChatMessageSkillReferencePart, ChatMessageTextPart } from 'types/chat';
import { nanoid } from 'nanoid';
import type { FileReferenceTokenMatch } from '@/utils/file/reference';
import { isUnsavedPath } from '@/utils/file/unsaved';
import { workspace } from '@/utils/file/workspace';
import { splitReferenceText } from './userInputReference';

/** Renderer 发送给 ChatRuntime 的用户输入片段。 */
export type BChatUserInputPart = ChatMessageTextPart | ChatMessageFilePartInput | ChatMessageSkillReferencePart;

/**
 * 用户输入解析结果。
 */
export interface ParsedBChatUserInput {
  /** 保留文件与技能引用 Token 的消息正文。 */
  content: string;
  /** 按来源顺序排列的 Runtime 输入片段。 */
  parts: BChatUserInputPart[];
}

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
 * 将输入解析为保留引用 Token 的正文与有序 Runtime parts。
 * @param content - 编辑器原始文本
 * @param workspaceRoot - 当前工作区根路径
 * @returns 可读正文与结构化片段
 */
export function parseUserInput(content: string, workspaceRoot?: string): ParsedBChatUserInput {
  const parts: BChatUserInputPart[] = [];
  for (const segment of splitReferenceText(content)) {
    if (segment.type === 'text') {
      appendTextPart(parts, segment.text);
    } else if (segment.type === 'file') {
      const { token } = segment;
      parts.push({
        type: 'file',
        id: `file-part-${nanoid()}`,
        filename: token.match.reference.fileName,
        mime: 'text/plain',
        url: createRuntimeFileUrl(token.match.reference.rawPath, workspaceRoot, token.match),
        path: token.match.reference.rawPath,
        sourceText: {
          start: token.start,
          end: token.end,
          value: token.token
        }
      });
    } else {
      const { token } = segment;
      parts.push({
        type: 'skill_reference',
        id: `skill-reference-${nanoid()}`,
        name: token.match.name,
        sourceText: {
          start: token.start,
          end: token.end,
          value: token.token
        }
      });
    }
  }
  return { content, parts };
}

/**
 * 从用户输入文本构建有序 runtime input parts。
 * @param content - 用户输入文本
 * @param workspaceRoot - 当前工作区根路径
 * @returns 有序输入片段
 */
export function buildUserInputParts(content: string, workspaceRoot?: string): BChatUserInputPart[] {
  return parseUserInput(content, workspaceRoot).parts;
}
