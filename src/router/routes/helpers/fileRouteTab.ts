/**
 * @file fileRouteTab.ts
 * @description 提供文件型路由的标签页 ID 与缓存 key 解析工具。
 */
import type { RouteTabMeta } from '../../type';
import type { RouteLocationNormalizedLoaded } from 'vue-router';

/**
 * 将路由参数值规范为单个字符串。
 * @param value - Vue Router 参数值
 * @returns 参数字符串，不存在时返回 undefined
 */
export function normalizeRouteParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * 解析文件型路由的标签页 ID。
 * @param route - 当前路由
 * @returns 文件 ID，不存在时返回 undefined
 */
function resolveFileRouteTabId(route: RouteLocationNormalizedLoaded): string | undefined {
  return normalizeRouteParam(route.params.id);
}

/**
 * 创建文件型路由的标签页元信息。
 * @param cacheKeyPrefix - KeepAlive 缓存 key 前缀
 * @returns 路由标签页元信息
 */
export function createFileRouteTabMeta(cacheKeyPrefix: string): RouteTabMeta {
  return {
    id: resolveFileRouteTabId,
    cacheKey: (route: RouteLocationNormalizedLoaded): string | undefined => {
      const fileId = resolveFileRouteTabId(route);

      return fileId ? `${cacheKeyPrefix}:${fileId}` : undefined;
    }
  };
}
