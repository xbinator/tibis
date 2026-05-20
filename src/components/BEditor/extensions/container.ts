/**
 * @file container.ts
 * @description 容器扩展，支持 :::type{attrs}...::: 语法。
 */
import type { JSONContent, MarkdownLexerConfiguration, MarkdownParseHelpers, MarkdownParseResult, MarkdownRendererHelpers, MarkdownToken, MarkdownTokenizer, RenderContext } from '@tiptap/core';
import { Node } from '@tiptap/core';

/**
 * marked 容器 tokenizer，识别 :::type{attrs}...::: 围栏代码块。
 */
const containerTokenizer: MarkdownTokenizer = {
  name: 'container',
  level: 'block',
  start(src: string): number {
    const index = src.search(/^:::\w+/m);
    return index;
  },
  tokenize(src: string, _tokens: MarkdownToken[], lexer: MarkdownLexerConfiguration): MarkdownToken | undefined {
    const match = src.match(/^:::(\w+)(?:\{([^}]*)\})?\n([\s\S]*?)\n:::(?:\n|$)/);

    if (!match) {
      return undefined;
    }

    const innerMd = match[3] ?? '';

    // 使用 lexer.blockTokens 解析容器内部 Markdown 内容为子 tokens
    const childTokens = innerMd.trim() ? lexer.blockTokens(innerMd) : [];

    return {
      type: 'container',
      raw: match[0],
      text: `:::${match[1]}${match[2] ? `{${match[2]}}` : ''}`,
      tokens: childTokens
    };
  }
};

export const Container = Node.create({
  name: 'container',

  group: 'block',

  content: 'block+',

  markdownTokenName: 'container',

  markdownTokenizer: containerTokenizer,

  addAttributes() {
    return {
      type: { default: 'comment' },
      id: { default: null },
      title: { default: null },
      commentText: { default: null },
      resolved: { default: false }
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-container]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', { 'data-container': '', ...HTMLAttributes }, 0];
  },

  parseMarkdown(token: MarkdownToken, helpers: MarkdownParseHelpers): MarkdownParseResult {
    const raw = typeof token.raw === 'string' ? token.raw : '';
    const match = raw.match(/^:::(\w+)(?:\{([^}]*)\})?\n([\s\S]*?)\n:::\n?$/);

    if (!match) {
      return [];
    }

    const type = (match[1] ?? '') || 'comment';
    const attrsStr = match[2] ?? '';

    const attrs: Record<string, unknown> = { type };

    const attrPattern = /(\w+)="([^"]*)"/g;
    let attrMatch: RegExpExecArray | null;

    while ((attrMatch = attrPattern.exec(attrsStr)) !== null) {
      const key = (attrMatch[1] ?? '') || '';
      const value = (attrMatch[2] ?? '') || '';
      if (key === 'type') {
        attrs.type = value;
      } else if (key === 'resolved') {
        attrs.resolved = value === 'true';
      } else {
        attrs[key] = value;
      }
    }

    // 使用 helpers.parseChildren 解析子 tokens
    const content = helpers.parseChildren(token.tokens ?? []);

    return helpers.createNode('container', attrs, content);
  },

  renderMarkdown(node: JSONContent, helpers: MarkdownRendererHelpers, _ctx: RenderContext): string {
    const { type, id, title, commentText, resolved } = node.attrs ?? {};

    // 构建属性字符串（固定顺序，确保 round-trip 字符串级稳定）
    const attrsArr: string[] = [];
    if (commentText) attrsArr.push(`commentText="${commentText}"`);
    if (id) attrsArr.push(`id="${id}"`);
    if (title) attrsArr.push(`title="${title}"`);
    if (resolved) attrsArr.push('resolved="true"');

    const attrsStr = attrsArr.length > 0 ? `{${attrsArr.join(' ')}}` : '';
    const openLine = `:::${type || 'comment'}${attrsStr}`;

    // 渲染容器内部内容并去除末尾多余空行
    const innerContent = helpers.renderChildren(node).replace(/\n+$/, '');

    return `${openLine}\n${innerContent}\n:::`;
  }
});
