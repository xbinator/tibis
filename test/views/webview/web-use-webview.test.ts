/**
 * @file web-use-webview.test.ts
 * @description 验证 WebView 标签控制器行为。
 * @vitest-environment jsdom
 */
import { Script, createContext } from 'node:vm';
import type { WebviewTag } from 'electron';
import { ref } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElementSelectionScript, useWebView } from '@/views/webview/web/hooks/useWebView';

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
});
