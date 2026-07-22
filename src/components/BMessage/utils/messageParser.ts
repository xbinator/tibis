/**
 * @file messageParser.ts
 * @description 将 BMessage 内容解析为 BlockNode / InlineNode 消息节点。
 */
/* eslint-disable no-use-before-define -- parser 使用递归下降转换，函数之间存在自然递归。 */
import type {
  BlockNode,
  HeadingBlockNode,
  InlineNode,
  ListItemNode,
  ParseMessageNodesOptions,
  ParseMessageNodesResult,
  SafeHtmlInlineTag,
  TableCellNode
} from '../types';
import type { Token, TokenizerExtension, Tokens } from 'marked';
import { unescape } from 'lodash-es';
import { Marked } from 'marked';
import { assignImageIndexes, stableHash } from './messageHelper';

/**
 * BMessage 专用 Marked 实例，避免修改全局 marked 单例。
 */
const messageMarked = new Marked();
let entityDecoderElement: HTMLTextAreaElement | null = null;

/**
 * BMessage 支持的扩展行内 Markdown token 类型。
 */
type ExtendedInlineTokenType = 'mark' | 'math' | 'sub' | 'sup';

/**
 * BMessage 扩展行内 Markdown token。
 */
interface ExtendedInlineToken extends Tokens.Generic {
  /** 节点类型 */
  type: ExtendedInlineTokenType;
  /** 原始文本 */
  raw: string;
  /** 去掉定界符后的文本 */
  text: string;
  /** 子 token */
  tokens: Token[];
}

/**
 * BMessage 扩展块级数学公式 token。
 */
interface ExtendedMathBlockToken extends Tokens.Generic {
  /** 节点类型 */
  type: 'mathBlock';
  /** 原始文本 */
  raw: string;
  /** 公式内容 */
  text: string;
}

/**
 * BMessage 未闭合数学公式源码 token。
 */
interface PendingMathToken extends Tokens.Generic {
  /** 节点类型 */
  type: 'pendingMath' | 'pendingMathBlock';
  /** 原始文本 */
  raw: string;
  /** 公式源码 */
  text: string;
}

/**
 * 安全 HTML 标签解析结果。
 */
interface ParsedSafeHtmlInlineTag {
  /** 标签状态 */
  kind: 'open' | 'close' | 'selfClosing';
  /** 标签名 */
  tag: SafeHtmlInlineTag | 'br';
  /** 安全标题属性 */
  title?: string;
}

/**
 * 未被 Marked 原生规则识别的备用强调定界符。
 */
interface FallbackEmphasisDelimiter {
  /** Markdown 定界符。 */
  marker: '**' | '*' | '__' | '_';
  /** 对应行内节点类型。 */
  nodeType: 'strong' | 'em';
}

/**
 * 备用强调定界符匹配顺序，先匹配长定界符避免被单字符定界符截断。
 */
const FALLBACK_EMPHASIS_DELIMITERS: FallbackEmphasisDelimiter[] = [
  { marker: '**', nodeType: 'strong' },
  { marker: '__', nodeType: 'strong' },
  { marker: '*', nodeType: 'em' },
  { marker: '_', nodeType: 'em' }
];

/**
 * 创建行内 Markdown 扩展 tokenizer。
 * @param name - token 名称
 * @param pattern - 匹配源码的正则
 * @param startMarker - 起始标记
 * @returns Marked tokenizer 扩展
 */
function createInlineMarkdownExtension(name: ExtendedInlineTokenType, pattern: RegExp, startMarker: string): TokenizerExtension {
  return {
    name,
    level: 'inline',
    start(src: string): number | void {
      const index = src.indexOf(startMarker);
      return index >= 0 ? index : undefined;
    },
    tokenizer(src: string): ExtendedInlineToken | undefined {
      const match = pattern.exec(src);
      if (!match) return undefined;

      return {
        type: name,
        raw: match[0],
        text: match[1],
        tokens: this.lexer.inlineTokens(match[1])
      };
    }
  };
}

/**
 * 创建行内数学公式 tokenizer。
 * @returns Marked tokenizer 扩展
 */
function createInlineMathExtension(): TokenizerExtension {
  return {
    name: 'math',
    level: 'inline',
    start(src: string): number | void {
      const index = src.indexOf('$');
      return index >= 0 ? index : undefined;
    },
    tokenizer(src: string): ExtendedInlineToken | undefined {
      const match = /^\$(?!\$|\s)([\s\S]*?\S)\$(?!\$)/.exec(src);
      if (!match) return undefined;

      return {
        type: 'math',
        raw: match[0],
        text: match[1],
        tokens: []
      };
    }
  };
}

/**
 * 创建更宽松的星号加粗 tokenizer，兼容中文正文中加粗内容以引号等标点结尾的场景。
 * @returns Marked tokenizer 扩展
 */
function createRelaxedStrongExtension(): TokenizerExtension {
  return {
    name: 'relaxedStrong',
    level: 'inline',
    start(src: string): number | void {
      const index = src.indexOf('**');
      return index >= 0 ? index : undefined;
    },
    tokenizer(src: string): Tokens.Strong | undefined {
      const match = /^\*\*(?!\*)(?=\S)([\s\S]*?\S)\*\*(?!\*)/.exec(src);
      if (!match) return undefined;

      return {
        type: 'strong',
        raw: match[0],
        text: match[1],
        tokens: this.lexer.inlineTokens(match[1])
      };
    }
  };
}

/**
 * 创建更宽松的星号斜体 tokenizer，避免中文正文中相邻星号段被 Marked 错配。
 * @returns Marked tokenizer 扩展
 */
function createRelaxedEmExtension(): TokenizerExtension {
  return {
    name: 'relaxedEm',
    level: 'inline',
    start(src: string): number | void {
      const index = src.indexOf('*');
      return index >= 0 ? index : undefined;
    },
    tokenizer(src: string): Tokens.Em | undefined {
      const match = /^\*(?!\*)(?=\S)([\s\S]*?\S)\*(?!\*)/.exec(src);
      if (!match) return undefined;

      return {
        type: 'em',
        raw: match[0],
        text: match[1],
        tokens: this.lexer.inlineTokens(match[1])
      };
    }
  };
}

/**
 * 创建未闭合行内数学公式 tokenizer，流式过程中保留源码文本。
 * @returns Marked tokenizer 扩展
 */
function createPendingInlineMathExtension(): TokenizerExtension {
  return {
    name: 'pendingMath',
    level: 'inline',
    start(src: string): number | void {
      const index = src.indexOf('$');
      return index >= 0 ? index : undefined;
    },
    tokenizer(src: string): PendingMathToken | undefined {
      if (/^\$(?!\$|\s)([\s\S]*?\S)\$(?!\$)/.test(src)) return undefined;

      const match = /^\$(?!\$|\s)[\s\S]*$/.exec(src);
      if (!match) return undefined;

      return {
        type: 'pendingMath',
        raw: match[0],
        text: match[0]
      };
    }
  };
}

/**
 * 创建块级数学公式 tokenizer。
 * @returns Marked tokenizer 扩展
 */
function createBlockMathExtension(): TokenizerExtension {
  return {
    name: 'mathBlock',
    level: 'block',
    start(src: string): number | void {
      const index = src.indexOf('$$');
      return index >= 0 ? index : undefined;
    },
    tokenizer(src: string): ExtendedMathBlockToken | undefined {
      const match = /^\$\$[ \t]*\n?([\s\S]+?)\n?\$\$(?:\n+|$)/.exec(src);
      if (!match) return undefined;

      return {
        type: 'mathBlock',
        raw: match[0],
        text: match[1].trim()
      };
    }
  };
}

/**
 * 创建未闭合块级数学公式 tokenizer，避免流式源码被行内 Markdown 改写。
 * @returns Marked tokenizer 扩展
 */
function createPendingBlockMathExtension(): TokenizerExtension {
  return {
    name: 'pendingMathBlock',
    level: 'block',
    start(src: string): number | void {
      const index = src.indexOf('$$');
      return index >= 0 ? index : undefined;
    },
    tokenizer(src: string): PendingMathToken | undefined {
      if (/^\$\$[ \t]*\n?([\s\S]+?)\n?\$\$(?:\n+|$)/.test(src)) return undefined;

      const match = /^\$\$[ \t]*\n?[\s\S]*$/.exec(src);
      if (!match) return undefined;

      return {
        type: 'pendingMathBlock',
        raw: match[0],
        text: match[0].trimEnd()
      };
    }
  };
}

messageMarked.use({
  extensions: [
    createBlockMathExtension(),
    createPendingBlockMathExtension(),
    createInlineMathExtension(),
    createPendingInlineMathExtension(),
    createRelaxedStrongExtension(),
    createRelaxedEmExtension(),
    createInlineMarkdownExtension('mark', /^==(?=\S)([\s\S]*?\S)==(?!=)/, '=='),
    createInlineMarkdownExtension('sup', /^\^(?!\^)(?=\S)([\s\S]*?\S)\^(?!\^)/, '^'),
    createInlineMarkdownExtension('sub', /^~(?!~)(?=\S)([\s\S]*?\S)~(?!~)/, '~')
  ],
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
 * 判断 Marked 代码 token 对应的围栏是否已经闭合。
 * @param raw - 代码 token 原始源码
 * @returns 围栏已闭合或不是围栏代码块时返回 true
 */
function isCodeFenceComplete(raw: string): boolean {
  const openingMatch = /^ {0,3}(`{3,}|~{3,})[^\n]*(?:\n|$)/.exec(raw);
  if (!openingMatch) return true;

  const openingFence = openingMatch[1];
  const fenceChar = openingFence[0];
  const closingFencePattern = new RegExp(`^ {0,3}${fenceChar}{${openingFence.length},}[ \\t]*$`, 'm');

  return closingFencePattern.test(raw.slice(openingMatch[0].length));
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
 * 从 HTML 标签源码中读取安全 title 属性。
 * @param raw - HTML 标签源码
 * @returns 解码后的 title 属性
 */
function extractSafeTitleAttribute(raw: string): string | undefined {
  const match = /\stitle\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i.exec(raw);
  const title = match?.[1] ?? match?.[2] ?? match?.[3];
  return title ? decodeMarkdownText(title) : undefined;
}

/**
 * 判断标签名是否为安全行内 HTML 标签。
 * @param tag - 标签名
 * @returns 是否可渲染为行内 HTML 节点
 */
function isSafeHtmlInlineTag(tag: string): tag is SafeHtmlInlineTag {
  return ['abbr', 'kbd', 'mark', 'small', 'sub', 'sup', 'u'].includes(tag);
}

/**
 * 解析白名单内的安全行内 HTML 标签。
 * @param raw - HTML 标签源码
 * @returns 标签信息，无法安全解析时返回 null
 */
function parseSafeHtmlInlineTag(raw: string): ParsedSafeHtmlInlineTag | null {
  const trimmedRaw = raw.trim();
  const closeMatch = /^<\/([a-z][\w-]*)\s*>$/i.exec(trimmedRaw);

  if (closeMatch) {
    const tag = closeMatch[1].toLowerCase();
    return isSafeHtmlInlineTag(tag) ? { kind: 'close', tag } : null;
  }

  if (/^<br\s*\/?>$/i.test(trimmedRaw)) {
    return { kind: 'selfClosing', tag: 'br' };
  }

  const openMatch = /^<([a-z][\w-]*)(?:\s+[^>]*)?>$/i.exec(trimmedRaw);
  if (!openMatch || /\/>$/.test(trimmedRaw)) return null;

  const tag = openMatch[1].toLowerCase();
  if (!isSafeHtmlInlineTag(tag)) return null;

  return {
    kind: 'open',
    tag,
    title: tag === 'abbr' ? extractSafeTitleAttribute(raw) : undefined
  };
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
 * 判断字符是否为 ASCII 标识符字符。
 * @param char - 待检查字符
 * @returns 是否为 ASCII 字母、数字或下划线
 */
function isAsciiWordChar(char: string | undefined): boolean {
  return typeof char === 'string' && /^[A-Za-z0-9_]$/.test(char);
}

/**
 * 判断指定位置的 Markdown 定界符是否被反斜杠转义。
 * @param text - 原始文本
 * @param index - 定界符起始位置
 * @returns 是否被转义
 */
function isEscapedDelimiter(text: string, index: number): boolean {
  let slashCount = 0;

  for (let cursor = index - 1; cursor >= 0 && text[cursor] === '\\'; cursor -= 1) {
    slashCount += 1;
  }

  return slashCount % 2 === 1;
}

/**
 * 判断定界符是否贴着同类字符，避免把 `***` 或 `___` 拆成错误的单个标记。
 * @param text - 原始文本
 * @param index - 定界符起始位置
 * @param marker - 定界符文本
 * @returns 是否贴着重复定界符字符
 */
function hasRepeatedMarker(text: string, index: number, marker: FallbackEmphasisDelimiter['marker']): boolean {
  const markerChar = marker[0];
  return text[index - 1] === markerChar || text[index + marker.length] === markerChar;
}

/**
 * 判断下划线定界符是否处于 ASCII 标识符内部。
 * @param text - 原始文本
 * @param index - 定界符起始位置
 * @param marker - 定界符文本
 * @returns 是否位于 ASCII 标识符内部
 */
function isIdentifierMarker(text: string, index: number, marker: FallbackEmphasisDelimiter['marker']): boolean {
  if (!marker.includes('_')) return false;
  return isAsciiWordChar(text[index - 1]) && isAsciiWordChar(text[index + marker.length]);
}

/**
 * 判断备用强调定界符在指定位置是否可用。
 * @param text - 原始文本
 * @param index - 定界符起始位置
 * @param delimiter - 备用强调定界符
 * @returns 是否可作为强调定界符
 */
function canUseDelimiter(text: string, index: number, delimiter: FallbackEmphasisDelimiter): boolean {
  if (isEscapedDelimiter(text, index)) return false;
  if (hasRepeatedMarker(text, index, delimiter.marker)) return false;
  return !isIdentifierMarker(text, index, delimiter.marker);
}

/**
 * 获取当前位置可用的备用强调定界符。
 * @param text - 原始文本
 * @param index - 当前扫描位置
 * @returns 匹配的定界符，未匹配时返回 null
 */
function getFallbackDelimiter(text: string, index: number): FallbackEmphasisDelimiter | null {
  return (
    FALLBACK_EMPHASIS_DELIMITERS.find((delimiter) => {
      const contentChar = text[index + delimiter.marker.length];
      if (!text.startsWith(delimiter.marker, index) || !contentChar || /\s/.test(contentChar)) return false;
      return canUseDelimiter(text, index, delimiter);
    }) ?? null
  );
}

/**
 * 查找与开头定界符配对的结束定界符。
 * @param text - 原始文本
 * @param searchStart - 搜索起始位置
 * @param delimiter - 开头定界符
 * @returns 结束定界符位置，未找到时返回 -1
 */
function findClosingDelimiter(text: string, searchStart: number, delimiter: FallbackEmphasisDelimiter): number {
  let closeIndex = text.indexOf(delimiter.marker, searchStart);

  while (closeIndex >= 0) {
    const content = text.slice(searchStart, closeIndex);
    if (/\S$/.test(content) && canUseDelimiter(text, closeIndex, delimiter)) return closeIndex;

    closeIndex = text.indexOf(delimiter.marker, closeIndex + delimiter.marker.length);
  }

  return -1;
}

/**
 * 将纯文本转为单个文本行内节点，不做 Markdown 兜底解析。
 * @param text - 文本内容
 * @param decodeEntities - 是否解码 HTML 实体
 * @returns 行内节点列表
 */
function rawTextToInlineNodes(text: string, decodeEntities = false): InlineNode[] {
  const normalizedText = decodeEntities ? decodeMarkdownText(text) : text;
  return normalizedText ? [{ type: 'text', text: normalizedText }] : [];
}

/**
 * 将 Marked 未识别的强调源码兜底转为行内节点。
 * @param text - 文本内容
 * @param decodeEntities - 是否解码 HTML 实体
 * @returns 行内节点列表
 */
function parseFallbackEmphasis(text: string, decodeEntities: boolean): InlineNode[] {
  const nodes: InlineNode[] = [];
  let segmentStart = 0;
  let index = 0;

  while (index < text.length) {
    const delimiter = getFallbackDelimiter(text, index);
    if (!delimiter) {
      index += 1;
      continue;
    }

    const contentStart = index + delimiter.marker.length;
    const closeIndex = findClosingDelimiter(text, contentStart, delimiter);
    if (closeIndex < 0) {
      index += delimiter.marker.length;
      continue;
    }

    nodes.push(...rawTextToInlineNodes(text.slice(segmentStart, index), decodeEntities));

    const children = parseFallbackEmphasis(text.slice(contentStart, closeIndex), decodeEntities);
    nodes.push(delimiter.nodeType === 'strong' ? { type: 'strong', children } : { type: 'em', children });

    index = closeIndex + delimiter.marker.length;
    segmentStart = index;
  }

  if (segmentStart === 0) return rawTextToInlineNodes(text, decodeEntities);

  nodes.push(...rawTextToInlineNodes(text.slice(segmentStart), decodeEntities));
  return nodes;
}

/**
 * 将文本转为行内节点。
 * @param text - 文本内容
 * @param decodeEntities - 是否解码 HTML 实体
 * @param parseFallback - 是否兜底解析 Marked 未识别的强调源码
 * @returns 行内节点列表
 */
function textToInlineNodes(text: string, decodeEntities = false, parseFallback = false): InlineNode[] {
  return parseFallback ? parseFallbackEmphasis(text, decodeEntities) : rawTextToInlineNodes(text, decodeEntities);
}

/**
 * 合并相邻文本节点，避免 HTML 标签降级为文本时产生碎片。
 * @param nodes - 行内节点列表
 * @returns 合并后的行内节点列表
 */
function mergeAdjacentTextNodes(nodes: InlineNode[]): InlineNode[] {
  const mergedNodes: InlineNode[] = [];

  nodes.forEach((node) => {
    const previousNode = mergedNodes[mergedNodes.length - 1];

    if (previousNode?.type === 'text' && node.type === 'text') {
      previousNode.text += node.text;
      return;
    }

    mergedNodes.push(node);
  });

  return mergedNodes;
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
      return textToken.tokens?.length ? tokensToInlineNodes(textToken.tokens, path) : textToInlineNodes(textToken.text, true, true);
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

    case 'mark': {
      const markToken = token as ExtendedInlineToken;
      return [{ type: 'mark', children: tokensToInlineNodes(markToken.tokens, path) }];
    }

    case 'sup': {
      const supToken = token as ExtendedInlineToken;
      return [{ type: 'sup', children: tokensToInlineNodes(supToken.tokens, path) }];
    }

    case 'sub': {
      const subToken = token as ExtendedInlineToken;
      return [{ type: 'sub', children: tokensToInlineNodes(subToken.tokens, path) }];
    }

    case 'codespan': {
      return [{ type: 'code', text: (token as Tokens.Codespan).text }];
    }

    case 'math': {
      return [{ type: 'math', text: (token as ExtendedInlineToken).text }];
    }

    case 'pendingMath': {
      return textToInlineNodes((token as PendingMathToken).text, true);
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

    case 'checkbox': {
      return [];
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

  const nodes: InlineNode[] = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const safeTag = token.type === 'html' ? parseSafeHtmlInlineTag(getTokenRaw(token)) : null;

    if (safeTag?.kind === 'selfClosing' && safeTag.tag === 'br') {
      nodes.push({ type: 'break' });
      continue;
    }

    if (safeTag?.kind === 'open' && safeTag.tag !== 'br') {
      const closeIndex = tokens.findIndex((candidateToken, candidateIndex) => {
        if (candidateIndex <= index || candidateToken.type !== 'html') return false;

        const candidateTag = parseSafeHtmlInlineTag(getTokenRaw(candidateToken));
        return candidateTag?.kind === 'close' && candidateTag.tag === safeTag.tag;
      });

      if (closeIndex > index) {
        nodes.push({
          type: 'htmlInline',
          tag: safeTag.tag,
          title: safeTag.title,
          children: tokensToInlineNodes(tokens.slice(index + 1, closeIndex), [...path, index])
        });
        index = closeIndex;
        continue;
      }
    }

    nodes.push(...tokenToInlineNodes(token, [...path, index]));
  }

  return mergeAdjacentTextNodes(nodes);
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
    case 'checkbox':
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
      const textToken = token as Tokens.Text;
      return [
        {
          type: 'paragraph',
          id,
          raw,
          children: textToken.tokens?.length ? tokensToInlineNodes(textToken.tokens, path) : textToInlineNodes(textToken.text, true)
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
          text: codeToken.text,
          complete: isCodeFenceComplete(raw)
        }
      ];
    }

    case 'mathBlock': {
      const mathToken = token as ExtendedMathBlockToken;
      return [
        {
          type: 'math',
          id,
          raw,
          text: mathToken.text
        }
      ];
    }

    case 'pendingMathBlock': {
      const pendingMathToken = token as PendingMathToken;
      return [
        {
          type: 'paragraph',
          id,
          raw,
          children: textToInlineNodes(pendingMathToken.text, true)
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
