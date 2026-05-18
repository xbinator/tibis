/* @vitest-environment jsdom */

/**
 * @file editorMarkdownTrailingParagraph.test.ts
 * @description 验证表格结尾时编辑器会保留尾部空段落，同时导出结果不追加无意义空行。
 */
import { ref, type Ref } from 'vue';
import { Editor } from '@tiptap/core';
import { describe, expect, test } from 'vitest';
import { useExtensions } from '@/components/BEditor/hooks/useExtensions';
import { getPersistedMarkdown } from '@/components/BEditor/utils/editorMarkdown';

/**
 * 创建带有当前 BEditor 扩展集的 Markdown 编辑器。
 * @returns 可用于导入导出 Markdown 的编辑器实例
 */
function createMarkdownEditor(): Editor {
  const editorInstanceId: Ref<string> = ref('table-trailing-paragraph-test');
  const { editorExtensions } = useExtensions(editorInstanceId);

  return new Editor({
    extensions: editorExtensions,
    content: '',
    contentType: 'markdown'
  });
}

describe('editor markdown trailing paragraph', () => {
  test('keeps an editable trailing paragraph after a table without changing persisted markdown', () => {
    const editor = createMarkdownEditor();
    const markdown = '| a | b |\n|---|---|\n| 1 | 2 |';

    editor.commands.setContent(markdown, { contentType: 'markdown' });

    const { lastChild } = editor.state.doc;

    expect(lastChild?.type.name).toBe('paragraph');
    expect(lastChild?.textContent).toBe('');
    expect(getPersistedMarkdown(editor)).toBe(markdown);

    editor.destroy();
  });
});
