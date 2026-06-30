/**
 * @file inlineCommentMark.ts
 * @description 行内批注 TipTap Mark 扩展，支持 [text]{comment="..."} 语法的解析与渲染。
 */
import type { JSONContent, MarkdownParseHelpers, MarkdownParseResult, MarkdownRendererHelpers, MarkdownToken, MarkdownTokenizer } from '@tiptap/core';
import { Mark } from '@tiptap/core';

/**
 * 行内批注属性。
 */
export interface InlineCommentAttrs {
  /** 批注内容 */
  comment: string;
  /** 批注唯一标识 */
  id: string;
}

/**
 * 生成唯一批注 ID。
 * @returns 格式为 comment-{timestamp}-{random} 的唯一标识
 */
function generateCommentId(): string {
  return `comment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 行内批注 Mark 扩展。
 * 将 [被批注文本]{comment="批注内容"} 语法映射为 TipTap inline mark，
 * 在 Rich 模式下渲染为带高亮的 span，在 Markdown 序列化时回写为原始语法。
 */
export const InlineCommentMark = Mark.create({
  name: 'inlineComment',

  /**
   * 行内批注不需要与其他 mark 互斥，允许与 bold/italic 等叠加。
   */
  excludes: '',

  /**
   * 非包容模式：光标在批注边界外时不算作批注内部。
   */
  inclusive: false,

  addAttributes() {
    return {
      comment: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-comment'),
        renderHTML: (attributes: Record<string, unknown>) => {
          if (!attributes.comment) return {};
          return { 'data-comment': attributes.comment as string };
        }
      },
      id: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-comment-id'),
        renderHTML: (attributes: Record<string, unknown>) => {
          if (!attributes.id) return {};
          return { 'data-comment-id': attributes.id as string };
        }
      }
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-comment]'
      }
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', { ...HTMLAttributes, class: 'editor-comment-highlight' }, 0];
  },

  /**
   * 自定义 markdown tokenizer，识别 [text]{comment="..."} 语法。
   * 由 @tiptap/markdown 的 MarkdownManager 在解析时调用。
   */
  markdownTokenizer: {
    name: 'inlineComment',
    level: 'inline' as const,
    start(src: string) {
      return src.indexOf('[');
    },
    tokenize(src: string, _tokens: MarkdownToken[], lexer) {
      const match = src.match(/^\[([^[\]]*?)\]\{comment="([^"]*?)"(?:\s+id="([^"]*?)")?\}/);
      if (!match) return undefined;

      const [, text, comment, id] = match;
      return {
        type: 'inlineComment',
        raw: match[0],
        text,
        tokens: lexer.inlineTokens(text),
        comment,
        id: id || undefined
      };
    }
  } satisfies MarkdownTokenizer,

  /**
   * 解析 inlineComment token 为 TipTap mark 节点。
   * @param token - markdown tokenizer 输出的 token
   * @param helpers - 解析辅助函数
   * @returns 带 inlineComment mark 的内容节点
   */
  parseMarkdown: (token: MarkdownToken, helpers: MarkdownParseHelpers): MarkdownParseResult => {
    const text = typeof token.text === 'string' ? token.text : '';
    const comment = typeof token.comment === 'string' ? token.comment : '';
    const id = typeof token.id === 'string' && token.id ? token.id : generateCommentId();

    let inlineTokens: MarkdownToken[] = [];
    if (Array.isArray(token.tokens) && token.tokens.length > 0) {
      inlineTokens = token.tokens;
    } else if (helpers.tokenizeInline) {
      inlineTokens = helpers.tokenizeInline(text);
    }

    let content: JSONContent[] = [];
    if (inlineTokens.length > 0) {
      content = helpers.parseInline(inlineTokens);
    } else if (text) {
      content = [helpers.createTextNode(text)];
    }

    return helpers.applyMark('inlineComment', content, { comment, id });
  },

  /**
   * 将 inlineComment mark 节点序列化回 Markdown 语法。
   * @param node - 带 inlineComment mark 的 JSONContent 节点
   * @returns 序列化后的 Markdown 文本
   */
  renderMarkdown: (node: JSONContent, helpers: MarkdownRendererHelpers): string => {
    const attrs = node.attrs ?? {};
    const comment = typeof attrs.comment === 'string' ? attrs.comment : '';
    const id = typeof attrs.id === 'string' ? attrs.id : '';
    const text = helpers.renderChildren(node.content ?? []);

    const idPart = id ? ` id="${id}"` : '';
    return `[${text}]{comment="${comment}"${idPart}}`;
  }
});
