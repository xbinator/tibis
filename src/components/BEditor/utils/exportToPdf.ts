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

  .b-markdown-export .b-markdown-frontmatter {
    width: 100% !important;
    min-width: 0 !important;
    max-width: 100% !important;
    inline-size: 100% !important;
    min-inline-size: 0 !important;
    max-inline-size: 100% !important;
    margin: 0 0 24px !important;
    break-inside: avoid;
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
  }

  .b-markdown-export table {
    width: 100%;
    border-collapse: collapse;
  }

  .b-markdown-export th,
  .b-markdown-export td {
    padding: 8px 12px;
    border: 1px solid #d0d7de;
  }

  .b-markdown-export blockquote {
    padding-left: 16px;
    color: #57606a;
    border-left: 4px solid #d0d7de;
  }

  .b-markdown-export code,
  .b-markdown-export pre {
    font-family: "SFMono-Regular", "Consolas", "Liberation Mono", monospace;
  }

  .b-markdown-export pre {
    padding: 16px;
    overflow-wrap: anywhere;
    white-space: pre-wrap;
    background: #f6f8fa;
    border-radius: 8px;
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
 * 将收集结果作为独立样式块注入导出 HTML，替代逐节点调用 getComputedStyle 的性能瓶颈。
 * @returns 收集到的 CSS 文本
 */
function collectDocumentStyles(): string {
  const parts: string[] = [];

  // 收集 :root 中的 CSS 自定义属性（色值与间距变量），确保导出上下文中的颜色与尺寸一致
  const computedRootStyle = getComputedStyle(document.documentElement);
  const variables: string[] = [];
  for (const name of Array.from(computedRootStyle)) {
    if (name.startsWith('--')) {
      variables.push(`  ${name}: ${computedRootStyle.getPropertyValue(name).trim()};`);
    }
  }
  if (variables.length > 0) {
    parts.push(`:root {\n${variables.join('\n')}\n}`);
  }

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
