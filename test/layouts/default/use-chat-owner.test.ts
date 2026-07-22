/**
 * @file use-chat-owner.test.ts
 * @description ChatSider 标准会话 Owner 查询测试。
 * @vitest-environment jsdom
 */
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { useChatOwner } from '@/layouts/default/hooks/useChatOwner';
import { useChatTabStore } from '@/stores/chat/tab';
import type { Tab } from '@/stores/workspace/tabs';
import { useTabsStore } from '@/stores/workspace/tabs';

/**
 * 创建测试标签。
 * @param id - 标签 ID
 * @param path - 标签路径
 * @returns 标签数据
 */
function createTab(id: string, path: string): Tab {
  return { id, path, title: id, cacheKey: id };
}

describe('useChatOwner', (): void => {
  beforeEach((): void => {
    setActivePinia(createPinia());
  });

  it('normalizes a persisted chat tab', (): void => {
    useTabsStore().tabs = [createTab('chat:session-a', '/chat/session-a')];

    expect(useChatOwner().findOwner('session-a')).toEqual({
      tabId: 'chat:session-a',
      path: '/chat/session-a',
      sessionId: 'session-a'
    });
  });

  it('normalizes a runtime-owned draft session', (): void => {
    useTabsStore().tabs = [createTab('chat:new', '/chat')];
    useChatTabStore().ensureTab('chat:new', 'session-a');

    expect(useChatOwner().findOwner('session-a')).toEqual({
      tabId: 'chat:new',
      path: '/chat',
      sessionId: 'session-a'
    });
  });

  it('provides a fallback path when a runtime owner has no visible tab', (): void => {
    useChatTabStore().ensureTab('chat:session-a', 'session-a');

    expect(useChatOwner().findOwner('session-a')).toEqual({
      tabId: 'chat:session-a',
      path: '/chat/session-a',
      sessionId: 'session-a'
    });
  });

  it('finds the unique blank draft without inventing a session id', (): void => {
    useTabsStore().tabs = [createTab('chat:new', '/chat')];

    expect(useChatOwner().findOwner()).toEqual({
      tabId: 'chat:new',
      path: '/chat'
    });
  });

  it('returns undefined when no chat owner exists', (): void => {
    expect(useChatOwner().findOwner('missing')).toBeUndefined();
  });
});
