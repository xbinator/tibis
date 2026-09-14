/**
 * @file code-block-comment.test.ts
 * @description Rich 编辑器代码块选区批注回归测试。
 * @vitest-environment jsdom
 */
import type { Node as PMNode } from '@tiptap/pm/model';
import { ref } from 'vue';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { Editor } from '@tiptap/vue-3';
import { message } from 'ant-design-vue';
import { describe, expect, it, vi } from 'vitest';
import { createRichSelectionAssistantAdapter } from '@/components/BEditor/adapters/richSelectionAssistant';
import { createSourceSelectionAssistantAdapter } from '@/components/BEditor/adapters/sourceSelectionAssistant';
import { useCommentActions } from '@/components/BEditor/hooks/useCommentActions';
import { useExtensions } from '@/components/BEditor/hooks/useExtensions';
import { insertSourceCodeComment } from '@/components/BEditor/utils/codeBlockComments';
import { parseMarkdownForRichLoad } from '@/components/BEditor/utils/richMarkdownParser';

/**
 * 创建含代码块的真实 Rich 编辑器并应用一条代码片段批注。
 * @returns 已提交批注的编辑器实例
 */
function createCommentedCodeEditor(): Editor {
  const { editorExtensions } = useExtensions(ref('code-comment-test'));
  const editor = new Editor({
    extensions: editorExtensions,
    content: '```typescript\nconst answer = 42;\n```',
    contentType: 'markdown'
  });
  const codeBlock = editor.state.doc.firstChild;
  if (!codeBlock) {
    throw new Error('测试代码块未创建');
  }

  const from = 1 + codeBlock.textContent.indexOf('answer');
  const to = from + 'answer'.length;
  const adapter = createRichSelectionAssistantAdapter(editor, {
    editorState: { id: 'code-comment-test', name: 'note.md', path: '/tmp/note.md', ext: 'md', content: '' },
    overlayRoot: document.createElement('div')
  });
  adapter.applyComment?.({ from, to, text: 'answer', docVersion: editor.state.doc.nodeSize }, '请核对变量名');
  return editor;
}

/**
 * 查找代码块中被批注的文本节点。
 * @param codeBlock - 代码块节点
 * @returns 被批注的文本节点或 null
 */
function findCommentedText(codeBlock: PMNode): PMNode | null {
  for (let index = 0; index < codeBlock.childCount; index += 1) {
    const child = codeBlock.child(index);
    if (child.marks.some((mark) => mark.type.name === 'inlineComment')) {
      return child;
    }
  }
  return null;
}

/**
 * 在文档树里寻找首个代码块。
 * @param doc - ProseMirror 文档
 * @returns 代码块节点或 null
 */
function findCodeBlock(doc: PMNode): PMNode | null {
  let codeBlock: PMNode | null = null;
  doc.descendants((node): boolean => {
    if (node.type.name === 'codeBlock') {
      codeBlock = node;
      return false;
    }
    return true;
  });
  return codeBlock;
}

/**
 * 读取代码块中首个批注的代码偏移。
 * @param codeBlock - 代码块节点
 * @returns 批注起点，未找到时返回 -1
 */
function getCommentOffset(codeBlock: PMNode): number {
  let offset = 0;
  for (let index = 0; index < codeBlock.childCount; index += 1) {
    const child = codeBlock.child(index);
    if (child.marks.some((mark) => mark.type.name === 'inlineComment')) return offset;
    offset += child.text?.length ?? 0;
  }
  return -1;
}

describe('code block comments', (): void => {
  it('attaches a rich comment to the selected code text', (): void => {
    const editor = createCommentedCodeEditor();
    const codeBlock = editor.state.doc.firstChild;

    expect(codeBlock?.type.name).toBe('codeBlock');
    expect(codeBlock && findCommentedText(codeBlock)?.text).toBe('answer');
    expect(codeBlock && findCommentedText(codeBlock)?.marks.find((mark) => mark.type.name === 'inlineComment')?.attrs.comment).toBe('请核对变量名');

    editor.destroy();
  });

  it('preserves the code comment and original code through Markdown save and reload', (): void => {
    const editor = createCommentedCodeEditor();
    const markdown = editor.getMarkdown();
    const originalMark =
      editor.state.doc.firstChild && findCommentedText(editor.state.doc.firstChild)?.marks.find((mark) => mark.type.name === 'inlineComment');
    const { editorExtensions } = useExtensions(ref('code-comment-reload-test'));
    const reopened = new Editor({ extensions: editorExtensions, content: markdown, contentType: 'markdown' });
    const codeBlock = reopened.state.doc.firstChild;
    const restoredMark = codeBlock && findCommentedText(codeBlock)?.marks.find((mark) => mark.type.name === 'inlineComment');

    expect(markdown).toContain('const answer = 42;');
    expect(markdown).toContain(' {comments=');
    expect(codeBlock?.textContent).toBe('const answer = 42;');
    expect(restoredMark?.attrs).toEqual(originalMark?.attrs);

    reopened.destroy();
    editor.destroy();
  });

  it('renders legacy inline comment syntax already stored inside fenced code', async (): Promise<void> => {
    const source = '```typescript\ninterface SmartSchema {\n  [ version: 1;]{comment="使用语义化版本号" id="N7Gf60V78SvNN09tVR5ow"}\n}\n```';
    const { editorExtensions } = useExtensions(ref('legacy-code-comment-test'));
    const editor = new Editor({ extensions: editorExtensions, content: source, contentType: 'markdown' });
    const codeBlock = editor.state.doc.firstChild;
    const commentedText = codeBlock && findCommentedText(codeBlock);
    const highlighted = editor.view.dom.querySelector<HTMLElement>('span[data-comment]');

    expect(codeBlock?.textContent).toBe('interface SmartSchema {\n   version: 1;\n}');
    expect(commentedText?.text).toBe(' version: 1;');
    expect(commentedText?.marks.find((mark) => mark.type.name === 'inlineComment')?.attrs.comment).toBe('使用语义化版本号');
    expect(highlighted?.textContent).toBe(' version: 1;');

    const markdown = editor.getMarkdown();
    expect(markdown).toContain(' {comments=');
    expect(markdown).not.toContain('[ version: 1;]{comment=');
    const { json } = await parseMarkdownForRichLoad(source, 'legacy-code-comment-large-load-test', '1');
    const parsedCode = json.content?.[0];
    expect(parsedCode?.content?.find((node) => node.marks?.some((mark) => mark.type === 'inlineComment'))?.text).toBe(' version: 1;');
    editor.destroy();
  });

  it('preserves old and new comments in the same code block', (): void => {
    const source = '```typescript\nconst one = [1]{comment="旧批注" id="N7Gf60V78SvNN09tVR5ow"};\nconst two = 2;\n```';
    const from = source.lastIndexOf('2;');
    const change = insertSourceCodeComment(source, from, from + 1, 'modern-b', '新批注');
    if (!change) throw new Error('测试代码选区未识别');
    const markdown = `${source.slice(0, change.from)}${change.insert}${source.slice(change.to)}`;
    const { editorExtensions } = useExtensions(ref('mixed-code-comment-test'));
    const editor = new Editor({ extensions: editorExtensions, content: markdown, contentType: 'markdown' });
    const codeBlock = editor.state.doc.firstChild;
    const annotated = codeBlock?.content.content.filter((node) => node.marks.some((mark) => mark.type.name === 'inlineComment')) ?? [];

    expect(codeBlock?.textContent).toBe('const one = 1;\nconst two = 2;');
    expect(annotated.map((node) => node.text)).toEqual(['1', '2']);
    expect(annotated.map((node) => node.marks[0].attrs.id)).toEqual(['N7Gf60V78SvNN09tVR5ow', 'modern-b']);

    editor.destroy();
  });

  it('leaves comment syntax without an ID alone when it is literal code', (): void => {
    const source = '```typescript\nconst example = `[text]{comment="说明"}`;\n```';
    const { editorExtensions } = useExtensions(ref('literal-code-comment-syntax-test'));
    const editor = new Editor({ extensions: editorExtensions, content: source, contentType: 'markdown' });
    const codeBlock = editor.state.doc.firstChild;

    expect(codeBlock?.textContent).toBe('const example = `[text]{comment="说明"}`;');
    expect(codeBlock && findCommentedText(codeBlock)).toBeNull();

    editor.destroy();
  });

  it('leaves old comments around nested brackets unchanged when their boundary is ambiguous', (): void => {
    const source = '```typescript\nconst first = [nodes[0]]{comment="检查索引" id="N7Gf60V78SvNN09tVR5ow"};\n```';
    const { editorExtensions } = useExtensions(ref('nested-bracket-code-comment-test'));
    const editor = new Editor({ extensions: editorExtensions, content: source, contentType: 'markdown' });
    const codeBlock = editor.state.doc.firstChild;

    expect(codeBlock?.textContent).toBe('const first = [nodes[0]]{comment="检查索引" id="N7Gf60V78SvNN09tVR5ow"};');
    expect(codeBlock && findCommentedText(codeBlock)).toBeNull();

    editor.destroy();
  });

  it('leaves ambiguous old bracket selections unchanged instead of losing code', (): void => {
    const source = '```typescript\nconst value = [arr[0]{comment="检查" id="N7Gf60V78SvNN09tVR5ow"}];\n```';
    const { editorExtensions } = useExtensions(ref('ambiguous-code-comment-test'));
    const editor = new Editor({ extensions: editorExtensions, content: source, contentType: 'markdown' });
    const codeBlock = editor.state.doc.firstChild;

    expect(codeBlock?.textContent).toBe('const value = [arr[0]{comment="检查" id="N7Gf60V78SvNN09tVR5ow"}];');
    expect(codeBlock && findCommentedText(codeBlock)).toBeNull();

    editor.destroy();
  });

  it('leaves old selections with unmatched closing brackets unchanged', (): void => {
    const source = '```typescript\nconst a = [1; const v = [foo]bar]{comment="检查" id="N7Gf60V78SvNN09tVR5ow"};\n```';
    const { editorExtensions } = useExtensions(ref('closing-bracket-code-comment-test'));
    const editor = new Editor({ extensions: editorExtensions, content: source, contentType: 'markdown' });
    const codeBlock = editor.state.doc.firstChild;

    expect(codeBlock?.textContent).toBe('const a = [1; const v = [foo]bar]{comment="检查" id="N7Gf60V78SvNN09tVR5ow"};');
    expect(codeBlock && findCommentedText(codeBlock)).toBeNull();

    editor.destroy();
  });

  it('keeps a code comment when the code contains a shorter Markdown fence', (): void => {
    const { editorExtensions } = useExtensions(ref('code-comment-long-fence-test'));
    const editor = new Editor({ extensions: editorExtensions, content: '````md\n```\nfoo\n````', contentType: 'markdown' });
    const code = editor.state.doc.firstChild;
    if (!code) throw new Error('测试代码块未创建');
    const from = 1 + code.textContent.indexOf('foo');
    editor
      .chain()
      .setTextSelection({ from, to: from + 3 })
      .setMark('inlineComment', { id: 'comment-a', comment: '检查' })
      .run();

    const markdown = editor.getMarkdown();
    const reopened = new Editor({ extensions: editorExtensions, content: markdown, contentType: 'markdown' });
    const codeBlock = reopened.state.doc.firstChild;

    expect(markdown).toContain('````md');
    expect(codeBlock?.type.name).toBe('codeBlock');
    expect(codeBlock?.textContent).toBe('```\nfoo');
    expect(codeBlock && findCommentedText(codeBlock)?.text).toBe('foo');

    reopened.destroy();
    editor.destroy();
  });

  it('restores comments on code fences without a language', (): void => {
    const { editorExtensions } = useExtensions(ref('code-comment-no-language-test'));
    const editor = new Editor({ extensions: editorExtensions, content: '```\nanswer\n```', contentType: 'markdown' });
    editor.chain().setTextSelection({ from: 1, to: 7 }).setMark('inlineComment', { id: 'comment-a', comment: '检查' }).run();
    const markdown = editor.getMarkdown();
    const reopened = new Editor({ extensions: editorExtensions, content: markdown, contentType: 'markdown' });
    const codeBlock = reopened.state.doc.firstChild;

    expect(codeBlock?.attrs.language).toBeNull();
    expect(codeBlock && findCommentedText(codeBlock)?.text).toBe('answer');
    expect(markdown).toContain(' {comments=');

    reopened.destroy();
    editor.destroy();
  });

  it('creates a code comment in source mode without changing code text', (): void => {
    const source = '```typescript\nconst answer = 42;\n```';
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const view = new EditorView({ parent, state: EditorState.create({ doc: source }) });
    const from = source.indexOf('answer');
    const to = from + 'answer'.length;
    const adapter = createSourceSelectionAssistantAdapter(
      view,
      {
        editorState: { id: 'source-code-comment-test', name: 'note.md', path: '/tmp/note.md', ext: 'md', content: source },
        overlayRoot: parent
      },
      () => true
    );

    try {
      adapter.applyComment?.({ from, to, text: 'answer', docVersion: source.length }, '请核对变量名');
      const markdown = view.state.doc.toString();
      const { editorExtensions } = useExtensions(ref('source-code-comment-reload-test'));
      const richEditor = new Editor({ extensions: editorExtensions, content: markdown, contentType: 'markdown' });
      const codeBlock = richEditor.state.doc.firstChild;

      expect(markdown).toContain(' {comments=');
      expect(markdown).toContain('const answer = 42;');
      expect(codeBlock?.textContent).toBe('const answer = 42;');
      expect(codeBlock && findCommentedText(codeBlock)?.text).toBe('answer');

      richEditor.destroy();
    } finally {
      view.destroy();
      parent.remove();
    }
  });

  it('loads code comments through the large-document Markdown parser', async (): Promise<void> => {
    const editor = createCommentedCodeEditor();
    const markdown = editor.getMarkdown();
    const { json } = await parseMarkdownForRichLoad(markdown, 'code-comment-large-load-test', '1');
    const codeBlock = json.content?.[0];
    const commentedText = codeBlock?.content?.find((node) => node.marks?.some((mark) => mark.type === 'inlineComment'));

    expect(codeBlock?.type).toBe('codeBlock');
    expect(commentedText?.text).toBe('answer');
    expect(commentedText?.marks?.[0]?.attrs?.comment).toBe('请核对变量名');

    editor.destroy();
  });

  it('keeps a source code comment on its text after inserting code before it', (): void => {
    const source = '```typescript\nconst answer = 42;\n```';
    const from = source.indexOf('answer');
    const change = insertSourceCodeComment(source, from, from + 'answer'.length, 'comment-a', '请核对变量名');
    if (!change) throw new Error('测试代码选区未识别');

    const withComment = `${source.slice(0, change.from)}${change.insert}${source.slice(change.to)}`;
    const edited = withComment.replace('const answer', '// 新增说明\nconst answer');
    const { editorExtensions } = useExtensions(ref('code-comment-source-edit-test'));
    const editor = new Editor({ extensions: editorExtensions, content: edited, contentType: 'markdown' });
    const codeBlock = editor.state.doc.firstChild;

    expect(codeBlock?.textContent).toContain('const answer');
    expect(codeBlock && findCommentedText(codeBlock)?.text).toBe('answer');

    editor.destroy();
  });

  it('keeps a comment on the second identical code fragment after a preceding insertion', (): void => {
    const source = '```text\nfoo\nfoo\n```';
    const from = source.lastIndexOf('foo');
    const change = insertSourceCodeComment(source, from, from + 3, 'comment-a', '第二处');
    if (!change) throw new Error('测试代码选区未识别');

    const withComment = `${source.slice(0, change.from)}${change.insert}${source.slice(change.to)}`;
    const edited = withComment.replace('foo\nfoo', `foo\n${'x'.repeat(20)}\nfoo`);
    const { editorExtensions } = useExtensions(ref('code-comment-duplicate-test'));
    const editor = new Editor({ extensions: editorExtensions, content: edited, contentType: 'markdown' });
    const codeBlock = findCodeBlock(editor.state.doc);

    expect(codeBlock && getCommentOffset(codeBlock)).toBe(codeBlock?.textContent.lastIndexOf('foo'));

    editor.destroy();
  });

  it('prefers surrounding code when a new identical fragment appears before the comment', (): void => {
    const source = '```text\nfoo\nfoo\nbar\n```';
    const from = source.lastIndexOf('foo');
    const change = insertSourceCodeComment(source, from, from + 3, 'comment-a', '原来的第二处');
    if (!change) throw new Error('测试代码选区未识别');

    const withComment = `${source.slice(0, change.from)}${change.insert}${source.slice(change.to)}`;
    const edited = withComment.replace('foo\nfoo\nbar', 'foo\nfoo\nfoo\nbar');
    const { editorExtensions } = useExtensions(ref('code-comment-duplicate-insert-test'));
    const editor = new Editor({ extensions: editorExtensions, content: edited, contentType: 'markdown' });
    const codeBlock = findCodeBlock(editor.state.doc);

    expect(codeBlock && getCommentOffset(codeBlock)).toBe(8);

    editor.destroy();
  });

  it('adds comments to fenced code nested in a quote or list without changing code text', (): void => {
    const examples = ['> ```typescript\n> const answer = 42;\n> ```', '- item\n\n    ```typescript\n    const answer = 42;\n    ```'];

    examples.forEach((source: string, index: number): void => {
      const from = source.indexOf('answer');
      const change = insertSourceCodeComment(source, from, from + 'answer'.length, `comment-${index}`, '检查');
      expect(change).not.toBeNull();
      if (!change) return;

      const withComment = `${source.slice(0, change.from)}${change.insert}${source.slice(change.to)}`;
      const { editorExtensions } = useExtensions(ref(`code-comment-nested-${index}`));
      const editor = new Editor({ extensions: editorExtensions, content: withComment, contentType: 'markdown' });
      const codeBlock = findCodeBlock(editor.state.doc);

      expect(withComment).not.toContain('[answer]{comment=');
      expect(codeBlock?.textContent).toBe('const answer = 42;');
      expect(codeBlock && findCommentedText(codeBlock)?.text).toBe('answer');

      const reopened = new Editor({ extensions: editorExtensions, content: editor.getMarkdown(), contentType: 'markdown' });
      const restoredCode = findCodeBlock(reopened.state.doc);
      expect(restoredCode && findCommentedText(restoredCode)?.text).toBe('answer');

      reopened.destroy();
      editor.destroy();
    });
  });

  it('restores multiline code selections inside quote and list fences', (): void => {
    const examples = [
      '> ```typescript\n> const answer = 42;\n> return answer;\n> ```',
      '- item\n\n    ```typescript\n    const answer = 42;\n    return answer;\n    ```'
    ];

    examples.forEach((source: string, index: number): void => {
      const from = source.indexOf('const answer');
      const to = source.indexOf('return') + 'return'.length;
      const change = insertSourceCodeComment(source, from, to, `multiline-${index}`, '检查两行代码');
      expect(change).not.toBeNull();
      if (!change) return;

      const withComment = `${source.slice(0, change.from)}${change.insert}${source.slice(change.to)}`;
      const { editorExtensions } = useExtensions(ref(`code-comment-multiline-${index}`));
      const editor = new Editor({ extensions: editorExtensions, content: withComment, contentType: 'markdown' });
      const codeBlock = findCodeBlock(editor.state.doc);

      expect(codeBlock && findCommentedText(codeBlock)?.text).toBe('const answer = 42;\nreturn');

      editor.destroy();
    });
  });

  it('does not inject inline comment syntax into an unsupported indented code block', (): void => {
    const source = '    const answer = 42;';
    const parent = document.createElement('div');
    document.body.appendChild(parent);
    const view = new EditorView({ parent, state: EditorState.create({ doc: source }) });
    const warning = vi.spyOn(message, 'warning').mockImplementation(() => undefined as never);
    const adapter = createSourceSelectionAssistantAdapter(
      view,
      {
        editorState: { id: 'indented-code-comment-test', name: 'note.md', path: '/tmp/note.md', ext: 'md', content: source },
        overlayRoot: parent
      },
      () => true
    );

    try {
      const from = source.indexOf('answer');
      adapter.applyComment?.({ from, to: from + 'answer'.length, text: 'answer', docVersion: source.length }, '检查');
      expect(view.state.doc.toString()).toBe(source);
      expect(warning).toHaveBeenCalled();
    } finally {
      warning.mockRestore();
      view.destroy();
      parent.remove();
    }
  });

  it('opens, edits and deletes a comment on code without changing the code', (): void => {
    const editor = createCommentedCodeEditor();
    const commentElement = editor.view.dom.querySelector<HTMLElement>('span[data-comment]');
    const position = {
      anchorRect: { top: 0, left: 0, width: 60, height: 20 },
      lineHeight: 20
    };
    const actions = useCommentActions({ getEditor: () => editor, getPanelPosition: () => position });
    const event = new MouseEvent('click');
    Object.defineProperty(event, 'target', { value: commentElement });

    expect(commentElement).not.toBeNull();
    actions.handleCommentClick(event);
    const id = actions.activeCommentCard.value?.id ?? '';
    expect(actions.activeCommentCard.value?.annotatedText).toBe('answer');

    actions.handleCommentEdit(id, '修改后的批注');
    expect(editor.getMarkdown()).toContain(encodeURIComponent('修改后的批注'));

    actions.handleCommentDelete(id);
    expect(editor.state.doc.firstChild?.textContent).toBe('const answer = 42;');
    expect(editor.getMarkdown()).not.toContain(' {comments=');

    editor.destroy();
  });
});
