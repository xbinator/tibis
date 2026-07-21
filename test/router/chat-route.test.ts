/**
 * @file chat-route.test.ts
 * @description 独立聊天页路由与标签身份测试。
 */
import type { RouteLocationNormalizedLoaded } from 'vue-router';
import { describe, expect, it } from 'vitest';
import { CHAT_DRAFT_TAB_ID, createChatPath, createChatTabId, findChatTab, resolveChatSessionId } from '@/router/routes/helpers/chatRouteTab';
import routes from '@/router/routes/modules/chat';

describe('chat routes', (): void => {
  it('registers draft and persisted chat routes', (): void => {
    expect(routes.map((route) => route.path)).toEqual(['chat', 'chat/:sessionId']);
    expect(routes.map((route) => route.name)).toEqual(['chat-new', 'chat-session']);
  });

  it('does not inject chat page props', (): void => {
    expect(routes.every((route) => !('props' in route))).toBe(true);
  });

  it('resolves stable chat paths and tab ids', (): void => {
    expect(CHAT_DRAFT_TAB_ID).toBe('chat:new');
    expect(createChatPath()).toBe('/chat');
    expect(createChatPath('session/a')).toBe('/chat/session%2Fa');
    expect(createChatTabId()).toBe('chat:new');
    expect(createChatTabId('session-a')).toBe('chat:session-a');
    expect(resolveChatSessionId('/chat/session%2Fa?from=history')).toBe('session/a');
  });

  it('finds both persisted owners and the unique draft tab', (): void => {
    const tabs = [
      { id: 'chat:new', path: '/chat', title: '新会话' },
      { id: 'chat:session-a', path: '/chat/session-a', title: 'A' }
    ];

    expect(findChatTab(tabs)?.id).toBe('chat:new');
    expect(findChatTab(tabs, 'session-a')?.id).toBe('chat:session-a');
    expect(findChatTab(tabs, 'missing')).toBeUndefined();
  });

  it('uses the session id for persisted route tab identity', (): void => {
    const route = { params: { sessionId: 'session-a' } } as unknown as RouteLocationNormalizedLoaded;
    const persistedRoute = routes.find((item) => item.name === 'chat-session');
    const id = persistedRoute?.meta?.tab?.id;

    expect(typeof id === 'function' ? id(route) : id).toBe('chat:session-a');
  });
});
