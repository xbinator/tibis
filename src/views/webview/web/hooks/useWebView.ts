/**
 * @file useWebView.ts
 * @description 封装 `<webview>` 标签页面状态与导航控制。
 */
import type { DidNavigateEvent, PageFaviconUpdatedEvent, PageTitleUpdatedEvent, WebviewTag } from 'electron';
import { ref, type Ref } from 'vue';
import type { WebviewOperateInput, WebviewOperateResult, WebviewPageSnapshot } from '@/ai/tools/context/webview';
import type {
  WebviewAgentActivity,
  WebviewAgentActivityPhase,
  WebviewController,
  WebviewElementSelection,
  WebviewElementToolbarAction,
  WebviewElementToolbarActionType,
  WebviewPageState
} from '@/views/webview/shared/types';
import { normalizeWebviewUrl } from '@/views/webview/shared/utils/url';
import { WEBVIEW_PAGE_SNAPSHOT_TTL_MS } from '@/views/webview/web/automation/constants';
import {
  createActiveSnapshotElements,
  createPublicWebviewPageSnapshot,
  createSelectedElementSnapshot,
  createWebviewOperationError,
  isWebviewOperateResult,
  isWebviewPageSnapshot,
  normalizeWebviewPageOperationError,
  normalizeWebviewPageReadError,
  normalizeWebviewPageSnapshot,
  withWebviewPageOperationTimeout,
  withWebviewPageReadTimeout
} from '@/views/webview/web/automation/normalize';
import { createPageOperationScript } from '@/views/webview/web/automation/operationScript';
import { createPageSnapshotScript } from '@/views/webview/web/automation/snapshotScript';
import type { ActiveWebviewSnapshotElement } from '@/views/webview/web/automation/types';

export {
  WEBVIEW_PAGE_CONTENT_LIMIT,
  WEBVIEW_PAGE_ELEMENT_LIMIT,
  WEBVIEW_PAGE_HEADING_LIMIT,
  WEBVIEW_PAGE_LINK_LIMIT,
  WEBVIEW_PAGE_OPERATION_TIMEOUT_MS,
  WEBVIEW_PAGE_SELECTED_TEXT_LIMIT,
  WEBVIEW_PAGE_SNAPSHOT_TIMEOUT_MS,
  WEBVIEW_PAGE_SNAPSHOT_TTL_MS,
  WEBVIEW_PAGE_TEXT_LIMIT
} from '@/views/webview/web/automation/constants';

export { normalizeWebviewPageSnapshot } from '@/views/webview/web/automation/normalize';

/**
 * 默认 WebView 页面状态。
 */
const DEFAULT_STATE: WebviewPageState = {
  url: '',
  title: '',
  favicon: '',
  isLoading: false,
  isElementSelecting: false,
  isTouchSimulationEnabled: false,
  canGoBack: false,
  canGoForward: false,
  loadProgress: 0
};

/**
 * 默认 WebView Agent 活动状态。
 */
const DEFAULT_AGENT_ACTIVITY: WebviewAgentActivity = {
  phase: 'idle',
  label: '',
  startedAt: 0
};

/**
 * Agent 活动完成后保留视觉反馈的时长。
 */
const AGENT_ACTIVITY_CLEAR_DELAY_MS = 900;

/**
 * WebView 页面元素选择器主题。
 */
export interface WebviewElementPickerTheme {
  /** 高亮边框色 */
  color: string;
  /** 高亮背景色 */
  background: string;
  /** 高亮描边色 */
  border?: string;
  /** 工具条文字色 */
  toolbarText?: string;
  /** 工具条背景色 */
  toolbarBackground?: string;
  /** 工具条按钮悬停文字色 */
  toolbarHoverText?: string;
  /** 工具条阴影 */
  toolbarShadow?: string;
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
 * 页面脚本上报元素工具条动作的 console 消息前缀。
 */
const ELEMENT_PICKER_ACTION_MESSAGE_PREFIX = '__TIBIS_ELEMENT_PICKER_ACTION__';

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
 * 当前有效 WebView Agent 快照。
 */
interface ActiveWebviewSnapshot {
  /** 快照 ID。 */
  id: string;
  /** 快照采集时页面地址。 */
  url: string;
  /** renderer 本地采集时间。 */
  capturedAtMs: number;
  /** 快照中的元素身份信息。 */
  elements: ActiveWebviewSnapshotElement[];
}

/**
 * 判断事件是否包含 WebView console message。
 * @param event - 待判断的事件对象
 * @returns 是否包含可解析的 message
 */
function isWebviewConsoleMessageEvent(event: Event | WebviewConsoleMessageEvent): event is WebviewConsoleMessageEvent {
  return 'message' in event && typeof event.message === 'string';
}

/**
 * 判断值是否为元素工具条动作类型。
 * @param value - 待判断的值
 * @returns 是否为已支持的工具条动作类型
 */
function isWebviewElementToolbarActionType(value: unknown): value is WebviewElementToolbarActionType {
  return value === 'capture-selected-element-screenshot';
}

/**
 * 从工具条动作 console 消息中读取动作类型。
 * @param message - WebView console 消息
 * @returns 工具条动作类型，解析失败时返回 null
 */
function readElementToolbarActionType(message: string): WebviewElementToolbarActionType | null {
  try {
    const payload = JSON.parse(message.slice(ELEMENT_PICKER_ACTION_MESSAGE_PREFIX.length)) as unknown;
    if (!payload || typeof payload !== 'object') {
      return null;
    }

    const { type } = payload as { type?: unknown };
    return isWebviewElementToolbarActionType(type) ? type : null;
  } catch (error) {
    console.error('Failed to parse webview element toolbar action message:', error);
    return null;
  }
}

/**
 * 判断错误是否为 Electron 导航被主动中断。
 * @param error - 原始加载错误
 * @returns 是否为可忽略的导航中断
 */
function isWebviewLoadAbortError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || '');
  return message.includes('ERR_ABORTED') || message.includes('(-3)');
}

/**
 * 处理 `<webview>.loadURL` 的异步加载错误。
 * @param error - 原始加载错误
 * @param url - 目标地址
 */
function handleWebviewLoadError(error: unknown, url: string): void {
  if (isWebviewLoadAbortError(error)) {
    return;
  }

  console.error(`Failed to load WebView URL ${url}:`, error);
}

/**
 * 读取 favicon 更新事件中的第一个有效 URL。
 * @param favicons - WebView 上报的 favicon URL 列表
 * @returns 第一个有效 favicon URL，缺失时返回空字符串
 */
function readFirstFavicon(favicons: string[]): string {
  return favicons.find((favicon) => favicon.trim())?.trim() ?? '';
}

/**
 * 判断值是否支持 Promise catch。
 * @param value - 待判断值
 * @returns 是否为可捕获加载结果
 */
function isCatchableLoadResult(value: unknown): value is { catch: (onRejected: (error: unknown) => void) => unknown } {
  if (!value || typeof value !== 'object') {
    return false;
  }

  return typeof (value as { catch?: unknown }).catch === 'function';
}

/**
 * 安全加载 WebView 地址，避免导航中断成为未捕获 Promise。
 * @param instance - WebView 实例
 * @param url - 目标地址
 */
function loadWebviewUrl(instance: WebviewTag, url: string): void {
  const { loadURL } = instance;
  if (typeof loadURL === 'function') {
    const loadResult: unknown = loadURL.call(instance, url);
    if (isCatchableLoadResult(loadResult)) {
      loadResult.catch((error: unknown) => handleWebviewLoadError(error, url));
    }
    return;
  }

  instance.setAttribute('src', url);
}

/**
 * 构建注入到页面内的 DOM 元素选择脚本。
 * @param theme - 元素选择器主题
 * @returns 可通过 `executeJavaScript` 执行的脚本
 */
export function createElementSelectionScript(theme: WebviewElementPickerTheme = DEFAULT_ELEMENT_PICKER_THEME): string {
  const pickerColor = theme.color || DEFAULT_ELEMENT_PICKER_THEME.color;
  const pickerBackground = theme.background || DEFAULT_ELEMENT_PICKER_THEME.background;
  const pickerBorder = theme.border || pickerColor;
  const toolbarText = theme.toolbarText || '#fff';
  const toolbarBackground = theme.toolbarBackground || pickerColor;
  const toolbarHoverText = theme.toolbarHoverText || 'rgba(255,255,255,.72)';
  const toolbarShadow = theme.toolbarShadow || 'none';
  const borderStyle = JSON.stringify(`border:2px solid ${pickerBorder};`);
  const backgroundStyle = JSON.stringify(`background:${pickerBackground};`);
  const toolbarTextStyle = JSON.stringify(`color:${toolbarText};`);
  const toolbarBackgroundStyle = JSON.stringify(`background:${toolbarBackground};`);
  const toolbarHoverTextStyle = JSON.stringify(`color:${toolbarHoverText};`);
  const toolbarShadowStyle = JSON.stringify(`box-shadow:${toolbarShadow};`);
  const selectionMessagePrefix = JSON.stringify(ELEMENT_PICKER_SELECTION_MESSAGE_PREFIX);
  const actionMessagePrefix = JSON.stringify(ELEMENT_PICKER_ACTION_MESSAGE_PREFIX);
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
    '}',
    '.tibis-element-picker-toolbar{',
    'position:fixed;',
    'z-index:2147483647;',
    'display:flex;',
    'gap:2px;',
    'align-items:flex-end;',
    'max-width:calc(100vw - 8px);',
    'font:12px/18px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;',
    ${toolbarTextStyle},
    'box-sizing:border-box;',
    'pointer-events:auto;',
    'animation:tibis-element-picker-toolbar-enter 120ms ease-out;',
    '}',
    '.tibis-element-picker-toolbar[hidden]{',
    'display:none;',
    '}',
    '.tibis-element-picker-toolbar__tag{',
    'display:inline-flex;',
    'flex:0 0 auto;',
    'align-items:center;',
    'height:20px;',
    'max-width:120px;',
    'padding:0 8px;',
    'overflow:hidden;',
    'box-sizing:border-box;',
    'font-size:12px;',
    'font-weight:500;',
    'line-height:20px;',
    'text-overflow:ellipsis;',
    'text-transform:lowercase;',
    'white-space:nowrap;',
    ${toolbarBackgroundStyle},
    ${toolbarShadowStyle},
    'border-radius:3px;',
    '}',
    '.tibis-element-picker-toolbar__actions{',
    'display:flex;',
    'flex:0 0 auto;',
    'height:20px;',
    'gap:1px;',
    'align-items:center;',
    'padding:0 1px;',
    'box-sizing:border-box;',
    ${toolbarBackgroundStyle},
    ${toolbarShadowStyle},
    'border-radius:3px;',
    '}',
    '.tibis-element-picker-toolbar__action{',
    'display:inline-flex;',
    'align-items:center;',
    'justify-content:center;',
    'width:20px;',
    'min-width:20px;',
    'height:18px;',
    'padding:0;',
    'font:inherit;',
    'font-size:12px;',
    'font-weight:500;',
    'line-height:1;',
    'color:inherit;',
    'box-sizing:border-box;',
    'cursor:pointer;',
    'background:transparent;',
    'border:0;',
    'border-radius:3px;',
    'transition:color 120ms ease,transform 120ms ease;',
    '}',
    '.tibis-element-picker-toolbar__action:active{',
    'transform:scale(.92);',
    '}',
    '.tibis-element-picker-toolbar__action-icon{',
    'display:block;',
    'width:14px;',
    'height:14px;',
    'font-size:14px;',
    'stroke:currentColor;',
    'stroke-width:2;',
    'fill:none;',
    'stroke-linecap:round;',
    'stroke-linejoin:round;',
    '}',
    '.tibis-element-picker-toolbar__action:hover{',
    ${toolbarHoverTextStyle},
    '}',
    '.tibis-element-picker-toolbar__action:focus-visible{',
    'outline:2px solid currentColor;',
    'outline-offset:1px;',
    '}',
    '.tibis-element-picker-toolbar__action-label{',
    'position:absolute;',
    'width:1px;',
    'height:1px;',
    'padding:0;',
    'margin:-1px;',
    'overflow:hidden;',
    'clip:rect(0,0,0,0);',
    'white-space:nowrap;',
    'border:0;',
    '}',
    '@keyframes tibis-element-picker-toolbar-enter{',
    'from{',
    'opacity:0;',
    'transform:translateY(2px);',
    '}',
    'to{',
    'opacity:1;',
    'transform:translateY(0);',
    '}',
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

  const selectedToolbar = document.createElement('div');
  selectedToolbar.className = 'tibis-element-picker-toolbar';
  selectedToolbar.hidden = true;
  document.documentElement.appendChild(selectedToolbar);

  const toolbarActions = [
    {
      type: 'capture-selected-element-screenshot',
      label: '截图',
      title: '截取选中元素',
      icon: 'screenshot'
    }
  ];

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
    selectedToolbar.removeEventListener('click', handleToolbarClick);
    window.removeEventListener('scroll', handleScrollOrResize, true);
    window.removeEventListener('resize', handleScrollOrResize, true);
    highlight.remove();
    selectedHighlight.remove();
    selectedToolbar.remove();
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
    syncToolbarPosition(element);
  }

  function isPickerLayer(target) {
    return target === highlight || target === selectedHighlight || selectedToolbar.contains(target);
  }

  function renderSelectedToolbar(element) {
    selectedToolbar.replaceChildren();

    const tag = document.createElement('span');
    tag.className = 'tibis-element-picker-toolbar__tag';
    tag.textContent = element.tagName.toLowerCase();
    selectedToolbar.appendChild(tag);

    const actions = document.createElement('div');
    actions.className = 'tibis-element-picker-toolbar__actions';
    toolbarActions.forEach((action) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'tibis-element-picker-toolbar__action';
      button.dataset.tibisElementPickerAction = action.type;
      button.title = action.title;
      button.setAttribute('aria-label', action.title);

      button.appendChild(createToolbarActionIcon(action.icon));

      const label = document.createElement('span');
      label.className = 'tibis-element-picker-toolbar__action-label';
      label.textContent = action.label;
      button.appendChild(label);
      actions.appendChild(button);
    });
    selectedToolbar.appendChild(actions);
  }

  function createToolbarActionIcon(icon) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'tibis-element-picker-toolbar__action-icon');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');

    if (icon === 'screenshot') {
      const body = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      body.setAttribute('d', 'M5 8h3l1.5-2h5L16 8h3v9H5z');
      svg.appendChild(body);

      const lens = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      lens.setAttribute('cx', '12');
      lens.setAttribute('cy', '12.5');
      lens.setAttribute('r', '2.5');
      svg.appendChild(lens);
      return svg;
    }

    const fallback = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    fallback.setAttribute('cx', '12');
    fallback.setAttribute('cy', '12');
    fallback.setAttribute('r', '4');
    svg.appendChild(fallback);
    return svg;
  }

  function syncToolbarPosition(element) {
    if (!element.isConnected) {
      selectedToolbar.hidden = true;
      return;
    }

    renderSelectedToolbar(element);
    selectedToolbar.hidden = false;

    const rect = element.getBoundingClientRect();
    const toolbarRect = selectedToolbar.getBoundingClientRect();
    const toolbarWidth = toolbarRect.width || selectedToolbar.offsetWidth || 128;
    const toolbarHeight = toolbarRect.height || selectedToolbar.offsetHeight || 20;
    const margin = 4;
    const toolbarGap = 1;
    const preferredTop = rect.top - toolbarHeight - toolbarGap;
    const fallbackTop = rect.bottom + toolbarGap;
    const maxTop = Math.max(margin, window.innerHeight - toolbarHeight - margin);
    const top = preferredTop >= margin ? preferredTop : Math.min(fallbackTop, maxTop);
    const maxLeft = Math.max(margin, window.innerWidth - toolbarWidth - margin);
    const preferredLeft = rect.right - toolbarWidth;
    const left = Math.min(Math.max(preferredLeft, margin), maxLeft);

    selectedToolbar.style.left = Math.round(left) + 'px';
    selectedToolbar.style.top = Math.round(Math.max(margin, top)) + 'px';
  }

  function emitSelectedElement(element) {
    const selectedElement = readElement(element);
    console.log('Tibis WebView selected element', selectedElement);
    console.log(${selectionMessagePrefix} + JSON.stringify(selectedElement));
    return selectedElement;
  }

  function emitToolbarAction(type) {
    console.log(${actionMessagePrefix} + JSON.stringify({ type }));
  }

  function handleToolbarClick(event) {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const button = target.closest('[data-tibis-element-picker-action]');
    if (!(button instanceof HTMLElement)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    emitToolbarAction(button.dataset.tibisElementPickerAction || '');
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
  selectedToolbar.addEventListener('click', handleToolbarClick);
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
  const selectedElementToolbarAction = ref<WebviewElementToolbarAction | null>(null);
  const agentActivity = ref<WebviewAgentActivity>({ ...DEFAULT_AGENT_ACTIVITY });
  let initialUrlAttached = false;
  let isDomReady = false;
  let pendingUserAgent = '';
  let pendingPageSnapshotRead: Promise<WebviewPageSnapshot> | null = null;
  let activeSnapshot: ActiveWebviewSnapshot | null = null;
  let agentActivityClearTimer: number | null = null;

  /**
   * 读取 renderer 本地单调时间。
   * @returns 当前单调时间
   */
  function nowMs(): number {
    return globalThis.performance?.now?.() ?? Date.now();
  }

  /**
   * 创建页面快照 ID。
   * @returns 页面快照 ID
   */
  function createSnapshotId(): string {
    return `webview-snapshot-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  /**
   * 清理延迟隐藏 Agent 活动状态的定时器。
   */
  function clearAgentActivityTimer(): void {
    if (agentActivityClearTimer === null) {
      return;
    }

    window.clearTimeout(agentActivityClearTimer);
    agentActivityClearTimer = null;
  }

  /**
   * 开始展示 Agent 活动反馈。
   * @param phase - 活动阶段
   * @param label - 状态文案
   */
  function startAgentActivity(phase: Extract<WebviewAgentActivityPhase, 'reading' | 'operating'>, label: string): void {
    clearAgentActivityTimer();
    agentActivity.value = {
      phase,
      label,
      startedAt: nowMs()
    };
  }

  /**
   * 完成 Agent 活动反馈，并短暂保留完成状态。
   * @param phase - 完成阶段
   * @param label - 状态文案
   */
  function finishAgentActivity(phase: Extract<WebviewAgentActivityPhase, 'success' | 'error'>, label: string): void {
    const finishedAt = nowMs();
    agentActivity.value = {
      phase,
      label,
      startedAt: agentActivity.value.startedAt || finishedAt,
      finishedAt
    };
    clearAgentActivityTimer();
    agentActivityClearTimer = window.setTimeout(() => {
      agentActivity.value = { ...DEFAULT_AGENT_ACTIVITY };
      agentActivityClearTimer = null;
    }, AGENT_ACTIVITY_CLEAR_DELAY_MS);
  }

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
      loadWebviewUrl(webviewRef.value, url);
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

    startAgentActivity('reading', '正在读取网页');
    let rawRead: Promise<unknown>;
    try {
      rawRead = executeJavaScript.call(instance, createPageSnapshotScript()) as Promise<unknown>;
    } catch (error: unknown) {
      finishAgentActivity('error', '读取失败');
      throw normalizeWebviewPageReadError(error);
    }

    pendingPageSnapshotRead = withWebviewPageReadTimeout(
      rawRead.then((value: unknown) => {
        if (!isWebviewPageSnapshot(value)) {
          throw new Error('页面快照格式无效');
        }

        const snapshotId = typeof value.snapshotId === 'string' && value.snapshotId ? value.snapshotId : createSnapshotId();
        const snapshot = normalizeWebviewPageSnapshot({ ...value, snapshotId });
        const selectedElementSnapshot = createSelectedElementSnapshot(selectedElement.value, snapshot.elements);
        const snapshotWithSelection = selectedElementSnapshot ? { ...snapshot, selectedElement: selectedElementSnapshot } : snapshot;
        activeSnapshot = { id: snapshotId, url: snapshot.url, capturedAtMs: nowMs(), elements: createActiveSnapshotElements(snapshot.elements) };
        return createPublicWebviewPageSnapshot(snapshotWithSelection);
      })
    )
      .then((snapshot: WebviewPageSnapshot) => {
        finishAgentActivity('success', '读取完成');
        return snapshot;
      })
      .catch((error: unknown) => {
        finishAgentActivity('error', '读取失败');
        throw normalizeWebviewPageReadError(error);
      })
      .finally(() => {
        pendingPageSnapshotRead = null;
      });

    return pendingPageSnapshotRead;
  }

  /**
   * 操作当前网页。
   * @param input - WebView 操作输入
   * @returns WebView 操作结果
   */
  async function operatePage(input: WebviewOperateInput): Promise<WebviewOperateResult> {
    const instance = webviewRef.value;
    const executeJavaScript = instance?.executeJavaScript;
    if (!instance || typeof executeJavaScript !== 'function') {
      throw createWebviewOperationError('EDITOR_UNAVAILABLE');
    }

    if (input.action.type === 'navigate') {
      startAgentActivity('operating', '正在操作网页');
      try {
        const targetUrl = normalizeWebviewUrl(input.action.url);
        state.value.url = targetUrl;
        activeSnapshot = null;
        loadWebviewUrl(instance, targetUrl);

        const result: WebviewOperateResult = {
          ok: true,
          action: 'navigate',
          target: null,
          message: `navigating to ${targetUrl}`,
          navigationStarted: true,
          pageChanged: true,
          shouldReadAgain: true
        };
        finishAgentActivity('success', '操作完成');
        return result;
      } catch {
        finishAgentActivity('error', '操作失败');
        throw createWebviewOperationError('INVALID_INPUT', '网页地址无效，仅支持 http/https');
      }
    }

    if (
      !input.snapshotId ||
      !activeSnapshot ||
      activeSnapshot.id !== input.snapshotId ||
      nowMs() - activeSnapshot.capturedAtMs > WEBVIEW_PAGE_SNAPSHOT_TTL_MS
    ) {
      throw createWebviewOperationError('STALE_SNAPSHOT');
    }

    if (state.value.url && state.value.url !== activeSnapshot.url) {
      throw createWebviewOperationError('STALE_SNAPSHOT');
    }

    if (state.value.isLoading && input.action.type !== 'wait') {
      throw createWebviewOperationError('PAGE_LOADING');
    }

    startAgentActivity('operating', '正在操作网页');
    try {
      const rawOperation = executeJavaScript.call(instance, createPageOperationScript(input, activeSnapshot.elements)) as Promise<unknown>;
      const result = await withWebviewPageOperationTimeout(rawOperation);
      if (!isWebviewOperateResult(result)) {
        throw createWebviewOperationError('EXECUTION_FAILED', '页面操作结果格式无效');
      }

      finishAgentActivity('success', '操作完成');
      return result;
    } catch (error) {
      finishAgentActivity('error', '操作失败');
      throw normalizeWebviewPageOperationError(error);
    }
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
    if (message.startsWith(ELEMENT_PICKER_ACTION_MESSAGE_PREFIX)) {
      const type = readElementToolbarActionType(message);
      if (!type) {
        return;
      }

      selectedElementToolbarAction.value = {
        type,
        selection: selectedElement.value,
        triggeredAt: Date.now()
      };
      return;
    }

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
    state.value.favicon = '';
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
    const shouldInvalidateSnapshot = !activeSnapshot || activeSnapshot.url !== event.url;
    state.value.url = event.url;
    if (shouldInvalidateSnapshot) {
      activeSnapshot = null;
      selectedElement.value = null;
    }
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
   * 处理页面 favicon 更新事件。
   * @param event - favicon 更新事件
   */
  function handleFaviconUpdated(event: PageFaviconUpdatedEvent): void {
    const favicon = readFirstFavicon(event.favicons);
    if (!favicon) {
      return;
    }

    state.value.favicon = favicon;
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
    selectedElementToolbarActionRef: selectedElementToolbarAction,
    agentActivity,

    attachInitialUrl,
    handleDidStartLoading,
    handleDomReady,
    handleDidNavigate,
    handleTitleUpdated,
    handleFaviconUpdated,
    handleDidStopLoading,
    handleAttachRejected,
    handleConsoleMessage,
    startElementSelection,
    stopElementSelection,
    clearSelectedElement,
    readPageSnapshot,
    operatePage,
    setTouchSimulationEnabled,
    setUserAgent
  };
}

/**
 * 兼容旧测试与旧调用方的 `<webview>` 控制器命名。
 */
export const useTagWebView = useWebView;
