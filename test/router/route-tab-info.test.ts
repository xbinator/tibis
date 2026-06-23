/**
 * @file route-tab-info.test.ts
 * @description 路由标签页元信息解析测试。
 */
import type { RouteLocationNormalizedLoaded } from 'vue-router';
import { describe, expect, it } from 'vitest';
import { resolveRouteTabInfo } from '@/router/cache';

describe('resolveRouteTabInfo', (): void => {
  it('resolves the configured tab icon from route meta', (): void => {
    const route = {
      fullPath: '/settings/provider',
      path: '/settings/provider',
      name: 'Settings',
      meta: {
        title: '设置',
        tab: {
          id: 'settings',
          cacheKey: 'settings',
          title: '设置',
          icon: 'lucide:settings'
        }
      }
    } as unknown as RouteLocationNormalizedLoaded;

    expect(resolveRouteTabInfo(route)).toMatchObject({
      tabId: 'settings',
      cacheKey: 'settings',
      title: '设置',
      icon: 'lucide:settings'
    });
  });
});
