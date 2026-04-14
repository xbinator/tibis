import type { AppRouteRecordRaw } from '../../type';

const routes: AppRouteRecordRaw[] = [
  {
    path: 'editor',
    name: 'editor-index',
    component: () => import('@/views/editor/index.vue'),
    meta: { hideTab: true }
  },
  {
    path: 'editor/:id?',
    name: 'editor-file',
    component: () => import('@/views/editor/index.vue')
  }
];

export default routes;
