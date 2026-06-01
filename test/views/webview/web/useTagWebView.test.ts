/**
 * @file useTagWebView.test.ts
 * @description 验证 `<webview>` 页面状态收敛逻辑。
 */

import { ref } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { useTagWebView } from '@/views/webview/web/hooks/useTagWebView';

describe('useTagWebView', () => {
  it('loads the initial url only once for the same webview instance', () => {
    const setAttribute = vi.fn();
    const instance = {
      setAttribute,
      canGoBack: () => false,
      canGoForward: () => false
    } as unknown as Electron.WebviewTag;

    const webviewRef = ref<Electron.WebviewTag | null>(instance);
    const hook = useTagWebView(webviewRef);

    hook.attachInitialUrl('https://example.com');
    hook.attachInitialUrl('https://example.com');

    expect(setAttribute).toHaveBeenCalledTimes(1);
    expect(setAttribute).toHaveBeenCalledWith('src', 'https://example.com');
  });

  it('falls back to setting src before dom-ready and uses loadURL after dom-ready', () => {
    const setAttribute = vi.fn();
    const loadURL = vi.fn();
    const instance = {
      setAttribute,
      loadURL,
      canGoBack: () => false,
      canGoForward: () => false
    } as unknown as Electron.WebviewTag;

    const hook = useTagWebView(ref(instance));

    hook.navigate('https://before-ready.example');
    hook.handleDomReady();
    hook.navigate('https://after-ready.example');

    expect(setAttribute).toHaveBeenCalledWith('src', 'https://before-ready.example');
    expect(loadURL).toHaveBeenCalledWith('https://after-ready.example');
  });

  it('maps webview DOM events into shared state', () => {
    const instance = {
      canGoBack: () => true,
      canGoForward: () => false
    } as unknown as Electron.WebviewTag;

    const hook = useTagWebView(ref(instance));

    hook.handleDidStartLoading();
    hook.handleDomReady();
    hook.handleDidNavigate({ url: 'https://example.com' } as Electron.DidNavigateEvent);
    hook.handleTitleUpdated({ title: 'Example Domain' } as Electron.PageTitleUpdatedEvent);
    hook.handleDidStopLoading();

    expect(hook.state.value.isLoading).toBe(false);
    expect(hook.state.value.loadProgress).toBe(1);
    expect(hook.state.value.url).toBe('https://example.com');
    expect(hook.state.value.title).toBe('Example Domain');
    expect(hook.state.value.canGoBack).toBe(true);
    expect(hook.state.value.canGoForward).toBe(false);
  });

  it('logs selected element details after starting element picker mode', async () => {
    const selectedElement = {
      tagName: 'A',
      id: 'read-more',
      className: 'link primary',
      text: 'Read more',
      selector: 'a#read-more.link.primary',
      rect: {
        x: 10,
        y: 20,
        width: 120,
        height: 32
      }
    };
    const executeJavaScript = vi.fn<(script: string) => Promise<typeof selectedElement>>().mockResolvedValue(selectedElement);
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const instance = {
      executeJavaScript,
      canGoBack: () => false,
      canGoForward: () => false
    } as unknown as Electron.WebviewTag;

    const hook = useTagWebView(ref(instance));

    await hook.startElementSelection();

    expect(executeJavaScript).toHaveBeenCalledTimes(1);
    expect(executeJavaScript.mock.calls[0]?.[0]).toContain('Tibis WebView selected element');
    expect(consoleLog).toHaveBeenCalledWith('[WebView Element Picker]', selectedElement);
    expect(hook.state.value.isElementSelecting).toBe(false);

    consoleLog.mockRestore();
  });
});
