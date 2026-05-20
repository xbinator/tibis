/**
 * @file container.ts
 * @description 容器扩展，支持 :::type{attrs}...::: 语法。
 */
import type {
  CommandProps,
  JSONContent,
  MarkdownLexerConfiguration,
  MarkdownParseHelpers,
  MarkdownParseResult,
  MarkdownRendererHelpers,
  MarkdownToken,
  MarkdownTokenizer
} from '@tiptap/core';
import { Node } from '@tiptap/core';
import { VueNodeViewRenderer } from '@tiptap/vue-3';
import ContainerView from '../components/ContainerView.vue';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    container: {
      /** 解除容器包裹，保留内部块内容。 */
      unwrapContainer: () => ReturnType;
    };
  }
}

/**
 * marked 容器 tokenizer，识别 :::type{attrs}...::: 围栏代码块。
 */
const containerTokenizer: MarkdownTokenizer = {
  name: 'container',
  level: 'block',
  start(src: string): number {
    return src.search(/^:::\w+/m);
  },
  tokenize(src: string, _tokens: MarkdownToken[], lexer: MarkdownLexerConfiguration): MarkdownToken | undefined {
    const match = src.match(/^:::(\w+)(?:\{([^}]*)\})?\n([\s\S]*?)\n:::(?:\n|$)/);

    if (!match) {
      return undefined;
    }

    const innerMd = match[3] ?? '';
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

  addCommands() {
    return {
      /**
       * 解除容器包裹，保留内部块内容。
       */
      unwrapContainer:
        () =>
        ({ state, dispatch }: CommandProps) => {
          const { $from } = state.selection;
          const containerPos = $from.before(1);

          if (containerPos == null) {
            return false;
          }

          const containerNode = state.doc.nodeAt(containerPos);
          if (containerNode?.type.name !== 'container') {
            return false;
          }

          if (dispatch) {
            const endPos = containerPos + containerNode.nodeSize;
            dispatch(state.tr.replaceWith(containerPos, endPos, containerNode.content));
          }

          return true;
        }
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-container]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', { 'data-container': '', ...HTMLAttributes }, 0];
  },

  addNodeView() {
    return VueNodeViewRenderer(ContainerView);
  },

  parseMarkdown(token: MarkdownToken, helpers: MarkdownParseHelpers): MarkdownParseResult {
    const raw = typeof token.raw === 'string' ? token.raw : '';
    const match = raw.match(/^:::(\w+)(?:\{([^}]*)\})?\n([\s\S]*?)\n:::\n?$/);

    if (!match) {
      return [];
    }

    const attrs: Record<string, unknown> = {
      type: match[1] || 'comment'
    };

    // fix: 用 matchAll + for...of 替代 while 条件赋值，消除 no-cond-assign
    const attrsStr = match[2] ?? '';
    for (const [, key, value] of attrsStr.matchAll(/(\w+)="([^"]*)"/g)) {
      if (key === 'type') {
        attrs.type = value;
      } else if (key === 'resolved') {
        attrs.resolved = value === 'true';
      } else if (key) {
        attrs[key] = value;
      }
    }

    const content = helpers.parseChildren(token.tokens ?? []);

    return helpers.createNode('container', attrs, content);
  },

  renderMarkdown(node: JSONContent, helpers: MarkdownRendererHelpers): string {
    const { type, id, title, commentText, resolved } = node.attrs ?? {};

    const attrsArr: string[] = [];
    if (commentText) attrsArr.push(`commentText="${commentText}"`);
    if (id) attrsArr.push(`id="${id}"`);
    if (title) attrsArr.push(`title="${title}"`);
    if (resolved) attrsArr.push('resolved="true"');

    const attrsStr = attrsArr.length > 0 ? `{${attrsArr.join(' ')}}` : '';
    const openLine = `:::${type || 'comment'}${attrsStr}`;

    const innerContent = helpers.renderChildren(node).replace(/\n+$/, '');

    return `${openLine}\n${innerContent}\n:::`;
  }
});
