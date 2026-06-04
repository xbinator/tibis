/**
 * @file webview.ts
 * @description 定义 WebView 页面路由与标签页标题元信息。
 */

import type { AppRouteRecordRaw } from '../../type';
import type { RouteLocationNormalizedLoaded } from 'vue-router';

/**
 * 从路由 query 中读取第一个字符串值。
 * @param value - Vue Router query 值
 * @returns 字符串 query 值，不存在时返回 undefined
 */
function normalizeQueryString(value: string | null | Array<string | null> | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value.find((item) => item !== null) ?? undefined;
  }

  return value ?? undefined;
}

/**
 * 解析 WebView 标签页标题。
 * @param route - 当前路由
 * @returns 解码后的目标 URL，不存在时返回 undefined
 */
function resolveWebviewTitle(route: RouteLocationNormalizedLoaded): string | undefined {
  const urlParam = normalizeQueryString(route.query.url);
  if (!urlParam) {
    return undefined;
  }

  try {
    return decodeURIComponent(urlParam);
  } catch {
    return urlParam;
  }
}

const routes: AppRouteRecordRaw[] = [
  {
    path: '/webview/native',
    name: 'webview-native',
    component: () => import('@/views/webview/native/index.vue'),
    meta: {
      title: '网页浏览',
      tab: {
        title: resolveWebviewTitle
      }
    }
  },
  {
    path: '/webview/web',
    name: 'webview-web',
    component: () => import('@/views/webview/web/index.vue'),
    meta: {
      title: '网页浏览',
      tab: {
        title: resolveWebviewTitle
      }
    }
  }
];

export default routes;
