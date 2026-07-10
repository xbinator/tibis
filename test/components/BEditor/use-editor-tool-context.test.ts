/**
 * @file use-editor-tool-context.test.ts
 * @description BEditor 工具上下文实时状态读取测试。
 */
import type { AIToolContext } from 'types/ai';
import { describe, expect, it } from 'vitest';
import { createNoopEditorController, type EditorController } from '@/components/BEditor/adapters/types';
import { createEditorToolContext } from '@/components/BEditor/hooks/useEditorToolContext';
import type { EditorState } from '@/components/BEditor/types';

/**
 * 创建测试用编辑器状态。
 * @param content - 文档内容
 * @returns 编辑器状态
 */
function createEditorState(content: string): EditorState {
  return {
    id: 'document-1',
    name: 'document',
    path: '/workspace/document.md',
    ext: 'md',
    content
  };
}

/**
 * 创建带固定选区的编辑器控制器。
 * @param text - 选区文本
 * @returns 编辑器控制器
 */
function createEditorController(text: string): EditorController {
  return {
    ...createNoopEditorController(),
    getSelection: () => ({ from: 0, to: text.length, text })
  };
}

describe('createEditorToolContext', (): void => {
  it('reads replaced editor state and controller through live getters', (): void => {
    let editorState = createEditorState('old content');
    let editorController = createEditorController('old selection');
    let context: AIToolContext | undefined;

    expect((): void => {
      context = createEditorToolContext({
        getFileState: (): EditorState => editorState,
        getEditorInstance: (): EditorController => editorController
      } as unknown as Parameters<typeof createEditorToolContext>[0]);
    }).not.toThrow();

    editorState = createEditorState('new content');
    editorController = createEditorController('new selection');

    expect(context?.document.getContent()).toBe('new content');
    expect(context?.editor.getSelection()?.text).toBe('new selection');
  });
});
