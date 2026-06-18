/**
 * @file rich-markdown-parser.test.ts
 * @description BEditor Rich 模式 Markdown 解析行为测试。
 * @vitest-environment jsdom
 */
import type { JSONContent } from '@tiptap/core';
import { describe, expect, it } from 'vitest';
import { parseMarkdownForRichLoad } from '@/components/BEditor/utils/richMarkdownParser';

/**
 * 提取 JSONContent 树中的纯文本内容。
 * @param node - 当前 JSON 节点
 * @returns 当前节点及子节点拼接后的文本
 */
function getTextContent(node: JSONContent): string {
  const text = typeof node.text === 'string' ? node.text : '';
  const childText = Array.isArray(node.content) ? node.content.map(getTextContent).join('') : '';
  return `${text}${childText}`;
}

/**
 * 查找包含指定文本的文本节点。
 * @param node - 当前 JSON 节点
 * @param text - 待查找文本
 * @returns 命中时返回文本节点，否则返回 null
 */
function findTextNode(node: JSONContent, text: string): JSONContent | null {
  if (node.type === 'text' && node.text === text) {
    return node;
  }

  const children = Array.isArray(node.content) ? node.content : [];
  for (const child of children) {
    const found = findTextNode(child, text);
    if (found) {
      return found;
    }
  }

  return null;
}

/**
 * 查找指定类型的第一个 JSON 节点。
 * @param node - 当前 JSON 节点
 * @param type - 节点类型
 * @returns 命中时返回节点，否则返回 null
 */
function findNodeByType(node: JSONContent, type: string): JSONContent | null {
  if (node.type === type) {
    return node;
  }

  const children = Array.isArray(node.content) ? node.content : [];
  for (const child of children) {
    const found = findNodeByType(child, type);
    if (found) {
      return found;
    }
  }

  return null;
}

/**
 * 判断文本节点是否带有指定 mark。
 * @param node - 文本节点
 * @param markType - mark 类型
 * @returns 存在该 mark 时返回 true
 */
function hasMark(node: JSONContent | null, markType: string): boolean {
  return Boolean(node?.marks?.some((mark) => mark.type === markType));
}

/**
 * 读取文本节点上的指定 mark。
 * @param node - 文本节点
 * @param markType - mark 类型
 * @returns 命中时返回 mark，否则返回 null
 */
function getMark(node: JSONContent | null, markType: string): { type: string; attrs?: Record<string, unknown> } | null {
  return node?.marks?.find((mark) => mark.type === markType) ?? null;
}

/**
 * 统计 JSONContent 树中指定 mark 的出现次数。
 * @param node - 当前 JSON 节点
 * @param markType - mark 类型
 * @returns 当前节点及子节点中的 mark 数量
 */
function countMarks(node: JSONContent, markType: string): number {
  const currentCount = node.marks?.filter((mark) => mark.type === markType).length ?? 0;
  const childCount = Array.isArray(node.content)
    ? node.content.reduce((total: number, child: JSONContent): number => total + countMarks(child, markType), 0)
    : 0;

  return currentCount + childCount;
}

describe('BEditor rich Markdown parser', (): void => {
  it('does not create strikethrough marks for ATDD single-tilde ranges', async (): Promise<void> => {
    const markdown = ['REQ-5/6/7→ATDD-1~3、REQ-8/9/10→ATDD-4~6、REQ-12~16→ATDD-8~11。', '', '显式删除线仍应生效：~~已删除~~。'].join('\n');

    const { json } = await parseMarkdownForRichLoad(markdown, 'atdd-table-test', '1');

    expect(countMarks(json, 'strike')).toBe(1);
    expect(hasMark(findTextNode(json, '已删除'), 'strike')).toBe(true);
  });

  it('keeps technical prose plain when no explicit Markdown syntax is used', async (): Promise<void> => {
    const markdown = [
      '仓库 b2cmall_qr、b2c_public_components，字段 <refId>，地址 https://example.com/a_b。',
      '显式链接：[文档](https://example.com/doc)。'
    ].join('\n');

    const { json } = await parseMarkdownForRichLoad(markdown, 'technical-prose-test', '1');
    const textContent = getTextContent(json);

    expect(textContent).toContain('b2cmall_qr');
    expect(textContent).toContain('b2c_public_components');
    expect(textContent).toContain('<refId>');
    expect(textContent).toContain('https://example.com/a_b');
    expect(countMarks(json, 'italic')).toBe(0);
    expect(countMarks(json, 'link')).toBe(1);
    expect(hasMark(findTextNode(json, '文档'), 'link')).toBe(true);
  });

  it('keeps content carried by raw HTML tags when loading Markdown', async (): Promise<void> => {
    const markdown = [
      '这是 <u>下划线</u>、<mark>标记</mark>、<kbd>Ctrl</kbd>、<abbr title="HyperText Markup Language">HTML</abbr>、<small>小字</small>、H<sub>2</sub>O 和 x<sup>上标</sup>。',
      '',
      '| 写法 | 效果 |',
      '| --- | --- |',
      '| 换行 | 第一行<br>第二行 |',
      '',
      '<details>',
      '<summary>折叠标题</summary>',
      '折叠内容',
      '</details>'
    ].join('\n');

    const { json } = await parseMarkdownForRichLoad(markdown, 'html-tag-test', '1');
    const textContent = getTextContent(json);

    expect(textContent).toContain('下划线');
    expect(textContent).toContain('标记');
    expect(textContent).toContain('第一行');
    expect(textContent).toContain('第二行');
    expect(textContent).toContain('折叠标题');
    expect(textContent).toContain('折叠内容');
    expect(textContent).not.toContain('<details>');
    expect(textContent).not.toContain('</details>');
    expect(hasMark(findTextNode(json, '下划线'), 'underline')).toBe(true);
    expect(hasMark(findTextNode(json, '标记'), 'highlight')).toBe(true);
    expect(getMark(findTextNode(json, 'Ctrl'), 'htmlInline')?.attrs).toEqual({ tag: 'kbd' });
    expect(getMark(findTextNode(json, 'HTML'), 'htmlInline')?.attrs).toEqual({ tag: 'abbr', title: 'HyperText Markup Language' });
    expect(getMark(findTextNode(json, '小字'), 'htmlInline')?.attrs).toEqual({ tag: 'small' });
    expect(getMark(findTextNode(json, '2'), 'htmlInline')?.attrs).toEqual({ tag: 'sub' });
    expect(getMark(findTextNode(json, '上标'), 'htmlInline')?.attrs).toEqual({ tag: 'sup' });
    expect(JSON.stringify(json)).toContain('"type":"hardBreak"');
  });

  it('keeps block math as a semantic node when loading Markdown', async (): Promise<void> => {
    const { json } = await parseMarkdownForRichLoad('$$\na^2+b^2=c^2\n$$', 'math-node-test', '1');
    const blockMath = findNodeByType(json, 'blockMath');

    expect(blockMath?.attrs).toEqual({ latex: 'a^2+b^2=c^2' });
  });
});
