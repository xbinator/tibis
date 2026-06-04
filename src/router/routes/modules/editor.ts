/**
 * @file editor.ts
 * @description 定义编辑器页面路由与标签页缓存元信息。
 */

import type { AppRouteRecordRaw } from '../../type';
import type { RouteLocationNormalizedLoaded } from 'vue-router';
import { customAlphabet } from 'nanoid';

const nanoid = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz_', 8);

/**
 * 将路由参数值规范为单个字符串。
 * @param value - Vue Router 参数值
 * @returns 参数字符串，不存在时返回 undefined
 */
function normalizeRouteParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * 解析编辑器标签页 ID。
 * @param route - 当前路由
 * @returns 编辑器文件 ID，不存在时返回 undefined
 */
function resolveEditorTabId(route: RouteLocationNormalizedLoaded): string | undefined {
  return normalizeRouteParam(route.params.id);
}

/**
 * 解析编辑器 KeepAlive 缓存 key。
 * @param route - 当前路由
 * @returns 编辑器缓存 key，不存在时返回 undefined
 */
function resolveEditorCacheKey(route: RouteLocationNormalizedLoaded): string | undefined {
  const editorId = resolveEditorTabId(route);

  return editorId ? `editor:${editorId}` : undefined;
}

const routes: AppRouteRecordRaw[] = [
  {
    path: 'editor/:id?',
    name: 'editor',
    component: () => import('@/views/editor/index.vue'),
    meta: {
      hideTab: true,
      tab: {
        id: resolveEditorTabId,
        cacheKey: resolveEditorCacheKey
      }
    },
    beforeEnter: (to) => {
      if (!to.params.id) {
        return { name: 'editor', params: { id: nanoid() }, replace: true };
      }
    }
  }
];

export default routes;
