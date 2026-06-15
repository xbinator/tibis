/**
 * @file drawing-route.test.ts
 * @description 验证文件化画图页面路由注册。
 */
import type { RouteLocationNormalizedLoaded } from 'vue-router';
import { describe, expect, it } from 'vitest';
import routes from '@/router/routes/modules/drawing';

describe('drawing route', (): void => {
  it('registers a parameterized drawing file route', (): void => {
    const drawingRoute = routes[0];
    const route = {
      params: {
        id: 'drawing-1'
      }
    } as unknown as RouteLocationNormalizedLoaded;
    const tabId = drawingRoute?.meta?.tab?.id;
    const cacheKey = drawingRoute?.meta?.tab?.cacheKey;

    expect(drawingRoute).toBeTruthy();
    expect(drawingRoute?.path).toBe('drawing/:id?');
    expect(drawingRoute?.name).toBe('drawing');
    expect(drawingRoute?.meta?.hideTab).toBe(true);
    expect(typeof tabId).toBe('function');
    expect(typeof cacheKey).toBe('function');
    expect(typeof tabId === 'function' ? tabId(route) : '').toBe('drawing-1');
    expect(typeof cacheKey === 'function' ? cacheKey(route) : '').toBe('drawing:drawing-1');
  });
});
