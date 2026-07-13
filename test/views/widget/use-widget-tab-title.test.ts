/**
 * @file use-widget-tab-title.test.ts
 * @description 验证 Widget 标签标题从实际保存内容解析并同步。
 */
import { computed, nextTick, ref } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveSavedWidgetTabTitle, useWidgetTabTitle } from '@/views/widget/hooks/useWidgetTabTitle';

const updateTabTitleMock = vi.hoisted(() => vi.fn());

vi.mock('@/stores/workspace/tabs', () => ({
  useTabsStore: () => ({
    updateTabTitle: updateTabTitleMock
  })
}));

describe('useWidgetTabTitle', (): void => {
  beforeEach((): void => {
    updateTabTitleMock.mockClear();
  });

  it('updates the tab when the saved Widget content changes', async (): Promise<void> => {
    const tabId = ref('widget-1');
    const fileTitle = ref('board.json');
    const savedContent = ref(JSON.stringify({ name: '旧名称' }));
    const title = computed<string>(() => resolveSavedWidgetTabTitle(savedContent.value, fileTitle.value));

    useWidgetTabTitle({ tabId, title, savedContent });

    expect(updateTabTitleMock).not.toHaveBeenCalled();

    savedContent.value = JSON.stringify({ name: '新名称' });
    await nextTick();

    expect(updateTabTitleMock).toHaveBeenLastCalledWith({ id: 'widget-1', title: '新名称' });
  });

  it('syncs the current title when the Widget tab id changes', async (): Promise<void> => {
    const tabId = ref('widget-1');
    const title = ref('天气卡片');
    const savedContent = ref(JSON.stringify({ name: '天气卡片' }));

    useWidgetTabTitle({ tabId, title, savedContent });

    tabId.value = 'widget-2';
    await nextTick();

    expect(updateTabTitleMock).toHaveBeenCalledWith({ id: 'widget-2', title: '天气卡片' });
  });

  it('syncs an authoritative saved title when the derived text stays unchanged', async (): Promise<void> => {
    const tabId = ref('widget-1');
    const title = ref('Untitled.json');
    const savedContent = ref(JSON.stringify({ name: '' }));

    useWidgetTabTitle({ tabId, title, savedContent });

    savedContent.value = JSON.stringify({ name: 'Untitled.json' });
    await nextTick();

    expect(updateTabTitleMock).toHaveBeenCalledWith({ id: 'widget-1', title: 'Untitled.json' });
  });

  it('falls back to the file title for empty or invalid saved Widget content', (): void => {
    expect(resolveSavedWidgetTabTitle(JSON.stringify({ name: '   ' }), 'board.json')).toBe('board.json');
    expect(resolveSavedWidgetTabTitle('{invalid', 'board.json')).toBe('board.json');
  });
});
