/* @vitest-environment jsdom */

/**
 * @file containerExtension.test.ts
 * @description 容器扩展的单元测试，覆盖 parseMarkdown、renderMarkdown 和 round-trip。
 */
import { ref, type Ref } from 'vue';
import { Editor } from '@tiptap/core';
import { describe, expect, test } from 'vitest';
import { useExtensions } from '@/components/BEditor/hooks/useExtensions';
import { Container } from '@/components/BEditor/extensions/container';

/**
 * 创建带有容器扩展的 Markdown 编辑器。
 * @returns 编辑器实例
 */
function createEditor(): Editor {
  const editorInstanceId: Ref<string> = ref('container-test');
  const { editorExtensions } = useExtensions(editorInstanceId);

  return new Editor({
    extensions: [
      ...editorExtensions,
      Container
    ],
    content: '',
    contentType: 'markdown'
  });
}

describe('Container Extension', () => {
  test('parses simple comment container', () => {
    const md = ':::comment{commentText="test"}\ncontent\n:::';
    const editor = createEditor();
    editor.commands.setContent(md, { contentType: 'markdown' });

    const doc = editor.state.doc;
    expect(doc.childCount).toBeGreaterThanOrEqual(1);
    expect(doc.firstChild?.type.name).toBe('container');
    expect(doc.firstChild?.attrs.type).toBe('comment');
    expect(doc.firstChild?.attrs.commentText).toBe('test');

    editor.destroy();
  });

  test('round-trip stable for comment container', () => {
    const md = ':::comment{commentText="test" id="c1"}\ncontent\n:::';
    const editor = createEditor();
    editor.commands.setContent(md, { contentType: 'markdown' });
    const exported = editor.getMarkdown();
    // Markdown 扩展可能在末尾追加换行，语义上等价即可
    expect(exported.trimEnd()).toBe(md);
    editor.destroy();
  });
});
