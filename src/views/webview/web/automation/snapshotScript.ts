/**
 * @file snapshotScript.ts
 * @description WebView 自动化页面快照采集脚本生成器。
 */
import { WEBVIEW_PAGE_ELEMENT_LIMIT } from './constants';
import { createRuntimeScript } from './engine/runtime';
import { createSerializerScript } from './engine/serializer';

/**
 * 构建页面快照读取脚本。
 * @returns 可通过 `executeJavaScript` 执行的脚本
 */
export function createPageSnapshotScript(): string {
  return `
(() => {
  ${createRuntimeScript()}
  ${createSerializerScript()}

  const readText = __tibisWebviewEngine.readText;
  const { flatTree, indexedNodes, topLayer } = __tibisWebviewEngine.collectFlatDomTree({ elementLimit: ${WEBVIEW_PAGE_ELEMENT_LIMIT} });
  const content = __tibisWebviewEngineSerializer.flatTreeToString(flatTree);
  const elements = indexedNodes.map((node) => ({
    index: node.highlightIndex,
    tagName: String(node.tagName || '').toUpperCase(),
    role: node.attributes.role || undefined,
    text: node.text || '',
    label: node.label || node.text || '',
    roleHint: node.roleHint,
    fingerprint: node.fingerprint,
    placeholder: node.attributes.placeholder || undefined,
    href: node.href,
    valuePreview: node.valuePreview,
    disabled: Boolean(node.disabled),
    checked: node.checked,
    selected: node.selected,
    isNew: Boolean(node.isNew),
    rect: node.rect,
    visibleRatio: node.visibleRatio,
    covered: node.covered,
    layer: node.layer,
    primary: Boolean(node.primary),
    clickableScore: node.clickableScore,
    reasons: node.reasons,
    semanticPath: node.semanticPath,
    hitTarget: node.hitTarget,
    actions: Array.isArray(node.actions) ? node.actions : []
  }));
  const scrollX = window.scrollX || document.documentElement.scrollLeft || document.body.scrollLeft || 0;
  const scrollY = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
  const scrollWidth = Math.max(document.documentElement.scrollWidth, document.body ? document.body.scrollWidth : 0, window.innerWidth);
  const scrollHeight = Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0, window.innerHeight);
  const remainingBottom = Math.max(scrollHeight - (scrollY + window.innerHeight), 0);
  const header = [
    'Page info: ',
    window.innerWidth,
    'x',
    window.innerHeight,
    'px, scroll ',
    Math.round(scrollX),
    ',',
    Math.round(scrollY),
    ' of ',
    Math.round(scrollWidth),
    'x',
    Math.round(scrollHeight),
    scrollY <= 0 ? ' [Start of page]' : ''
  ].join('');
  const footer = remainingBottom <= 2 ? '[End of page]' : '... ' + Math.round(remainingBottom) + ' pixels below ...';
  const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6')).map((element) => ({
    level: Number(element.tagName.slice(1)),
    text: readText(element.innerText || element.textContent)
  })).filter((item) => item.text);
  const links = Array.from(document.querySelectorAll('a[href]')).map((element) => ({
    text: readText(element.innerText || element.textContent || element.getAttribute('aria-label')),
    href: element.href
  })).filter((item) => item.href);
  const viewport = {
    width: window.innerWidth,
    height: window.innerHeight,
    scrollX,
    scrollY,
    ...(topLayer ? { topLayer } : {}),
    elements: elements
      .filter((element) => typeof element.visibleRatio === 'number' && element.visibleRatio > 0)
      .map((element) => ({
        index: element.index,
        tagName: element.tagName,
        label: element.label,
        roleHint: element.roleHint,
        actions: element.actions,
        rect: element.rect,
        visibleRatio: element.visibleRatio,
        covered: element.covered,
        layer: element.layer,
        primary: element.primary,
        clickableScore: element.clickableScore,
        reasons: element.reasons,
        semanticPath: element.semanticPath,
        hitTarget: element.hitTarget
      }))
  };

  return {
    url: location.href,
    title: document.title || '',
    header,
    content,
    footer,
    text: readText(document.body ? document.body.innerText : ''),
    selectedText: readText(window.getSelection ? window.getSelection().toString() : ''),
    headings,
    links,
    loading: document.readyState === 'loading',
    scroll: {
      x: scrollX,
      y: scrollY,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      scrollWidth,
      scrollHeight,
      atTop: scrollY <= 0,
      atBottom: scrollY + window.innerHeight >= scrollHeight - 2
    },
    viewport,
    elements
  };
})();
`;
}
