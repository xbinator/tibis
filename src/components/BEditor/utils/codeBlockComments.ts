/**
 * @file codeBlockComments.ts
 * @description 在代码围栏信息中保存代码片段批注，保持围栏正文为原始代码。
 */
import type { JSONContent } from '@tiptap/core';
import { markdownLanguage } from '@codemirror/lang-markdown';
import { Marked } from 'marked';

/**
 * 代码块内一段连续文本的批注。
 */
export interface CodeBlockComment {
  /** 相对于代码正文的 UTF-16 起始偏移。 */
  from: number;
  /** 相对于代码正文的 UTF-16 结束偏移。 */
  to: number;
  /** 批注 ID。 */
  id: string;
  /** 批注内容。 */
  comment: string;
  /** 原始被批注代码，用于 Source 模式修改后重新定位。 */
  quote?: string;
  /** 相同代码片段在本代码块中的出现序号。 */
  occurrence?: number;
  /** 批注前的短上下文。 */
  before?: string;
  /** 批注后的短上下文。 */
  after?: string;
}

/**
 * 代码围栏信息解析结果。
 */
export interface CodeBlockInfo {
  /** 语法高亮语言。 */
  language: string | null;
  /** 代码片段批注。 */
  comments: CodeBlockComment[];
}

/**
 * 富文本模式读取的代码正文与批注。
 */
export interface CommentedCode extends CodeBlockInfo {
  /** 去除旧版行内批注包装后的代码正文。 */
  text: string;
}

/**
 * 旧版行内批注在原始代码与清理后代码中的位置。
 */
interface LegacyCodeSpan {
  /** 原始包装的起点。 */
  rawFrom: number;
  /** 包装内代码的起点。 */
  quoteFrom: number;
  /** 包装内代码的终点。 */
  quoteTo: number;
  /** 原始包装的终点。 */
  rawTo: number;
  /** 清理后代码片段的起点。 */
  cleanFrom: number;
  /** 清理后代码片段的终点。 */
  cleanTo: number;
}

/**
 * Source 编辑器对围栏信息行的一次替换。
 */
export interface SourceCodeCommentChange {
  /** 替换起点。 */
  from: number;
  /** 替换终点。 */
  to: number;
  /** 新的围栏信息。 */
  insert: string;
  /** 原选区结束位置随信息行更新后的光标位置。 */
  nextPosition: number;
}

/**
 * Source 文本中的一个围栏代码块。
 */
interface SourceCodeFence {
  /** 开始围栏信息起点。 */
  infoFrom: number;
  /** 开始围栏信息终点。 */
  infoTo: number;
  /** 开始围栏信息。 */
  info: string;
  /** 代码正文起点。 */
  bodyFrom: number;
}

/**
 * 代码围栏批注键。
 */
const COMMENT_INFO_KEY = 'comments';

/**
 * 用于区分重复代码片段的上下文长度。
 */
const COMMENT_CONTEXT_LENGTH = 24;

/**
 * Source 代码围栏解析器，与 Rich 模式使用相同的 Marked 围栏正文语义。
 */
const codeMarkdownLexer = new Marked();

/**
 * 为批注范围记录短上下文和相同代码片段的出现序号。
 * @param code - 代码正文
 * @param comment - 批注范围
 * @returns 带重定位信息的批注
 */
function withCodeContext(code: string, comment: CodeBlockComment): CodeBlockComment {
  const quote = code.slice(comment.from, comment.to);
  let occurrence = 0;
  let index = code.indexOf(quote);
  while (index >= 0 && index < comment.from) {
    occurrence += 1;
    index = code.indexOf(quote, index + 1);
  }

  return {
    ...comment,
    quote,
    occurrence,
    before: code.slice(Math.max(0, comment.from - COMMENT_CONTEXT_LENGTH), comment.from),
    after: code.slice(comment.to, comment.to + COMMENT_CONTEXT_LENGTH)
  };
}

/**
 * 计算两个字符串的共同前缀长度。
 * @param left - 左侧文本
 * @param right - 右侧文本
 * @returns 共同前缀字符数
 */
function getSharedPrefix(left: string, right: string): number {
  let length = 0;
  while (length < left.length && length < right.length && left[length] === right[length]) length += 1;
  return length;
}

/**
 * 计算两个字符串的共同后缀长度。
 * @param left - 左侧文本
 * @param right - 右侧文本
 * @returns 共同后缀字符数
 */
function getSharedSuffix(left: string, right: string): number {
  let length = 0;
  while (length < left.length && length < right.length && left[left.length - length - 1] === right[right.length - length - 1]) length += 1;
  return length;
}

/**
 * 根据上下文、出现序号和原偏移寻找原先被批注的同文片段。
 * @param text - 当前代码正文
 * @param comment - 已保存的批注定位信息
 * @returns 最匹配片段起点；未找到时返回 -1
 */
function findNearestQuote(text: string, comment: CodeBlockComment): number {
  const { quote, from, occurrence, before, after } = comment;
  if (!quote) return -1;

  let best = -1;
  let bestScore = -1;
  let bestOrdinalMatch = false;
  let ordinal = 0;
  let index = text.indexOf(quote);
  while (index >= 0) {
    const preceding = text.slice(Math.max(0, index - COMMENT_CONTEXT_LENGTH), index);
    const following = text.slice(index + quote.length, index + quote.length + COMMENT_CONTEXT_LENGTH);
    let beforeScore = 0;
    let afterScore = 0;
    if (before === '') {
      if (index === 0) beforeScore = COMMENT_CONTEXT_LENGTH;
    } else if (before) {
      beforeScore = getSharedSuffix(before, preceding);
    }
    if (after === '') {
      if (index + quote.length === text.length) afterScore = COMMENT_CONTEXT_LENGTH;
    } else if (after) {
      afterScore = getSharedPrefix(after, following);
    }
    const score = beforeScore + afterScore;
    const ordinalMatch = occurrence === ordinal;
    if (
      score > bestScore ||
      (score === bestScore && ordinalMatch && !bestOrdinalMatch) ||
      (score === bestScore && ordinalMatch === bestOrdinalMatch && Math.abs(index - from) < Math.abs(best - from))
    ) {
      best = index;
      bestScore = score;
      bestOrdinalMatch = ordinalMatch;
    }
    ordinal += 1;
    index = text.indexOf(quote, index + 1);
  }
  return best;
}

/**
 * 验证从代码围栏读到的批注范围和属性。
 * @param value - 待验证的值
 * @param text - 当前代码正文
 * @returns 有效时返回规范化批注，否则返回 null
 */
function validateCodeComment(value: unknown, text: string): CodeBlockComment | null {
  if (!value || typeof value !== 'object') return null;

  const record = value as Record<string, unknown>;
  const { from, to, id, comment, quote, occurrence, before, after } = record;
  if (
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    typeof from !== 'number' ||
    typeof to !== 'number' ||
    from < 0 ||
    to <= from ||
    typeof id !== 'string' ||
    !id ||
    typeof comment !== 'string' ||
    !comment ||
    (quote !== undefined && (typeof quote !== 'string' || !quote)) ||
    (occurrence !== undefined && (!Number.isInteger(occurrence) || typeof occurrence !== 'number' || occurrence < 0)) ||
    (before !== undefined && typeof before !== 'string') ||
    (after !== undefined && typeof after !== 'string')
  ) {
    return null;
  }

  if (typeof quote === 'string') {
    const saved: CodeBlockComment = { from, to, id, comment, quote };
    if (typeof occurrence === 'number') saved.occurrence = occurrence;
    if (typeof before === 'string') saved.before = before;
    if (typeof after === 'string') saved.after = after;
    const relocated = findNearestQuote(text, saved);
    return relocated < 0 ? null : { from: relocated, to: relocated + quote.length, id, comment, quote };
  }

  return to <= text.length ? { from, to, id, comment } : null;
}

/**
 * 从 Markdown 围栏信息中读取语言和批注元数据。
 * @param info - 围栏起始行的语言信息
 * @param text - 当前代码正文
 * @returns 语言及有效批注列表
 */
export function parseCodeBlockInfo(info: string | null | undefined, text: string): CodeBlockInfo {
  const rawInfo = info?.trim() ?? '';
  const match = rawInfo.match(new RegExp(`^(.*?)\\s*\\{${COMMENT_INFO_KEY}=([^\\s}]+)\\}$`));
  if (!match) return { language: rawInfo || null, comments: [] };

  const language = match[1].trim() || null;
  try {
    const decoded: unknown = JSON.parse(decodeURIComponent(match[2]));
    if (!Array.isArray(decoded)) return { language, comments: [] };

    const comments = decoded
      .map((value: unknown): CodeBlockComment | null => validateCodeComment(value, text))
      .filter((value: CodeBlockComment | null): value is CodeBlockComment => value !== null)
      .sort((left: CodeBlockComment, right: CodeBlockComment): number => left.from - right.from);

    // ProseMirror 同类型 mark 不能重叠，忽略损坏的重叠范围。
    const accepted: CodeBlockComment[] = [];
    comments.forEach((item: CodeBlockComment): void => {
      const previous = accepted[accepted.length - 1];
      if (!previous || item.from >= previous.to) accepted.push(item);
    });
    return {
      language,
      comments: accepted
    };
  } catch {
    return { language, comments: [] };
  }
}

/**
 * 从闭合方括号向前寻找旧版批注的起始方括号，跳过代码本身的成对方括号。
 * @param text - 原始代码正文
 * @param closing - 包装结束方括号的位置
 * @returns 起始方括号的位置；未找到时返回 -1
 */
function findLegacyOpen(text: string, closing: number): number {
  let nested = 0;
  for (let index = closing - 1; index >= 0; index -= 1) {
    if (text[index] === ']') nested += 1;
    if (text[index] === '[') {
      if (nested === 0) {
        // 前方仍有未闭合的方括号时，无法确定它是代码还是旧版包装；保留原文更安全。
        let preceding = 0;
        for (let offset = 0; offset < index; offset += 1) {
          if (text[offset] === '[') preceding += 1;
          else if (text[offset] === ']' && preceding > 0) preceding -= 1;
        }
        return preceding === 0 ? index : -1;
      }
      nested -= 1;
    }
  }
  return -1;
}

/**
 * 将新版元数据的原始代码偏移换算到去除旧版包装后的代码中。
 * @param offset - 原始代码偏移
 * @param spans - 已迁移的旧版包装范围
 * @returns 清理后的代码偏移
 */
function rebaseCodeOffset(offset: number, spans: LegacyCodeSpan[]): number {
  let removed = 0;
  for (const span of spans) {
    if (offset < span.rawFrom) return offset - removed;
    if (offset <= span.quoteFrom) return span.cleanFrom;
    if (offset <= span.quoteTo) return span.cleanFrom + offset - span.quoteFrom;
    if (offset < span.rawTo) return span.cleanTo;
    removed += span.rawTo - span.rawFrom - (span.cleanTo - span.cleanFrom);
  }
  return offset - removed;
}

/**
 * 兼容旧版源码模式写入代码正文的行内批注语法。
 * @param info - 围栏语言及新版批注元数据
 * @param text - Markdown 解析出的代码正文
 * @returns 可供 Rich 模式渲染的代码与批注
 */
export function parseCommentedCode(info: string | null | undefined, text: string): CommentedCode {
  const parsed = parseCodeBlockInfo(info, text);
  if (!text.includes(']{comment="')) return { ...parsed, text };

  // 只迁移源码编辑器生成的 21 位 nanoid，避免把文档中的普通语法示例误当作批注。
  const syntax = /\]\{comment="([^"]+)"\s+id="([A-Za-z0-9_-]{21})"\}/g;
  const legacy: CodeBlockComment[] = [];
  const spans: LegacyCodeSpan[] = [];
  let code = '';
  let cursor = 0;

  for (const match of text.matchAll(syntax)) {
    const opening = findLegacyOpen(text, match.index);
    if (opening < cursor || opening < 0 || opening + 1 === match.index) continue;

    const quote = text.slice(opening + 1, match.index);
    // 旧语法没有转义方括号；包含方括号的选区存在多个合法起点，自动剥除会误删代码。
    if (quote.includes('[') || quote.includes(']')) continue;
    code += text.slice(cursor, opening);
    const cleanFrom = code.length;
    code += quote;
    const cleanTo = code.length;
    legacy.push({ from: cleanFrom, to: cleanTo, id: match[2], comment: match[1] });
    spans.push({ rawFrom: opening, quoteFrom: opening + 1, quoteTo: match.index, rawTo: match.index + match[0].length, cleanFrom, cleanTo });
    cursor = match.index + match[0].length;
  }

  if (legacy.length === 0) return { ...parsed, text };
  code += text.slice(cursor);
  const current = parsed.comments
    .map(
      ({ from, to, id, comment }: CodeBlockComment): CodeBlockComment => ({
        from: rebaseCodeOffset(from, spans),
        to: rebaseCodeOffset(to, spans),
        id,
        comment
      })
    )
    .filter(({ from, to }: CodeBlockComment): boolean => to > from);
  const remaining = legacy.filter(
    (item: CodeBlockComment): boolean => !current.some((other: CodeBlockComment): boolean => item.from < other.to && item.to > other.from)
  );
  return { language: parsed.language, text: code, comments: [...current, ...remaining].sort((left, right): number => left.from - right.from) };
}

/**
 * 将代码批注编码到围栏信息，不修改代码正文。
 * @param language - 代码语言
 * @param comments - 代码片段批注
 * @returns 完整围栏信息
 */
export function formatCodeBlockInfo(language: string | null | undefined, comments: CodeBlockComment[]): string {
  const resolvedLanguage = language ?? '';
  if (comments.length === 0) return resolvedLanguage;

  const encoded = encodeURIComponent(JSON.stringify(comments));
  return `${resolvedLanguage} {${COMMENT_INFO_KEY}=${encoded}}`;
}

/**
 * 根据代码文本和范围重建带 inlineComment mark 的 JSON 文本节点。
 * @param text - 原始代码正文
 * @param comments - 已验证的批注范围
 * @returns 代码块文本节点列表
 */
export function createCommentedCode(text: string, comments: CodeBlockComment[]): JSONContent[] {
  const content: JSONContent[] = [];
  let cursor = 0;

  comments.forEach(({ from, to, id, comment }: CodeBlockComment): void => {
    if (from > cursor) content.push({ type: 'text', text: text.slice(cursor, from) });
    content.push({ type: 'text', text: text.slice(from, to), marks: [{ type: 'inlineComment', attrs: { id, comment } }] });
    cursor = to;
  });

  if (cursor < text.length) content.push({ type: 'text', text: text.slice(cursor) });
  return content;
}

/**
 * 从代码块 JSON 文本节点提取连续的批注范围。
 * @param content - 代码块文本节点列表
 * @returns 当前代码正文中的批注范围
 */
export function readCodeBlockComments(content: JSONContent[]): CodeBlockComment[] {
  const comments: CodeBlockComment[] = [];
  let offset = 0;

  content.forEach((node: JSONContent): void => {
    const text = node.text ?? '';
    const mark = node.marks?.find((item) => item.type === 'inlineComment');
    const id = mark?.attrs?.id;
    const comment = mark?.attrs?.comment;
    if (text && typeof id === 'string' && typeof comment === 'string') {
      const last = comments[comments.length - 1];
      if (last && last.to === offset && last.id === id && last.comment === comment) {
        last.to += text.length;
        last.quote = `${last.quote ?? ''}${text}`;
      } else {
        comments.push({ from: offset, to: offset + text.length, id, comment, quote: text });
      }
    }
    offset += text.length;
  });

  const code = content.map((node: JSONContent): string => node.text ?? '').join('');
  return comments.map((item: CodeBlockComment): CodeBlockComment => withCodeContext(code, item));
}

/**
 * 将代码块序列化为保留原始代码的 Markdown 围栏。
 * @param node - 代码块 JSON 节点
 * @returns 带可选批注元数据的 Markdown
 */
export function renderCommentedCode(node: JSONContent): string {
  const content = node.content ?? [];
  const code = content.map((child: JSONContent): string => child.text ?? '').join('');
  const language = typeof node.attrs?.language === 'string' ? node.attrs.language : '';
  const info = formatCodeBlockInfo(language, readCodeBlockComments(content));
  // 围栏必须长于正文中所有反引号序列，避免正文里的 Markdown 围栏提前关闭代码块。
  const longestBacktickRun = code.match(/`+/g)?.reduce((longest: number, run: string): number => Math.max(longest, run.length), 0) ?? 0;
  const fence = '`'.repeat(Math.max(3, longestBacktickRun + 1));
  return [`${fence}${info}`, code, fence].join('\n');
}

/**
 * 计算围栏正文末尾，排除结束围栏前的行分隔符。
 * @param source - Markdown 原文
 * @param bodyFrom - 围栏正文起点
 * @param closingFrom - 结束围栏起点或文档末尾
 * @returns 与 Markdown code token 对齐的正文终点
 */
function getCodeBodyEnd(source: string, bodyFrom: number, closingFrom: number): number {
  if (closingFrom <= bodyFrom) return bodyFrom;
  if (source.slice(closingFrom - 2, closingFrom) === '\r\n') return closingFrom - 2;
  if (source[closingFrom - 1] === '\n') return closingFrom - 1;
  return closingFrom;
}

/**
 * 递归收集 Marked 解析出的围栏代码正文，保持与 Lezer 围栏的文档顺序一致。
 * @param tokens - 当前层级的 Markdown token
 * @param codeTexts - 收集到的围栏正文
 */
function collectFencedCode(tokens: unknown[], codeTexts: string[]): void {
  tokens.forEach((value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    const token = value as Record<string, unknown>;
    if (token.type === 'code' && token.codeBlockStyle !== 'indented' && typeof token.text === 'string') {
      codeTexts.push(token.text);
    }
    if (Array.isArray(token.tokens)) collectFencedCode(token.tokens, codeTexts);
    if (Array.isArray(token.items)) {
      token.items.forEach((item: unknown): void => {
        if (!item || typeof item !== 'object') return;
        const itemTokens = (item as Record<string, unknown>).tokens;
        if (Array.isArray(itemTokens)) collectFencedCode(itemTokens, codeTexts);
      });
    }
  });
}

/**
 * 读取指定顺序围栏在 Rich 模式中使用的规范化代码正文。
 * @param source - Markdown 原文
 * @param fenceIndex - 围栏在文档中的出现序号
 * @returns 对应代码正文，无法匹配时返回 null
 */
function getFencedCodeText(source: string, fenceIndex: number): string | null {
  const codeTexts: string[] = [];
  collectFencedCode(codeMarkdownLexer.lexer(source), codeTexts);
  return codeTexts[fenceIndex] ?? null;
}

/**
 * 将 Source 原文位置映射到 Marked 去除引用及列表前缀后的代码正文。
 * @param source - Markdown 原文
 * @param bodyFrom - 源码围栏正文起点
 * @param bodyEnd - 源码围栏正文终点
 * @param code - Marked 解析后的代码正文
 * @param position - 待映射的源码位置
 * @returns 代码正文偏移，位置不在真实代码文本内时返回 null
 */
function mapSourceCodePosition(source: string, bodyFrom: number, bodyEnd: number, code: string, position: number): number | null {
  const rawLines = source.slice(bodyFrom, bodyEnd).split('\n');
  const codeLines = code.split('\n');
  if (rawLines.length !== codeLines.length) return null;

  let sourceLineFrom = bodyFrom;
  let codeLineFrom = 0;
  for (let index = 0; index < rawLines.length; index += 1) {
    const rawLine = rawLines[index].replace(/\r$/, '');
    const codeLine = codeLines[index];
    if (!rawLine.endsWith(codeLine)) return null;

    const contentFrom = sourceLineFrom + rawLine.length - codeLine.length;
    const contentTo = sourceLineFrom + rawLine.length;
    if (position >= contentFrom && position <= contentTo) {
      return codeLineFrom + position - contentFrom;
    }

    sourceLineFrom += rawLines[index].length + 1;
    codeLineFrom += codeLine.length + 1;
  }
  return null;
}

/**
 * 在 Source Markdown 中找到完整落在代码围栏正文里的选区。
 * @param source - Markdown 原文
 * @param from - 选区起点
 * @param to - 选区终点
 * @returns 对应围栏和正文范围，不符合条件时返回 null
 */
function findSourceCodeFence(source: string, from: number, to: number): { fence: SourceCodeFence; bodyEnd: number; code: string } | null {
  const tree = markdownLanguage.parser.parse(source);
  let fenceRange: { from: number; to: number } | null = null;
  let fenceIndex = -1;
  let currentIndex = 0;
  tree.iterate({
    enter(node): void {
      if (node.name === 'FencedCode') {
        if (from >= node.from && to <= node.to) {
          fenceRange = { from: node.from, to: node.to };
          fenceIndex = currentIndex;
        }
        currentIndex += 1;
      }
    }
  });
  if (!fenceRange) return null;

  const code = getFencedCodeText(source, fenceIndex);
  if (code === null) return null;

  const { from: fenceFrom, to: fenceTo } = fenceRange;
  const openingLineEnd = source.indexOf('\n', fenceFrom);
  if (openingLineEnd < 0) return null;
  const openingLine = source.slice(fenceFrom, openingLineEnd).replace(/\r$/, '');
  const opening = openingLine.match(/^(`{3,}|~{3,})(.*)$/);
  if (!opening) return null;

  const codeMarks: number[] = [];
  tree.iterate({
    from: fenceFrom,
    to: fenceTo,
    enter(node): void {
      if (node.name === 'CodeMark' && node.from >= fenceFrom && node.to <= fenceTo) codeMarks.push(node.from);
    }
  });

  // Lezer 已识别容器内的真实围栏；末尾 CodeMark 的物理行决定正文边界。
  const closingMark = codeMarks.length > 1 ? codeMarks[codeMarks.length - 1] : null;
  const closingFrom = closingMark === null ? fenceTo : source.lastIndexOf('\n', closingMark - 1) + 1;
  const fence: SourceCodeFence = {
    infoFrom: fenceFrom + opening[1].length,
    infoTo: fenceFrom + openingLine.length,
    info: opening[2],
    bodyFrom: openingLineEnd + 1
  };
  const bodyEnd = getCodeBodyEnd(source, fence.bodyFrom, closingFrom);
  return from >= fence.bodyFrom && to <= bodyEnd && from < to ? { fence, bodyEnd, code } : null;
}

/**
 * 判断源码选区是否碰到 Markdown 代码块，避免无法映射时向代码正文插入行内语法。
 * @param source - Markdown 原文
 * @param from - 选区起点
 * @param to - 选区终点
 * @returns 选区是否与围栏或缩进代码块相交
 */
export function isSourceCodeSelection(source: string, from: number, to: number): boolean {
  const tree = markdownLanguage.parser.parse(source);
  let intersectsCode = false;
  tree.iterate({
    enter(node): void {
      if ((node.name === 'FencedCode' || node.name === 'CodeBlock') && from < node.to && to > node.from) {
        intersectsCode = true;
      }
    }
  });
  return intersectsCode;
}

/**
 * 计算 Source 代码片段批注对应的围栏信息修改。
 * @param source - Markdown 原文
 * @param from - 被批注源码范围起点
 * @param to - 被批注源码范围终点
 * @param id - 新批注 ID
 * @param comment - 新批注内容
 * @returns 围栏信息修改；非代码块选区返回 null
 */
export function insertSourceCodeComment(source: string, from: number, to: number, id: string, comment: string): SourceCodeCommentChange | null {
  const match = findSourceCodeFence(source, from, to);
  if (!match) return null;

  const { fence, bodyEnd, code } = match;
  const start = mapSourceCodePosition(source, fence.bodyFrom, bodyEnd, code, from);
  const end = mapSourceCodePosition(source, fence.bodyFrom, bodyEnd, code, to);
  if (start === null || end === null || start >= end) return null;
  const { language, comments } = parseCodeBlockInfo(fence.info, code);
  const remaining = comments.flatMap((item: CodeBlockComment): CodeBlockComment[] => {
    if (item.to <= start || item.from >= end) return [item];

    // 新批注覆盖旧批注的交叉部分，旧批注在两侧的有效范围仍需保留。
    const fragments: CodeBlockComment[] = [];
    if (item.from < start) fragments.push({ ...item, to: start, quote: code.slice(item.from, start) });
    if (item.to > end) fragments.push({ ...item, from: end, quote: code.slice(end, item.to) });
    return fragments;
  });
  remaining.push({ from: start, to: end, id, comment, quote: code.slice(start, end) });
  remaining.sort((left: CodeBlockComment, right: CodeBlockComment): number => left.from - right.from);

  const insert = formatCodeBlockInfo(
    language,
    remaining.map((item: CodeBlockComment): CodeBlockComment => withCodeContext(code, item))
  );
  return {
    from: fence.infoFrom,
    to: fence.infoTo,
    insert,
    nextPosition: to + insert.length - (fence.infoTo - fence.infoFrom)
  };
}
