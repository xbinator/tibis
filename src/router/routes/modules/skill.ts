/**
 * @file skill.ts
 * @description 定义 Skill 独立详情页路由，从设置页跳转而来，按 skill 名作为标识。
 */

import type { AppRouteRecordRaw } from '../../type';

const routes: AppRouteRecordRaw[] = [
  {
    path: 'skill/:name',
    name: 'skill',
    component: () => import('@/views/skill/index.vue'),
    meta: { hideTab: true }
  }
];

export default routes;
