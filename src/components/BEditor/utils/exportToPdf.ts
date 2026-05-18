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

  .b-markdown-export {
    max-width: 860px;
    padding: 48px 56px 64px;
    margin: 0 auto;
    font-size: 15px;
    line-height: 1.75;
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
    margin: 0;
  }
`;

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
 * @returns 完整 HTML 文档
 */
export function buildPdfDocumentHtml(body: string): string {
  return [
    '<!DOCTYPE html>',
    '<html lang="zh-CN">',
    '<head>',
    '<meta charset="UTF-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    '<title>Export PDF</title>',
    `<style>${PDF_EXPORT_DOCUMENT_STYLE}</style>`,
    '</head>',
    `<body><main class="b-markdown-export">${body}</main></body>`,
    '</html>'
  ].join('');
}

/**
 * 将单个 DOM 元素的计算样式内联到导出副本上。
 * @param source - 原始元素
 * @param target - 克隆后的目标元素
 */
function inlineComputedStyle(source: Element, target: Element): void {
  const computedStyle = window.getComputedStyle(source);
  const cssText = Array.from(computedStyle)
    .map((propertyName) => `${propertyName}: ${computedStyle.getPropertyValue(propertyName)};`)
    .join(' ');

  if (cssText) {
    target.setAttribute('style', cssText);
  }
}

/**
 * 深度克隆富文本节点，并将当前计算样式写入导出副本。
 * @param sourceNode - 原始 DOM 节点
 * @returns 带内联样式的克隆节点
 */
function cloneNodeWithInlineStyles(sourceNode: Node): Node {
  if (!(sourceNode instanceof Element)) {
    return sourceNode.cloneNode(true);
  }

  const clonedElement = sourceNode.cloneNode(false) as Element;
  inlineComputedStyle(sourceNode, clonedElement);

  if (sourceNode instanceof HTMLInputElement) {
    const clonedInput = clonedElement as HTMLInputElement;
    clonedInput.checked = sourceNode.checked;

    if (sourceNode.checked) {
      clonedInput.setAttribute('checked', '');
    } else {
      clonedInput.removeAttribute('checked');
    }
  }

  Array.from(sourceNode.childNodes).forEach((childNode) => {
    clonedElement.appendChild(cloneNodeWithInlineStyles(childNode));
  });

  return clonedElement;
}

/**
 * 根据当前富文本渲染结果生成更接近屏幕显示效果的导出 HTML。
 * 通过克隆 DOM 并内联计算样式，减少样式源分散导致的导出偏差。
 * @param rootElement - 富文本渲染根节点
 * @returns 完整 HTML 文档
 */
export function buildRichPdfExportHtml(rootElement: HTMLElement): string {
  const clonedRoot = cloneNodeWithInlineStyles(rootElement) as HTMLElement;

  clonedRoot.querySelectorAll(RICH_EXPORT_IGNORED_SELECTORS).forEach((element) => {
    element.remove();
  });

  clonedRoot.querySelectorAll('[contenteditable]').forEach((element) => {
    element.removeAttribute('contenteditable');
  });

  return buildPdfDocumentHtml(clonedRoot.outerHTML);
}

/**
 * 从 HTML 字符串中移除所有带 data-export-ignore 属性的元素。
 * 通过 DOMParser 解析，确保准确匹配成对标签和自闭合标签。
 * @param html - 原始 HTML 字符串
 * @returns 过滤后的 HTML 字符串
 */
function stripDataExportIgnoreElements(html: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');
  doc.body.querySelectorAll('[data-export-ignore]').forEach((el) => el.remove());
  return doc.body.innerHTML;
}

/**
 * 根据源码文本生成 PDF 导出的完整 HTML 文档。
 * @param source - 当前源码文本
 * @returns 完整 HTML 文档
 */
export function buildSourcePdfExportHtml(source: string): string {
  const filteredSource = stripDataExportIgnoreElements(source);
  const sourceHtml = `<pre class="b-markdown-export__source">${escapePdfHtml(filteredSource)}</pre>`;
  return buildPdfDocumentHtml(sourceHtml);
}
