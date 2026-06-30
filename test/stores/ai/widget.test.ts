/**
 * @file widget.test.ts
 * @description 小组件 Store 测试。
 * @vitest-environment jsdom
 */
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import type { WidgetScannerAPI } from '@/ai/widget';
import { useWidgetStore } from '@/stores/ai/widget';

/**
 * 小组件扫描器测试 API。
 */
interface WidgetScannerAPIMock extends WidgetScannerAPI {
  /** 读取文件 mock */
  readFile: Mock<WidgetScannerAPI['readFile']>;
  /** 读取目录 mock */
  readWorkspaceDirectory: Mock<WidgetScannerAPI['readWorkspaceDirectory']>;
}

/**
 * 创建小组件扫描器测试 API。
 * @returns 扫描器依赖 API
 */
function createScannerAPI(): WidgetScannerAPIMock {
  return {
    readFile: vi.fn<WidgetScannerAPI['readFile']>(),
    readWorkspaceDirectory: vi.fn<WidgetScannerAPI['readWorkspaceDirectory']>()
  };
}

describe('widget store', (): void => {
  beforeEach((): void => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('initializes widgets and persists disabled ids by directory id', async (): Promise<void> => {
    const api = createScannerAPI();
    api.readWorkspaceDirectory.mockResolvedValue({
      entries: [{ name: 'weather', type: 'directory' }]
    });
    api.readFile.mockResolvedValue({
      content: JSON.stringify({
        name: '天气',
        description: '查询指定城市天气'
      })
    });
    const store = useWidgetStore();

    await store.init('/Users/test', api);

    expect(store.initialized).toBe(true);
    expect(store.widgets[0]?.id).toBe('weather');
    expect(store.getWidgetById('weather')?.name).toBe('天气');

    store.toggleWidget('weather');
    expect(store.getWidgetById('weather')?.enabled).toBe(false);

    setActivePinia(createPinia());
    const nextStore = useWidgetStore();
    await nextStore.init('/Users/test', api);

    expect(nextStore.getWidgetById('weather')?.enabled).toBe(false);
  });
});
