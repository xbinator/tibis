/**
 * @file drawing-route.test.ts
 * @description 验证独立画图页面路由注册。
 */
import { describe, expect, it } from 'vitest';
import routes from '@/router/routes/modules/drawing';

describe('drawing route', (): void => {
  it('registers an independent drawing page route', (): void => {
    const drawingRoute = routes[0];

    expect(drawingRoute).toBeTruthy();
    expect(drawingRoute?.path).toBe('drawing');
    expect(drawingRoute?.name).toBe('drawing');
    expect(drawingRoute?.meta?.title).toBe('画图 (Beta)');
    expect(drawingRoute?.meta?.tab?.id).toBe('drawing');
  });
});
