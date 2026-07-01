/**
 * @file mermaidMarkdown.ts
 * @description Mermaid Markdown 宽松围栏兼容工具。
 */

/**
 * 正在解析的 Mermaid 代码围栏。
 */
interface ActiveMermaidFence {
  /** 围栏字符 */
  char: '`' | '~';
  /** 起始围栏长度 */
  length: number;
}

/**
 * Markdown 标题层级。
 */
export type MarkdownHeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Mermaid 代码块中误吞的后续标题修复信息。
 */
export interface LooseMermaidHeadingRepair {
  /** 可保留在 Mermaid 代码块中的源码 */
  source: string;
  /** 需要恢复成 Markdown 节点的原始内容 */
  markdown: string;
  /** 需要恢复成 Markdown 标题的内容 */
  heading: {
    /** 标题层级 */
    level: MarkdownHeadingLevel;
    /** 标题纯文本 */
    text: string;
  };
}

const MARKDOWN_ESCAPABLE_CHARACTERS = new Set<string>(Array.from('!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~'));

/**
 * 转义字符串以安全拼接到正则表达式。
 * @param value - 待转义文本
 * @returns 正则安全文本
 */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 读取 Mermaid 代码块起始围栏。
 * @param line - 当前 Markdown 行
 * @returns Mermaid 围栏信息，未命中时返回 null
 */
function getMermaidOpeningFence(line: string): ActiveMermaidFence | null {
  const match = /^ {0,3}(`{3,}|~{3,})[ \t]*mermaid(?:[ \t].*)?$/i.exec(line);
  if (!match) {
    return null;
  }

  const marker = match[1];
  return {
    char: marker[0] as '`' | '~',
    length: marker.length
  };
}

/**
 * 判断当前行是否为标准代码块结束围栏。
 * @param line - 当前 Markdown 行
 * @param fence - 起始围栏信息
 * @returns 当前行是否闭合代码块
 */
function isClosingFenceLine(line: string, fence: ActiveMermaidFence): boolean {
  const closingFencePattern = new RegExp(`^ {0,3}${escapeRegExp(fence.char)}{${fence.length},}[ \\t]*$`);
  return closingFencePattern.test(line);
}

/**
 * 生成宽松结束围栏正则片段，兼容每个围栏字符前带反斜杠的 Markdown 转义写法。
 * @param fence - 起始围栏信息；省略时兼容反引号和波浪号
 * @returns 正则片段
 */
function getLooseClosingMarkerPattern(fence?: ActiveMermaidFence): string {
  if (fence) {
    return `(?:\\\\*${escapeRegExp(fence.char)}){${fence.length},}`;
  }

  return '(?:\\\\*`){3,}|(?:\\\\*~){3,}';
}

/**
 * 拆分 Mermaid 内容行中误粘在行尾的结束围栏与后续标题。
 * @param line - 当前 Mermaid 内容行
 * @param fence - 起始围栏信息；省略时兼容任意三连围栏
 * @returns 拆分后的代码行、结束围栏和标题行；未命中时返回 null
 */
function splitLooseMermaidClosingFence(line: string, fence?: ActiveMermaidFence): [string, string, string] | null {
  const markerPattern = getLooseClosingMarkerPattern(fence);
  const looseClosingPattern = new RegExp(`(${markerPattern})[ \\t]*(#{1,6}[ \\t].*)$`);
  const match = looseClosingPattern.exec(line);
  if (!match) {
    return null;
  }

  return [line.slice(0, match.index).trimEnd(), match[1], match[2]];
}

/**
 * 拆分 Mermaid 内容行末尾误粘的结束围栏。
 * @param line - 当前 Mermaid 内容行
 * @param fence - 起始围栏信息
 * @returns 拆分后的代码行和结束围栏；未命中时返回 null
 */
function splitLineEndMermaidClosingFence(line: string, fence: ActiveMermaidFence): [string, string] | null {
  const markerPattern = getLooseClosingMarkerPattern(fence);
  const looseClosingPattern = new RegExp(`(${markerPattern})[ \\t]*$`);
  const match = looseClosingPattern.exec(line);
  if (!match) {
    return null;
  }

  const sourceLine = line.slice(0, match.index).trimEnd();
  if (!sourceLine) {
    return null;
  }

  return [sourceLine, match[1]];
}

/**
 * 查找 Mermaid 源码中误残留的 Markdown 结束围栏位置。
 * @param line - 当前 Mermaid 内容行
 * @returns 围栏起始位置，未命中时返回 -1
 */
function findDanglingFenceMarkerIndex(line: string): number {
  const markerPattern = getLooseClosingMarkerPattern();
  const markerMatcher = new RegExp(markerPattern);
  const match = markerMatcher.exec(line);

  return match?.index ?? -1;
}

/**
 * 还原 Markdown 标题文本中的反斜杠转义。
 * @param value - 标题原始文本
 * @returns 还原后的标题文本
 */
function unescapeMarkdownHeadingText(value: string): string {
  return value.replace(/\\([\s\S])/g, (escapedSequence: string, escapedCharacter: string): string =>
    MARKDOWN_ESCAPABLE_CHARACTERS.has(escapedCharacter) ? escapedCharacter : escapedSequence
  );
}

/**
 * 解析 Markdown ATX 标题行。
 * @param line - Markdown 标题行
 * @returns 标题信息；不是标题时返回 null
 */
function parseMarkdownHeading(line: string): LooseMermaidHeadingRepair['heading'] | null {
  const match = /^(#{1,6})[ \t]+(.+)$/.exec(line);
  if (!match) {
    return null;
  }

  return {
    level: match[1].length as MarkdownHeadingLevel,
    text: unescapeMarkdownHeadingText(match[2].trim())
  };
}

/**
 * 获取 Markdown 片段中的首个非空行。
 * @param markdown - Markdown 片段
 * @returns 首个非空行，不存在时返回 null
 */
function getFirstNonEmptyLine(markdown: string): string | null {
  return markdown.split(/\r?\n/).find((line) => line.trim().length > 0) ?? null;
}

/**
 * 创建 Mermaid 误吞标题的修复信息。
 * @param source - 可保留在 Mermaid 代码块中的源码
 * @param markdown - 需要恢复成 Markdown 节点的原始内容
 * @returns 可修复信息；后续内容不是标题时返回 null
 */
function createLooseMermaidHeadingRepair(source: string, markdown: string): LooseMermaidHeadingRepair | null {
  const repairedSource = source.trim();
  const repairedMarkdown = markdown.trimStart();
  if (!repairedSource || !repairedMarkdown) {
    return null;
  }

  const headingLine = getFirstNonEmptyLine(repairedMarkdown);
  const heading = headingLine ? parseMarkdownHeading(headingLine) : null;
  if (!heading) {
    return null;
  }

  return {
    source: repairedSource,
    markdown: repairedMarkdown,
    heading
  };
}

/**
 * 兼容外部 Markdown 中 Mermaid 结束围栏与下一行标题粘连的写法。
 * @param markdown - 原始 Markdown 内容
 * @returns 规范化后的 Markdown 内容
 */
export function normalizeLooseMermaidClosingFences(markdown: string): string {
  const newline = markdown.includes('\r\n') ? '\r\n' : '\n';
  const lines = markdown.split(/\r?\n/);
  const normalizedLines: string[] = [];
  let activeFence: ActiveMermaidFence | null = null;

  lines.forEach((line) => {
    if (!activeFence) {
      normalizedLines.push(line);
      activeFence = getMermaidOpeningFence(line);
      return;
    }

    if (isClosingFenceLine(line, activeFence)) {
      normalizedLines.push(line);
      activeFence = null;
      return;
    }

    const splitLines = splitLooseMermaidClosingFence(line, activeFence);
    if (splitLines) {
      normalizedLines.push(splitLines[0], activeFence.char.repeat(activeFence.length), splitLines[2]);
      activeFence = null;
      return;
    }

    const lineEndSplitLines = splitLineEndMermaidClosingFence(line, activeFence);
    if (lineEndSplitLines) {
      normalizedLines.push(lineEndSplitLines[0], activeFence.char.repeat(activeFence.length));
      activeFence = null;
      return;
    }

    normalizedLines.push(line);
  });

  return normalizedLines.join(newline);
}

/**
 * 从 Mermaid 代码块源码中提取误吞进来的后续 Markdown 标题。
 * @param source - Mermaid 代码块源码
 * @returns 可修复的源码与标题信息；未命中时返回 null
 */
export function extractLooseMermaidHeadingRepair(source: string): LooseMermaidHeadingRepair | null {
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  const lines = source.split(/\r?\n/);
  const renderableLines: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const splitLines = splitLooseMermaidClosingFence(line);
    if (splitLines) {
      renderableLines.push(splitLines[0]);
      return createLooseMermaidHeadingRepair(renderableLines.join(newline), splitLines[2]);
    }

    const lineEndSplitLines =
      splitLineEndMermaidClosingFence(line, { char: '`', length: 3 }) ?? splitLineEndMermaidClosingFence(line, { char: '~', length: 3 });
    if (lineEndSplitLines) {
      renderableLines.push(lineEndSplitLines[0]);
      return createLooseMermaidHeadingRepair(renderableLines.join(newline), lines.slice(index + 1).join(newline));
    }

    renderableLines.push(line);
  }

  return null;
}

/**
 * 从 Mermaid 代码块源码中裁掉误粘进来的结束围栏和后续标题。
 * @param source - Mermaid 代码块源码
 * @returns 可送入 Mermaid 渲染器的源码
 */
export function getRenderableMermaidSource(source: string): string {
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  const lines = source.split(/\r?\n/);
  const renderableLines: string[] = [];

  for (const line of lines) {
    const splitLines = splitLooseMermaidClosingFence(line);
    if (splitLines) {
      renderableLines.push(splitLines[0]);
      return renderableLines.join(newline).trim();
    }

    const danglingFenceIndex = findDanglingFenceMarkerIndex(line);
    if (danglingFenceIndex >= 0) {
      renderableLines.push(line.slice(0, danglingFenceIndex).trimEnd());
      return renderableLines.join(newline).trim();
    }

    renderableLines.push(line);
  }

  return source.trim();
}
