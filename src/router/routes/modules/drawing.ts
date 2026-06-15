/**
 * @file drawing.ts
 * @description 定义文件化画图工具页面路由。
 */

import type { AppRouteRecordRaw } from '../../type';
import { customAlphabet } from 'nanoid';
import { createFileRouteTabMeta } from '../helpers/fileRouteTab';

const nanoid = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz_', 8);

const routes: AppRouteRecordRaw[] = [
  {
    path: 'drawing/:id?',
    name: 'drawing',
    component: () => import('@/views/drawing/index.vue'),
    meta: {
      hideTab: true,
      tab: createFileRouteTabMeta('drawing')
    },
    beforeEnter: (to) => {
      if (!to.params.id) {
        return { name: 'drawing', params: { id: nanoid() }, replace: true };
      }
    }
  }
];

export default routes;
