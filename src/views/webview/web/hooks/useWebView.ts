/**
 * @file useWebView.ts
 * @description 封装 `<webview>` 标签页面状态与导航控制。
 */
import type { DidNavigateEvent, PageTitleUpdatedEvent, WebviewTag } from 'electron';
import { ref, type Ref } from 'vue';
import type { WebviewPageHeading, WebviewPageLink, WebviewPageSnapshot, WebviewPageTruncation } from '@/ai/tools/context/webview';
import type { WebviewController, WebviewElementSelection, WebviewPageState } from '@/views/webview/shared/types';

/**
 * 默认 WebView 页面状态。
 */
const DEFAULT_STATE: WebviewPageState = {
  url: '',
  title: '',
  isLoading: false,
  isElementSelecting: false,
  isTouchSimulationEnabled: false,
  canGoBack: false,
  canGoForward: false,
  loadProgress: 0
};

/**
 * WebView 页面元素选择器主题。
 */
export interface WebviewElementPickerTheme {
  /** 高亮边框色 */
  color: string;
  /** 高亮背景色 */
  background: string;
}

/**
 * 默认 WebView 页面元素选择器主题。
 */
const DEFAULT_ELEMENT_PICKER_THEME: WebviewElementPickerTheme = {
  color: '#2563eb',
  background: 'rgba(37,99,235,.12)'
};

/**
 * 页面脚本上报元素选择结果的 console 消息前缀。
 */
const ELEMENT_PICKER_SELECTION_MESSAGE_PREFIX = '__TIBIS_ELEMENT_PICKER_SELECTION__';

/**
 * 页面元素选择脚本需要读取的精选计算样式。
 */
const ELEMENT_PICKER_STYLE_PROPERTIES = [
  'display',
  'position',
  'box-sizing',
  'opacity',
  'width',
  'height',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'font-family',
  'font-size',
  'font-weight',
  'line-height',
  'letter-spacing',
  'text-align',
  'color',
  'background-color',
  'border-top-width',
  'border-right-width',
  'border-bottom-width',
  'border-left-width',
  'border-color',
  'border-radius',
  'z-index',
  'overflow',
  'transform'
];

/**
 * 私有字区通常被 iconfont 用作图标编码，不应作为可读文本展示。
 */
const PRIVATE_USE_ICON_GLYPH_PATTERN = /[\uE000-\uF8FF]/g;

/**
 * WebView console-message 事件的最小消息结构。
 */
export interface WebviewConsoleMessageEvent {
  /** WebView 页面输出的 console message */
  message: string;
}

/**
 * 判断事件是否包含 WebView console message。
 * @param event - 待判断的事件对象
 * @returns 是否包含可解析的 message
 */
function isWebviewConsoleMessageEvent(event: Event | WebviewConsoleMessageEvent): event is WebviewConsoleMessageEvent {
  return 'message' in event && typeof event.message === 'string';
}

/** 页面正文最大字符数。 */
export const WEBVIEW_PAGE_TEXT_LIMIT = 20000;
/** 页面标题最大数量。 */
export const WEBVIEW_PAGE_HEADING_LIMIT = 120;
/** 页面链接最大数量。 */
export const WEBVIEW_PAGE_LINK_LIMIT = 100;
/** 页面选中文本最大字符数。 */
export const WEBVIEW_PAGE_SELECTED_TEXT_LIMIT = 4000;
/** 页面读取超时时间。 */
export const WEBVIEW_PAGE_SNAPSHOT_TIMEOUT_MS = 10000;

/**
 * 判断值是否为页面标题数组。
 * @param value - 待判断的值
 * @returns 是否为页面标题数组
 */
function isHeadingArray(value: unknown): value is WebviewPageHeading[] {
  return (
    Array.isArray(value) &&
    value.every((item) => {
      if (!item || typeof item !== 'object') {
        return false;
      }

      const heading = item as Partial<WebviewPageHeading>;
      return typeof heading.level === 'number' && typeof heading.text === 'string';
    })
  );
}

/**
 * 判断值是否为页面链接数组。
 * @param value - 待判断的值
 * @returns 是否为页面链接数组
 */
function isLinkArray(value: unknown): value is WebviewPageLink[] {
  return (
    Array.isArray(value) &&
    value.every((item) => {
      if (!item || typeof item !== 'object') {
        return false;
      }

      const link = item as Partial<WebviewPageLink>;
      return typeof link.text === 'string' && typeof link.href === 'string';
    })
  );
}

/**
 * 判断值是否为未裁剪的页面快照。
 * @param value - 待判断的值
 * @returns 是否为页面快照
 */
export function isWebviewPageSnapshot(value: unknown): value is Omit<WebviewPageSnapshot, 'capturedAt' | 'truncated'> {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const snapshot = value as Partial<WebviewPageSnapshot>;
  return (
    typeof snapshot.url === 'string' &&
    typeof snapshot.title === 'string' &&
    typeof snapshot.text === 'string' &&
    typeof snapshot.selectedText === 'string' &&
    isHeadingArray(snapshot.headings) &&
    isLinkArray(snapshot.links)
  );
}

/**
 * 裁剪字符串并返回截断标记。
 * @param value - 原始字符串
 * @param limit - 最大长度
 * @returns 裁剪结果
 */
function truncateText(value: string, limit: number): { value: string; truncated: boolean } {
  if (value.length <= limit) {
    return { value, truncated: false };
  }

  return { value: value.slice(0, limit), truncated: true };
}

/**
 * 规范化 WebView 页面快照。
 * @param value - 页面脚本返回值
 * @returns 带截断标记的页面快照
 */
export function normalizeWebviewPageSnapshot(value: Omit<WebviewPageSnapshot, 'capturedAt' | 'truncated'>): WebviewPageSnapshot {
  const text = truncateText(value.text, WEBVIEW_PAGE_TEXT_LIMIT);
  const selectedText = truncateText(value.selectedText, WEBVIEW_PAGE_SELECTED_TEXT_LIMIT);
  const headings = value.headings.slice(0, WEBVIEW_PAGE_HEADING_LIMIT).map((heading) => ({
    level: heading.level,
    text: truncateText(heading.text, 300).value
  }));
  const links = value.links.slice(0, WEBVIEW_PAGE_LINK_LIMIT).map((link) => ({
    text: truncateText(link.text, 300).value,
    href: link.href
  }));
  const truncated: WebviewPageTruncation = {
    text: text.truncated,
    headings: value.headings.length > WEBVIEW_PAGE_HEADING_LIMIT,
    links: value.links.length > WEBVIEW_PAGE_LINK_LIMIT,
    selectedText: selectedText.truncated
  };

  return {
    url: value.url,
    title: value.title,
    text: text.value,
    selectedText: selectedText.value,
    headings,
    links,
    capturedAt: Date.now(),
    truncated
  };
}

/**
 * 为页面读取 Promise 添加超时保护。
 * @param promise - 页面读取 Promise
 * @returns 带超时保护的 Promise
 */
export function withWebviewPageReadTimeout<T>(promise: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer: ReturnType<typeof globalThis.setTimeout> = globalThis.setTimeout(() => reject(new Error('页面读取超时')), WEBVIEW_PAGE_SNAPSHOT_TIMEOUT_MS);
    promise
      .then(resolve)
      .catch(reject)
      .finally(() => globalThis.clearTimeout(timer));
  });
}

/**
 * 归一化页面读取错误，避免把底层安全策略错误直接暴露给模型。
 * @param error - 原始错误
 * @returns 归一化后的错误
 */
export function normalizeWebviewPageReadError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error || '读取当前网页失败');
  const lowerMessage = message.toLowerCase();
  if (
    lowerMessage.includes('content security policy') ||
    lowerMessage.includes('script-src') ||
    lowerMessage.includes('refused to execute') ||
    lowerMessage.includes('csp')
  ) {
    return new Error('页面安全策略阻止读取当前网页内容');
  }

  return error instanceof Error ? error : new Error(message);
}

/**
 * 构建页面快照读取脚本。
 * @returns 可通过 `executeJavaScript` 执行的脚本
 */
function createPageSnapshotScript(): string {
  return `
(() => {
  const readText = (value) => String(value || '').trim();
  const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6')).map((element) => ({
    level: Number(element.tagName.slice(1)),
    text: readText(element.innerText || element.textContent)
  })).filter((item) => item.text);
  const links = Array.from(document.querySelectorAll('a[href]')).map((element) => ({
    text: readText(element.innerText || element.textContent || element.getAttribute('aria-label')),
    href: element.href
  })).filter((item) => item.href);

  return {
    url: location.href,
    title: document.title || '',
    text: readText(document.body ? document.body.innerText : ''),
    selectedText: readText(window.getSelection ? window.getSelection().toString() : ''),
    headings,
    links
  };
})();
`;
}

/**
 * 构建注入到页面内的 DOM 元素选择脚本。
 * @param theme - 元素选择器主题
 * @returns 可通过 `executeJavaScript` 执行的脚本
 */
export function createElementSelectionScript(theme: WebviewElementPickerTheme = DEFAULT_ELEMENT_PICKER_THEME): string {
  const borderStyle = JSON.stringify(`border:2px solid ${theme.color || DEFAULT_ELEMENT_PICKER_THEME.color};`);
  const backgroundStyle = JSON.stringify(`background:${theme.background || DEFAULT_ELEMENT_PICKER_THEME.background};`);
  const messagePrefix = JSON.stringify(ELEMENT_PICKER_SELECTION_MESSAGE_PREFIX);
  const styleProperties = JSON.stringify(ELEMENT_PICKER_STYLE_PROPERTIES);

  return `
(() => new Promise((resolve) => {
  const existingCleanup = window.__tibisElementPickerCleanup;
  if (typeof existingCleanup === 'function') {
    existingCleanup();
  }

  const style = document.createElement('style');
  style.textContent = [
    '.tibis-element-picker-highlight{',
    'position:fixed;',
    'z-index:2147483647;',
    'pointer-events:none;',
    ${borderStyle},
    ${backgroundStyle},
    'box-sizing:border-box;',
    'border-radius:4px;',
    '}',
    '.tibis-element-picker-selected{',
    'position:fixed;',
    'z-index:2147483646;',
    'pointer-events:none;',
    ${borderStyle},
    'background:transparent;',
    'box-sizing:border-box;',
    'border-radius:4px;',
    '}'
  ].join('');
  document.documentElement.appendChild(style);

  const highlight = document.createElement('div');
  highlight.className = 'tibis-element-picker-highlight';
  highlight.hidden = true;
  document.documentElement.appendChild(highlight);

  const selectedHighlight = document.createElement('div');
  selectedHighlight.className = 'tibis-element-picker-selected';
  selectedHighlight.hidden = true;
  document.documentElement.appendChild(selectedHighlight);

  let activeHoverElement = null;
  let activeSelectedElement = null;

  const escapeCss = (value) => {
    if (window.CSS && typeof window.CSS.escape === 'function') {
      return window.CSS.escape(value);
    }
    return value.replace(/[^a-zA-Z0-9_-]/g, '\\\\$&');
  };

	  const buildClassSelector = (element) => {
	    const classes = Array.from(element.classList).slice(0, 3).map((className) => '.' + escapeCss(className)).join('');
	    return element.tagName.toLowerCase() + classes;
	  };

	  const buildSimpleSelector = (element) => {
	    if (element.id) {
	      return element.tagName.toLowerCase() + '#' + escapeCss(element.id);
	    }
	
	    return buildClassSelector(element);
	  };

	  const buildSelectorSegment = (element) => {
	    const simpleSelector = buildSimpleSelector(element);
	    if (!element.parentElement) {
	      return simpleSelector;
	    }
	
	    const sameTagSiblings = Array.from(element.parentElement.children).filter((child) => child.tagName === element.tagName);
	    const siblingIndex = sameTagSiblings.indexOf(element) + 1;
	    if (element.id) {
	      const sameSimpleSiblings = Array.from(element.parentElement.children).filter((child) => child.matches(simpleSelector));
	      if (sameSimpleSiblings.length <= 1) {
	        return simpleSelector;
	      }
	
	      return buildClassSelector(element) + ':nth-of-type(' + siblingIndex + ')';
	    }
	
	    return simpleSelector + ':nth-of-type(' + siblingIndex + ')';
	  };

  const buildSelector = (element) => {
    const segments = [];
    let current = element;

    while (current && current instanceof Element) {
      segments.unshift(buildSelectorSegment(current));
      const candidate = segments.join(' > ');

      try {
        if (document.querySelectorAll(candidate).length === 1) {
          return candidate;
        }
      } catch {
        return buildSimpleSelector(element);
      }

      if (current === document.documentElement) {
        return candidate;
      }

      current = current.parentElement;
    }

    return buildSimpleSelector(element);
  };

  const cleanup = () => {
    document.removeEventListener('mousemove', handleMouseMove, true);
    document.removeEventListener('mouseout', handleMouseOut, true);
    document.removeEventListener('click', handleClick, true);
    document.removeEventListener('keydown', handleKeydown, true);
    window.removeEventListener('scroll', handleScrollOrResize, true);
    window.removeEventListener('resize', handleScrollOrResize, true);
    highlight.remove();
    selectedHighlight.remove();
    style.remove();
    delete window.__tibisElementPickerCleanup;
  };

  const readAttributes = (element) => Array.from(element.attributes).map((attribute) => ({
    name: attribute.name,
    value: attribute.value
  }));

  const readAncestors = (element) => {
    const ancestors = [];
    let current = element.parentElement;
    while (current) {
      ancestors.unshift({
        tagName: current.tagName,
        selector: buildSelector(current)
      });
      current = current.parentElement;
    }
    return ancestors;
  };

  const readComputedStyles = (element) => {
    const styles = window.getComputedStyle(element);
    return ${styleProperties}.reduce((result, propertyName) => {
      result[propertyName] = styles.getPropertyValue(propertyName);
      return result;
    }, {});
  };

  const readRawText = (element) => String(element.innerText || element.textContent || '');

  const normalizeReadableText = (value) => String(value || '').replace(/[\\uE000-\\uF8FF]/g, '').replace(/\\s+/g, ' ').trim();

  const readElementGlyph = (element) => {
    const glyphs = readRawText(element).match(/[\\uE000-\\uF8FF]/g);
    return glyphs ? glyphs.join('') : '';
  };

  const readElementLabel = (element) => {
    const directLabel = normalizeReadableText(
      element.getAttribute('aria-label') ||
      element.getAttribute('title') ||
      element.getAttribute('alt') ||
      element.getAttribute('value')
    );
    if (directLabel) {
      return directLabel;
    }

    const labeledAncestor = element.closest('[aria-label],[title],button,a,[role="button"],[role="link"]');
    if (labeledAncestor && labeledAncestor !== element) {
      return normalizeReadableText(
        labeledAncestor.getAttribute('aria-label') ||
        labeledAncestor.getAttribute('title') ||
        labeledAncestor.innerText ||
        labeledAncestor.textContent
      );
    }

    return '';
  };

  const readElementText = (element) => {
    const label = readElementLabel(element);
    if (label) {
      return label.slice(0, 200);
    }

    return normalizeReadableText(element.innerText || element.textContent).slice(0, 200);
  };

  const readElement = (element) => {
    const rect = element.getBoundingClientRect();
    const scrollLeft = window.scrollX || document.documentElement.scrollLeft || document.body.scrollLeft || 0;
    const scrollTop = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
    return {
      tagName: element.tagName,
      id: element.id || '',
      className: element.className || '',
      text: readElementText(element),
      glyph: readElementGlyph(element),
      selector: buildSelector(element),
      attributes: readAttributes(element),
      ancestors: readAncestors(element),
      computedStyles: readComputedStyles(element),
      rect: {
        x: rect.x,
        y: rect.y,
        pageX: scrollLeft + rect.x,
        pageY: scrollTop + rect.y,
        width: rect.width,
        height: rect.height
      }
    };
  };

  const syncLayerPosition = (layer, element) => {
    if (!element.isConnected) {
      layer.hidden = true;
      return;
    }

    const rect = element.getBoundingClientRect();
    layer.hidden = false;
    layer.style.left = rect.left + 'px';
    layer.style.top = rect.top + 'px';
    layer.style.width = rect.width + 'px';
    layer.style.height = rect.height + 'px';
  };

  function syncHighlight(element) {
    syncLayerPosition(highlight, element);
  }

  function syncSelectedHighlight(element) {
    syncLayerPosition(selectedHighlight, element);
  }

  function isPickerLayer(target) {
    return target === highlight || target === selectedHighlight;
  }

  function emitSelectedElement(element) {
    const selectedElement = readElement(element);
    console.log('Tibis WebView selected element', selectedElement);
    console.log(${messagePrefix} + JSON.stringify(selectedElement));
    return selectedElement;
  }

  function handleMouseMove(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement) || isPickerLayer(target)) {
      return;
    }

    activeHoverElement = target;
    syncHighlight(target);
  }

  function handleMouseOut(event) {
    if (event.relatedTarget) {
      return;
    }

    highlight.hidden = true;
    activeHoverElement = null;
  }

  function handleClick(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement) || isPickerLayer(target)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
	    event.stopImmediatePropagation();
	    activeSelectedElement = target;
	    syncSelectedHighlight(target);
	    emitSelectedElement(target);
	  }

  function handleScrollOrResize() {
    if (activeHoverElement) {
      syncHighlight(activeHoverElement);
    }
    if (activeSelectedElement) {
      syncSelectedHighlight(activeSelectedElement);
    }
  }

  function handleKeydown(event) {
    if (event.key !== 'Escape') {
      return;
    }

    event.preventDefault();
    cleanup();
    resolve(null);
  }

  window.__tibisElementPickerCleanup = () => {
    cleanup();
    resolve(null);
  };
  document.addEventListener('mousemove', handleMouseMove, true);
  document.addEventListener('mouseout', handleMouseOut, true);
  document.addEventListener('click', handleClick, true);
  document.addEventListener('keydown', handleKeydown, true);
  window.addEventListener('scroll', handleScrollOrResize, true);
  window.addEventListener('resize', handleScrollOrResize, true);
}))();
`;
}

/**
 * 构建停止 DOM 元素选择模式的页面脚本。
 * @returns 可通过 `executeJavaScript` 执行的脚本
 */
function createStopElementSelectionScript(): string {
  return `
(() => {
  const cleanup = window.__tibisElementPickerCleanup;
  if (typeof cleanup === 'function') {
    cleanup();
  }
  return null;
})();
`;
}

/**
 * 判断执行脚本返回值是否为元素选择结果。
 * @param value - 待判断的脚本返回值
 * @returns 是否为元素选择结果
 */
function isElementSelection(value: unknown): value is WebviewElementSelection {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const selection = value as Partial<WebviewElementSelection>;
  return (
    typeof selection.tagName === 'string' &&
    typeof selection.selector === 'string' &&
    Array.isArray(selection.attributes) &&
    Array.isArray(selection.ancestors) &&
    Boolean(selection.computedStyles) &&
    typeof selection.computedStyles === 'object'
  );
}

/**
 * 清理元素可读文本，避免 iconfont 私有字区字符污染 DOM 检查结果。
 * @param value - 页面脚本读取到的原始文本
 * @returns 去除图标字形后的可读文本
 */
function sanitizeElementReadableText(value: string): string {
  return value.replace(PRIVATE_USE_ICON_GLYPH_PATTERN, '').replace(/\s+/g, ' ').trim();
}

/**
 * 提取元素中的 iconfont 私有字区字符。
 * @param value - 页面脚本读取到的原始文本
 * @returns 私有字区字符拼接结果
 */
function extractElementGlyph(value: string): string {
  return Array.from(value.matchAll(PRIVATE_USE_ICON_GLYPH_PATTERN))
    .map((match) => match[0])
    .join('');
}

/**
 * 规范化元素选择结果。
 * @param selection - 页面脚本或 console 消息回传的元素选择结果
 * @returns 规范化后的元素选择结果
 */
function normalizeElementSelection(selection: WebviewElementSelection): WebviewElementSelection {
  const glyph = selection.glyph || extractElementGlyph(selection.text);
  return {
    ...selection,
    glyph: glyph || undefined,
    text: sanitizeElementReadableText(selection.text)
  };
}

/**
 * 构建注入到页面内的 touch 事件模拟脚本。
 * @param enabled - 是否启用 touch 事件模拟
 * @returns 可通过 `executeJavaScript` 执行的脚本
 */
function createTouchSimulationScript(enabled: boolean): string {
  return `
(() => {
  const cleanupExisting = window.__tibisTouchSimulationCleanup;
  if (typeof cleanupExisting === 'function') {
    cleanupExisting();
  }

  if (!${enabled ? 'true' : 'false'}) {
    return null;
  }

  let activeTarget = null;

  const createTouchLike = (event) => ({
    identifier: 1,
    target: event.target,
    clientX: event.clientX,
    clientY: event.clientY,
    screenX: event.screenX,
    screenY: event.screenY,
    pageX: event.pageX,
    pageY: event.pageY,
    radiusX: 1,
    radiusY: 1,
    rotationAngle: 0,
    force: event.buttons ? 1 : 0
  });

  const dispatchTouchEvent = (mouseEvent, eventType) => {
    const target = activeTarget || mouseEvent.target;
    if (!(target instanceof EventTarget)) {
      return;
    }

    const touch = createTouchLike(mouseEvent);
    const event = new Event(eventType, { bubbles: true, cancelable: true });
    Object.defineProperties(event, {
      touches: { value: eventType === 'touchend' ? [] : [touch] },
      targetTouches: { value: eventType === 'touchend' ? [] : [touch] },
      changedTouches: { value: [touch] },
      altKey: { value: mouseEvent.altKey },
      ctrlKey: { value: mouseEvent.ctrlKey },
      metaKey: { value: mouseEvent.metaKey },
      shiftKey: { value: mouseEvent.shiftKey }
    });
    target.dispatchEvent(event);
  };

  const handleMouseDown = (event) => {
    activeTarget = event.target;
    dispatchTouchEvent(event, 'touchstart');
  };

  const handleMouseMove = (event) => {
    if (!activeTarget || !event.buttons) {
      return;
    }

    dispatchTouchEvent(event, 'touchmove');
  };

  const handleMouseUp = (event) => {
    if (!activeTarget) {
      return;
    }

    dispatchTouchEvent(event, 'touchend');
    activeTarget = null;
  };

  try {
    Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, get: () => 1 });
    Object.defineProperty(window, 'ontouchstart', { configurable: true, value: null });
  } catch (error) {
    console.warn('Tibis touch simulation environment patch failed', error);
  }

  window.addEventListener('mousedown', handleMouseDown, true);
  window.addEventListener('mousemove', handleMouseMove, true);
  window.addEventListener('mouseup', handleMouseUp, true);
  window.__tibisTouchSimulationCleanup = () => {
    window.removeEventListener('mousedown', handleMouseDown, true);
    window.removeEventListener('mousemove', handleMouseMove, true);
    window.removeEventListener('mouseup', handleMouseUp, true);
    delete window.__tibisTouchSimulationCleanup;
  };
  return null;
})();
`;
}

/**
 * 创建 `<webview>` 标签控制器。
 * @param webviewRef - `<webview>` 实例引用
 * @returns `<webview>` 控制器与事件处理器
 */
export function useWebView(webviewRef: Ref<WebviewTag | null>) {
  const state = ref<WebviewPageState>({ ...DEFAULT_STATE });
  const selectedElement = ref<WebviewElementSelection | null>(null);
  let initialUrlAttached = false;
  let isDomReady = false;
  let pendingUserAgent = '';
  let pendingPageSnapshotRead: Promise<WebviewPageSnapshot> | null = null;

  /**
   * 首次把初始 URL 附着到 `<webview>` 实例。
   * 同一个实例重复激活时不应再次触发加载。
   * @param initialUrl - 初始 URL
   */
  function attachInitialUrl(initialUrl: string): void {
    if (initialUrlAttached || !initialUrl) {
      return;
    }

    webviewRef.value?.setAttribute('src', initialUrl);
    initialUrlAttached = true;
  }

  /**
   * 从当前 `<webview>` 实例同步导航状态。
   */
  function syncNavigationState(): void {
    const instance = webviewRef.value;
    if (!instance) {
      return;
    }

    state.value.canGoBack = instance.canGoBack();
    state.value.canGoForward = instance.canGoForward();
  }

  /**
   * 初始化 `<webview>` 地址。
   * @param initialUrl - 初始 URL
   */
  function create(initialUrl: string): void {
    state.value.url = initialUrl;
  }

  /**
   * 导航到新地址。
   * @param url - 目标 URL
   */
  function navigate(url: string): void {
    state.value.url = url;
    if (!webviewRef.value) {
      return;
    }

    if (isDomReady) {
      webviewRef.value.loadURL(url);
      return;
    }

    webviewRef.value.setAttribute('src', url);
  }

  /**
   * 后退。
   */
  function goBack(): void {
    webviewRef.value?.goBack();
    syncNavigationState();
  }

  /**
   * 前进。
   */
  function goForward(): void {
    webviewRef.value?.goForward();
    syncNavigationState();
  }

  /**
   * 刷新当前页面。
   */
  function reload(): void {
    webviewRef.value?.reload();
  }

  /**
   * 停止当前加载。
   */
  function stop(): void {
    webviewRef.value?.stop();
  }

  /**
   * 打开当前 `<webview>` 页面开发者工具。
   */
  function openDevTools(): void {
    const instance = webviewRef.value;
    const open = instance?.openDevTools;
    if (!instance || typeof open !== 'function') {
      return;
    }

    const isOpened = instance.isDevToolsOpened;
    const close = instance.closeDevTools;
    if (typeof isOpened === 'function' && isOpened.call(instance) && typeof close === 'function') {
      close.call(instance);
    }

    open.call(instance);
  }

  /**
   * 读取当前网页快照。
   * @returns 当前网页快照
   */
  async function readPageSnapshot(): Promise<WebviewPageSnapshot> {
    if (state.value.isLoading) {
      throw new Error('当前页面正在导航，请稍后重试');
    }

    if (pendingPageSnapshotRead) {
      return pendingPageSnapshotRead;
    }

    const instance = webviewRef.value;
    const executeJavaScript = instance?.executeJavaScript;
    if (!instance || typeof executeJavaScript !== 'function') {
      throw new Error('当前页面尚未准备好读取，请稍后重试');
    }

    const rawRead = executeJavaScript.call(instance, createPageSnapshotScript()) as Promise<unknown>;
    pendingPageSnapshotRead = withWebviewPageReadTimeout(
      rawRead.then((value: unknown) => {
        if (!isWebviewPageSnapshot(value)) {
          throw new Error('页面快照格式无效');
        }

        return normalizeWebviewPageSnapshot(value);
      })
    )
      .catch((error: unknown) => {
        throw normalizeWebviewPageReadError(error);
      })
      .finally(() => {
        pendingPageSnapshotRead = null;
      });

    return pendingPageSnapshotRead;
  }

  /**
   * 应用 touch 事件模拟状态到当前页面。
   * @param enabled - 是否启用 touch 事件模拟
   */
  async function applyTouchSimulation(enabled: boolean): Promise<void> {
    const instance = webviewRef.value;
    const executeJavaScript = instance?.executeJavaScript;
    if (!instance || typeof executeJavaScript !== 'function') {
      return;
    }

    await executeJavaScript.call(instance, createTouchSimulationScript(enabled));
  }

  /**
   * 设置 touch 事件模拟状态。
   * @param enabled - 是否启用 touch 事件模拟
   */
  async function setTouchSimulationEnabled(enabled: boolean): Promise<void> {
    state.value.isTouchSimulationEnabled = enabled;
    await applyTouchSimulation(enabled);
  }

  /**
   * 设置当前 `<webview>` 的 User-Agent，空字符串表示恢复默认 UA。
   * `dom-ready` 前通过 `setAttribute` 设置 HTML 属性，`dom-ready` 后通过 API 动态设置。
   * @param userAgent - 目标 User-Agent
   */
  function setUserAgent(userAgent: string): void {
    const instance = webviewRef.value;
    if (!instance) {
      return;
    }

    if (!userAgent) {
      instance.removeAttribute('useragent');
    }

    pendingUserAgent = userAgent;

    if (!isDomReady) {
      instance.setAttribute('useragent', userAgent);
      return;
    }

    instance.setUserAgent(userAgent);
  }

  /**
   * 开启页面 DOM 元素持续选择模式。
   * @param theme - 元素选择器主题
   */
  async function startElementSelection(theme: WebviewElementPickerTheme = DEFAULT_ELEMENT_PICKER_THEME): Promise<void> {
    const instance = webviewRef.value;
    if (!instance || state.value.isElementSelecting) {
      return;
    }

    state.value.isElementSelecting = true;
    try {
      const result = await instance.executeJavaScript(createElementSelectionScript(theme));
      if (isElementSelection(result)) {
        selectedElement.value = normalizeElementSelection(result);
      }
    } finally {
      state.value.isElementSelecting = false;
    }
  }

  /**
   * 停止页面 DOM 元素持续选择模式。
   */
  async function stopElementSelection(): Promise<void> {
    const instance = webviewRef.value;
    const executeJavaScript = instance?.executeJavaScript;
    state.value.isElementSelecting = false;
    if (!instance || typeof executeJavaScript !== 'function') {
      return;
    }

    await executeJavaScript.call(instance, createStopElementSelectionScript());
  }

  /**
   * 清空当前 DOM 检查结果。
   */
  function clearSelectedElement(): void {
    selectedElement.value = null;
  }

  /**
   * 处理页面 console 消息中的 DOM 元素选择结果。
   * @param event - WebView console-message 事件
   */
  function handleConsoleMessage(event: Event | WebviewConsoleMessageEvent): void {
    if (!isWebviewConsoleMessageEvent(event)) {
      return;
    }

    const { message } = event;
    if (!message.startsWith(ELEMENT_PICKER_SELECTION_MESSAGE_PREFIX)) {
      return;
    }

    try {
      const payload = JSON.parse(message.slice(ELEMENT_PICKER_SELECTION_MESSAGE_PREFIX.length)) as unknown;
      if (isElementSelection(payload)) {
        selectedElement.value = normalizeElementSelection(payload);
      }
    } catch (error) {
      console.error('Failed to parse webview element picker message:', error);
    }
  }

  /**
   * 处理开始加载事件。
   */
  function handleDidStartLoading(): void {
    state.value.isLoading = true;
    state.value.isElementSelecting = false;
    state.value.loadProgress = 0.1;
    selectedElement.value = null;
  }

  /**
   * 处理 DOM 就绪事件。
   */
  function handleDomReady(): void {
    isDomReady = true;
    state.value.loadProgress = 0.7;
    syncNavigationState();
    applyTouchSimulation(state.value.isTouchSimulationEnabled).catch((error: unknown) => {
      console.error('Failed to apply webview touch simulation after DOM ready:', error);
    });
    if (pendingUserAgent) {
      webviewRef.value?.setUserAgent(pendingUserAgent);
    }
  }

  /**
   * 处理导航事件。
   * @param event - 导航事件
   */
  function handleDidNavigate(event: DidNavigateEvent): void {
    state.value.url = event.url;
    syncNavigationState();
  }

  /**
   * 处理标题更新事件。
   * @param event - 标题事件
   */
  function handleTitleUpdated(event: PageTitleUpdatedEvent): void {
    state.value.title = event.title;
  }

  /**
   * 处理停止加载事件。
   */
  function handleDidStopLoading(): void {
    state.value.isLoading = false;
    state.value.loadProgress = 1;
    syncNavigationState();
  }

  /**
   * 处理宿主拒绝附加 `<webview>` 的事件。
   * @param payload - 拒绝信息
   */
  function handleAttachRejected(payload: { src: string; reason: string }): void {
    state.value.isLoading = false;
    console.error(`Webview attach rejected for ${payload.src}: ${payload.reason}`);
  }

  const controller: WebviewController = {
    state,
    create,
    navigate,
    goBack,
    goForward,
    reload,
    stop,
    openDevTools
  };

  return {
    ...controller,
    get selectedElement() {
      return selectedElement.value;
    },
    selectedElementRef: selectedElement,

    attachInitialUrl,
    handleDidStartLoading,
    handleDomReady,
    handleDidNavigate,
    handleTitleUpdated,
    handleDidStopLoading,
    handleAttachRejected,
    handleConsoleMessage,
    startElementSelection,
    stopElementSelection,
    clearSelectedElement,
    readPageSnapshot,
    setTouchSimulationEnabled,
    setUserAgent
  };
}

/**
 * 兼容旧测试与旧调用方的 `<webview>` 控制器命名。
 */
export const useTagWebView = useWebView;
