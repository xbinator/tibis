/**
 * @file widget.test.ts
 * @description 小组件 Store 测试。
 * @vitest-environment jsdom
 */
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { joinPath, parseWidgetJson, type WidgetScannerAPI } from '@/ai/widget';
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

  it('updates widgets from watched widget.json changes', (): void => {
    const store = useWidgetStore();
    const filePath = joinPath('/Users/test', '.tibis', 'widgets', 'weather', 'widget.json');
    const widget = parseWidgetJson(
      JSON.stringify({
        name: '天气',
        description: '查询指定城市天气'
      }),
      filePath
    );

    store.handleWidgetChange('add', widget);
    expect(store.getWidgetById('weather')?.description).toBe('查询指定城市天气');

    store.handleWidgetChange(
      'change',
      parseWidgetJson(
        JSON.stringify({
          name: '天气',
          description: '展示天气和出行建议'
        }),
        filePath
      )
    );
    expect(store.getWidgetById('weather')?.description).toBe('展示天气和出行建议');

    store.handleWidgetChange('unlink', { ...widget, filePath });
    expect(store.getWidgetById('weather')).toBeUndefined();
  });

  it('preserves disabled state when watched widget.json changes', (): void => {
    const store = useWidgetStore();
    const filePath = joinPath('/Users/test', '.tibis', 'widgets', 'weather', 'widget.json');
    const widget = parseWidgetJson(
      JSON.stringify({
        name: '天气',
        description: '查询指定城市天气'
      }),
      filePath
    );

    store.handleWidgetChange('add', widget);
    store.toggleWidget('weather');
    expect(store.getWidgetById('weather')?.enabled).toBe(false);

    store.handleWidgetChange(
      'change',
      parseWidgetJson(
        JSON.stringify({
          name: '天气',
          description: '展示天气和出行建议'
        }),
        filePath
      )
    );

    expect(store.getWidgetById('weather')?.description).toBe('展示天气和出行建议');
    expect(store.getWidgetById('weather')?.enabled).toBe(false);
  });

  it('keeps widgets visible when watched widget.json becomes invalid', (): void => {
    const store = useWidgetStore();
    const filePath = joinPath('/Users/test', '.tibis', 'widgets', 'weather', 'widget.json');
    const widget = parseWidgetJson(
      JSON.stringify({
        name: '天气',
        description: '查询指定城市天气'
      }),
      filePath
    );

    store.handleWidgetChange('add', widget);
    store.toggleWidget('weather');
    store.handleWidgetChange('change', parseWidgetJson('{broken', filePath));

    expect(store.getWidgetById('weather')?.parseError).toBeTruthy();
    expect(store.getWidgetById('weather')?.enabled).toBe(false);
  });
});
