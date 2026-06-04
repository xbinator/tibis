/**
 * @file cache.test.ts
 * @description 验证路由标签页 ID 与 KeepAlive 缓存 key 的解析规则。
 */

import type { RouteLocationNormalizedLoaded } from 'vue-router';
import { describe, expect, it } from 'vitest';
import { resolveRouteCacheName, resolveRouteTabInfo } from '@/router/cache';

/**
 * 创建测试用的路由对象。
 * @param overrides - 需要覆盖的路由字段
 * @returns 标准化后的测试路由
 */
function createRoute(overrides: Partial<RouteLocationNormalizedLoaded>): RouteLocationNormalizedLoaded {
  return {
    fullPath: '/fallback',
    path: '/fallback',
    name: undefined,
    params: {},
    query: {},
    hash: '',
    matched: [],
    meta: {},
    redirectedFrom: undefined,
    ...overrides
  } as RouteLocationNormalizedLoaded;
}

describe('route cache helpers', () => {
  it('uses meta tab config for ordinary routes without route-specific branches', () => {
    const route = createRoute({
      path: '/workspace/files',
      fullPath: '/workspace/files?folder=recent',
      name: 'workspace-files',
      meta: {
        title: '最近文件',
        tab: {
          id: 'workspace',
          cacheKey: 'workspace',
          title: '工作区'
        }
      }
    });

    expect(resolveRouteTabInfo(route)).toEqual({
      tabId: 'workspace',
      cacheKey: 'workspace',
      title: '工作区'
    });
  });

  it('uses meta tab resolver values before the fallback route identity', () => {
    const route = createRoute({
      path: '/editor/file_1',
      fullPath: '/editor/file_1',
      name: 'editor',
      params: { id: 'file_1' },
      meta: {
        title: '编辑器',
        tab: {
          id: (currentRoute: RouteLocationNormalizedLoaded): string => String(currentRoute.params.id),
          cacheKey: (currentRoute: RouteLocationNormalizedLoaded): string => `editor:${String(currentRoute.params.id)}`
        }
      }
    });

    expect(resolveRouteTabInfo(route)).toEqual({
      tabId: 'file_1',
      cacheKey: 'editor:file_1',
      title: '编辑器'
    });
  });

  it('uses static meta tab values to group nested pages into one tab', () => {
    const route = createRoute({
      path: '/settings/provider/openai',
      fullPath: '/settings/provider/openai',
      name: 'provider-detail',
      meta: {
        title: '服务商配置',
        tab: {
          id: 'settings',
          cacheKey: 'settings',
          title: '设置'
        }
      }
    });

    expect(resolveRouteTabInfo(route)).toEqual({
      tabId: 'settings',
      cacheKey: 'settings',
      title: '设置'
    });
  });

  it('uses meta title resolver values for dynamic route titles', () => {
    const route = createRoute({
      path: '/webview/web',
      fullPath: '/webview/web?url=https%3A%2F%2Fexample.com',
      name: 'webview-web',
      query: { url: 'https%3A%2F%2Fexample.com' },
      meta: {
        title: '网页浏览',
        tab: {
          title: (currentRoute: RouteLocationNormalizedLoaded): string | undefined => {
            const urlParam = currentRoute.query.url;
            return typeof urlParam === 'string' ? decodeURIComponent(urlParam) : undefined;
          }
        }
      }
    });

    expect(resolveRouteTabInfo(route)).toEqual({
      tabId: '/webview/web?url=https%3A%2F%2Fexample.com',
      cacheKey: '/webview/web?url=https%3A%2F%2Fexample.com',
      title: 'https://example.com'
    });
  });

  it('falls back to fullPath for ordinary routes', () => {
    const route = createRoute({ path: '/welcome', fullPath: '/welcome?from=boot', name: 'welcome' });

    expect(resolveRouteTabInfo(route)).toEqual({
      tabId: '/welcome?from=boot',
      cacheKey: '/welcome?from=boot',
      title: 'welcome'
    });
  });

  it('creates stable component names from cache keys', () => {
    expect(resolveRouteCacheName('editor:file_1')).toBe(resolveRouteCacheName('editor:file_1'));
    expect(resolveRouteCacheName('editor:file_1')).not.toBe(resolveRouteCacheName('editor:file_2'));
    expect(resolveRouteCacheName('/settings/provider?tab=models')).toMatch(/^RouteCache_[A-Za-z0-9_]+$/);
  });
});
