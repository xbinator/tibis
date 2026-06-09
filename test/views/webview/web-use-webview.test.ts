/**
 * @file web-use-webview.test.ts
 * @description 验证 WebView 标签控制器行为。
 * @vitest-environment jsdom
 */
import type { WebviewTag } from 'electron';
import { ref } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { useWebView } from '@/views/webview/web/hooks/useWebView';

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
});
