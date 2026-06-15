/**
 * @file export-to-pdf.test.ts
 * @description Markdown PDF 导出 HTML 主题样式测试。
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { buildRichPdfExportHtml, buildSourcePdfExportHtml } from '@/components/BEditor/utils/exportToPdf';

describe('exportToPdf theme styles', (): void => {
  it('adds a stable print theme for source exports', (): void => {
    const html = buildSourcePdfExportHtml('# Title\n\n```ts\nconst color = "blue";\n```');

    expect(html).toContain('--text-primary: #1f2329;');
    expect(html).toContain('--bg-primary: #ffffff;');
    expect(html).toContain('--code-keyword: #cf222e;');
    expect(html).toContain('.b-markdown-export .b-markdown-codeblock');
    expect(html).toContain('.b-markdown-export .b-markdown-frontmatter');
  });

  it('does not inject current app root theme variables into rich exports', (): void => {
    const style = document.createElement('style');
    style.textContent = ':root { --text-primary: #ffffff; --bg-primary: #101010; } .b-markdown-rich p { color: var(--text-primary); }';
    document.head.appendChild(style);

    const root = document.createElement('div');
    root.className = 'b-markdown-rich';
    root.innerHTML = '<div class="ProseMirror"><p>Content</p></div>';

    const html = buildRichPdfExportHtml(root);

    expect(html).toContain('.b-markdown-rich p { color: var(--text-primary); }');
    expect(html).toContain('--text-primary: #1f2329;');
    expect(html).not.toContain('--text-primary: #ffffff;');
    expect(html).not.toContain('--bg-primary: #101010;');
  });

  it('lets exported rich tables shrink to the PDF page width', (): void => {
    const style = document.createElement('style');
    style.textContent = '.b-markdown-rich th, .b-markdown-rich td { min-width: 120px; }';
    document.head.appendChild(style);

    const root = document.createElement('div');
    root.className = 'b-markdown-rich';
    root.innerHTML = [
      '<div class="ProseMirror">',
      '<div class="b-markdown-table">',
      '<div class="b-markdown-table__scroller">',
      '<table class="b-markdown-table__table"><tbody><tr><td>Long table content</td></tr></tbody></table>',
      '</div>',
      '</div>',
      '</div>'
    ].join('');

    const html = buildRichPdfExportHtml(root);
    const collectedTableStyleIndex = html.indexOf('.b-markdown-rich th, .b-markdown-rich td');
    const exportTableCellRule = /\.b-markdown-export th,\s*\.b-markdown-export td \{[^}]*min-width: 0 !important;[^}]*overflow-wrap: anywhere;/s;

    expect(collectedTableStyleIndex).toBeGreaterThan(-1);
    expect(html).toMatch(exportTableCellRule);
  });
});
