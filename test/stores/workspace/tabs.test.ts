/**
 * @file tabs.test.ts
 * @description 工作区标签原位替换行为测试。
 * @vitest-environment jsdom
 */
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Tab } from '@/stores/workspace/tabs';
import { useTabsStore } from '@/stores/workspace/tabs';

/**
 * 创建测试标签。
 * @param id - 标签 ID
 * @param path - 标签路径
 * @returns 测试标签
 */
function createTab(id: string, path = `/${id}`): Tab {
  return {
    id,
    path,
    title: id,
    cacheKey: id
  };
}

describe('tabs store replacement', (): void => {
  beforeEach((): void => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('replaces a draft tab in place and migrates cache state', (): void => {
    const store = useTabsStore();
    store.tabs = [createTab('before'), createTab('chat:new', '/chat'), createTab('after')];
    store.cachedKeys = ['before', 'chat:new', 'after'];
    store.dirtyById['chat:new'] = true;
    store.missingById['chat:new'] = true;

    const replaced = store.replaceTab({
      sourceId: 'chat:new',
      tab: {
        id: 'chat:session-a',
        path: '/chat/session-a',
        title: 'A',
        cacheKey: 'chat:session-a',
        icon: 'lucide:message-circle'
      }
    });

    expect(replaced).toBe(true);
    expect(store.tabs.map((tab) => tab.id)).toEqual(['before', 'chat:session-a', 'after']);
    expect(store.cachedKeys).toEqual(['before', 'chat:session-a', 'after']);
    expect(store.dirtyById['chat:session-a']).toBe(true);
    expect(store.dirtyById['chat:new']).toBeUndefined();
    expect(store.missingById['chat:session-a']).toBe(true);
    expect(store.missingById['chat:new']).toBeUndefined();
  });

  it('collapses a router-created target while preserving the draft position', (): void => {
    const store = useTabsStore();
    store.tabs = [createTab('chat:new', '/chat'), createTab('other'), createTab('chat:session-a', '/chat/session-a')];
    store.cachedKeys = ['chat:new', 'other', 'chat:session-a'];

    const replaced = store.replaceTab({ sourceId: 'chat:new', tab: createTab('chat:session-a', '/chat/session-a') });

    expect(replaced).toBe(true);
    expect(store.tabs.map((tab) => tab.id)).toEqual(['chat:session-a', 'other']);
    expect(store.cachedKeys).toEqual(['chat:session-a', 'other']);
  });

  it('returns false without mutating state when the source tab is absent', (): void => {
    const store = useTabsStore();
    store.tabs = [createTab('other')];

    expect(store.replaceTab({ sourceId: 'chat:new', tab: createTab('chat:session-a', '/chat/session-a') })).toBe(false);
    expect(store.tabs.map((tab) => tab.id)).toEqual(['other']);
  });
});
