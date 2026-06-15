/**
 * @file parser.ts
 * @description 将 BMessage 内容解析为 BlockNode / InlineNode 消息节点。
 */
/* eslint-disable no-use-before-define -- parser 使用递归下降转换，函数之间存在自然递归。 */
import type { BlockNode, HeadingBlockNode, InlineNode, ListItemNode, ParseMessageNodesOptions, ParseMessageNodesResult, TableCellNode } from './types';
import type { Token, Tokens } from 'marked';
import { unescape } from 'lodash-es';
import { Marked } from 'marked';
import { assignImageIndexes, stableHash } from './utils';

/**
 * BMessage 专用 Marked 实例，避免修改全局 marked 单例。
 */
const messageMarked = new Marked();
let entityDecoderElement: HTMLTextAreaElement | null = null;

messageMarked.use({
  tokenizer: {
    /**
     * 仅将双波浪号识别为删除线，单波浪号保持普通文本。
     * @param src - 待解析源码
     * @returns 删除线 token，未匹配时返回 undefined
     */
    del(src: string): Tokens.Del | undefined {
      const match = /^~~(?=\S)([\s\S]*?\S)~~/.exec(src);
      if (!match) return undefined;

      return {
        type: 'del',
        raw: match[0],
        text: match[1],
        tokens: this.lexer.inlineTokens(match[1])
      };
    }
  }
});

/**
 * 将任意层级路径转换为稳定 ID 片段。
 * @param path - 节点路径
 * @returns ID 片段
 */
function pathToId(path: number[]): string {
  return path.join('-');
}

/**
 * 创建块级节点 ID。
 * @param raw - 原始源码
 * @param path - 节点路径
 * @param isTail - 是否为流式尾部节点
 * @returns 块级节点 ID
 */
function createBlockId(raw: string, path: number[], isTail: boolean): string {
  const idPath = pathToId(path);
  return isTail ? `block-tail-${idPath}` : `block-${idPath}-${stableHash(raw)}`;
}

/**
 * 获取 token 的原始文本。
 * @param token - Marked token
 * @returns 原始文本
 */
function getTokenRaw(token: Token): string {
  return 'raw' in token ? token.raw : '';
}

/**
 * 获取 token 的展示文本。
 * @param token - Marked token
 * @returns 展示文本
 */
function getTokenText(token: Token): string {
  if ('text' in token && typeof token.text === 'string') return token.text;
  return getTokenRaw(token);
}

/**
 * 解码 Markdown 文本 token 中保留的 HTML 实体。
 * @param text - Marked token 文本
 * @returns 解码后的文本
 */
function decodeMarkdownText(text: string): string {
  if (typeof document !== 'undefined') {
    entityDecoderElement ??= document.createElement('textarea');
    entityDecoderElement.innerHTML = text;
    return entityDecoderElement.value;
  }

  return unescape(text);
}

/**
 * 按浏览器基准地址规范化图片地址，保留无法解析的原值。
 * @param src - Markdown 图片地址
 * @returns 规范化后的图片地址
 */
function normalizeImageSource(src: string): string {
  if (typeof document === 'undefined') return src;

  try {
    return new URL(src, document.baseURI).href;
  } catch {
    return src;
  }
}

/**
 * 将 Markdown 标题深度限制在 HTML 支持范围内。
 * @param depth - Marked 标题深度
 * @returns 规范化标题深度
 */
function normalizeHeadingDepth(depth: number): HeadingBlockNode['depth'] {
  if (depth <= 1) return 1;
  if (depth === 2) return 2;
  if (depth === 3) return 3;
  if (depth === 4) return 4;
  if (depth === 5) return 5;
  return 6;
}

/**
 * 将文本转为单个文本行内节点。
 * @param text - 文本内容
 * @param decodeEntities - 是否解码 HTML 实体
 * @returns 行内节点列表
 */
function textToInlineNodes(text: string, decodeEntities = false): InlineNode[] {
  const normalizedText = decodeEntities ? decodeMarkdownText(text) : text;
  return normalizedText ? [{ type: 'text', text: normalizedText }] : [];
}

/**
 * 将 Marked 行内 token 转为项目行内节点。
 * @param token - Marked token
 * @param path - 节点路径
 * @returns 行内节点列表
 */
function tokenToInlineNodes(token: Token, path: number[]): InlineNode[] {
  switch (token.type) {
    case 'text': {
      const textToken = token as Tokens.Text;
      return textToken.tokens?.length ? tokensToInlineNodes(textToken.tokens, path) : textToInlineNodes(textToken.text, true);
    }

    case 'escape': {
      return textToInlineNodes((token as Tokens.Escape).text, true);
    }

    case 'strong': {
      const strongToken = token as Tokens.Strong;
      return [{ type: 'strong', children: tokensToInlineNodes(strongToken.tokens, path) }];
    }

    case 'em': {
      const emToken = token as Tokens.Em;
      return [{ type: 'em', children: tokensToInlineNodes(emToken.tokens, path) }];
    }

    case 'del': {
      const delToken = token as Tokens.Del;
      return [{ type: 'del', children: tokensToInlineNodes(delToken.tokens, path) }];
    }

    case 'codespan': {
      return [{ type: 'code', text: (token as Tokens.Codespan).text }];
    }

    case 'link': {
      const linkToken = token as Tokens.Link;
      return [
        {
          type: 'link',
          href: linkToken.href,
          title: linkToken.title,
          children: tokensToInlineNodes(linkToken.tokens, path)
        }
      ];
    }

    case 'image': {
      const imageToken = token as Tokens.Image;
      return [
        {
          type: 'image',
          src: normalizeImageSource(imageToken.href),
          alt: decodeMarkdownText(imageToken.text),
          title: imageToken.title,
          imageIndex: -1
        }
      ];
    }

    case 'br': {
      return [{ type: 'break' }];
    }

    case 'html': {
      return textToInlineNodes(getTokenRaw(token), true);
    }

    default: {
      return textToInlineNodes(getTokenText(token), true);
    }
  }
}

/**
 * 将 Marked 行内 token 列表转为项目行内节点列表。
 * @param tokens - Marked token 列表
 * @param path - 节点路径
 * @returns 行内节点列表
 */
function tokensToInlineNodes(tokens: Token[] | undefined, path: number[]): InlineNode[] {
  if (!tokens?.length) return [];

  return tokens.flatMap((token, index) => tokenToInlineNodes(token, [...path, index]));
}

/**
 * 将 Marked 表格单元格转为项目表格单元格。
 * @param cell - Marked 表格单元格
 * @param align - 对齐方式
 * @param path - 节点路径
 * @returns 表格单元格节点
 */
function tableCellToNode(cell: Tokens.TableCell, align: TableCellNode['align'], path: number[]): TableCellNode {
  return {
    id: `cell-${pathToId(path)}-${stableHash(cell.text)}`,
    align,
    children: tokensToInlineNodes(cell.tokens, path)
  };
}

/**
 * 将列表项 token 转为项目列表项节点。
 * @param item - Marked 列表项
 * @param path - 节点路径
 * @returns 列表项节点
 */
function listItemToNode(item: Tokens.ListItem, path: number[]): ListItemNode {
  return {
    id: `list-item-${pathToId(path)}-${stableHash(item.raw)}`,
    raw: item.raw,
    task: item.task,
    checked: item.checked,
    children: tokensToBlockNodes(item.tokens, path, -1)
  };
}

/**
 * 将 Marked 块级 token 转为项目块级节点。
 * @param token - Marked token
 * @param path - 节点路径
 * @param tailIndex - 当前层级流式尾部索引，-1 表示无尾部
 * @returns 块级节点列表
 */
function tokenToBlockNodes(token: Token, path: number[], tailIndex: number): BlockNode[] {
  const raw = getTokenRaw(token);
  const isTail = path.length === 1 && path[0] === tailIndex;
  const id = createBlockId(raw, path, isTail);

  switch (token.type) {
    case 'space':
    case 'def': {
      return [];
    }

    case 'heading': {
      const headingToken = token as Tokens.Heading;
      return [
        {
          type: 'heading',
          id,
          raw,
          depth: normalizeHeadingDepth(headingToken.depth),
          children: tokensToInlineNodes(headingToken.tokens, path)
        }
      ];
    }

    case 'paragraph': {
      const paragraphToken = token as Tokens.Paragraph;
      return [
        {
          type: 'paragraph',
          id,
          raw,
          children: tokensToInlineNodes(paragraphToken.tokens, path)
        }
      ];
    }

    case 'text': {
      return [
        {
          type: 'paragraph',
          id,
          raw,
          children: textToInlineNodes((token as Tokens.Text).text, true)
        }
      ];
    }

    case 'html': {
      return [
        {
          type: 'paragraph',
          id,
          raw,
          children: textToInlineNodes(raw || getTokenText(token), true)
        }
      ];
    }

    case 'blockquote': {
      const blockquoteToken = token as Tokens.Blockquote;
      return [
        {
          type: 'blockquote',
          id,
          raw,
          children: tokensToBlockNodes(blockquoteToken.tokens, path, -1)
        }
      ];
    }

    case 'list': {
      const listToken = token as Tokens.List;
      return [
        {
          type: 'list',
          id,
          raw,
          ordered: listToken.ordered,
          start: listToken.start,
          items: listToken.items.map((item, index) => listItemToNode(item, [...path, index]))
        }
      ];
    }

    case 'code': {
      const codeToken = token as Tokens.Code;
      return [
        {
          type: 'code',
          id,
          raw,
          lang: codeToken.lang,
          text: codeToken.text
        }
      ];
    }

    case 'table': {
      const tableToken = token as Tokens.Table;
      return [
        {
          type: 'table',
          id,
          raw,
          header: tableToken.header.map((cell, index) => tableCellToNode(cell, tableToken.align[index] ?? null, [...path, 0, index])),
          rows: tableToken.rows.map((row, rowIndex) =>
            row.map((cell, cellIndex) => tableCellToNode(cell, tableToken.align[cellIndex] ?? null, [...path, rowIndex + 1, cellIndex]))
          )
        }
      ];
    }

    case 'hr': {
      return [{ type: 'hr', id, raw }];
    }

    default: {
      return [
        {
          type: 'paragraph',
          id,
          raw,
          children: textToInlineNodes(getTokenText(token), true)
        }
      ];
    }
  }
}

/**
 * 将 Marked 块级 token 列表转为项目块级节点列表。
 * @param tokens - Marked token 列表
 * @param parentPath - 父级路径
 * @param tailIndex - 当前层级流式尾部索引，-1 表示无尾部
 * @returns 块级节点列表
 */
function tokensToBlockNodes(tokens: Token[] | undefined, parentPath: number[], tailIndex: number): BlockNode[] {
  if (!tokens?.length) return [];

  const blocks: BlockNode[] = [];
  let renderIndex = 0;

  tokens.forEach((token) => {
    const nextBlocks = tokenToBlockNodes(token, [...parentPath, renderIndex], tailIndex);

    if (nextBlocks.length > 0) {
      blocks.push(...nextBlocks);
      renderIndex += nextBlocks.length;
    }
  });

  return blocks;
}

/**
 * 判断 token 是否会生成可渲染块节点。
 * @param token - Marked token
 * @returns 是否会生成块节点
 */
function isRenderableBlockToken(token: Token): boolean {
  return token.type !== 'space' && token.type !== 'def';
}

/**
 * 计算顶层可渲染块 token 数量。
 * @param tokens - Marked token 列表
 * @returns 可渲染块数量
 */
function countRenderableBlockTokens(tokens: Token[]): number {
  return tokens.filter(isRenderableBlockToken).length;
}

/**
 * 判断块节点是否可以容纳行内光标。
 * @param node - 块级节点
 * @returns 是否可以容纳行内光标
 */
function canAppendInlineCursor(node: BlockNode): node is Extract<BlockNode, { children: InlineNode[] }> {
  return node.type === 'paragraph' || node.type === 'heading';
}

/**
 * 为块级节点追加流式光标。
 * @param blocks - 块级节点列表
 */
function appendCursor(blocks: BlockNode[]): void {
  const tail = blocks[blocks.length - 1];

  if (!tail) {
    blocks.push({ type: 'cursor', id: 'block-tail-0', raw: '' });
    return;
  }

  if (canAppendInlineCursor(tail)) {
    tail.children.push({ type: 'cursor' });
    return;
  }

  blocks.push({ type: 'cursor', id: `block-tail-${blocks.length}`, raw: '' });
}

/**
 * 解析 Markdown 模式节点。
 * @param content - Markdown 内容
 * @param loading - 是否处于流式状态
 * @returns 块级节点列表
 */
function parseMarkdownBlocks(content: string, loading: boolean): BlockNode[] {
  const tokens = messageMarked.lexer(content);
  const tailIndex = loading ? countRenderableBlockTokens(tokens) - 1 : -1;
  const blocks = tokensToBlockNodes(tokens, [], tailIndex);

  if (loading) {
    appendCursor(blocks);
  }

  return blocks;
}

/**
 * 解析纯文本模式节点。
 * @param content - 纯文本内容
 * @param loading - 是否处于流式状态
 * @returns 块级节点列表
 */
function parseTextBlocks(content: string, loading: boolean): BlockNode[] {
  if (!content && loading) {
    return [{ type: 'cursor', id: 'block-tail-0', raw: '' }];
  }

  if (!content) {
    return [];
  }

  const blocks: BlockNode[] = [
    {
      type: 'paragraph',
      id: createBlockId(content, [0], loading),
      raw: content,
      children: textToInlineNodes(content)
    }
  ];

  if (loading) {
    appendCursor(blocks);
  }

  return blocks;
}

/**
 * 将消息内容解析为可渲染节点。
 * @param options - 解析选项
 * @returns 解析结果
 */
export function parseMessageNodes(options: ParseMessageNodesOptions): ParseMessageNodesResult {
  const blocks = options.mode === 'text' ? parseTextBlocks(options.content, options.loading) : parseMarkdownBlocks(options.content, options.loading);
  const images = assignImageIndexes(blocks);

  return {
    blocks,
    images
  };
}
