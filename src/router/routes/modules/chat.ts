/**
 * @file chat.ts
 * @description 定义空白聊天页与持久化会话聊天页路由。
 */
import type { AppRouteRecordRaw } from '../../type';
import type { RouteLocationNormalizedLoaded } from 'vue-router';
import { CHAT_DRAFT_TAB_ID, createChatTabId } from '../helpers/chatRouteTab';
import { normalizeRouteParam } from '../helpers/fileRouteTab';

/** 聊天标签统一图标。 */
const CHAT_TAB_ICON = 'lucide:message-circle';

/**
 * 解析聊天路由会话 ID。
 * @param route - 当前聊天路由
 * @returns 持久化会话 ID
 */
function resolveSessionId(route: RouteLocationNormalizedLoaded): string | undefined {
  return normalizeRouteParam(route.params.sessionId);
}

/**
 * 解析持久化聊天标签 ID。
 * @param route - 当前聊天路由
 * @returns 聊天标签 ID
 */
function resolveChatTabId(route: RouteLocationNormalizedLoaded): string | undefined {
  const sessionId = resolveSessionId(route);

  return sessionId ? createChatTabId(sessionId) : undefined;
}

const routes: AppRouteRecordRaw[] = [
  {
    path: 'chat',
    name: 'chat-new',
    component: () => import('@/views/chat/index.vue'),
    meta: {
      title: '新会话',
      tab: {
        id: CHAT_DRAFT_TAB_ID,
        cacheKey: CHAT_DRAFT_TAB_ID,
        title: '新会话',
        icon: CHAT_TAB_ICON
      }
    }
  },
  {
    path: 'chat/:sessionId',
    name: 'chat-session',
    component: () => import('@/views/chat/index.vue'),
    meta: {
      title: '聊天',
      tab: {
        id: resolveChatTabId,
        cacheKey: resolveChatTabId,
        title: '聊天',
        icon: CHAT_TAB_ICON
      }
    }
  }
];

export default routes;
