/**
 * @file parser.test.ts
 * @description BMessage 节点解析器测试。
 */
import { marked } from 'marked';
import { describe, expect, it } from 'vitest';
import { parseMessageNodes } from '@/components/BMessage/parser';
import type { BlockNode, InlineNode } from '@/components/BMessage/types';

/**
 * 断言节点类型并返回窄化后的节点。
 * @param node - 待检查节点
 * @param type - 期望节点类型
 * @returns 窄化后的节点
 */
function expectBlockNode<T extends BlockNode['type']>(node: BlockNode | undefined, type: T): Extract<BlockNode, { type: T }> {
  expect(node?.type).toBe(type);
  return node as Extract<BlockNode, { type: T }>;
}

/**
 * 断言行内节点类型并返回窄化后的节点。
 * @param node - 待检查节点
 * @param type - 期望节点类型
 * @returns 窄化后的节点
 */
function expectInlineNode<T extends InlineNode['type']>(node: InlineNode | undefined, type: T): Extract<InlineNode, { type: T }> {
  expect(node?.type).toBe(type);
  return node as Extract<InlineNode, { type: T }>;
}

describe('parseMessageNodes', () => {
  it('converts markdown blocks and nested inline formatting into owned nodes', (): void => {
    const result = parseMessageNodes({
      content: '# Title\n\nHello **bold _em_** and ~~gone~~ with `code`.',
      mode: 'markdown',
      loading: false
    });

    const heading = expectBlockNode(result.blocks[0], 'heading');
    const paragraph = expectBlockNode(result.blocks[1], 'paragraph');
    const strong = expectInlineNode(paragraph.children[1], 'strong');
    const em = expectInlineNode(strong.children[1], 'em');
    const del = expectInlineNode(paragraph.children[3], 'del');
    const code = expectInlineNode(paragraph.children[5], 'code');

    expect(heading.depth).toBe(1);
    expect(heading.children).toMatchObject([{ type: 'text', text: 'Title' }]);
    expect(strong.children[0]).toMatchObject({ type: 'text', text: 'bold ' });
    expect(em.children).toMatchObject([{ type: 'text', text: 'em' }]);
    expect(del.children).toMatchObject([{ type: 'text', text: 'gone' }]);
    expect(code.text).toBe('code');
  });

  it('converts extended inline markdown into semantic nodes', (): void => {
    const result = parseMessageNodes({
      content: 'Use ==highlight==, X^2^ and H~2~O.',
      mode: 'markdown',
      loading: false
    });

    const paragraph = expectBlockNode(result.blocks[0], 'paragraph');

    expect(paragraph.children).toMatchObject([
      { type: 'text', text: 'Use ' },
      { type: 'mark', children: [{ type: 'text', text: 'highlight' }] },
      { type: 'text', text: ', X' },
      { type: 'sup', children: [{ type: 'text', text: '2' }] },
      { type: 'text', text: ' and H' },
      { type: 'sub', children: [{ type: 'text', text: '2' }] },
      { type: 'text', text: 'O.' }
    ]);
  });

  it('converts inline and block math into semantic nodes', (): void => {
    const result = parseMessageNodes({
      content: 'Inline $E=mc^2$ math.\n\n$$\na^2+b^2=c^2\n$$',
      mode: 'markdown',
      loading: false
    });

    const paragraph = expectBlockNode(result.blocks[0], 'paragraph');
    const inlineMath = expectInlineNode(paragraph.children[1], 'math');
    const blockMath = expectBlockNode(result.blocks[1], 'math');

    expect(inlineMath.text).toBe('E=mc^2');
    expect(blockMath.text).toBe('a^2+b^2=c^2');
  });

  it('marks fenced code blocks as incomplete until their closing fence arrives', (): void => {
    const streaming = parseMessageNodes({
      content: '```mermaid\ngraph TD\n  A --> B',
      mode: 'markdown',
      loading: true
    });
    const completed = parseMessageNodes({
      content: '```mermaid\ngraph TD\n  A --> B\n```',
      mode: 'markdown',
      loading: false
    });

    const streamingCode = expectBlockNode(streaming.blocks[0], 'code');
    const completedCode = expectBlockNode(completed.blocks[0], 'code');

    expect(streamingCode.complete).toBe(false);
    expect(completedCode.complete).toBe(true);
  });

  it('keeps incomplete math delimiters as text while streaming', (): void => {
    const result = parseMessageNodes({
      content: 'Inline $E=mc^2 and block:\n\n$$\na^2+b^2=c^2',
      mode: 'markdown',
      loading: true
    });

    const firstParagraph = expectBlockNode(result.blocks[0], 'paragraph');
    const secondParagraph = expectBlockNode(result.blocks[1], 'paragraph');

    expect(firstParagraph.children.some((node) => node.type === 'math')).toBe(false);
    expect(secondParagraph.children.some((node) => node.type === 'math')).toBe(false);
    expect(firstParagraph.children).toMatchObject([{ type: 'text', text: 'Inline $E=mc^2 and block:' }]);
    expect(secondParagraph.children[0]).toMatchObject({ type: 'text', text: '$$\na^2+b^2=c^2' });
  });

  it('preserves inline formatting inside tight list item text blocks', (): void => {
    const result = parseMessageNodes({
      content: '- **粗体**\n- *斜体*\n- ~~删除线~~\n- ==高亮==\n- `行内代码`\n- X^2^ and H~2~O',
      mode: 'markdown',
      loading: false
    });

    const list = expectBlockNode(result.blocks[0], 'list');
    const firstItemParagraph = expectBlockNode(list.items[0]?.children[0], 'paragraph');
    const secondItemParagraph = expectBlockNode(list.items[1]?.children[0], 'paragraph');
    const thirdItemParagraph = expectBlockNode(list.items[2]?.children[0], 'paragraph');
    const fourthItemParagraph = expectBlockNode(list.items[3]?.children[0], 'paragraph');
    const fifthItemParagraph = expectBlockNode(list.items[4]?.children[0], 'paragraph');
    const sixthItemParagraph = expectBlockNode(list.items[5]?.children[0], 'paragraph');

    expect(firstItemParagraph.children[0]).toMatchObject({ type: 'strong' });
    expect(secondItemParagraph.children[0]).toMatchObject({ type: 'em' });
    expect(thirdItemParagraph.children[0]).toMatchObject({ type: 'del' });
    expect(fourthItemParagraph.children[0]).toMatchObject({ type: 'mark' });
    expect(fifthItemParagraph.children[0]).toMatchObject({ type: 'code', text: '行内代码' });
    expect(sixthItemParagraph.children).toMatchObject([
      { type: 'text', text: 'X' },
      { type: 'sup' },
      { type: 'text', text: ' and H' },
      { type: 'sub' },
      { type: 'text', text: 'O' }
    ]);
  });

  it('omits raw task checkbox tokens from task list item content', (): void => {
    const result = parseMessageNodes({
      content: '- [x] 已完成任务\n- [ ] 未完成任务',
      mode: 'markdown',
      loading: false
    });

    const list = expectBlockNode(result.blocks[0], 'list');
    const firstItemParagraph = expectBlockNode(list.items[0]?.children[0], 'paragraph');
    const secondItemParagraph = expectBlockNode(list.items[1]?.children[0], 'paragraph');

    expect(list.items[0]?.task).toBe(true);
    expect(list.items[0]?.checked).toBe(true);
    expect(list.items[1]?.task).toBe(true);
    expect(list.items[1]?.checked).toBe(false);
    expect(firstItemParagraph.children).toMatchObject([{ type: 'text', text: '已完成任务' }]);
    expect(secondItemParagraph.children).toMatchObject([{ type: 'text', text: '未完成任务' }]);
  });

  it('converts safe inline html tags without allowing unsafe html injection', (): void => {
    const result = parseMessageNodes({
      content: '<u>under</u> <mark>marked</mark> <kbd>Ctrl</kbd> <abbr title="HyperText Markup Language">HTML</abbr> <script>alert(1)</script>',
      mode: 'markdown',
      loading: false
    });

    const paragraph = expectBlockNode(result.blocks[0], 'paragraph');

    expect(paragraph.children).toMatchObject([
      { type: 'htmlInline', tag: 'u', children: [{ type: 'text', text: 'under' }] },
      { type: 'text', text: ' ' },
      { type: 'htmlInline', tag: 'mark', children: [{ type: 'text', text: 'marked' }] },
      { type: 'text', text: ' ' },
      { type: 'htmlInline', tag: 'kbd', children: [{ type: 'text', text: 'Ctrl' }] },
      { type: 'text', text: ' ' },
      { type: 'htmlInline', tag: 'abbr', title: 'HyperText Markup Language', children: [{ type: 'text', text: 'HTML' }] },
      { type: 'text', text: ' <script>alert(1)</script>' }
    ]);
  });

  it('textifies raw html instead of emitting html nodes', (): void => {
    const result = parseMessageNodes({
      content: '<script>alert(1)</script>\n\n<div>safe text</div>',
      mode: 'markdown',
      loading: false
    });

    expect(result.blocks).toHaveLength(2);
    expect(result.blocks.every((node) => node.type === 'paragraph')).toBe(true);
    expect(result.blocks[0]).toMatchObject({
      type: 'paragraph',
      children: [{ type: 'text', text: '<script>alert(1)</script>' }]
    });
    expect(result.blocks[1]).toMatchObject({
      type: 'paragraph',
      children: [{ type: 'text', text: '<div>safe text</div>' }]
    });
  });

  it('collects image preview items and assigns image indexes', (): void => {
    const result = parseMessageNodes({
      content: '![first](https://example.com/first.png "First") and ![second](https://example.com/second.png)',
      mode: 'markdown',
      loading: false
    });

    const paragraph = expectBlockNode(result.blocks[0], 'paragraph');
    const firstImage = expectInlineNode(paragraph.children[0], 'image');
    const secondImage = expectInlineNode(paragraph.children[2], 'image');

    expect(firstImage.imageIndex).toBe(0);
    expect(secondImage.imageIndex).toBe(1);
    expect(result.images).toEqual([
      { src: 'https://example.com/first.png', name: 'first' },
      { src: 'https://example.com/second.png', name: 'second' }
    ]);
  });

  it('preserves plain text mode without markdown interpretation', (): void => {
    const result = parseMessageNodes({
      content: '**not bold**\n  indented',
      mode: 'text',
      loading: true
    });

    const paragraph = expectBlockNode(result.blocks[0], 'paragraph');
    const text = expectInlineNode(paragraph.children[0], 'text');
    const cursor = expectInlineNode(paragraph.children[1], 'cursor');

    expect(text.text).toBe('**not bold**\n  indented');
    expect(cursor).toMatchObject({ type: 'cursor' });
  });

  it('keeps the streaming tail id stable while promoting completed ids after loading', (): void => {
    const streaming = parseMessageNodes({
      content: 'Done paragraph.\n\nGrowing tail',
      mode: 'markdown',
      loading: true
    });
    const completed = parseMessageNodes({
      content: 'Done paragraph.\n\nGrowing tail',
      mode: 'markdown',
      loading: false
    });

    expect(streaming.blocks[0]?.id).toMatch(/^block-0-/);
    expect(streaming.blocks[1]?.id).toBe('block-tail-1');
    expect(completed.blocks[1]?.id).toMatch(/^block-1-/);
    expect(completed.blocks[1]?.id).not.toBe(streaming.blocks[1]?.id);
  });

  it('uses local inline extensions without changing the package-level marked singleton', (): void => {
    const result = parseMessageNodes({
      content: 'Keep ~single~ but delete ~~double~~.',
      mode: 'markdown',
      loading: false
    });
    const paragraph = expectBlockNode(result.blocks[0], 'paragraph');

    expect(paragraph.children.some((node) => node.type === 'del')).toBe(true);
    expect(paragraph.children.some((node) => node.type === 'sub')).toBe(true);
    expect(marked.parse('Keep ~single~.', { async: false })).toContain('<del>single</del>');
  });
});
