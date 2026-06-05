/**
 * @file header-toolbar.test.ts
 * @description Header 动态工具栏 Store 测试，覆盖注册归属和显示过滤逻辑。
 */
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useHeaderToolbarStore } from '@/stores/ui/headerToolbar';

describe('useHeaderToolbarStore', () => {
  beforeEach((): void => {
    setActivePinia(createPinia());
  });

  it('keeps the active toolbar when a stale owner unregisters', (): void => {
    const store = useHeaderToolbarStore();
    const firstClick = vi.fn();
    const secondClick = vi.fn();

    store.register('tab-a', [
      {
        type: 'action',
        key: 'save',
        icon: 'lucide:save',
        tooltip: '保存',
        onClick: firstClick
      }
    ]);
    store.register('tab-b', [
      {
        type: 'action',
        key: 'wrap',
        icon: 'lucide:wrap-text',
        tooltip: '自动换行',
        onClick: secondClick
      }
    ]);
    store.unregister('tab-a');

    expect(store.ownerId).toBe('tab-b');
    expect(store.items).toHaveLength(1);
    expect(store.items[0].key).toBe('wrap');

    store.unregister('tab-b');

    expect(store.ownerId).toBe('');
    expect(store.items).toEqual([]);
  });

  it('exposes only visible toolbar items for layout rendering', (): void => {
    const store = useHeaderToolbarStore();

    store.register('tab-a', [
      {
        type: 'action',
        key: 'visible-action',
        icon: 'lucide:list',
        tooltip: '显示大纲',
        onClick: vi.fn()
      },
      {
        type: 'action',
        key: 'hidden-action',
        icon: 'lucide:list-x',
        tooltip: '隐藏项',
        visible: false,
        onClick: vi.fn()
      }
    ]);

    expect(store.visibleItems.map((item) => item.key)).toEqual(['visible-action']);
  });
});
