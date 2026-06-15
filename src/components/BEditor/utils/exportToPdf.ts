/**
 * @file exportToPdf.ts
 * @description BEditor PDF 导出工具，负责生成导出 HTML 与默认文件路径。
 */

import type { EditorState } from '../types';

/**
 * 富文本导出时需要移除的编辑态元素。
 * 这些节点只服务于编辑交互，不应出现在 PDF 中。
 */
const RICH_EXPORT_IGNORED_SELECTORS = [
  '.b-markdown-table__line-overlay',
  '.b-markdown-table__segment-overlay',
  '.b-markdown-table__add-button-group',
  '.b-markdown-table__segment-button-group',
  '.b-markdown-codeblock__copy',
  '.b-markdown-blockmenu',
  '[data-export-ignore]'
].join(', ');

/**
 * 导出 PDF 时使用的基础文档样式。
 * 渲染层统一生成完整 HTML，让原生层只负责 HTML -> PDF 的通用管道。
 */
const PDF_EXPORT_DOCUMENT_STYLE = `
  :root {
    color-scheme: light;
  }

  * {
    box-sizing: border-box;
  }

  body {
    margin: 0;
    color: #1f2329;
    background: #ffffff;
    font-family: "PingFang SC", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif;
  }

  @page {
    size: A4;
    margin: 18mm 16mm;
  }

  .b-markdown-export {
    --bg-primary: #ffffff;
    --bg-secondary: #f6f8fa;
    --bg-tertiary: #f1f5f9;
    --bg-hover: #eef2f7;
    --bg-disabled: #f6f8fa;
    --text-primary: #1f2329;
    --text-secondary: #57606a;
    --text-tertiary: #6e7781;
    --text-quaternary: #8c959f;
    --text-disabled: #a6b0ba;
    --border-primary: #d0d7de;
    --border-secondary: #d8dee4;
    --border-tertiary: #eaeef2;
    --color-primary: #0969da;
    --color-primary-bg: #ddf4ff;
    --color-primary-bg-hover: #b6e3ff;
    --color-primary-border: #54aeff;
    --color-success: #1a7f37;
    --color-success-bg: #dafbe1;
    --color-warning: #9a6700;
    --color-warning-bg: #fff8c5;
    --color-error: #cf222e;
    --color-error-bg: #ffebe9;
    --color-info: #0969da;
    --color-purple: #8250df;
    --color-purple-bg: #fbefff;
    --color-purple-border: #d8b9ff;
    --selection-color: #ffffff;
    --selection-bg: #0969da;
    --shadow-sm: none;
    --shadow-md: none;
    --shadow-lg: none;
    --editor-text: #1f2329;
    --editor-placeholder: #8c959f;
    --editor-caret: #1f2329;
    --editor-blockquote-text: #57606a;
    --editor-blockquote-bg: #f6f8fa;
    --editor-blockquote-border: #d0d7de;
    --editor-link: #0969da;
    --editor-hr: #d8dee4;
    --editor-table-header-bg: #f6f8fa;
    --editor-table-border: #d0d7de;
    --editor-table-even-bg: #fbfbfc;
    --editor-search-highlight: transparent;
    --editor-search-active: transparent;
    --editor-search-active-border: none;
    --code-bg: #f6f8fa;
    --code-border: #d0d7de;
    --code-header-bg: #eef2f7;
    --code-line-bg: #ffffff;
    --code-line-hover-bg: #eef2f7;
    --code-line-number: #6e7781;
    --code-text: #24292f;
    --code-keyword: #cf222e;
    --code-string: #0a3069;
    --code-comment: #6e7781;
    --code-function: #8250df;
    --code-number: #0550ae;
    --code-operator: #cf222e;
    --code-punctuation: #24292f;
    --code-property: #953800;
    --code-tag: #116329;
    --code-attr-name: #953800;
    --code-attr-value: #0a3069;
    --code-builtin: #0550ae;
    --code-boolean: #0550ae;
    --code-class: #953800;
    --code-constant: #0550ae;
    --code-deleted: #82071e;
    --code-inserted: #116329;
    --code-regex: #116329;
    --code-symbol: #0550ae;
    --code-variable: #953800;
    --tag-bg: #f6f8fa;
    --tag-hover-bg: #eef2f7;
    --tag-text: #1f2329;
    --tag-secondary-text: #57606a;
    --tag-placeholder: #8c959f;
    --frontmatter-bg: #f8fafc;
    --frontmatter-border: #d0d7de;
    --frontmatter-divider: #d8dee4;
    --frontmatter-key-text: #8250df;
    --frontmatter-value-text: #1f2329;

    width: 100%;
    max-width: none;
    padding: 0;
    margin: 0;
    font-size: 15px;
    line-height: 1.75;
  }

  .b-markdown-export .b-markdown-rich,
  .b-markdown-export .b-markdown-rich__content,
  .b-markdown-export .ProseMirror {
    width: 100% !important;
    min-width: 0 !important;
    max-width: 100% !important;
    inline-size: 100% !important;
    min-inline-size: 0 !important;
    max-inline-size: 100% !important;
    height: auto !important;
    min-height: 0 !important;
    max-height: none !important;
    block-size: auto !important;
    min-block-size: 0 !important;
    max-block-size: none !important;
    padding-right: 0 !important;
    padding-left: 0 !important;
    margin-right: 0 !important;
    margin-left: 0 !important;
    overflow: visible !important;
    transform: none !important;
  }

  .b-markdown-export .b-markdown-rich__content .ProseMirror {
    color: var(--editor-text);
    caret-color: transparent;
  }

  .b-markdown-export .b-markdown-frontmatter {
    width: 100% !important;
    min-width: 0 !important;
    max-width: 100% !important;
    inline-size: 100% !important;
    min-inline-size: 0 !important;
    max-inline-size: 100% !important;
    margin: 0 0 24px !important;
    background-color: var(--frontmatter-bg);
    border: 1px solid var(--frontmatter-border);
    break-inside: avoid;
  }

  .b-markdown-export .b-markdown-frontmatter__header,
  .b-markdown-export .b-markdown-frontmatter__content,
  .b-markdown-export .b-markdown-frontmatter__item {
    background: transparent;
  }

  .b-markdown-export .b-markdown-frontmatter__title,
  .b-markdown-export .b-markdown-frontmatter__key {
    color: var(--frontmatter-key-text);
  }

  .b-markdown-export .b-markdown-frontmatter__value,
  .b-markdown-export .b-markdown-frontmatter__new-value {
    color: var(--frontmatter-value-text);
    background-color: var(--bg-primary);
    border-color: var(--border-primary);
  }

  .b-markdown-export .b-markdown-frontmatter__action-btn,
  .b-markdown-export .b-markdown-frontmatter__delete,
  .b-markdown-export .b-markdown-frontmatter__add-row,
  .b-markdown-export .b-markdown-frontmatter__add-btn {
    display: none !important;
  }

  .b-markdown-export .b-markdown-frontmatter__item,
  .b-markdown-export .b-markdown-frontmatter__value-wrapper,
  .b-markdown-export input,
  .b-markdown-export textarea {
    min-width: 0 !important;
    max-width: 100% !important;
    min-inline-size: 0 !important;
    max-inline-size: 100% !important;
  }

  .b-markdown-export h1,
  .b-markdown-export h2,
  .b-markdown-export h3,
  .b-markdown-export h4,
  .b-markdown-export h5,
  .b-markdown-export h6 {
    margin: 1.5em 0 0.65em;
    color: var(--editor-text);
    line-height: 1.35;
  }

  .b-markdown-export p,
  .b-markdown-export ul,
  .b-markdown-export ol,
  .b-markdown-export blockquote,
  .b-markdown-export pre,
  .b-markdown-export table {
    margin: 0 0 1em;
  }

  .b-markdown-export img {
    max-width: 100%;
    box-shadow: none !important;
  }

  .b-markdown-export table {
    width: 100% !important;
    min-width: 0 !important;
    max-width: 100% !important;
    border-collapse: collapse;
    table-layout: fixed;
  }

  .b-markdown-export .b-markdown-table,
  .b-markdown-export .b-markdown-table__viewport,
  .b-markdown-export .b-markdown-table__scroller,
  .b-markdown-export .b-markdown-table__table {
    width: 100% !important;
    min-width: 0 !important;
    max-width: 100% !important;
    overflow: visible !important;
  }

  .b-markdown-export th,
  .b-markdown-export td {
    min-width: 0 !important;
    max-width: none !important;
    padding: 8px 12px;
    color: var(--editor-text);
    overflow-wrap: anywhere;
    word-break: break-word;
    background-color: var(--bg-primary);
    border: 1px solid var(--editor-table-border);
  }

  .b-markdown-export th {
    background-color: var(--editor-table-header-bg);
  }

  .b-markdown-export blockquote {
    padding-left: 16px;
    color: var(--editor-blockquote-text);
    background-color: var(--editor-blockquote-bg);
    border-left: 4px solid var(--editor-blockquote-border);
  }

  .b-markdown-export code,
  .b-markdown-export pre {
    font-family: "SFMono-Regular", "Consolas", "Liberation Mono", monospace;
  }

  .b-markdown-export :not(pre) > code {
    color: var(--color-error);
    background: var(--bg-disabled);
  }

  .b-markdown-export pre {
    padding: 16px;
    overflow-wrap: anywhere;
    white-space: pre-wrap;
    color: var(--code-text);
    background: var(--code-bg);
    border: 1px solid var(--code-border);
    border-radius: 8px;
  }

  .b-markdown-export a {
    color: var(--editor-link);
  }

  .b-markdown-export .b-markdown-codeblock {
    overflow: hidden;
    background: var(--code-bg);
    border: 1px solid var(--code-border);
    border-radius: 8px;
    box-shadow: none;
    break-inside: avoid;
  }

  .b-markdown-export .b-markdown-codeblock__header {
    color: var(--code-line-number);
    background: var(--code-header-bg);
  }

  .b-markdown-export .b-markdown-codeblock__control-btn,
  .b-markdown-export .b-markdown-codeblock__copy {
    display: none !important;
  }

  .b-markdown-export .b-markdown-codeblock__body,
  .b-markdown-export .b-markdown-codeblock__body code {
    color: var(--code-text);
    background: var(--code-bg);
  }

  .b-markdown-export .hljs-keyword {
    color: var(--code-keyword);
  }

  .b-markdown-export .hljs-string {
    color: var(--code-string);
  }

  .b-markdown-export .hljs-number {
    color: var(--code-number);
  }

  .b-markdown-export .hljs-comment {
    color: var(--code-comment);
  }

  .b-markdown-export .hljs-function,
  .b-markdown-export .hljs-title {
    color: var(--code-function);
  }

  .b-markdown-export .hljs-params {
    color: var(--code-text);
  }

  .b-markdown-export .hljs-variable,
  .b-markdown-export .hljs-property {
    color: var(--code-variable);
  }

  .b-markdown-export .hljs-operator {
    color: var(--code-operator);
  }

  .b-markdown-export .hljs-tag {
    color: var(--code-tag);
  }

  .b-markdown-export .hljs-attr {
    color: var(--code-attr-name);
  }

  .b-markdown-export .hljs-value {
    color: var(--code-attr-value);
  }

  .b-markdown-export .hljs-built_in {
    color: var(--code-builtin);
  }

  .b-markdown-export .hljs-class {
    color: var(--code-class);
  }

  .b-markdown-export .hljs-constant {
    color: var(--code-constant);
  }

  .b-markdown-export__source {
    display: block;
    margin: 0;
    overflow-wrap: anywhere;
    white-space: pre-wrap;
    background: transparent;
    border-radius: 0;
    font-family: "SFMono-Regular", "Consolas", "Liberation Mono", monospace;
  }
`;

/**
 * 富文本导出时需要从内联样式中移除的屏幕布局属性。
 * 这些值通常来自当前编辑器视口，带入 PDF 会导致内容固定宽度溢出或偏移。
 */
const RICH_EXPORT_LAYOUT_STYLE_PROPERTIES = [
  'width',
  'min-width',
  'max-width',
  'inline-size',
  'min-inline-size',
  'max-inline-size',
  'height',
  'min-height',
  'max-height',
  'block-size',
  'min-block-size',
  'max-block-size',
  'margin',
  'margin-left',
  'margin-right'
];

/**
 * 对源码文本做 HTML 转义，避免源码模式导出时被解析为真实标签。
 * @param raw - 原始源码文本
 * @returns 转义后的文本
 */
export function escapePdfHtml(raw: string): string {
  return raw.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

/**
 * 解析 PDF 默认导出路径。
 * 优先沿用当前文件路径并替换扩展名；未保存文档则回退到 `<name>.pdf`。
 * @param editorState - 当前编辑器状态
 * @returns 默认导出路径
 */
export function resolvePdfDefaultPath(editorState: EditorState): string {
  if (editorState.path) {
    const nextPath = editorState.path.replace(/\.[^./\\]+$/u, '.pdf');
    return nextPath === editorState.path ? `${editorState.path}.pdf` : nextPath;
  }

  const normalizedName = editorState.name.trim() || 'untitled';
  return `${normalizedName}.pdf`;
}

/**
 * 将正文片段包装为可直接用于 PDF 渲染的完整 HTML 文档。
 * @param body - 已准备好的正文 HTML
 * @param extraStyles - 额外注入的样式块（如收集的页面样式表规则）
 * @returns 完整 HTML 文档
 */
export function buildPdfDocumentHtml(body: string, extraStyles = ''): string {
  return [
    '<!DOCTYPE html>',
    '<html lang="zh-CN">',
    '<head>',
    '<meta charset="UTF-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    '<title>Export PDF</title>',
    `<style>${PDF_EXPORT_DOCUMENT_STYLE}</style>`,
    extraStyles ? `<style>${extraStyles}</style>` : '',
    '</head>',
    `<body><main class="b-markdown-export">${body}</main></body>`,
    '</html>'
  ].join('');
}

/**
 * 标记为与 markdown 导出内容相关的样式表规则模式。
 * 只收集匹配这些模式的规则，避免注入无关样式影响导出排版。
 */
const DOCUMENT_STYLE_RELEVANT_SELECTORS = [
  '.b-markdown-rich',
  '.ProseMirror',
  '.hljs-',
  '.code-highlight',
  '.search-match',
  '.ai-selection-highlight',
  '.editor-comment-highlight',
  '.b-markdown-frontmatter',
  '.b-markdown-codeblock',
  '.b-markdown-table',
  '.b-markdown-anchor'
];

/**
 * 从当前页面收集 CSS 自定义属性与样式表规则。
 * 只收集 Markdown 内容相关规则；颜色变量由 PDF 专用打印主题提供，避免当前应用主题污染导出结果。
 * @returns 收集到的 CSS 文本
 */
function collectDocumentStyles(): string {
  const parts: string[] = [];

  // 收集与 markdown 渲染相关的样式表规则
  for (const sheet of document.styleSheets) {
    try {
      for (const rule of sheet.cssRules) {
        if (!(rule instanceof CSSStyleRule)) {
          continue;
        }
        const { selectorText } = rule;
        if (!DOCUMENT_STYLE_RELEVANT_SELECTORS.some((pattern) => selectorText.includes(pattern))) {
          continue;
        }
        // 移除 Vue scoped 数据属性选择器，使规则在导出 DOM 中也能匹配
        const cleaned = rule.cssText.replace(/\[data-v-[a-f0-9]+\]/gi, '');
        parts.push(cleaned);
      }
    } catch {
      // 跨域或受限的样式表无法读取，静默跳过
    }
  }

  return parts.join('\n');
}

/**
 * 清理富文本导出副本中的视口布局样式，让内容交由 PDF 导出容器居中排版。
 * @param rootElement - 已完成样式内联的富文本导出根节点
 */
function normalizeRichExportLayout(rootElement: HTMLElement): void {
  [rootElement, ...Array.from(rootElement.querySelectorAll('*'))].forEach((element) => {
    RICH_EXPORT_LAYOUT_STYLE_PROPERTIES.forEach((propertyName) => {
      (element as HTMLElement).style.removeProperty(propertyName);
    });
  });
}

/**
 * 根据当前富文本渲染结果生成更接近屏幕显示效果的导出 HTML。
 * 通过克隆 DOM 并内联计算样式，减少样式源分散导致的导出偏差。
 * @param rootElement - 富文本渲染根节点
 * @returns 完整 HTML 文档
 */
export function buildRichPdfExportHtml(rootElement: HTMLElement): string {
  const clonedRoot = rootElement.cloneNode(true) as HTMLElement;
  normalizeRichExportLayout(clonedRoot);

  clonedRoot.querySelectorAll(RICH_EXPORT_IGNORED_SELECTORS).forEach((element) => {
    element.remove();
  });

  clonedRoot.querySelectorAll('[contenteditable]').forEach((element) => {
    element.removeAttribute('contenteditable');
  });

  return buildPdfDocumentHtml(clonedRoot.outerHTML, collectDocumentStyles());
}

/**
 * 根据源码文本生成 PDF 导出的完整 HTML 文档。
 * @param source - 当前源码文本
 * @returns 完整 HTML 文档
 */
export function buildSourcePdfExportHtml(source: string): string {
  const sourceHtml = `<div class="b-markdown-export__source">${escapePdfHtml(source)}</div>`;
  return buildPdfDocumentHtml(sourceHtml);
}
