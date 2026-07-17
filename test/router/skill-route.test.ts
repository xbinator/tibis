/**
 * @file skill-route.test.ts
 * @description 验证 Skill 详情页面的路由标签配置。
 */
import type { RouteLocationNormalizedLoaded } from 'vue-router';
import { describe, expect, it } from 'vitest';
import { resolveRouteTabInfo } from '@/router/cache';
import routes from '@/router/routes/modules/skill';

describe('skill route', (): void => {
  it('creates an independent tab for each skill detail page', (): void => {
    const skillRoute = routes.find((route): boolean => route.name === 'skill');
    const route = {
      fullPath: '/skill/weather',
      path: '/skill/weather',
      name: 'skill',
      params: { name: 'weather' },
      meta: skillRoute?.meta ?? {}
    } as unknown as RouteLocationNormalizedLoaded;

    expect(skillRoute?.meta?.hideTab).toBeUndefined();
    expect(resolveRouteTabInfo(route)).toMatchObject({
      tabId: 'skill:weather',
      cacheKey: 'skill:weather',
      title: 'weather',
      icon: 'lucide:hammer'
    });
  });
});
