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

describe('useWebView', () => {
  afterEach((): void => {
    (window as WindowWithElementPickerCleanup).__tibisElementPickerCleanup?.();
    document.body.innerHTML = '';
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
});
