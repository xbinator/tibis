/**
 * @file exportToPdf.test.ts
 * @description BEditor PDF 导出工具测试，验证导出 HTML 的布局清理与内容保真。
 */
/* @vitest-environment jsdom */

import { describe, expect, it } from 'vitest';
import { buildRichPdfExportHtml, buildSourcePdfExportHtml } from '@/components/BEditor/utils/exportToPdf';

describe('buildSourcePdfExportHtml', () => {
  it('exports raw markdown source without injecting wrapper divs or code block background', () => {
    const source = '# Title\n\n`<webview>` and `<KeepAlive>`\n\n```typescript\nconst value = \"ok\"\n```';
    const html = buildSourcePdfExportHtml(source);

    expect(html).toContain('&lt;webview&gt;');
    expect(html).toContain('&lt;KeepAlive&gt;');
    expect(html).not.toContain('&lt;div&gt;');
    expect(html).not.toContain('&lt;/div&gt;');
    expect(html).toContain('.b-markdown-export__source');
    expect(html).toContain('<div class="b-markdown-export__source">');
    expect(html).not.toContain('<pre class="b-markdown-export__source">');
    expect(html).toContain('white-space: pre-wrap;');
    expect(html).toContain('background: transparent;');
  });
});

describe('buildRichPdfExportHtml', () => {
  it('removes viewport layout styles that would offset exported rich content', () => {
    const rootElement = document.createElement('div');
    rootElement.className = 'b-markdown-rich';
    rootElement.style.width = '900px';
    rootElement.style.maxWidth = '900px';
    rootElement.style.minWidth = '900px';
    rootElement.style.setProperty('inline-size', '900px');
    rootElement.style.setProperty('max-inline-size', '900px');
    rootElement.style.setProperty('min-inline-size', '900px');
    rootElement.style.marginLeft = '120px';
    rootElement.style.marginRight = '0px';
    rootElement.innerHTML = '<div class="b-markdown-rich__content"><div class="ProseMirror"><p>Centered body</p></div></div>';

    const html = buildRichPdfExportHtml(rootElement);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const exportedRoot = doc.querySelector('.b-markdown-export > .b-markdown-rich');
    const exportedRootStyle = exportedRoot?.getAttribute('style') ?? '';

    expect(exportedRoot?.textContent).toContain('Centered body');
    expect(exportedRootStyle).not.toContain('width: 900px');
    expect(exportedRootStyle).not.toContain('max-width: 900px');
    expect(exportedRootStyle).not.toContain('min-width: 900px');
    expect(exportedRootStyle).not.toContain('inline-size: 900px');
    expect(exportedRootStyle).not.toContain('max-inline-size: 900px');
    expect(exportedRootStyle).not.toContain('min-inline-size: 900px');
    expect(exportedRootStyle).not.toContain('margin-left: 120px');
  });
});
