import { describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import {
  WEBVIEW_PAGE_SNAPSHOT_TIMEOUT_MS,
  isWebviewPageSnapshot,
  normalizeWebviewPageReadError,
  normalizeWebviewPageSnapshot,
  useWebView,
  withWebviewPageReadTimeout
} from '@/views/webview/web/hooks/useWebView';

/**
 * 创建测试用 WebView 引用。
 * @param executeJavaScript - 页面脚本执行函数
 * @returns WebView 引用
 */
function createWebviewRef(executeJavaScript: () => Promise<unknown>) {
  return ref({
    canGoBack: () => false,
    canGoForward: () => false,
    executeJavaScript
  } as unknown as Electron.WebviewTag);
}

describe('webview page snapshot helpers', () => {
  it('normalizes and marks truncated fields separately', () => {
    const value = normalizeWebviewPageSnapshot({
      url: 'https://example.com',
      title: 'Example',
      text: 'a'.repeat(20001),
      selectedText: 'b'.repeat(4001),
      headings: Array.from({ length: 121 }, (_, index) => ({ level: 1, text: `Heading ${index}` })),
      links: Array.from({ length: 101 }, (_, index) => ({ text: `Link ${index}`, href: `https://example.com/${index}` }))
    });

    expect(value.text).toHaveLength(20000);
    expect(value.selectedText).toHaveLength(4000);
    expect(value.headings).toHaveLength(120);
    expect(value.links).toHaveLength(100);
    expect(value.truncated).toEqual({
      text: true,
      headings: true,
      links: true,
      selectedText: true
    });
  });

  it('rejects invalid snapshot values', () => {
    expect(isWebviewPageSnapshot({ url: 1 })).toBe(false);
    expect(isWebviewPageSnapshot({ url: 'https://example.com', title: 'x', text: 'x', selectedText: '', headings: [], links: [] })).toBe(true);
  });

  it('times out slow page reads', async () => {
    vi.useFakeTimers();
    const promise = withWebviewPageReadTimeout(new Promise<string>(() => undefined));
    const assertion = expect(promise).rejects.toThrow('页面读取超时');

    await vi.advanceTimersByTimeAsync(WEBVIEW_PAGE_SNAPSHOT_TIMEOUT_MS);

    await assertion;
    vi.useRealTimers();
  });

  it('normalizes CSP-like page read errors', () => {
    const error = normalizeWebviewPageReadError(new Error("Refused to execute inline script because it violates Content Security Policy script-src 'none'"));

    expect(error.message).toBe('页面安全策略阻止读取当前网页内容');
  });

  it('does not execute JavaScript while page is loading', async () => {
    const executeJavaScript = vi.fn(async () => ({}));
    const webview = useWebView(createWebviewRef(executeJavaScript));

    webview.handleDidStartLoading();

    await expect(webview.readPageSnapshot()).rejects.toThrow('当前页面正在导航');
    expect(executeJavaScript).not.toHaveBeenCalled();
  });

  it('reuses the same pending read promise for concurrent calls', async () => {
    let resolveRead: (value: unknown) => void = () => undefined;
    const executeJavaScript = vi.fn(
      () =>
        new Promise<unknown>((resolve) => {
          resolveRead = resolve;
        })
    );
    const webview = useWebView(createWebviewRef(executeJavaScript));

    const firstRead = webview.readPageSnapshot();
    const secondRead = webview.readPageSnapshot();

    resolveRead({
      url: 'https://example.com',
      title: 'Example',
      text: 'Visible text',
      selectedText: '',
      headings: [],
      links: []
    });

    await expect(firstRead).resolves.toMatchObject({ url: 'https://example.com' });
    await expect(secondRead).resolves.toMatchObject({ url: 'https://example.com' });
    expect(executeJavaScript).toHaveBeenCalledTimes(1);
  });
});
