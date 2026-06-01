/**
 * @file useTagWebView.ts
 * @description 封装 `<webview>` 标签页面状态与导航控制。
 */
import { ref, type Ref } from 'vue';
import type { WebviewController, WebviewElementSelection, WebviewPageState } from '@/views/webview/shared/types';

/**
 * 默认 WebView 页面状态。
 */
const DEFAULT_STATE: WebviewPageState = {
  url: '',
  title: '',
  isLoading: false,
  isElementSelecting: false,
  canGoBack: false,
  canGoForward: false,
  loadProgress: 0
};

/**
 * 构建注入到页面内的 DOM 元素选择脚本。
 * @returns 可通过 `executeJavaScript` 执行的脚本
 */
function createElementSelectionScript(): string {
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
    'border:2px solid #2563eb;',
    'background:rgba(37,99,235,.12);',
    'box-sizing:border-box;',
    'border-radius:4px;',
    '}'
  ].join('');
  document.documentElement.appendChild(style);

  const highlight = document.createElement('div');
  highlight.className = 'tibis-element-picker-highlight';
  highlight.hidden = true;
  document.documentElement.appendChild(highlight);

  const escapeCss = (value) => {
    if (window.CSS && typeof window.CSS.escape === 'function') {
      return window.CSS.escape(value);
    }
    return value.replace(/[^a-zA-Z0-9_-]/g, '\\\\$&');
  };

  const buildSelector = (element) => {
    if (element.id) {
      return element.tagName.toLowerCase() + '#' + escapeCss(element.id);
    }

    const classes = Array.from(element.classList).slice(0, 3).map((className) => '.' + escapeCss(className)).join('');
    return element.tagName.toLowerCase() + classes;
  };

  const cleanup = () => {
    document.removeEventListener('mousemove', handleMouseMove, true);
    document.removeEventListener('click', handleClick, true);
    document.removeEventListener('keydown', handleKeydown, true);
    highlight.remove();
    style.remove();
    delete window.__tibisElementPickerCleanup;
  };

  const readElement = (element) => {
    const rect = element.getBoundingClientRect();
    return {
      tagName: element.tagName,
      id: element.id || '',
      className: element.className || '',
      text: (element.innerText || element.textContent || '').trim().slice(0, 200),
      selector: buildSelector(element),
      rect: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height
      }
    };
  };

  function handleMouseMove(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement) || target === highlight) {
      return;
    }

    const rect = target.getBoundingClientRect();
    highlight.hidden = false;
    highlight.style.left = rect.left + 'px';
    highlight.style.top = rect.top + 'px';
    highlight.style.width = rect.width + 'px';
    highlight.style.height = rect.height + 'px';
  }

  function handleClick(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement) || target === highlight) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    const selectedElement = readElement(target);
    console.log('Tibis WebView selected element', selectedElement);
    cleanup();
    resolve(selectedElement);
  }

  function handleKeydown(event) {
    if (event.key !== 'Escape') {
      return;
    }

    event.preventDefault();
    cleanup();
    resolve(null);
  }

  window.__tibisElementPickerCleanup = cleanup;
  document.addEventListener('mousemove', handleMouseMove, true);
  document.addEventListener('click', handleClick, true);
  document.addEventListener('keydown', handleKeydown, true);
}))();
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
  return typeof selection.tagName === 'string' && typeof selection.selector === 'string';
}

/**
 * 创建 `<webview>` 标签控制器。
 * @param webviewRef - `<webview>` 实例引用
 * @returns `<webview>` 控制器与事件处理器
 */
export function useTagWebView(webviewRef: Ref<Electron.WebviewTag | null>) {
  const state = ref<WebviewPageState>({ ...DEFAULT_STATE });
  let initialUrlAttached = false;
  let isDomReady = false;

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
   * 开启页面 DOM 元素选择模式，并在选择完成后输出元素信息。
   */
  async function startElementSelection(): Promise<void> {
    const instance = webviewRef.value;
    if (!instance || state.value.isElementSelecting) {
      return;
    }

    state.value.isElementSelecting = true;
    try {
      const result = await instance.executeJavaScript(createElementSelectionScript());
      if (isElementSelection(result)) {
        console.log('[WebView Element Picker]', result);
      }
    } finally {
      state.value.isElementSelecting = false;
    }
  }

  /**
   * 处理开始加载事件。
   */
  function handleDidStartLoading(): void {
    state.value.isLoading = true;
    state.value.loadProgress = 0.1;
  }

  /**
   * 处理 DOM 就绪事件。
   */
  function handleDomReady(): void {
    isDomReady = true;
    state.value.loadProgress = 0.7;
    syncNavigationState();
  }

  /**
   * 处理导航事件。
   * @param event - 导航事件
   */
  function handleDidNavigate(event: Electron.DidNavigateEvent): void {
    state.value.url = event.url;
    syncNavigationState();
  }

  /**
   * 处理标题更新事件。
   * @param event - 标题事件
   */
  function handleTitleUpdated(event: Electron.PageTitleUpdatedEvent): void {
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
    stop
  };

  return {
    ...controller,
    attachInitialUrl,
    handleDidStartLoading,
    handleDomReady,
    handleDidNavigate,
    handleTitleUpdated,
    handleDidStopLoading,
    handleAttachRejected,
    startElementSelection
  };
}
