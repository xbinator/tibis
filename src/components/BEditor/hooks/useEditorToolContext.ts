/**
 * @file useEditorToolContext.ts
 * @description BEditor 统一工具上下文工厂。
 */

import type { EditorController, EditorState } from '../types';
import type { AIToolContext } from 'types/ai';
import { resolveFileTitle } from '@/utils/file/title';
import { buildUnsavedPath } from '@/utils/file/unsaved';

/**
 * 工具上下文输入。
 */
export interface CreateEditorToolContextInput {
  /** 获取当前文件状态 */
  getFileState: () => EditorState;
  /** 获取当前编辑器实例 */
  getEditorInstance: () => Pick<EditorController, 'getSelection' | 'insertAtCursor' | 'replaceSelection' | 'replaceDocument'> | null;
}

/**
 * 创建统一编辑器工具上下文。
 * @param input - 当前上下文输入
 * @returns AI 工具上下文
 */
export function createEditorToolContext(input: CreateEditorToolContextInput): AIToolContext {
  return {
    document: {
      get id(): string {
        return input.getFileState().id;
      },
      get title(): string {
        return resolveFileTitle(input.getFileState());
      },
      get path(): string | null {
        return input.getFileState().path;
      },
      get locator(): string {
        const fileState = input.getFileState();

        return fileState.path ?? buildUnsavedPath({ id: fileState.id, fileName: `${fileState.name}.${fileState.ext}` });
      },
      getContent: (): string => input.getFileState().content
    },
    editor: {
      getSelection: () => input.getEditorInstance()?.getSelection() ?? null,
      insertAtCursor: async (content: string): Promise<void> => input.getEditorInstance()?.insertAtCursor(content),
      replaceSelection: async (content: string): Promise<void> => input.getEditorInstance()?.replaceSelection(content),
      replaceDocument: async (content: string): Promise<void> => input.getEditorInstance()?.replaceDocument(content)
    }
  };
}
