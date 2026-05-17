/**
 * @file markdown.ts
 * @description Markdown 编辑器驱动。
 */

import type { EditorDriver } from './types';
import type { AIToolContext } from 'types/ai';
import BMarkdown from '@/components/BMarkdown/index.vue';
import type { EditorController } from '@/components/BMarkdown/types';
import { buildUnsavedPath } from '@/utils/fileReference/unsavedPath';

/**
 * 生成工具上下文中的文档标题，优先展示“文件名.扩展名”。
 * @param fileState - 当前文件状态
 * @returns 文档展示标题
 */
function resolveDocumentTitle(fileState: Parameters<EditorDriver['createToolContext']>[0]['fileState']): string {
  const normalizedName = fileState.name.trim();
  const normalizedExt = fileState.ext.trim();

  if (normalizedName && normalizedExt) {
    return `${normalizedName}.${normalizedExt}`;
  }

  if (normalizedName) {
    return normalizedName;
  }

  return normalizedExt ? `Untitled.${normalizedExt}` : 'Untitled';
}

/**
 * 创建通用文档上下文。
 * @param fileState - 当前文件
 * @param editorInstance - 编辑器实例
 * @returns 工具上下文
 */
export function createBaseToolContext(
  fileState: Parameters<EditorDriver['createToolContext']>[0]['fileState'],
  editorInstance: EditorController | Record<string, unknown> | null
): AIToolContext {
  const safeEditor = editorInstance as EditorController | null;

  return {
    document: {
      id: fileState.id,
      title: resolveDocumentTitle(fileState),
      path: fileState.path,
      locator: fileState.path ?? buildUnsavedPath({ id: fileState.id, fileName: `${fileState.name}.${fileState.ext}` }),
      getContent: () => fileState.content
    },
    editor: {
      getSelection: () => safeEditor?.getSelection() ?? null,
      insertAtCursor: async (content: string): Promise<void> => safeEditor?.insertAtCursor(content),
      replaceSelection: async (content: string): Promise<void> => safeEditor?.replaceSelection(content),
      replaceDocument: async (content: string): Promise<void> => safeEditor?.replaceDocument(content)
    }
  };
}

/**
 * Markdown 驱动。
 */
export const markdownDriver: EditorDriver = {
  id: 'markdown',
  match(file): boolean {
    return !file.ext || file.ext === 'md';
  },
  component: BMarkdown,
  createToolContext({ fileState, editorInstance }) {
    return createBaseToolContext(fileState, editorInstance);
  },
  toolbar: {
    showViewModeToggle: true,
    showOutlineToggle: true,
    showStructuredViewToggle: false,
    showSearch: true
  },
  supportsOutline: true
};
