/**
 * @file tabs.test.ts
 * @description 验证标签页状态管理的增删与拖拽排序行为。
 */

import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 模拟持久化存储读取返回值。
 */
const getItemMock = vi.fn();

/**
 * 模拟持久化存储写入行为。
 */
const setItemMock = vi.fn();

vi.mock('@/shared/storage/base', () => ({
  local: {
    getItem: getItemMock,
    setItem: setItemMock,
    removeItem: vi.fn()
  }
}));

describe('useTabsStore', () => {
  beforeEach(() => {
    vi.resetModules();
    getItemMock.mockReset();
    setItemMock.mockReset();
    getItemMock.mockReturnValue(null);
    setActivePinia(createPinia());
  });

  it('moves the dragged tab before the target tab and persists the new order', async () => {
    const { useTabsStore } = await import('@/stores/workspace/tabs');
    const tabsStore = useTabsStore();

    tabsStore.addTab({ id: 'alpha', path: '/alpha', title: 'Alpha' });
    tabsStore.addTab({ id: 'beta', path: '/beta', title: 'Beta' });
    tabsStore.addTab({ id: 'gamma', path: '/gamma', title: 'Gamma' });

    setItemMock.mockClear();

    tabsStore.moveTab('gamma', 'alpha');

    expect(tabsStore.tabs.map((tab) => tab.id)).toEqual(['gamma', 'alpha', 'beta']);
    expect(setItemMock).toHaveBeenCalledTimes(1);
    expect(setItemMock.mock.calls[0]?.[0]).toBe('app_tabs');
  });

  it('does not persist when the drag source and target are identical', async () => {
    const { useTabsStore } = await import('@/stores/workspace/tabs');
    const tabsStore = useTabsStore();

    tabsStore.addTab({ id: 'alpha', path: '/alpha', title: 'Alpha' });
    setItemMock.mockClear();

    tabsStore.moveTab('alpha', 'alpha');

    expect(tabsStore.tabs.map((tab) => tab.id)).toEqual(['alpha']);
    expect(setItemMock).not.toHaveBeenCalled();
  });

  it('registers cache keys when tabs are added', async () => {
    const { useTabsStore } = await import('@/stores/workspace/tabs');
    const tabsStore = useTabsStore();

    tabsStore.addTab({ id: 'alpha', path: '/alpha', title: 'Alpha', cacheKey: 'cache:alpha' });
    tabsStore.addTab({ id: 'beta', path: '/beta', title: 'Beta', cacheKey: 'cache:beta' });
    tabsStore.addTab({ id: 'alpha', path: '/alpha', title: 'Alpha Updated', cacheKey: 'cache:alpha' });

    expect(tabsStore.cachedKeys).toEqual(['cache:alpha', 'cache:beta']);
  });

  it('preserves an existing tab title when a route is reactivated', async () => {
    const { useTabsStore } = await import('@/stores/workspace/tabs');
    const tabsStore = useTabsStore();

    tabsStore.addTab({
      id: '/webview/web?url=https%3A%2F%2Fbaidu.com',
      path: '/webview/web?url=https%3A%2F%2Fbaidu.com',
      title: '百度一下，你就知道',
      cacheKey: '/webview/web?url=https%3A%2F%2Fbaidu.com'
    });

    tabsStore.addTab(
      {
        id: '/webview/web?url=https%3A%2F%2Fbaidu.com',
        path: '/webview/web?url=https%3A%2F%2Fbaidu.com',
        title: 'https://baidu.com',
        cacheKey: '/webview/web?url=https%3A%2F%2Fbaidu.com'
      },
      { preserveTitle: true }
    );

    expect(tabsStore.tabs[0]?.title).toBe('百度一下，你就知道');
  });

  it('exposes cached component names for KeepAlive include filters', async () => {
    const { resolveRouteCacheName } = await import('@/router/cache');
    const { useTabsStore } = await import('@/stores/workspace/tabs');
    const tabsStore = useTabsStore();

    tabsStore.addTab({ id: 'alpha', path: '/alpha', title: 'Alpha', cacheKey: 'cache:alpha' });

    expect(tabsStore.cachedComponentNames).toEqual([resolveRouteCacheName('cache:alpha')]);
  });

  it('removes the tab cache key when a tab is closed', async () => {
    const { useTabsStore } = await import('@/stores/workspace/tabs');
    const tabsStore = useTabsStore();

    tabsStore.addTab({ id: 'alpha', path: '/alpha', title: 'Alpha', cacheKey: 'cache:alpha' });
    tabsStore.addTab({ id: 'beta', path: '/beta', title: 'Beta', cacheKey: 'cache:beta' });

    tabsStore.removeTab('alpha');

    expect(tabsStore.cachedKeys).toEqual(['cache:beta']);
    expect(tabsStore.tabs.map((tab) => tab.id)).toEqual(['beta']);
  });

  it('tracks missing file status for existing tabs and clears it later', async () => {
    const { useTabsStore } = await import('@/stores/workspace/tabs');
    const tabsStore = useTabsStore();

    tabsStore.addTab({ id: 'alpha', path: '/alpha', title: 'Alpha', cacheKey: 'cache:alpha' });

    tabsStore.markMissing('alpha');

    expect(tabsStore.isMissing('alpha')).toBe(true);

    tabsStore.clearMissing('alpha');

    expect(tabsStore.isMissing('alpha')).toBe(false);
  });

  it('migrates saved tabs without missing file state', async () => {
    getItemMock.mockReturnValue({
      tabs: [{ id: 'legacy', path: '/legacy', title: 'Legacy' }],
      dirtyById: { legacy: true }
    });

    const { useTabsStore } = await import('@/stores/workspace/tabs');
    const tabsStore = useTabsStore();

    expect(tabsStore.missingById).toEqual({});
  });

  it('migrates saved tabs without cache keys by using their ids', async () => {
    getItemMock.mockReturnValue({
      tabs: [{ id: 'legacy', path: '/legacy', title: 'Legacy' }],
      dirtyById: { legacy: true }
    });

    const { useTabsStore } = await import('@/stores/workspace/tabs');
    const tabsStore = useTabsStore();

    expect(tabsStore.tabs).toEqual([{ id: 'legacy', path: '/legacy', title: 'Legacy', cacheKey: 'legacy' }]);
    expect(tabsStore.cachedKeys).toEqual(['legacy']);
  });

  it('builds a disabled close plan for the last tab when allowCloseLastTab is false', async () => {
    const { useTabsStore } = await import('@/stores/workspace/tabs');
    const tabsStore = useTabsStore();

    tabsStore.addTab({ id: 'solo', path: '/solo', title: 'Solo', cacheKey: 'cache:solo' });

    const plan = tabsStore.getClosePlan('close', {
      anchorTabId: 'solo',
      activeTabId: 'solo'
    });

    expect(plan.disabled).toBe(true);
    expect(plan.targetTabIds).toEqual([]);
    expect(plan.requiresConfirm).toBe(false);
    expect(plan.requiresNavigation).toBe(false);
  });

  it('allows the close button path to close the last tab when allowCloseLastTab is true', async () => {
    const { useTabsStore } = await import('@/stores/workspace/tabs');
    const tabsStore = useTabsStore();

    tabsStore.addTab({ id: 'solo', path: '/solo', title: 'Solo', cacheKey: 'cache:solo' });

    const plan = tabsStore.getClosePlan('close', {
      anchorTabId: 'solo',
      activeTabId: 'solo',
      allowCloseLastTab: true
    });

    expect(plan.disabled).toBe(false);
    expect(plan.targetTabIds).toEqual(['solo']);
    expect(plan.requiresConfirm).toBe(false);
    expect(plan.requiresNavigation).toBe(true);
    expect(plan.nextActivePath).toBeNull();
  });

  it('marks closeOthers as requiring confirmation when another tab is dirty', async () => {
    const { useTabsStore } = await import('@/stores/workspace/tabs');
    const tabsStore = useTabsStore();

    tabsStore.addTab({ id: 'left', path: '/left', title: 'Left', cacheKey: 'cache:left' });
    tabsStore.addTab({ id: 'current', path: '/current', title: 'Current', cacheKey: 'cache:current' });
    tabsStore.addTab({ id: 'right', path: '/right', title: 'Right', cacheKey: 'cache:right' });
    tabsStore.setDirty('right');

    const plan = tabsStore.getClosePlan('closeOthers', {
      anchorTabId: 'current',
      activeTabId: 'current'
    });

    expect(plan.disabled).toBe(false);
    expect(plan.targetTabIds).toEqual(['left', 'right']);
    expect(plan.dirtyTabIds).toEqual(['right']);
    expect(plan.requiresConfirm).toBe(true);
    expect(plan.requiresNavigation).toBe(false);
  });

  it('routes to the nearest surviving tab when closeSaved removes the active saved tab', async () => {
    const { useTabsStore } = await import('@/stores/workspace/tabs');
    const tabsStore = useTabsStore();

    tabsStore.addTab({ id: 'left', path: '/left', title: 'Left', cacheKey: 'cache:left' });
    tabsStore.addTab({ id: 'active', path: '/active', title: 'Active', cacheKey: 'cache:active' });
    tabsStore.addTab({ id: 'right', path: '/right', title: 'Right', cacheKey: 'cache:right' });
    tabsStore.setDirty('right');

    const plan = tabsStore.getClosePlan('closeSaved', {
      activeTabId: 'active'
    });

    expect(plan.disabled).toBe(false);
    expect(plan.targetTabIds).toEqual(['left', 'active']);
    expect(plan.requiresConfirm).toBe(false);
    expect(plan.requiresNavigation).toBe(true);
    expect(plan.nextActivePath).toBe('/right');
  });

  it('safely applies a stale close plan without recomputing confirmation state', async () => {
    const { useTabsStore } = await import('@/stores/workspace/tabs');
    const tabsStore = useTabsStore();

    tabsStore.addTab({ id: 'alpha', path: '/alpha', title: 'Alpha', cacheKey: 'cache:alpha' });
    tabsStore.addTab({ id: 'beta', path: '/beta', title: 'Beta', cacheKey: 'cache:beta' });
    tabsStore.setDirty('beta');

    const plan = tabsStore.getClosePlan('closeAll', {
      activeTabId: 'alpha'
    });

    tabsStore.removeTab('beta');
    setItemMock.mockClear();

    tabsStore.applyClosePlan(plan);

    expect(tabsStore.tabs).toEqual([]);
    expect(setItemMock).toHaveBeenCalledTimes(1);
  });
});
