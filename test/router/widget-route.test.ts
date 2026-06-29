/**
 * @file widget-route.test.ts
 * @description 验证文件化小组件页面路由注册。
 */
import type { RouteLocationNormalizedLoaded } from 'vue-router';
import { describe, expect, it } from 'vitest';
import routes from '@/router/routes/modules/widget';

describe('widget route', (): void => {
  it('registers a parameterized widget file route', (): void => {
    const widgetRoute = routes[0];
    const route = {
      params: {
        id: 'widget-1'
      }
    } as unknown as RouteLocationNormalizedLoaded;
    const tabId = widgetRoute?.meta?.tab?.id;
    const cacheKey = widgetRoute?.meta?.tab?.cacheKey;

    expect(widgetRoute).toBeTruthy();
    expect(widgetRoute?.path).toBe('widget/:id?');
    expect(widgetRoute?.name).toBe('widget');
    expect(widgetRoute?.meta?.hideTab).toBe(true);
    expect(typeof tabId).toBe('function');
    expect(typeof cacheKey).toBe('function');
    expect(typeof tabId === 'function' ? tabId(route) : '').toBe('widget-1');
    expect(typeof cacheKey === 'function' ? cacheKey(route) : '').toBe('widget:widget-1');
  });
});
