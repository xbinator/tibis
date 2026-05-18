/**
 * @file useEditorToolContext.ts
 * @description BEditor 统一工具上下文工厂。
 */

import type { EditorController, EditorState } from '../types';
import type { AIToolContext } from 'types/ai';
import { buildUnsavedPath, resolveFileTitle } from '@/utils/file';

/**
 * 工具上下文输入。
 */
export interface CreateEditorToolContextInput {
  /** 当前文件状态 */
  fileState: EditorState;
  /** 当前编辑器实例 */
  editorInstance: Pick<EditorController, 'getSelection' | 'insertAtCursor' | 'replaceSelection' | 'replaceDocument'> | null;
}

/**
 * 创建统一编辑器工具上下文。
 * @param input - 当前上下文输入
 * @returns AI 工具上下文
 */
export function createEditorToolContext(input: CreateEditorToolContextInput): AIToolContext {
  const { fileState, editorInstance } = input;

  return {
    document: {
      id: fileState.id,
      title: resolveFileTitle(fileState),
      path: fileState.path,
      locator: fileState.path ?? buildUnsavedPath({ id: fileState.id, fileName: `${fileState.name}.${fileState.ext}` }),
      getContent: () => fileState.content
    },
    editor: {
      getSelection: () => editorInstance?.getSelection() ?? null,
      insertAtCursor: async (content: string): Promise<void> => editorInstance?.insertAtCursor(content),
      replaceSelection: async (content: string): Promise<void> => editorInstance?.replaceSelection(content),
      replaceDocument: async (content: string): Promise<void> => editorInstance?.replaceDocument(content)
    }
  };
}
