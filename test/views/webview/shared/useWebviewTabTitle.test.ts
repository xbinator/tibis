/**
 * @file useWebviewTabTitle.test.ts
 * @description 验证 WebView 标签页标题同步逻辑。
 */

import { nextTick, ref } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useWebviewTabTitle } from '@/views/webview/shared/hooks/useWebviewTabTitle';

const { getItemMock, setItemMock } = vi.hoisted(() => ({
  getItemMock: vi.fn(() => null),
  setItemMock: vi.fn(() => undefined)
}));

vi.mock('@/shared/storage/base', () => ({
  local: {
    getItem: getItemMock,
    setItem: setItemMock
  }
}));

describe('useWebviewTabTitle', () => {
  beforeEach(() => {
    vi.resetModules();
    setActivePinia(createPinia());
  });

  it('updates the matching tab title when title changes', async () => {
    const { useTabsStore } = await import('@/stores/workspace/tabs');
    const tabsStore = useTabsStore();

    tabsStore.addTab({ id: '/webview/native?url=https%3A%2F%2Fexample.com', path: '/webview/native?url=https%3A%2F%2Fexample.com', title: 'WebView' });
    const title = ref('');

    useWebviewTabTitle({
      routeFullPath: '/webview/native?url=https%3A%2F%2Fexample.com',
      title
    });

    title.value = 'Example Domain';
    await nextTick();

    expect(tabsStore.tabs[0]?.title).toBe('Example Domain');
  });

  it('ignores empty titles', async () => {
    const { useTabsStore } = await import('@/stores/workspace/tabs');
    const tabsStore = useTabsStore();

    tabsStore.addTab({ id: '/webview/web?url=https%3A%2F%2Fexample.com', path: '/webview/web?url=https%3A%2F%2Fexample.com', title: 'WebView' });
    const title = ref('');

    useWebviewTabTitle({
      routeFullPath: '/webview/web?url=https%3A%2F%2Fexample.com',
      title
    });

    // Empty title should not update the tab
    await nextTick();

    expect(tabsStore.tabs[0]?.title).toBe('WebView');
  });
});
