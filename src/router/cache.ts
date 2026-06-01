/**
 * @file cache.ts
 * @description 解析路由对应的标签页 ID 与 KeepAlive 缓存 key。
 */

import type { RouteLocationNormalizedLoaded } from 'vue-router';

/**
 * KeepAlive 包装组件名称前缀。
 */
const ROUTE_CACHE_NAME_PREFIX = 'RouteCache';

/**
 * 单例标签页路由配置。
 * 匹配此配置的路由在标签栏中只显示一个标签，无论子路径如何变化。
 */
export interface SingletonTabConfig {
  /** 路由路径前缀，用于匹配 */
  pathPrefix: string;
  /** 固定的标签页 ID */
  tabId: string;
  /** 固定的缓存 key */
  cacheKey: string;
  /** 固定的标签页标题 */
  title: string;
}

/**
 * 单例标签页路由配置列表。
 * 所有需要单例标签页行为的路由在此集中定义，
 * 避免路径、标题、ID 等信息分散在多个文件中。
 */
const SINGLETON_TAB_CONFIGS: SingletonTabConfig[] = [
  {
    pathPrefix: '/settings',
    tabId: 'settings',
    cacheKey: 'settings',
    title: '设置'
  }
];

/**
 * 根据路径查找匹配的单例标签页配置。
 * @param path - 路由路径
 * @returns 匹配的单例标签页配置，未匹配时返回 undefined
 */
export function findSingletonTabConfig(path: string): SingletonTabConfig | undefined {
  return SINGLETON_TAB_CONFIGS.find((config) => path === config.pathPrefix || path.startsWith(`${config.pathPrefix}/`));
}

/**
 * 将路由参数值规范为单个字符串。
 * @param value - Vue Router 参数值
 * @returns 参数字符串，不存在时返回空字符串
 */
function normalizeRouteParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

/**
 * 判断是否为编辑器路由。
 * @param route - 当前路由
 * @returns 是否为编辑器页面
 */
function isEditorRoute(route: RouteLocationNormalizedLoaded): boolean {
  return route.name === 'editor' || route.path.startsWith('/editor/');
}

/**
 * 解析 webview 路由的标签页标题。
 * 优先使用 query.url 解码后的目标 URL，解码失败或不存在时返回 undefined。
 * @param route - 当前路由
 * @returns 标签页标题，非 webview 路由返回 undefined
 */
function resolveWebviewTitle(route: RouteLocationNormalizedLoaded): string | undefined {
  if (route.name !== 'webview-web' && route.name !== 'webview-native') {
    return undefined;
  }

  const urlParam = route.query.url as string | undefined;
  if (!urlParam) {
    return undefined;
  }

  try {
    return decodeURIComponent(urlParam);
  } catch {
    return urlParam;
  }
}

/**
 * 解析路由对应的标签页 ID、KeepAlive 缓存 key 以及标签页标题。
 * @param route - 当前路由
 * @returns 包含 tabId、cacheKey 和 title 的对象
 */
export function resolveRouteTabInfo(route: RouteLocationNormalizedLoaded): { tabId: string; cacheKey: string; title: string } {
  const webviewTitle = resolveWebviewTitle(route);
  if (webviewTitle) {
    const fallback = route.fullPath || route.path;

    return { tabId: fallback, cacheKey: fallback, title: webviewTitle };
  }

  if (isEditorRoute(route)) {
    const editorId = normalizeRouteParam(route.params.id);
    const fallback = route.fullPath || route.path;

    return {
      tabId: editorId || fallback,
      cacheKey: editorId ? `editor:${editorId}` : fallback,
      title: (route.meta?.title || route.name || route.path) as string
    };
  }

  const singletonConfig = findSingletonTabConfig(route.path);
  if (singletonConfig) {
    return { tabId: singletonConfig.tabId, cacheKey: singletonConfig.cacheKey, title: singletonConfig.title };
  }

  const fallback = route.fullPath || route.path;

  return { tabId: fallback, cacheKey: fallback, title: (route.meta?.title || route.name || route.path) as string };
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
