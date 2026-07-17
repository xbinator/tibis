/**
 * @file skill.ts
 * @description 定义 Skill 独立详情页路由，从设置页跳转而来，按 skill 名作为标识。
 */

import type { AppRouteRecordRaw } from '../../type';
import type { RouteLocationNormalizedLoaded } from 'vue-router';
import { normalizeRouteParam } from '../helpers/fileRouteTab';

/**
 * 解析 Skill 路由中的名称。
 * @param route - 当前 Skill 路由
 * @returns Skill 名称，不存在时返回 undefined
 */
function resolveSkillName(route: RouteLocationNormalizedLoaded): string | undefined {
  return normalizeRouteParam(route.params.name);
}

/**
 * 解析 Skill 标签页的稳定标识。
 * @param route - 当前 Skill 路由
 * @returns 带命名空间的标签页标识，不存在名称时返回 undefined
 */
function resolveSkillTabId(route: RouteLocationNormalizedLoaded): string | undefined {
  const skillName = resolveSkillName(route);

  return skillName ? `skill:${skillName}` : undefined;
}

const routes: AppRouteRecordRaw[] = [
  {
    path: 'skill/:name',
    name: 'skill',
    component: () => import('@/views/skill/index.vue'),
    meta: {
      title: 'Skill',
      tab: {
        id: resolveSkillTabId,
        cacheKey: resolveSkillTabId,
        title: resolveSkillName,
        icon: 'lucide:hammer'
      }
    }
  }
];

export default routes;
