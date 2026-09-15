/**
 * @file richCodeBlockEditing.ts
 * @description Rich 编辑器代码块的缩进与语言感知行注释快捷键。
 */
import type { EditorState, Transaction } from '@tiptap/pm/state';
import type { CodeBlockIndentStyle } from '@/stores/editor/preferences';

/**
 * 代码块编辑器所需的最小接口。
 */
interface CodeBlockEditor {
  /** 当前 ProseMirror 状态。 */
  readonly state: EditorState;
  /** 编辑器事务派发入口。 */
  view: {
    /** 派发编辑事务。 */
    dispatch: (transaction: Transaction) => void;
  };
}

/**
 * 代码块缩进配置。
 */
interface CodeBlockIndentOptions {
  /** 缩进使用空格还是制表符。 */
  indentStyle: CodeBlockIndentStyle;
  /** 一个缩进层级的显示或插入宽度。 */
  indentSize: number;
}

/**
 * 代码块内的一行文本。
 */
interface CodeLine {
  /** 相对代码块正文的行首偏移。 */
  start: number;
  /** 不含换行符的行文本。 */
  text: string;
}

/**
 * 一次相对于代码块正文的文本替换。
 */
interface CodeTextEdit {
  /** 替换起点。 */
  from: number;
  /** 替换终点。 */
  to: number;
  /** 插入文本。 */
  insert: string;
}

/**
 * 可用双斜线行注释的代码语言。
 */
const SLASH_COMMENT_LANGUAGES = new Set(['javascript', 'typescript', 'react', 'java', 'c', 'cpp', 'csharp', 'go', 'rust', 'php', 'swift', 'kotlin', 'scss']);

/**
 * 可用井号行注释的代码语言。
 */
const HASH_COMMENT_LANGUAGES = new Set(['python', 'ruby', 'bash', 'yaml']);

/**
 * 读取指定偏移所在行的行首。
 * @param text - 完整代码正文
 * @param offset - 正文内偏移
 * @returns 当前行的起始偏移
 */
function getLineStart(text: string, offset: number): number {
  if (offset <= 0) return 0;
  return text.lastIndexOf('\n', offset - 1) + 1;
}

/**
 * 获取当前选区覆盖的代码行。
 * 选区终点刚好位于下一行行首时不包含下一行，与常见代码编辑器一致。
 * @param text - 完整代码正文
 * @param from - 选区起点偏移
 * @param to - 选区终点偏移
 * @returns 选区覆盖的行列表
 */
function getSelectedLines(text: string, from: number, to: number): CodeLine[] {
  const firstLineStart = getLineStart(text, from);
  const effectiveEnd = to > from && text[to - 1] === '\n' ? to - 1 : to;
  const lastLineStart = getLineStart(text, effectiveEnd);
  const lines: CodeLine[] = [];
  let lineStart = firstLineStart;

  while (lineStart <= lastLineStart) {
    const newlineIndex = text.indexOf('\n', lineStart);
    const lineEnd = newlineIndex < 0 ? text.length : newlineIndex;
    lines.push({ start: lineStart, text: text.slice(lineStart, lineEnd) });

    if (newlineIndex < 0) break;
    lineStart = newlineIndex + 1;
  }

  return lines;
}

/**
 * 解析代码语言对应的行注释前缀。
 * @param language - 代码块语言
 * @returns 行注释前缀；不支持时返回 null
 */
function resolveCommentPrefix(language: unknown): string | null {
  if (typeof language !== 'string') return null;

  const normalizedLanguage = language.toLowerCase();
  if (SLASH_COMMENT_LANGUAGES.has(normalizedLanguage)) return '//';
  if (HASH_COMMENT_LANGUAGES.has(normalizedLanguage)) return '#';
  if (normalizedLanguage === 'sql') return '--';
  if (normalizedLanguage === 'mermaid') return '%%';
  return null;
}

/**
 * 读取行首连续空格与制表符长度。
 * @param line - 当前行文本
 * @returns 行首缩进字符数
 */
function getIndentLength(line: string): number {
  return line.match(/^[\t ]*/u)?.[0].length ?? 0;
}

/**
 * 创建切换行注释所需的文本编辑。
 * @param lines - 选区覆盖的代码行
 * @param prefix - 当前语言的行注释前缀
 * @returns 文本编辑列表
 */
function createCommentEdits(lines: CodeLine[], prefix: string): CodeTextEdit[] {
  const nonEmptyLines = lines.filter((line: CodeLine): boolean => line.text.trim().length > 0);
  if (nonEmptyLines.length === 0) return [];

  const shouldUncomment = nonEmptyLines.every((line: CodeLine): boolean => {
    const indentLength = getIndentLength(line.text);
    return line.text.slice(indentLength).startsWith(prefix);
  });

  return nonEmptyLines.map((line: CodeLine): CodeTextEdit => {
    const indentLength = getIndentLength(line.text);
    const prefixStart = line.start + indentLength;

    if (!shouldUncomment) {
      return { from: prefixStart, to: prefixStart, insert: `${prefix} ` };
    }

    const content = line.text.slice(indentLength + prefix.length);
    const trailingSpaceLength = content.startsWith(' ') ? 1 : 0;
    return {
      from: prefixStart,
      to: prefixStart + prefix.length + trailingSpaceLength,
      insert: ''
    };
  });
}

/**
 * 创建增加缩进所需的文本编辑。
 * @param lines - 选区覆盖的代码行
 * @param indent - 一个缩进层级的文本
 * @returns 文本编辑列表
 */
function createIndentEdits(lines: CodeLine[], indent: string): CodeTextEdit[] {
  return lines.map((line: CodeLine): CodeTextEdit => ({ from: line.start, to: line.start, insert: indent }));
}

/**
 * 创建减少缩进所需的文本编辑。
 * 混合缩进下优先移除一个制表符，否则最多移除配置数量的空格。
 * @param lines - 选区覆盖的代码行
 * @param indentSize - 一个缩进层级的空格数
 * @returns 文本编辑列表
 */
function createOutdentEdits(lines: CodeLine[], indentSize: number): CodeTextEdit[] {
  return lines.flatMap((line: CodeLine): CodeTextEdit[] => {
    if (line.text.startsWith('\t')) {
      return [{ from: line.start, to: line.start + 1, insert: '' }];
    }

    const leadingSpaces = line.text.match(/^ */u)?.[0].length ?? 0;
    const removeLength = Math.min(leadingSpaces, indentSize);
    return removeLength > 0 ? [{ from: line.start, to: line.start + removeLength, insert: '' }] : [];
  });
}

/**
 * 把相对代码块正文的编辑转换为 ProseMirror 事务。
 * 从后向前应用以保持各编辑的原始偏移，并避免覆盖已有行内批注 mark。
 * @param state - 当前编辑器状态
 * @param blockStart - 代码块正文的绝对起点
 * @param edits - 待应用的文本编辑
 * @returns 构造出的编辑事务
 */
function applyCodeEdits(state: EditorState, blockStart: number, edits: CodeTextEdit[]): Transaction {
  const transaction = state.tr;
  const sortedEdits = [...edits].sort((left: CodeTextEdit, right: CodeTextEdit): number => right.from - left.from);

  sortedEdits.forEach((edit: CodeTextEdit): void => {
    const from = blockStart + edit.from;
    const to = blockStart + edit.to;
    if (edit.insert) {
      transaction.replaceWith(from, to, state.schema.text(edit.insert));
      return;
    }

    transaction.delete(from, to);
  });

  return transaction;
}

/**
 * 判断事件是否为代码块行注释快捷键。
 * @param event - 键盘事件
 * @returns 是否为 Command/Ctrl + /
 */
function isCommentShortcut(event: KeyboardEvent): boolean {
  return event.key === '/' && (event.metaKey || event.ctrlKey) && !event.altKey;
}

/**
 * 处理 Rich 编辑器代码块中的缩进与行注释快捷键。
 * @param editor - 编辑器实例
 * @param event - 键盘事件
 * @param options - 当前代码块缩进偏好
 * @returns 是否由代码块快捷键处理
 */
export function handleCodeBlockKey(editor: CodeBlockEditor, event: KeyboardEvent, options: CodeBlockIndentOptions): boolean {
  const isTab = event.key === 'Tab' && !event.ctrlKey && !event.metaKey && !event.altKey;
  const isComment = isCommentShortcut(event);
  if (!isTab && !isComment) return false;

  const { state } = editor;
  const { selection } = state;
  const { $from, $to } = selection;
  if ($from.parent.type.name !== 'codeBlock') return false;

  event.preventDefault();

  // 跨块选区不执行代码文本变换，但仍消费按键以避免破坏文档结构。
  if ($from.parent !== $to.parent) return true;

  const blockStart = $from.start();
  const code = $from.parent.textContent;
  const from = selection.from - blockStart;
  const to = selection.to - blockStart;
  const indentSize = Math.max(1, Math.round(options.indentSize));
  let edits: CodeTextEdit[] = [];

  if (isComment) {
    const prefix = resolveCommentPrefix($from.parent.attrs.language);
    if (!prefix) return true;
    edits = createCommentEdits(getSelectedLines(code, from, to), prefix);
  } else if (event.shiftKey) {
    edits = createOutdentEdits(getSelectedLines(code, from, to), indentSize);
  } else if (selection.empty) {
    const indent = options.indentStyle === 'tabs' ? '\t' : ' '.repeat(indentSize);
    edits = [{ from, to, insert: indent }];
  } else {
    const indent = options.indentStyle === 'tabs' ? '\t' : ' '.repeat(indentSize);
    edits = createIndentEdits(getSelectedLines(code, from, to), indent);
  }

  const transaction = applyCodeEdits(state, blockStart, edits);
  if (transaction.docChanged) editor.view.dispatch(transaction);
  return true;
}
