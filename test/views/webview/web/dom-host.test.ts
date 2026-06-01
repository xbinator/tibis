/**
 * @file dom-host.test.ts
 * @description 验证 `<webview>` DOM 宿主管理逻辑。
 */
/**
 * @vitest-environment jsdom
 */

import { describe, expect, it } from 'vitest';
import {
  WEBVIEW_BORDER_RADIUS_PX,
  ensureHostedWebviewElement,
  ensureWebviewHostLayer,
  hideWebviewHostLayer,
  showWebviewHostLayer,
  WEBVIEW_HOST_LAYER_ID
} from '@/views/webview/web/utils/hosting';

describe('webview dom host', () => {
  it('creates the host layer once and reuses it', () => {
    const first = ensureWebviewHostLayer(document);
    const second = ensureWebviewHostLayer(document);

    expect(first.id).toBe(WEBVIEW_HOST_LAYER_ID);
    expect(second).toBe(first);
  });

  it('creates isolated host layers for different webview tabs', () => {
    const baiduLayer = ensureWebviewHostLayer(document, '/webview/web?url=https%3A%2F%2Fbaidu.com');
    const taobaoLayer = ensureWebviewHostLayer(document, '/webview/web?url=https%3A%2F%2Ftaobao.com');

    const baiduWebview = ensureHostedWebviewElement(baiduLayer);
    const taobaoWebview = ensureHostedWebviewElement(taobaoLayer);

    expect(taobaoLayer).not.toBe(baiduLayer);
    expect(taobaoWebview).not.toBe(baiduWebview);
    expect(baiduLayer.childElementCount).toBe(1);
    expect(taobaoLayer.childElementCount).toBe(1);
  });

  it('reuses the same hosted webview element inside one tab layer', () => {
    const hostLayer = ensureWebviewHostLayer(document, '/webview/web?url=https%3A%2F%2Fbaidu.com');

    const first = ensureHostedWebviewElement(hostLayer);
    const second = ensureHostedWebviewElement(hostLayer);

    expect(second).toBe(first);
    expect(hostLayer.childElementCount).toBe(1);
    expect(hostLayer.style.flexDirection).toBe('column');
    expect(hostLayer.style.alignItems).toBe('stretch');
    expect(hostLayer.style.borderRadius).toBe(`${WEBVIEW_BORDER_RADIUS_PX}px`);
    expect(first.style.display).toBe('flex');
    expect(first.style.borderRadius).toBe(`${WEBVIEW_BORDER_RADIUS_PX}px`);
  });

  it('normalizes cached host and webview styles when reusing existing elements', () => {
    const hostLayer = ensureWebviewHostLayer(document, '/webview/web?url=https%3A%2F%2Fold-style.com');
    const webviewElement = ensureHostedWebviewElement(hostLayer);
    hostLayer.style.flexDirection = '';
    hostLayer.style.alignItems = '';
    webviewElement.style.display = 'block';
    webviewElement.style.flex = '';
    webviewElement.style.minHeight = '';

    const reusedHostLayer = ensureWebviewHostLayer(document, '/webview/web?url=https%3A%2F%2Fold-style.com');
    const reusedWebviewElement = ensureHostedWebviewElement(reusedHostLayer);

    expect(reusedHostLayer.style.flexDirection).toBe('column');
    expect(reusedHostLayer.style.alignItems).toBe('stretch');
    expect(reusedWebviewElement.style.display).toBe('flex');
    expect(reusedWebviewElement.style.flex).toBe('1 1 auto');
    expect(reusedWebviewElement.style.minHeight).toBe('0px');
  });

  it('shows and hides the host layer without removing the webview child', () => {
    const hostLayer = ensureWebviewHostLayer(document);
    const webviewElement = ensureHostedWebviewElement(hostLayer);

    showWebviewHostLayer(hostLayer, { x: 10, y: 20, width: 300, height: 200 });
    expect(hostLayer.style.display).toBe('flex');
    expect(hostLayer.style.left).toBe('10px');
    expect(hostLayer.style.top).toBe('20px');
    expect(hostLayer.style.width).toBe('300px');
    expect(hostLayer.style.height).toBe('200px');
    expect(webviewElement.style.flex).toBe('1 1 auto');
    expect(webviewElement.style.minHeight).toBe('0px');

    hideWebviewHostLayer(hostLayer);
    expect(hostLayer.style.display).toBe('none');
    expect(hostLayer.childElementCount).toBe(1);
  });

  it('hides inactive webview tab layers when showing the active one', () => {
    const baiduLayer = ensureWebviewHostLayer(document, '/webview/web?url=https%3A%2F%2Fbaidu.com');
    const taobaoLayer = ensureWebviewHostLayer(document, '/webview/web?url=https%3A%2F%2Ftaobao.com');

    showWebviewHostLayer(baiduLayer, { x: 0, y: 0, width: 300, height: 200 });
    showWebviewHostLayer(taobaoLayer, { x: 0, y: 0, width: 300, height: 200 });

    expect(baiduLayer.style.display).toBe('none');
    expect(taobaoLayer.style.display).toBe('flex');

    showWebviewHostLayer(baiduLayer, { x: 0, y: 0, width: 300, height: 200 });

    expect(baiduLayer.style.display).toBe('flex');
    expect(taobaoLayer.style.display).toBe('none');
  });
});
