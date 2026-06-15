/**
 * @file editor.ts
 * @description 定义编辑器页面路由与标签页缓存元信息。
 */

import type { AppRouteRecordRaw } from '../../type';
import { customAlphabet } from 'nanoid';
import { createFileRouteTabMeta } from '../helpers/fileRouteTab';

const nanoid = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz_', 8);

const routes: AppRouteRecordRaw[] = [
  {
    path: 'editor/:id?',
    name: 'editor',
    component: () => import('@/views/editor/index.vue'),
    meta: {
      hideTab: true,
      tab: createFileRouteTabMeta('editor')
    },
    beforeEnter: (to) => {
      if (!to.params.id) {
        return { name: 'editor', params: { id: nanoid() }, replace: true };
      }
    }
  }
];

export default routes;
