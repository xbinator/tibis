import type { AppRouteRecordRaw } from '../../type';
import { RouterView } from 'vue-router';

const routes: AppRouteRecordRaw[] = [
  {
    path: 'settings',
    name: 'Settings',
    component: () => import('@/views/settings/index.vue'),
    redirect: '/settings/provider',
    meta: {
      title: '设置'
    },
    children: [
      {
        path: 'provider',
        name: 'provider',
        component: () => import('@/views/settings/provider/layout.vue'),
        redirect: '/settings/provider',
        children: [
          {
            path: '',
            name: 'provider-list',
            component: () => import('@/views/settings/provider/index.vue'),
            meta: {
              title: '模型服务'
            }
          },
          {
            path: ':provider',
            name: 'provider-detail',
            component: () => import('@/views/settings/provider/detail.vue'),
            meta: {
              title: '服务商配置'
            }
          }
        ]
      },
      {
        path: 'service-model',
        name: 'service-model',
        component: () => import('@/views/settings/service-model/index.vue'),
        meta: { title: '默认模型' }
      },
      {
        path: 'tools',
        name: 'tools',
        component: RouterView,
        redirect: '/settings/tools/search',
        meta: { title: '工具' },
        children: [
          {
            path: 'search',
            name: 'search-tools-settings',
            component: () => import('@/views/settings/tools/search/index.vue'),
            meta: { title: '搜索' }
          },
          {
            path: 'mcp',
            name: 'mcp-tools-settings',
            component: () => import('@/views/settings/tools/mcp/index.vue'),
            meta: { title: 'MCP' }
          },
          {
            path: 'skill',
            name: 'skill-tools-settings',
            component: () => import('@/views/settings/tools/skill/index.vue'),
            meta: { title: 'Skills' }
          },
          {
            path: 'memory',
            name: 'memory-tools-settings',
            component: () => import('@/views/settings/tools/memory/index.vue'),
            meta: { title: '记忆' }
          }
        ]
      },
      {
        path: 'general',
        name: 'general-settings',
        component: () => import('@/views/settings/general/index.vue'),
        meta: { title: '通用' }
      },
      {
        path: 'speech',
        name: 'speech',
        component: () => import('@/views/settings/speech/index.vue'),
        meta: { title: '语音组件' }
      },
      {
        path: 'logger',
        name: 'logger',
        component: () => import('@/views/settings/logger/index.vue'),
        meta: { title: '运行日志' }
      }
    ]
  }
];

export default routes;
