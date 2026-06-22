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
      HTMLFormElement: window.HTMLFormElement,
      HTMLInputElement: window.HTMLInputElement,
      HTMLElement: window.HTMLElement,
      HTMLSelectElement: window.HTMLSelectElement,
      HTMLTextAreaElement: window.HTMLTextAreaElement,
      InputEvent: window.InputEvent,
      KeyboardEvent: window.KeyboardEvent,
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
 * 设置元素在 jsdom 中的视口矩形。
 * @param element - 目标元素
 * @param rect - 视口矩形
 */
function installElementRect(element: HTMLElement, rect: { x: number; y: number; width: number; height: number }): void {
  element.getBoundingClientRect = vi.fn(
    (): DOMRect =>
      ({
        x: rect.x,
        y: rect.y,
        top: rect.y,
        left: rect.x,
        right: rect.x + rect.width,
        bottom: rect.y + rect.height,
        width: rect.width,
        height: rect.height,
        toJSON: () => ({})
      } as DOMRect)
  );
}

/**
 * 设置元素在 jsdom 中可见。
 * @param element - 目标元素
 */
function installVisibleRect(element: HTMLElement): void {
  installElementRect(element, { x: 0, y: 0, width: 120, height: 32 });
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

  it('exposes non-semantic clickable webpage elements in snapshots', async (): Promise<void> => {
    document.body.innerHTML = `
      <section>
        <div id="doctor-card" class="doctor-card" data-testid="doctor-card" style="cursor: pointer;">预约专家</div>
        <span id="plain-text">普通文本</span>
      </section>
    `;
    const section = document.querySelector('section');
    const card = document.querySelector('#doctor-card');
    const plainText = document.querySelector('#plain-text');
    if (!(section instanceof HTMLElement) || !(card instanceof HTMLElement) || !(plainText instanceof HTMLElement)) {
      throw new Error('non-semantic clickable snapshot elements should exist');
    }

    installVisibleRect(section);
    installVisibleRect(card);
    installVisibleRect(plainText);
    const controller = useWebView(ref<WebviewTag | null>(createPageScriptExecutingWebview()));

    const snapshot = await controller.readPageSnapshot();

    expect(snapshot.elements?.map((element) => ({ label: element.label, actions: element.actions }))).toEqual([{ label: '预约专家', actions: ['click'] }]);
    expect(snapshot.content).toContain('[1]<div');
    expect(snapshot.content).toContain('class="doctor-card"');
    expect(snapshot.content).toContain('data-testid="doctor-card"');
    expect(snapshot.content).toContain('预约专家</div>');
  });

  it('returns simplified DOM browser state in webpage snapshots', async (): Promise<void> => {
    document.body.innerHTML = `
      <main id="register-page">
        <h1>预约挂号</h1>
        <form aria-label="搜索表单">
          <input name="keyword" placeholder="医院名" value="眼科" />
          <button type="submit" aria-label="搜索">搜索</button>
        </form>
        <div role="menuitem" aria-haspopup="menu">更多医院</div>
      </main>
    `;
    const visibleElements = Array.from(document.querySelectorAll<HTMLElement>('main,h1,form,input,button,[role="menuitem"]'));
    visibleElements.forEach((element) => installVisibleRect(element));
    const controller = useWebView(ref<WebviewTag | null>(createPageScriptExecutingWebview()));

    const snapshot = await controller.readPageSnapshot();

    expect(snapshot.header).toContain('Page info:');
    expect(snapshot.content).toContain('<h1>预约挂号</h1>');
    expect(snapshot.content).toContain('[1]<input name="keyword" value="眼科" placeholder="医院名" />');
    expect(snapshot.content).toContain('[2]<button type="submit" aria-label="搜索">搜索</button>');
    expect(snapshot.content).toContain('[3]<div role="menuitem" aria-haspopup="menu">更多医院</div>');
    expect(snapshot.footer.length).toBeGreaterThan(0);
    expect(snapshot.truncated.content).toBe(false);
  });

  it('returns open shadow DOM elements in webpage snapshots', async (): Promise<void> => {
    document.body.innerHTML = '<booking-dialog></booking-dialog>';
    const host = document.querySelector('booking-dialog');
    if (!(host instanceof HTMLElement)) {
      throw new Error('shadow DOM host should exist');
    }

    const shadowRoot = host.attachShadow({ mode: 'open' });
    shadowRoot.innerHTML = '<section><h2>温馨提示</h2><button>确认</button></section>';
    const confirmButton = shadowRoot.querySelector('button');
    if (!(confirmButton instanceof HTMLElement)) {
      throw new Error('shadow DOM button should exist');
    }

    installVisibleRect(host);
    installVisibleRect(confirmButton);
    const controller = useWebView(ref<WebviewTag | null>(createPageScriptExecutingWebview()));

    const snapshot = await controller.readPageSnapshot();

    expect(snapshot.elements?.map((element) => ({ label: element.label, actions: element.actions }))).toEqual([{ label: '确认', actions: ['click'] }]);
    expect(snapshot.content).toContain('<booking-dialog>');
    expect(snapshot.content).toContain('#shadow-root');
    expect(snapshot.content).toContain('[1]<button>确认</button>');
  });

  it('includes the manually selected element in webpage snapshots', async (): Promise<void> => {
    const selectedElement = {
      tagName: 'BUTTON',
      id: 'confirm-button',
      className: 'primary-action',
      text: '确认',
      selector: 'button#confirm-button',
      attributes: [{ name: 'id', value: 'confirm-button' }],
      ancestors: [{ tagName: 'SECTION', selector: 'section.dialog' }],
      computedStyles: { display: 'block', position: 'static' },
      rect: { x: 20, y: 30, pageX: 20, pageY: 30, width: 120, height: 40 }
    };
    const webviewElement = createScriptableWebview([
      selectedElement,
      {
        url: 'https://example.com',
        title: 'Example',
        text: '确认',
        selectedText: '',
        headings: [],
        links: [],
        snapshotId: 'snap-1',
        loading: false,
        elements: [
          {
            index: 1,
            tagName: 'BUTTON',
            text: '确认',
            label: '确认',
            disabled: false,
            isNew: false,
            actions: ['click'],
            rect: { x: 20, y: 30, width: 120, height: 40 },
            visibleRatio: 1,
            covered: false,
            layer: 'page',
            primary: false
          }
        ]
      }
    ]);
    const controller = useWebView(ref<WebviewTag | null>(webviewElement));

    await controller.startElementSelection();
    const snapshot = await controller.readPageSnapshot();

    expect(snapshot.selectedElement).toMatchObject({
      selector: 'button#confirm-button',
      text: '确认',
      matchedIndex: 1,
      matchedLabel: '确认',
      matchedActions: ['click']
    });
  });

  it('returns viewport top layer context for visible dialogs', async (): Promise<void> => {
    document.body.innerHTML = `
      <main>
        <button id="register-button">挂号</button>
      </main>
      <div id="mask" style="position: fixed; inset: 0; background: rgba(0, 0, 0, 0.55);"></div>
      <section id="confirm-dialog" role="dialog" aria-modal="true" style="position: fixed; background: #fff;">
        <h2>温馨提示</h2>
        <p>医生在多个院区/科室出诊，请确认预约信息</p>
        <button>取消</button>
        <button>确认</button>
      </section>
    `;
    const registerButton = document.querySelector('#register-button');
    const mask = document.querySelector('#mask');
    const dialog = document.querySelector('#confirm-dialog');
    const cancelButton = document.querySelector('#confirm-dialog button:first-of-type');
    const confirmButton = document.querySelector('#confirm-dialog button:last-of-type');
    if (
      !(registerButton instanceof HTMLElement) ||
      !(mask instanceof HTMLElement) ||
      !(dialog instanceof HTMLElement) ||
      !(cancelButton instanceof HTMLElement) ||
      !(confirmButton instanceof HTMLElement)
    ) {
      throw new Error('dialog viewport test elements should exist');
    }

    installElementRect(registerButton, { x: 112, y: 620, width: 130, height: 88 });
    installElementRect(mask, { x: 0, y: 0, width: 1024, height: 768 });
    installElementRect(dialog, { x: 120, y: 180, width: 760, height: 360 });
    installElementRect(cancelButton, { x: 180, y: 470, width: 260, height: 72 });
    installElementRect(confirmButton, { x: 520, y: 470, width: 260, height: 72 });
    const controller = useWebView(ref<WebviewTag | null>(createPageScriptExecutingWebview()));

    const snapshot = await controller.readPageSnapshot();

    expect(snapshot.viewport?.topLayer).toMatchObject({
      kind: 'dialog',
      label: '温馨提示',
      elementIndexes: [2, 3],
      primaryActionIndex: 3,
      dimmed: true
    });
    expect(snapshot.viewport?.elements).toEqual([
      expect.objectContaining({ index: 1, label: '挂号', covered: true, layer: 'background', primary: false }),
      expect.objectContaining({ index: 2, label: '取消', covered: false, layer: 'top', primary: false }),
      expect.objectContaining({ index: 3, label: '确认', covered: false, layer: 'top', primary: true })
    ]);
    expect(snapshot.elements?.[2]).toMatchObject({ index: 3, label: '确认', primary: true, layer: 'top' });
  });

  it('clicks non-semantic clickable webpage elements by index', async (): Promise<void> => {
    document.body.innerHTML = '<div id="submit-card" style="cursor: pointer;">确认预约</div>';
    const card = document.querySelector('#submit-card');
    if (!(card instanceof HTMLElement)) {
      throw new Error('non-semantic clickable operation element should exist');
    }

    let clickCount = 0;
    card.addEventListener('click', () => {
      clickCount += 1;
    });
    Object.defineProperty(window.HTMLElement.prototype, 'scrollIntoView', { configurable: true, writable: true, value: vi.fn() });
    installVisibleRect(card);
    const webviewElement = createPageOperationExecutingWebview({
      url: 'https://example.com',
      title: 'Example',
      text: 'Hello',
      selectedText: '',
      headings: [],
      links: [],
      snapshotId: 'snap-1',
      loading: false,
      elements: [{ index: 1, tagName: 'DIV', text: '确认预约', label: '确认预约', disabled: false, isNew: false, actions: ['click'] }]
    });
    const controller = useWebView(ref<WebviewTag | null>(webviewElement));
    const snapshot = await controller.readPageSnapshot();

    const result = await controller.operatePage({ snapshotId: snapshot.snapshotId ?? '', action: { type: 'click', index: 1 } });

    expect(clickCount).toBe(1);
    expect(result).toMatchObject({ ok: true, action: 'click', target: { index: 1, label: '确认预约', tagName: 'DIV' } });
  });

  it('clicks open shadow DOM elements by index', async (): Promise<void> => {
    document.body.innerHTML = '<booking-dialog></booking-dialog>';
    const host = document.querySelector('booking-dialog');
    if (!(host instanceof HTMLElement)) {
      throw new Error('shadow DOM operation host should exist');
    }

    const shadowRoot = host.attachShadow({ mode: 'open' });
    shadowRoot.innerHTML = '<button>确认</button>';
    const confirmButton = shadowRoot.querySelector('button');
    if (!(confirmButton instanceof HTMLElement)) {
      throw new Error('shadow DOM operation button should exist');
    }

    let clickCount = 0;
    confirmButton.addEventListener('click', () => {
      clickCount += 1;
    });
    Object.defineProperty(window.HTMLElement.prototype, 'scrollIntoView', { configurable: true, writable: true, value: vi.fn() });
    installVisibleRect(host);
    installVisibleRect(confirmButton);
    const webviewElement = createPageOperationExecutingWebview({
      url: 'https://example.com',
      title: 'Example',
      text: 'Hello',
      selectedText: '',
      headings: [],
      links: [],
      snapshotId: 'snap-1',
      loading: false,
      elements: [{ index: 1, tagName: 'BUTTON', text: '确认', label: '确认', disabled: false, isNew: false, actions: ['click'] }]
    });
    const controller = useWebView(ref<WebviewTag | null>(webviewElement));
    const snapshot = await controller.readPageSnapshot();

    const result = await controller.operatePage({ snapshotId: snapshot.snapshotId ?? '', action: { type: 'click', index: 1 } });

    expect(clickCount).toBe(1);
    expect(result).toMatchObject({ ok: true, action: 'click', target: { index: 1, label: '确认', tagName: 'BUTTON' } });
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

  it('presses Enter on an indexed input and submits the owning form', async (): Promise<void> => {
    document.body.innerHTML = `
      <form id="search-form">
        <input name="keyword" placeholder="搜索医院" />
      </form>
    `;
    const input = document.querySelector('input');
    const form = document.querySelector('form');
    if (!(input instanceof HTMLInputElement) || !(form instanceof HTMLFormElement)) {
      throw new Error('press test form should exist');
    }

    const observedKeys: string[] = [];
    let submitCount = 0;
    input.addEventListener('keydown', (event) => observedKeys.push(`down:${event.key}`));
    input.addEventListener('keypress', (event) => observedKeys.push(`press:${event.key}`));
    input.addEventListener('keyup', (event) => observedKeys.push(`up:${event.key}`));
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      submitCount += 1;
    });
    Object.defineProperty(window.HTMLElement.prototype, 'scrollIntoView', { configurable: true, writable: true, value: vi.fn() });
    installVisibleRect(form);
    installVisibleRect(input);
    const webviewElement = createPageOperationExecutingWebview({
      url: 'https://example.com',
      title: 'Example',
      text: 'Hello',
      selectedText: '',
      headings: [],
      links: [],
      snapshotId: 'snap-1',
      loading: false,
      elements: [{ index: 1, tagName: 'INPUT', text: '', label: '搜索医院', disabled: false, isNew: false, actions: ['input'] }]
    });
    const controller = useWebView(ref<WebviewTag | null>(webviewElement));
    const snapshot = await controller.readPageSnapshot();

    const result = await controller.operatePage({ snapshotId: snapshot.snapshotId ?? '', action: { type: 'press', index: 1, key: 'Enter' } });

    expect(observedKeys).toEqual(['down:Enter', 'press:Enter', 'up:Enter']);
    expect(submitCount).toBe(1);
    expect(result).toMatchObject({ ok: true, action: 'press', pageChanged: true, shouldReadAgain: true });
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
