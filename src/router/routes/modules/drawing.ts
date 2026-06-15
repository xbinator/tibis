/**
 * @file drawing.ts
 * @description 定义独立画图工具页面路由。
 */

import type { AppRouteRecordRaw } from '../../type';

const routes: AppRouteRecordRaw[] = [
  {
    path: 'drawing',
    name: 'drawing',
    component: () => import('@/views/drawing/index.vue'),
    meta: {
      title: '画图 (Beta)',
      tab: {
        id: 'drawing',
        cacheKey: 'drawing',
        title: '画图 (Beta)'
      }
    }
  }
];

export default routes;
