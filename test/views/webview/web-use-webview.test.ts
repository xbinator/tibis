/**
 * @file web-use-webview.test.ts
 * @description 验证 WebView 标签控制器行为。
 * @vitest-environment jsdom
 */
import { Script, createContext } from 'node:vm';
import type { WebviewTag } from 'electron';
import { ref } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElementSelectionScript, normalizeWebviewPageSnapshot, useWebView } from '@/views/webview/web/hooks/useWebView';

/**
 * 测试环境中注入的元素选择清理函数。
 */
interface WindowWithElementPickerCleanup extends Window {
  /** 清理页面元素选择器 */
  __tibisElementPickerCleanup?: () => void;
}

/**
 * 测试用开发者工具方法集合。
 */
interface TestDevToolsWebview {
  /** 打开开发者工具。 */
  openDevTools: () => void;
  /** 关闭开发者工具。 */
  closeDevTools: () => void;
  /** 开发者工具是否已打开。 */
  isDevToolsOpened: () => boolean;
}

/** 原始 scrollIntoView 实现，测试后恢复。 */
const originalScrollIntoView = window.HTMLElement.prototype.scrollIntoView;

/**
 * 创建可观测 catch 注册的 loadURL 返回值。
 * @returns loadURL 返回值与 catch spy
 */
function createCatchableLoadResult(): { promise: Promise<void>; catchSpy: ReturnType<typeof vi.fn<(_handler: (error: unknown) => void) => Promise<void>>> } {
  const catchSpy = vi.fn<(_handler: (error: unknown) => void) => Promise<void>>(() => Promise.resolve());
  return { promise: { catch: catchSpy } as unknown as Promise<void>, catchSpy };
}

/**
 * 创建测试用 WebView 元素。
 * @param isOpened - 开发者工具是否已打开
 * @returns 带开发者工具方法的 WebView 元素
 */
function createDevToolsWebview(isOpened: boolean): WebviewTag & TestDevToolsWebview {
  const element = document.createElement('webview') as unknown as WebviewTag & TestDevToolsWebview;
  element.openDevTools = vi.fn();
  element.closeDevTools = vi.fn();
  element.isDevToolsOpened = vi.fn(() => isOpened);
  return element;
}

/**
 * 创建可执行脚本的 WebView 测试替身。
 * @param results - executeJavaScript 依次返回的结果
 * @returns WebView 测试替身
 */
function createScriptableWebview(results: unknown[]): WebviewTag {
  const element = document.createElement('webview') as unknown as WebviewTag;
  const pendingResults = [...results];
  element.executeJavaScript = vi.fn().mockImplementation((): Promise<unknown> => {
    const nextResult = pendingResults.shift() ?? null;
    if (nextResult instanceof Error) {
      return Promise.reject(nextResult);
    }

    return Promise.resolve(nextResult);
  });
  return element;
}

/**
 * 创建第二次调用会执行页面脚本的 WebView 测试替身。
 * @param snapshot - 第一次读取快照返回的数据
 * @returns WebView 测试替身
 */
function createPageOperationExecutingWebview(snapshot: unknown): WebviewTag {
  const element = document.createElement('webview') as unknown as WebviewTag;
  let callCount = 0;
  element.executeJavaScript = vi.fn((script: string): Promise<unknown> => {
    callCount += 1;
    if (callCount === 1) return Promise.resolve(snapshot);

    const scriptContext = createContext({
      window,
      document,
      console,
      Error,
      Event: window.Event,
      HTMLAnchorElement: window.HTMLAnchorElement,
      HTMLInputElement: window.HTMLInputElement,
      HTMLElement: window.HTMLElement,
      HTMLSelectElement: window.HTMLSelectElement,
      HTMLTextAreaElement: window.HTMLTextAreaElement,
      InputEvent: window.InputEvent,
      MouseEvent: window.MouseEvent,
      PointerEvent: window.PointerEvent,
      Promise
    });
    return new Script(script).runInContext(scriptContext) as Promise<unknown>;
  });
  return element;
}

/**
 * 创建会在 jsdom 页面中执行脚本的 WebView 测试替身。
 * @returns WebView 测试替身
 */
function createPageScriptExecutingWebview(): WebviewTag {
  const element = document.createElement('webview') as unknown as WebviewTag;
  element.executeJavaScript = vi.fn((script: string): Promise<unknown> => {
    const scriptContext = createContext({
      window,
      document,
      console,
      location: window.location,
      Error,
      Event: window.Event,
      HTMLAnchorElement: window.HTMLAnchorElement,
      HTMLInputElement: window.HTMLInputElement,
      HTMLElement: window.HTMLElement,
      HTMLOptionElement: window.HTMLOptionElement,
      HTMLSelectElement: window.HTMLSelectElement,
      HTMLTextAreaElement: window.HTMLTextAreaElement,
      InputEvent: window.InputEvent,
      MouseEvent: window.MouseEvent,
      PointerEvent: window.PointerEvent,
      Promise
    });
    return Promise.resolve(new Script(script).runInContext(scriptContext));
  });
  return element;
}

/**
 * 设置元素在 jsdom 中可见。
 * @param element - 目标元素
 */
function installVisibleRect(element: HTMLElement): void {
  element.getBoundingClientRect = vi.fn(
    (): DOMRect =>
      ({
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 120,
        bottom: 32,
        width: 120,
        height: 32,
        toJSON: () => ({})
      } as DOMRect)
  );
}

/**
 * 给 jsdom 元素安装可滚动尺寸和 scrollBy 行为。
 * @param element - 目标元素
 * @param metrics - 滚动尺寸
 */
function installScrollableElementMetrics(
  element: HTMLElement,
  metrics: { clientHeight: number; scrollHeight: number; clientWidth: number; scrollWidth: number }
): void {
  let scrollTop = 0;
  let scrollLeft = 0;
  Object.defineProperties(element, {
    clientHeight: { configurable: true, get: () => metrics.clientHeight },
    scrollHeight: { configurable: true, get: () => metrics.scrollHeight },
    clientWidth: { configurable: true, get: () => metrics.clientWidth },
    scrollWidth: { configurable: true, get: () => metrics.scrollWidth },
    scrollTop: {
      configurable: true,
      get: () => scrollTop,
      set: (value: number) => {
        scrollTop = Math.max(0, Math.min(value, Math.max(metrics.scrollHeight - metrics.clientHeight, 0)));
      }
    },
    scrollLeft: {
      configurable: true,
      get: () => scrollLeft,
      set: (value: number) => {
        scrollLeft = Math.max(0, Math.min(value, Math.max(metrics.scrollWidth - metrics.clientWidth, 0)));
      }
    },
    scrollBy: {
      configurable: true,
      value: (options: ScrollToOptions): void => {
        element.scrollTop += Number(options.top || 0);
        element.scrollLeft += Number(options.left || 0);
      }
    }
  });
}

describe('useWebView', () => {
  afterEach((): void => {
    (window as WindowWithElementPickerCleanup).__tibisElementPickerCleanup?.();
    document.body.innerHTML = '';
    Object.defineProperty(window.HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      writable: true,
      value: originalScrollIntoView
    });
    vi.restoreAllMocks();
  });

  it('reopens devtools when debug action is triggered after devtools was already opened', (): void => {
    const element = createDevToolsWebview(true);
    const controller = useWebView(ref<WebviewTag | null>(element));
    const { openDevTools } = controller;

    if (typeof openDevTools !== 'function') {
      throw new Error('openDevTools should be available on web webview controller');
    }

    openDevTools();

    expect(element.closeDevTools).toHaveBeenCalledTimes(1);
    expect(element.openDevTools).toHaveBeenCalledTimes(1);
  });

  it('builds a unique selector for repeated sibling elements', (): void => {
    document.body.innerHTML = `
      <ul class="article-list">
        <li class="article-item"><span>第一条</span></li>
        <li class="article-item"><span>第七条</span></li>
      </ul>
    `;
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const secondItem = document.querySelectorAll('.article-item')[1];

    if (!(secondItem instanceof HTMLElement)) {
      throw new Error('second item should exist');
    }

    const scriptContext = createContext({
      window,
      document,
      console,
      Element: window.Element,
      HTMLElement: window.HTMLElement,
      Promise,
      requestAnimationFrame: window.requestAnimationFrame.bind(window)
    });
    new Script(createElementSelectionScript()).runInContext(scriptContext);
    secondItem.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    (window as WindowWithElementPickerCleanup).__tibisElementPickerCleanup?.();

    const selectionMessage = consoleLogSpy.mock.calls
      .map(([message]) => String(message))
      .find((message) => message.startsWith('__TIBIS_ELEMENT_PICKER_SELECTION__'));
    if (!selectionMessage) {
      throw new Error('selection message should be logged');
    }

    const selection = JSON.parse(selectionMessage.slice('__TIBIS_ELEMENT_PICKER_SELECTION__'.length)) as { selector: string };

    expect(selection.selector).not.toBe('li.article-item');
    expect(document.querySelector(selection.selector)).toBe(secondItem);
  });

  it('keeps building selector path when duplicate ids are present', (): void => {
    document.body.innerHTML = `
      <section class="article-section">
        <article id="article-card" class="article-item"><span>第一条</span></article>
      </section>
      <section class="article-section">
        <article id="article-card" class="article-item"><span>第七条</span></article>
      </section>
    `;
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const seventhItem = document.querySelectorAll('#article-card')[1];

    if (!(seventhItem instanceof HTMLElement)) {
      throw new Error('seventh item should exist');
    }

    const scriptContext = createContext({
      window,
      document,
      console,
      Element: window.Element,
      HTMLElement: window.HTMLElement,
      Promise,
      requestAnimationFrame: window.requestAnimationFrame.bind(window)
    });
    new Script(createElementSelectionScript()).runInContext(scriptContext);
    seventhItem.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    (window as WindowWithElementPickerCleanup).__tibisElementPickerCleanup?.();

    const selectionMessage = consoleLogSpy.mock.calls
      .map(([message]) => String(message))
      .find((message) => message.startsWith('__TIBIS_ELEMENT_PICKER_SELECTION__'));
    if (!selectionMessage) {
      throw new Error('selection message should be logged');
    }

    const selection = JSON.parse(selectionMessage.slice('__TIBIS_ELEMENT_PICKER_SELECTION__'.length)) as { selector: string };

    expect(selection.selector).not.toBe('article#article-card');
    expect(document.querySelector(selection.selector)).toBe(seventhItem);
  });

  it('adds sibling position when duplicate ids share the same parent', (): void => {
    document.body.innerHTML = `
      <section class="article-section">
        <article id="article-card" class="article-item"><span>第一条</span></article>
        <article id="article-card" class="article-item"><span>第七条</span></article>
      </section>
    `;
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const seventhItem = document.querySelectorAll('#article-card')[1];

    if (!(seventhItem instanceof HTMLElement)) {
      throw new Error('seventh item should exist');
    }

    const scriptContext = createContext({
      window,
      document,
      console,
      Element: window.Element,
      HTMLElement: window.HTMLElement,
      Promise,
      requestAnimationFrame: window.requestAnimationFrame.bind(window)
    });
    new Script(createElementSelectionScript()).runInContext(scriptContext);
    seventhItem.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    (window as WindowWithElementPickerCleanup).__tibisElementPickerCleanup?.();

    const selectionMessage = consoleLogSpy.mock.calls
      .map(([message]) => String(message))
      .find((message) => message.startsWith('__TIBIS_ELEMENT_PICKER_SELECTION__'));
    if (!selectionMessage) {
      throw new Error('selection message should be logged');
    }

    const selection = JSON.parse(selectionMessage.slice('__TIBIS_ELEMENT_PICKER_SELECTION__'.length)) as { selector: string };

    expect(selection.selector).toContain(':nth-of-type(2)');
    expect(document.querySelector(selection.selector)).toBe(seventhItem);
  });

  it('does not render screenshot action button inside selected element overlay', (): void => {
    document.body.innerHTML = `
      <section class="article-section">
        <article class="article-item"><span>第七条</span></article>
      </section>
    `;
    const item = document.querySelector('.article-item');

    if (!(item instanceof HTMLElement)) {
      throw new Error('item should exist');
    }

    const scriptContext = createContext({
      window,
      document,
      console,
      Element: window.Element,
      HTMLElement: window.HTMLElement,
      Promise,
      requestAnimationFrame: window.requestAnimationFrame.bind(window)
    });
    new Script(createElementSelectionScript()).runInContext(scriptContext);
    item.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    const captureButton = document.querySelector('.tibis-element-picker-action-button');
    (window as WindowWithElementPickerCleanup).__tibisElementPickerCleanup?.();

    expect(captureButton).toBeNull();
  });

  it('normalizes webpage agent snapshot fields', (): void => {
    const snapshot = normalizeWebviewPageSnapshot({
      url: 'https://example.com',
      title: 'Example',
      text: 'Hello',
      selectedText: '',
      headings: [],
      links: [],
      snapshotId: 'snap-1',
      loading: false,
      scroll: {
        x: 0,
        y: 0,
        viewportWidth: 800,
        viewportHeight: 600,
        scrollWidth: 800,
        scrollHeight: 1200,
        atTop: true,
        atBottom: false
      },
      elements: [{ index: 1, tagName: 'BUTTON', text: 'Search', label: 'Search', disabled: false, isNew: true, actions: ['click'] }]
    });

    expect(snapshot.snapshotId).toBe('snap-1');
    expect(snapshot.scroll).toMatchObject({ viewportWidth: 800, scrollHeight: 1200 });
    expect(snapshot.elements?.[0]).toMatchObject({ index: 1, label: 'Search', actions: ['click'] });
  });

  it('exposes only meaningful webpage element actions in snapshots', async (): Promise<void> => {
    document.body.innerHTML = `
      <div id="decorative" tabindex="0">Decorative</div>
      <button>Save</button>
      <section id="page-scroller" style="overflow-y: auto;">
        <span id="row" tabindex="0">Row</span>
      </section>
    `;
    const decorative = document.querySelector('#decorative');
    const button = document.querySelector('button');
    const pageScroller = document.querySelector('#page-scroller');
    const row = document.querySelector('#row');
    if (!(decorative instanceof HTMLElement) || !(button instanceof HTMLElement) || !(pageScroller instanceof HTMLElement) || !(row instanceof HTMLElement)) {
      throw new Error('snapshot action test elements should exist');
    }

    installVisibleRect(decorative);
    installVisibleRect(button);
    installVisibleRect(row);
    installScrollableElementMetrics(pageScroller, { clientHeight: 100, scrollHeight: 900, clientWidth: 300, scrollWidth: 300 });
    const controller = useWebView(ref<WebviewTag | null>(createPageScriptExecutingWebview()));

    const snapshot = await controller.readPageSnapshot();

    expect(snapshot.elements?.map((element) => ({ label: element.label, actions: element.actions }))).toEqual([
      { label: 'Save', actions: ['click'] },
      { label: 'Row', actions: ['scroll'] }
    ]);
  });

  it('operates the current page using the active snapshot', async (): Promise<void> => {
    const webviewElement = createScriptableWebview([
      {
        url: 'https://example.com',
        title: 'Example',
        text: 'Hello',
        selectedText: '',
        headings: [],
        links: [],
        snapshotId: 'snap-1',
        loading: false,
        scroll: {
          x: 0,
          y: 0,
          viewportWidth: 800,
          viewportHeight: 600,
          scrollWidth: 800,
          scrollHeight: 1200,
          atTop: true,
          atBottom: false
        },
        elements: [{ index: 1, tagName: 'BUTTON', text: 'Search', label: 'Search', disabled: false, isNew: true, actions: ['click'] }]
      },
      {
        ok: true,
        action: 'click',
        target: { index: 1, label: 'Search', tagName: 'BUTTON' },
        message: 'clicked',
        navigationStarted: false,
        pageChanged: true,
        shouldReadAgain: true
      }
    ]);
    const controller = useWebView(ref<WebviewTag | null>(webviewElement));
    const snapshot = await controller.readPageSnapshot();

    const result = await controller.operatePage({ snapshotId: snapshot.snapshotId ?? '', action: { type: 'click', index: 1 } });

    expect(result).toMatchObject({ ok: true, action: 'click', shouldReadAgain: true });
    expect(webviewElement.executeJavaScript).toHaveBeenCalledTimes(2);
  });

  it('handles aborted loadURL promises when navigating from the address bar', (): void => {
    const webviewElement = createScriptableWebview([]);
    const loadResult = createCatchableLoadResult();
    webviewElement.loadURL = vi.fn<(_url: string) => Promise<void>>(() => loadResult.promise);
    webviewElement.canGoBack = vi.fn(() => false);
    webviewElement.canGoForward = vi.fn(() => false);
    const controller = useWebView(ref<WebviewTag | null>(webviewElement));
    controller.handleDomReady();

    controller.navigate('https://example.com/');

    expect(webviewElement.loadURL).toHaveBeenCalledWith('https://example.com/');
    expect(loadResult.catchSpy).toHaveBeenCalledTimes(1);
    expect(() => loadResult.catchSpy.mock.calls[0]?.[0](new Error("ERR_ABORTED (-3) loading 'https://example.com/'"))).not.toThrow();
  });

  it('navigates the current WebView without requiring an active snapshot', async (): Promise<void> => {
    const webviewElement = createScriptableWebview([]);
    const loadResult = createCatchableLoadResult();
    webviewElement.loadURL = vi.fn<(_url: string) => Promise<void>>(() => loadResult.promise);
    const controller = useWebView(ref<WebviewTag | null>(webviewElement));

    const result = await controller.operatePage({ action: { type: 'navigate', url: 'example.org' } });

    expect(webviewElement.loadURL).toHaveBeenCalledWith('https://example.org/');
    expect(loadResult.catchSpy).toHaveBeenCalledTimes(1);
    expect(webviewElement.executeJavaScript).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: true, action: 'navigate', pageChanged: true, shouldReadAgain: true });
  });

  it('rejects operation when the active snapshot becomes stale', async (): Promise<void> => {
    const webviewElement = createScriptableWebview([
      {
        url: 'https://example.com',
        title: 'Example',
        text: 'Hello',
        selectedText: '',
        headings: [],
        links: [],
        snapshotId: 'snap-1',
        loading: false,
        elements: []
      }
    ]);
    const controller = useWebView(ref<WebviewTag | null>(webviewElement));
    const snapshot = await controller.readPageSnapshot();

    controller.handleDidStartLoading();
    await expect(controller.operatePage({ snapshotId: snapshot.snapshotId ?? '', action: { type: 'click', index: 1 } })).rejects.toMatchObject({
      code: 'STALE_SNAPSHOT'
    });
  });

  it('rejects operation when the indexed element no longer matches the snapshot fingerprint', async (): Promise<void> => {
    document.body.innerHTML = '<button>New button</button>';
    const button = document.querySelector('button');
    if (!(button instanceof HTMLElement)) {
      throw new Error('button should exist');
    }

    Object.defineProperty(window.HTMLElement.prototype, 'scrollIntoView', { configurable: true, writable: true, value: vi.fn() });
    installVisibleRect(button);
    const webviewElement = createPageOperationExecutingWebview({
      url: 'https://example.com',
      title: 'Example',
      text: 'Hello',
      selectedText: '',
      headings: [],
      links: [],
      snapshotId: 'snap-1',
      loading: false,
      elements: [
        {
          index: 1,
          tagName: 'BUTTON',
          text: 'Old button',
          label: 'Old button',
          fingerprint: 'BUTTON|Old button',
          disabled: false,
          isNew: false,
          actions: ['click']
        }
      ]
    });
    const controller = useWebView(ref<WebviewTag | null>(webviewElement));
    const snapshot = await controller.readPageSnapshot();

    expect(snapshot.elements?.[0].fingerprint).toBeUndefined();
    await expect(controller.operatePage({ snapshotId: snapshot.snapshotId ?? '', action: { type: 'click', index: 1 } })).rejects.toMatchObject({
      code: 'STALE_SNAPSHOT'
    });
  });

  it('normalizes page operation error codes from rejected scripts', async (): Promise<void> => {
    const webviewElement = createScriptableWebview([
      {
        url: 'https://example.com',
        title: 'Example',
        text: 'Hello',
        selectedText: '',
        headings: [],
        links: [],
        snapshotId: 'snap-1',
        loading: false,
        elements: [{ index: 1, tagName: 'SELECT', text: 'Other', label: 'Other', disabled: false, isNew: false, actions: ['select'] }]
      },
      new Error('Error: OPTION_AMBIGUOUS')
    ]);
    const controller = useWebView(ref<WebviewTag | null>(webviewElement));
    const snapshot = await controller.readPageSnapshot();

    await expect(
      controller.operatePage({ snapshotId: snapshot.snapshotId ?? '', action: { type: 'select', index: 1, optionText: 'Other' } })
    ).rejects.toMatchObject({
      code: 'OPTION_AMBIGUOUS'
    });
  });

  it('navigates the current WebView through operatePage without executing page JavaScript', async (): Promise<void> => {
    const webviewElement = createScriptableWebview([
      {
        url: 'https://example.com',
        title: 'Example',
        text: 'Hello',
        selectedText: '',
        headings: [],
        links: [],
        snapshotId: 'snap-1',
        loading: false,
        elements: []
      }
    ]);
    webviewElement.loadURL = vi.fn();
    const controller = useWebView(ref<WebviewTag | null>(webviewElement));
    const snapshot = await controller.readPageSnapshot();

    const result = await controller.operatePage({ snapshotId: snapshot.snapshotId ?? '', action: { type: 'navigate', url: 'example.org' } });

    expect(webviewElement.loadURL).toHaveBeenCalledWith('https://example.org/');
    expect(webviewElement.executeJavaScript).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ ok: true, action: 'navigate', pageChanged: true, shouldReadAgain: true });
  });

  it('scrolls the ancestor that can move in the requested direction', async (): Promise<void> => {
    document.body.innerHTML = `
      <section id="page-scroller" style="overflow-y: auto;">
        <div id="horizontal-scroller" style="overflow-x: auto;">
          <button>More</button>
        </div>
      </section>
    `;
    const pageScroller = document.querySelector('#page-scroller');
    const horizontalScroller = document.querySelector('#horizontal-scroller');
    const button = document.querySelector('button');
    if (!(pageScroller instanceof HTMLElement) || !(horizontalScroller instanceof HTMLElement) || !(button instanceof HTMLElement)) {
      throw new Error('scroll test elements should exist');
    }

    Object.defineProperty(window.HTMLElement.prototype, 'scrollIntoView', { configurable: true, writable: true, value: vi.fn() });
    installVisibleRect(button);
    installScrollableElementMetrics(pageScroller, { clientHeight: 100, scrollHeight: 900, clientWidth: 300, scrollWidth: 300 });
    installScrollableElementMetrics(horizontalScroller, { clientHeight: 100, scrollHeight: 100, clientWidth: 100, scrollWidth: 600 });
    const webviewElement = createPageOperationExecutingWebview({
      url: 'https://example.com',
      title: 'Example',
      text: 'Hello',
      selectedText: '',
      headings: [],
      links: [],
      snapshotId: 'snap-1',
      loading: false,
      elements: [{ index: 1, tagName: 'BUTTON', text: 'More', label: 'More', disabled: false, isNew: false, actions: ['scroll'] }]
    });
    const controller = useWebView(ref<WebviewTag | null>(webviewElement));
    const snapshot = await controller.readPageSnapshot();

    const result = await controller.operatePage({
      snapshotId: snapshot.snapshotId ?? '',
      action: { type: 'scroll', index: 1, direction: 'down', pixels: 120 }
    });

    expect(pageScroller.scrollTop).toBe(120);
    expect(horizontalScroller.scrollTop).toBe(0);
    expect(result).toMatchObject({
      scroll: {
        targetType: 'element',
        before: { x: 0, y: 0 },
        after: { x: 0, y: 120 },
        changed: true
      }
    });
  });

  it('falls back to page scrolling when indexed element has no scrollable ancestor', async (): Promise<void> => {
    document.body.innerHTML = '<button>More</button>';
    const button = document.querySelector('button');
    if (!(button instanceof HTMLElement)) {
      throw new Error('button should exist');
    }

    const scrollBy = vi.fn<(_options: ScrollToOptions) => void>();
    Object.defineProperty(window, 'scrollBy', { configurable: true, writable: true, value: scrollBy });
    Object.defineProperty(window.HTMLElement.prototype, 'scrollIntoView', { configurable: true, writable: true, value: vi.fn() });
    installVisibleRect(button);
    const webviewElement = createPageOperationExecutingWebview({
      url: 'https://example.com',
      title: 'Example',
      text: 'Hello',
      selectedText: '',
      headings: [],
      links: [],
      snapshotId: 'snap-1',
      loading: false,
      elements: [{ index: 1, tagName: 'BUTTON', text: 'More', label: 'More', disabled: false, isNew: false, actions: ['scroll'] }]
    });
    const controller = useWebView(ref<WebviewTag | null>(webviewElement));
    const snapshot = await controller.readPageSnapshot();

    await controller.operatePage({ snapshotId: snapshot.snapshotId ?? '', action: { type: 'scroll', index: 1, direction: 'down', pixels: 140 } });

    expect(scrollBy).toHaveBeenCalledWith({ left: 0, top: 140, behavior: 'auto' });
  });
});
