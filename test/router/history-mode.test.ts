/**
 * @file history-mode.test.ts
 * @description 验证桌面应用路由使用适配 file:// 入口的 Hash History。
 */

import { describe, expect, it, vi } from 'vitest';

/**
 * Vue Router 创建参数的最小测试结构。
 */
interface RouterCreateOptions {
  /** 路由历史实现。 */
  history: unknown;
  /** 路由表。 */
  routes: unknown[];
  /** 是否启用严格匹配。 */
  strict?: boolean;
  /** 滚动行为回调。 */
  scrollBehavior?: unknown;
}

const routerMocks = vi.hoisted(() => {
  const hashHistory = { mode: 'hash' };
  const webHistory = { mode: 'web' };

  return {
    hashHistory,
    webHistory,
    createRouter: vi.fn((options: RouterCreateOptions) => ({
      options,
      afterEach: vi.fn()
    })),
    createWebHashHistory: vi.fn(() => hashHistory),
    createWebHistory: vi.fn(() => webHistory)
  };
});

vi.mock('vue-router', () => ({
  createRouter: routerMocks.createRouter,
  createWebHashHistory: routerMocks.createWebHashHistory,
  createWebHistory: routerMocks.createWebHistory,
  RouterView: { name: 'RouterView' }
}));

vi.mock('@/router/routes', () => ({
  basicRoutes: []
}));

describe('router history mode', () => {
  it('uses hash history so Electron file:// entry keeps resolving index.html', async () => {
    await import('@/router');

    expect(routerMocks.createWebHashHistory).toHaveBeenCalledTimes(1);
    expect(routerMocks.createWebHistory).not.toHaveBeenCalled();
    expect(routerMocks.createRouter).toHaveBeenCalledWith(expect.objectContaining({ history: routerMocks.hashHistory }));
  });
});
