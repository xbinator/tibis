/**
 * @file useTagWebView.test.ts
 * @description 验证 `<webview>` 页面状态收敛逻辑。
 */

import { ref } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { useTagWebView } from '@/views/webview/web/hooks/useWebView';

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

  it('stores selected element details from console messages', async () => {
    const selectedElement = {
      tagName: 'A',
      id: 'read-more',
      className: 'link primary',
      text: 'Read more',
      selector: 'a#read-more.link.primary',
      attributes: [
        { name: 'id', value: 'read-more' },
        { name: 'class', value: 'link primary' }
      ],
      ancestors: [{ tagName: 'BODY', selector: 'body' }],
      computedStyles: {
        display: 'inline',
        color: 'rgb(0, 0, 0)'
      },
      rect: {
        x: 10,
        y: 20,
        width: 120,
        height: 32
      }
    };
    const executeJavaScript = vi.fn<(script: string) => Promise<null>>().mockResolvedValue(null);
    const instance = {
      executeJavaScript,
      canGoBack: () => false,
      canGoForward: () => false
    } as unknown as Electron.WebviewTag;

    const hook = useTagWebView(ref(instance));

    await hook.startElementSelection({
      color: '#ff3366',
      background: 'rgba(255,51,102,.12)'
    });

    expect(executeJavaScript).toHaveBeenCalledTimes(1);
    expect(executeJavaScript.mock.calls[0]?.[0]).toContain('Tibis WebView selected element');
    expect(executeJavaScript.mock.calls[0]?.[0]).toContain('__TIBIS_ELEMENT_PICKER_SELECTION__');
    expect(executeJavaScript.mock.calls[0]?.[0]).toContain('getComputedStyle');
    expect(executeJavaScript.mock.calls[0]?.[0]).toContain('border:2px solid #ff3366;');
    expect(executeJavaScript.mock.calls[0]?.[0]).toContain('background:rgba(255,51,102,.12);');
    expect(hook.state.value.isElementSelecting).toBe(false);

    hook.handleConsoleMessage({
      message: `__TIBIS_ELEMENT_PICKER_SELECTION__${JSON.stringify(selectedElement)}`
    });

    expect(hook.selectedElementRef.value).toEqual(selectedElement);
  });

  it('keeps element picker mode active after selecting one element', async () => {
    const executeJavaScript = vi.fn<(script: string) => Promise<null>>().mockResolvedValue(null);
    const instance = {
      executeJavaScript,
      canGoBack: () => false,
      canGoForward: () => false
    } as unknown as Electron.WebviewTag;

    const hook = useTagWebView(ref(instance));

    await hook.startElementSelection();

    const script = executeJavaScript.mock.calls[0]?.[0] ?? '';

    expect(script).toContain('selectedHighlight');
    expect(script).toContain('syncSelectedHighlight(target);');
    expect(script).not.toContain('resolve(selectedElement);');
    expect(script).not.toContain('box-shadow');
  });

  it('keeps picker highlight aligned when the selected page scrolls', async () => {
    const executeJavaScript = vi.fn<(script: string) => Promise<null>>().mockResolvedValue(null);
    const instance = {
      executeJavaScript,
      canGoBack: () => false,
      canGoForward: () => false
    } as unknown as Electron.WebviewTag;

    const hook = useTagWebView(ref(instance));

    await hook.startElementSelection();

    const script = executeJavaScript.mock.calls[0]?.[0] ?? '';

    expect(script).toContain('let activeHoverElement = null;');
    expect(script).toContain('function syncHighlight(element)');
    expect(script).toContain('function handleScrollOrResize()');
    expect(script).toContain("window.addEventListener('scroll', handleScrollOrResize, true);");
    expect(script).toContain("window.removeEventListener('scroll', handleScrollOrResize, true);");
    expect(script).toContain("window.addEventListener('resize', handleScrollOrResize, true);");
    expect(script).toContain("window.removeEventListener('resize', handleScrollOrResize, true);");
  });

  it('resets stale element picker state when the page starts loading again', async () => {
    const executeJavaScript = vi.fn<(script: string) => Promise<null>>().mockReturnValue(
      new Promise<null>(() => {
        // 保持 executeJavaScript 挂起，用于模拟页面选择器脚本在页面内持续运行。
      })
    );
    const instance = {
      executeJavaScript,
      canGoBack: () => false,
      canGoForward: () => false
    } as unknown as Electron.WebviewTag;

    const hook = useTagWebView(ref(instance));

    const selectionPromise = hook.startElementSelection();
    expect(hook.state.value.isElementSelecting).toBe(true);
    expect(selectionPromise).toBeInstanceOf(Promise);

    hook.handleDidStartLoading();

    expect(hook.state.value.isElementSelecting).toBe(false);
  });

  it('hides the element picker highlight when the pointer leaves the page container', async () => {
    const executeJavaScript = vi.fn<(script: string) => Promise<null>>().mockResolvedValue(null);
    const instance = {
      executeJavaScript,
      canGoBack: () => false,
      canGoForward: () => false
    } as unknown as Electron.WebviewTag;

    const hook = useTagWebView(ref(instance));

    await hook.startElementSelection();

    const script = executeJavaScript.mock.calls[0]?.[0] ?? '';

    expect(script).toContain('function handleMouseOut(event)');
    expect(script).toContain('highlight.hidden = true;');
    expect(script).toContain("document.addEventListener('mouseout', handleMouseOut, true);");
    expect(script).toContain("document.removeEventListener('mouseout', handleMouseOut, true);");
  });

  it('ignores plain browser events when parsing element picker messages', () => {
    const instance = {
      canGoBack: () => false,
      canGoForward: () => false
    } as unknown as Electron.WebviewTag;
    const hook = useTagWebView(ref(instance));

    hook.handleConsoleMessage(new Event('console-message'));

    expect(hook.selectedElementRef.value).toBeNull();
  });

  it('keeps private-use icon glyphs separately from selected element text', () => {
    const instance = {
      canGoBack: () => false,
      canGoForward: () => false
    } as unknown as Electron.WebviewTag;
    const hook = useTagWebView(ref(instance));

    hook.handleConsoleMessage({
      message: `__TIBIS_ELEMENT_PICKER_SELECTION__${JSON.stringify({
        tagName: 'I',
        id: '',
        className: 'iconfont',
        text: '',
        selector: 'i.iconfont',
        attributes: [{ name: 'class', value: 'iconfont' }],
        ancestors: [{ tagName: 'BUTTON', selector: 'button.search' }],
        computedStyles: { display: 'inline-block' },
        rect: { x: 0, y: 0, width: 16, height: 16 }
      })}`
    });

    expect(hook.selectedElementRef.value?.text).toBe('');
    expect(hook.selectedElementRef.value?.glyph).toBe('');
  });

  it('injects touch simulation when touch mode is enabled', async () => {
    const executeJavaScript = vi.fn<(script: string) => Promise<null>>().mockResolvedValue(null);
    const instance = {
      executeJavaScript,
      canGoBack: () => false,
      canGoForward: () => false
    } as unknown as Electron.WebviewTag;

    const hook = useTagWebView(ref(instance));

    await hook.setTouchSimulationEnabled(true);

    expect(hook.state.value.isTouchSimulationEnabled).toBe(true);
    expect(executeJavaScript).toHaveBeenCalledTimes(1);
    expect(executeJavaScript.mock.calls[0]?.[0]).toContain('__tibisTouchSimulationCleanup');
    expect(executeJavaScript.mock.calls[0]?.[0]).toContain('touchstart');
  });

  it('sets and clears the hosted webview user agent', () => {
    const setUserAgent = vi.fn();
    const removeAttribute = vi.fn();
    const setAttribute = vi.fn();
    const instance = {
      setUserAgent,
      removeAttribute,
      setAttribute,
      canGoBack: () => false,
      canGoForward: () => false
    } as unknown as Electron.WebviewTag;

    const hook = useTagWebView(ref(instance));

    hook.setUserAgent('Mozilla/5.0 iPhone');
    hook.setUserAgent('');
    hook.handleDomReady();
    hook.setUserAgent('Mozilla/5.0 Desktop');

    expect(setAttribute).toHaveBeenCalledWith('useragent', 'Mozilla/5.0 iPhone');
    expect(removeAttribute).toHaveBeenCalledWith('useragent');
    expect(setUserAgent).toHaveBeenCalledWith('Mozilla/5.0 Desktop');
  });
});
