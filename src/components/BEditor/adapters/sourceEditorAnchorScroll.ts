interface CssEscapeGlobal {
  CSS?: Pick<typeof CSS, 'escape'>;
}

interface SourceAnchorHost {
  getBoundingClientRect: () => DOMRect;
  querySelector: (selectors: string) => Element | null;
}

interface SourceAnchorElement {
  getBoundingClientRect: () => DOMRect;
}

function escapeCssIdentifier(id: string): string {
  const cssApi = globalThis as typeof globalThis & CssEscapeGlobal;
  return cssApi.CSS?.escape(id) ?? id.replace(/["\\]/g, '\\$&');
}

function isSourceAnchorElement(element: Element | null): element is Element & SourceAnchorElement {
  return Boolean(element && 'getBoundingClientRect' in element);
}

export function getRenderedSourceAnchorOffsetTop(hostElement: SourceAnchorHost, anchorId: string): number | null {
  const anchorElement = hostElement.querySelector(`#${escapeCssIdentifier(anchorId)}`);
  if (!isSourceAnchorElement(anchorElement)) {
    return null;
  }

  return anchorElement.getBoundingClientRect().top - hostElement.getBoundingClientRect().top;
}
