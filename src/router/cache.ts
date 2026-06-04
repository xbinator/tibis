/**
 * @file cache.ts
 * @description 解析路由对应的标签页 ID 与 KeepAlive 缓存 key。
 */

import type { RouteLocationNormalizedLoaded } from 'vue-router';
import { isString } from 'lodash-es';
import type { RouteTabField } from '@/router/type';

/**
 * KeepAlive 包装组件名称前缀。
 */
const ROUTE_CACHE_NAME_PREFIX = 'RouteCache';

/**
 * 解析路由的默认标签页标题。
 * 优先使用 meta.title，其次使用路由名称，最后使用路由路径。
 * @param route - 当前路由
 * @returns 标签页标题
 */
function resolveRouteTitle(route: RouteLocationNormalizedLoaded): string {
  const metaTitle = route.meta?.title;
  if (isString(metaTitle)) return metaTitle;
  // 其次使用路由名称
  if (route.name) return String(route.name);
  // 最后使用路由路径
  return route.path;
}

/**
 * 解析路由标签页字段配置。
 * @param field - 标签页字段配置
 * @param route - 当前路由
 * @returns 字段解析结果，不存在时返回 undefined
 */
function resolveRouteTabField(field: RouteTabField | undefined, route: RouteLocationNormalizedLoaded): string | undefined {
  if (!field) {
    return undefined;
  }

  return isString(field) ? field : field(route);
}

/**
 * 解析路由对应的标签页 ID、KeepAlive 缓存 key 以及标签页标题。
 * @param route - 当前路由
 * @returns 包含 tabId、cacheKey 和 title 的对象
 */
export function resolveRouteTabInfo(route: RouteLocationNormalizedLoaded): { tabId: string; cacheKey: string; title: string } {
  const fallback = route.fullPath || route.path;
  const metaTab = route.meta?.tab;
  const tabId = resolveRouteTabField(metaTab?.id, route) || fallback;
  const cacheKey = resolveRouteTabField(metaTab?.cacheKey, route) || tabId;
  const title = resolveRouteTabField(metaTab?.title, route) || resolveRouteTitle(route);

  return { tabId, cacheKey, title };
}

/**
 * 计算字符串的稳定短哈希，降低规范化名称冲突概率。
 * @param value - 原始字符串
 * @returns base36 哈希值
 */
function hashString(value: string): string {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash.toString(36);
}

/**
 * 解析缓存 key 对应的 KeepAlive 包装组件名称。
 * Vue KeepAlive 的 include 使用组件 name 过滤，组件名称用于把业务 cacheKey 映射到 Vue 可裁剪的缓存条目。
 * @param cacheKey - 标签页缓存 key
 * @returns 稳定的组件名称
 */
export function resolveRouteCacheName(cacheKey: string): string {
  const normalized = encodeURIComponent(cacheKey)
    .replace(/%/g, '_')
    .replace(/[^A-Za-z0-9_]/g, '_');

  return `${ROUTE_CACHE_NAME_PREFIX}_${normalized}_${hashString(cacheKey)}`;
}
