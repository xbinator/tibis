/**
 * @file front-matter.test.ts
 * @description BEditor Front Matter 默认数据测试。
 * @vitest-environment jsdom
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ref } from 'vue';
import { NodeSelection } from '@tiptap/pm/state';
import { Editor } from '@tiptap/vue-3';
import { beforeEach, describe, expect, it } from 'vitest';
import { useExtensions } from '@/components/BEditor/hooks/useExtensions';
import { createDefaultFrontMatterData, serializeFrontMatterData, useFrontMatter } from '@/components/BEditor/hooks/useFrontMatter';
import { getPersistedMarkdown } from '@/components/BEditor/utils/editorMarkdown';
import { parseMarkdownForRichLoad } from '@/components/BEditor/utils/richMarkdownParser';

beforeEach((): void => {
  if (!document.elementFromPoint) {
    document.elementFromPoint = (): Element | null => document.body;
  }
});

describe('createDefaultFrontMatterData', (): void => {
  it('uses the current file name as the default title', (): void => {
    expect(createDefaultFrontMatterData('Meeting Notes.md')).toEqual({ title: 'Meeting Notes' });
  });

  it('falls back to Untitled when the file name is empty', (): void => {
    expect(createDefaultFrontMatterData('')).toEqual({ title: 'Untitled' });
  });
});

describe('serializeFrontMatterData', (): void => {
  it('keeps an empty front matter block serializable', (): void => {
    expect(serializeFrontMatterData({})).toBe('---\n\n---');
  });
});

describe('FrontMatterBlock ownership', (): void => {
  it('keeps the front matter UI inside the node view component', (): void => {
    const componentPath = resolve(process.cwd(), 'src/components/BEditor/components/FrontMatterBlock.vue');
    const legacyPath = resolve(process.cwd(), 'src/components/BEditor/components/FrontMatterCard.vue');
    const source = readFileSync(componentPath, 'utf8');

    expect(source).not.toContain('FrontMatterCard');
    expect(source).toContain('b-markdown-frontmatter');
    expect(existsSync(legacyPath)).toBe(false);
  });
});

describe('useFrontMatter', (): void => {
  it('does not treat repeated body thematic breaks as front matter', (): void => {
    const markdown = '# 标题\n\n正文\n\n---\n\n## 下一节\n\n---\n\n结尾';
    const { bodyContent, hasFrontMatter } = useFrontMatter(ref(markdown));

    expect(hasFrontMatter.value).toBe(false);
    expect(bodyContent.value).toBe(markdown);
  });
});

describe('BEditor rich front matter node', (): void => {
  it('parses leading YAML front matter as a selectable editor node', async (): Promise<void> => {
    const { json } = await parseMarkdownForRichLoad('---\ntitle: Meeting Notes\n---\n\n正文', 'front-matter-node-test', '1');

    expect(json.content?.[0]).toMatchObject({
      type: 'frontMatter',
      attrs: {
        data: {
          title: 'Meeting Notes'
        }
      }
    });
  });

  it('parses an empty two-line front matter block as a selectable editor node', async (): Promise<void> => {
    const { json } = await parseMarkdownForRichLoad('---\n---\n\n正文', 'front-matter-empty-node-test', '1');

    expect(json.content?.[0]).toMatchObject({
      type: 'frontMatter',
      attrs: {
        data: {}
      }
    });
  });

  it('keeps repeated body thematic breaks as normal markdown instead of front matter nodes', async (): Promise<void> => {
    const { json } = await parseMarkdownForRichLoad('# 标题\n\n正文\n\n---\n\n## 下一节\n\n---\n\n结尾', 'front-matter-body-break-test', '1');

    expect(json.content?.some((node: { type?: string }): boolean => node.type === 'frontMatter')).toBe(false);
  });

  it('preserves invalid YAML front matter when rich markdown is persisted', (): void => {
    const { editorExtensions } = useExtensions(ref('front-matter-invalid-yaml-test'));
    const editor = new Editor({
      extensions: editorExtensions,
      content: '---\ntitle: [broken\n---\n\n正文',
      contentType: 'markdown'
    });

    expect(getPersistedMarkdown(editor)).toContain('title: [broken');
    expect(getPersistedMarkdown(editor)).not.toContain('---\n\n---');

    editor.destroy();
  });

  it('renders front matter YAML into HTML attributes for clipboard round trips', (): void => {
    const { editorExtensions } = useExtensions(ref('front-matter-html-test'));
    const editor = new Editor({
      extensions: editorExtensions,
      content: '---\ntitle: Meeting Notes\n---\n\n正文',
      contentType: 'markdown'
    });

    const document = new DOMParser().parseFromString(editor.getHTML(), 'text/html');
    const frontMatterElement = document.querySelector('section[data-type="front-matter"]');

    expect(frontMatterElement?.getAttribute('data-yaml')).toContain('title: Meeting Notes');

    editor.destroy();
  });

  it('deletes and restores the front matter node through editor history', (): void => {
    const { editorExtensions } = useExtensions(ref('front-matter-history-test'));
    const editor = new Editor({
      extensions: editorExtensions,
      content: '---\ntitle: Meeting Notes\n---\n\n正文',
      contentType: 'markdown'
    });

    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, 0)));
    editor.commands.deleteSelection();

    expect(getPersistedMarkdown(editor)).not.toContain('title: Meeting Notes');

    editor.commands.undo();

    expect(getPersistedMarkdown(editor)).toContain('title: Meeting Notes');

    editor.destroy();
  });

  it('keeps the front matter node when all fields are removed', (): void => {
    const { editorExtensions } = useExtensions(ref('front-matter-empty-test'));
    const editor = new Editor({
      extensions: editorExtensions,
      content: '---\ntitle: Meeting Notes\n---\n\n正文',
      contentType: 'markdown'
    });

    editor.view.dispatch(editor.state.tr.setNodeMarkup(0, undefined, { data: {} }));

    expect(getPersistedMarkdown(editor)).toContain('---\n\n---');

    editor.destroy();
  });

  it('keeps an editable paragraph after inserting front matter into an empty rich document', (): void => {
    const { editorExtensions } = useExtensions(ref('front-matter-insert-empty-test'));
    const editor = new Editor({
      extensions: editorExtensions,
      content: '',
      contentType: 'markdown'
    });

    editor
      .chain()
      .insertContentAt(0, { type: 'frontMatter', attrs: { data: { title: 'Untitled' } } })
      .run();

    const content = editor.state.doc.toJSON().content ?? [];
    expect(content.map((node: { type?: string }): string | undefined => node.type)).toEqual(['frontMatter', 'paragraph']);
    expect(content[0]).toMatchObject({
      type: 'frontMatter',
      attrs: {
        data: {
          title: 'Untitled'
        }
      }
    });

    editor.destroy();
  });

  it('prevents inserting content above an existing front matter node', (): void => {
    const { editorExtensions } = useExtensions(ref('front-matter-boundary-test'));
    const editor = new Editor({
      extensions: editorExtensions,
      content: '---\ntitle: Meeting Notes\n---\n\n正文',
      contentType: 'markdown'
    });

    editor.commands.insertContentAt(0, '不应该在元数据上方', { contentType: 'markdown' });

    const content = editor.state.doc.toJSON().content ?? [];
    expect(content[0]).toMatchObject({
      type: 'frontMatter',
      attrs: {
        data: {
          title: 'Meeting Notes'
        }
      }
    });
    expect(editor.state.doc.textBetween(0, editor.state.doc.firstChild?.nodeSize ?? 0, '')).not.toContain('不应该在元数据上方');

    editor.destroy();
  });
});
