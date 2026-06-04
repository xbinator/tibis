/**
 * @file webview-routes.test.ts
 * @description 验证 WebView 双实现路由定义。
 */

import type { RouteLocationNormalizedLoaded } from 'vue-router';
import { describe, expect, it } from 'vitest';
import { resolveRouteTabInfo } from '@/router/cache';
import routes from '@/router/routes/modules/webview';

describe('webview routes', () => {
  it('registers explicit native and web routes', () => {
    const paths = routes.map((route) => route.path);

    expect(paths).toContain('/webview/native');
    expect(paths).toContain('/webview/web');
  });

  it('configures webview tab titles through route meta', () => {
    const webRoute = routes.find((route) => route.name === 'webview-web');

    expect(
      resolveRouteTabInfo({
        fullPath: '/webview/web?url=https%3A%2F%2Fexample.com',
        path: '/webview/web',
        name: 'webview-web',
        params: {},
        query: { url: 'https%3A%2F%2Fexample.com' },
        hash: '',
        matched: [],
        meta: webRoute?.meta ?? {},
        redirectedFrom: undefined
      } as unknown as RouteLocationNormalizedLoaded)
    ).toEqual({
      tabId: '/webview/web?url=https%3A%2F%2Fexample.com',
      cacheKey: '/webview/web?url=https%3A%2F%2Fexample.com',
      title: 'https://example.com'
    });
  });
});
