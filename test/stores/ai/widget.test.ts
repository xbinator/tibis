/**
 * @file widget.test.ts
 * @description Widget Store 目录索引与内容懒加载测试。
 * @vitest-environment jsdom
 */
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import type { WidgetScannerAPI } from '@/ai/widget';
import { useWidgetStore } from '@/stores/ai/widget';

/** Widget 测试文件路径。 */
const WIDGET_FILE_PATH = '/Users/test/.tibis/widgets/weather/widget.json';

/**
 * Widget 扫描器测试 API。
 */
interface WidgetScannerAPIMock extends WidgetScannerAPI {
  /** 读取文件 mock。 */
  readFile: Mock<WidgetScannerAPI['readFile']>;
  /** 读取目录 mock。 */
  readWorkspaceDirectory: Mock<WidgetScannerAPI['readWorkspaceDirectory']>;
}

/**
 * 可由测试控制完成时机的 Promise。
 */
interface Deferred<T> {
  /** 延迟 Promise。 */
  promise: Promise<T>;
  /** 完成 Promise。 */
  resolve: (value: T) => void;
  /** 拒绝 Promise。 */
  reject: (reason: Error) => void;
}

/**
 * 创建可控 Promise。
 * @returns 可控 Promise
 */
function createDeferred<T>(): Deferred<T> {
  let resolvePromise: (value: T) => void = (): void => undefined;
  let rejectPromise: (reason: Error) => void = (): void => undefined;
  const promise = new Promise<T>((resolve: (value: T) => void, reject: (reason: Error) => void): void => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

/**
 * 创建 Widget JSON。
 * @param description - Widget 描述
 * @returns 完整 Widget JSON
 */
function createWidgetJson(description: string): string {
  return JSON.stringify({
    name: '天气',
    description
  });
}

/**
 * 创建 Widget Store 测试 API。
 * @param content - 首次读取的入口文件内容
 * @returns 扫描器测试 API
 */
function createScannerAPI(content = createWidgetJson('初始描述')): WidgetScannerAPIMock {
  return {
    readFile: vi.fn<WidgetScannerAPI['readFile']>().mockResolvedValue({ content }),
    readWorkspaceDirectory: vi.fn<WidgetScannerAPI['readWorkspaceDirectory']>().mockResolvedValue({
      entries: [{ name: 'weather', type: 'directory' }]
    })
  };
}

describe('widget store lazy content', (): void => {
  beforeEach((): void => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('initializes directory entries without reading widget.json', async (): Promise<void> => {
    const api = createScannerAPI();
    const store = useWidgetStore();

    await store.init('/Users/test', api);

    expect(store.initialized).toBe(true);
    expect(store.widgets).toEqual([
      {
        id: 'weather',
        dirPath: '/Users/test/.tibis/widgets/weather',
        filePath: WIDGET_FILE_PATH,
        enabled: true,
        revision: 0
      }
    ]);
    expect(api.readFile).not.toHaveBeenCalled();
  });

  it('loads a Widget once and returns the cached entry afterwards', async (): Promise<void> => {
    const api = createScannerAPI();
    const store = useWidgetStore();
    await store.init('/Users/test', api);

    const first = await store.getWidget('weather');
    const second = await store.getWidget('weather');

    expect(first?.sourceContent).toBe(createWidgetJson('初始描述'));
    expect(first?.definition?.description).toBe('初始描述');
    expect(second).toBe(first);
    expect(api.readFile).toHaveBeenCalledOnce();
  });

  it('shares concurrent first loads for the same Widget', async (): Promise<void> => {
    const api = createScannerAPI();
    const store = useWidgetStore();
    await store.init('/Users/test', api);
    const deferred = createDeferred<{ content: string }>();
    api.readFile.mockImplementationOnce((): Promise<{ content: string }> => deferred.promise);

    const first = store.getWidget('weather');
    const second = store.getWidget('weather');
    await vi.waitFor((): void => {
      expect(api.readFile).toHaveBeenCalledOnce();
    });
    deferred.resolve({ content: createWidgetJson('共享描述') });

    expect((await first)?.definition?.description).toBe('共享描述');
    expect(await second).toBe(await first);
  });

  it('returns the current entry with loadError and retries on the next get', async (): Promise<void> => {
    const api = createScannerAPI();
    const store = useWidgetStore();
    await store.init('/Users/test', api);
    api.readFile.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ content: createWidgetJson('重试描述') });

    const failedWidget = await store.getWidget('weather');
    expect(failedWidget?.loadError).toBe('offline');
    expect(failedWidget?.sourceContent).toBeUndefined();
    await expect(store.getWidget('weather')).resolves.toMatchObject({ sourceContent: createWidgetJson('重试描述') });
    expect(api.readFile).toHaveBeenCalledTimes(2);
  });

  it('returns undefined when the directory ID does not exist', async (): Promise<void> => {
    const api = createScannerAPI();
    const store = useWidgetStore();
    await store.init('/Users/test', api);

    await expect(store.getWidget('missing')).resolves.toBeUndefined();
    expect(api.readFile).not.toHaveBeenCalled();
  });

  it('caches parse failures after a successful read', async (): Promise<void> => {
    const api = createScannerAPI('{broken');
    const store = useWidgetStore();
    await store.init('/Users/test', api);

    const first = await store.getWidget('weather');
    const second = await store.getWidget('weather');

    expect(first?.sourceContent).toBe('{broken');
    expect(first?.definition?.parseError).toBeTruthy();
    expect(second).toBe(first);
    expect(api.readFile).toHaveBeenCalledOnce();
  });

  it('updates cached content from an application-owned save', async (): Promise<void> => {
    const api = createScannerAPI();
    const store = useWidgetStore();
    await store.init('/Users/test', api);
    const updatedContent = createWidgetJson('更新后的描述');

    store.updateWidgetContent('weather', updatedContent);

    expect(store.getWidgetById('weather')?.sourceContent).toBe(updatedContent);
    expect(store.getWidgetById('weather')?.definition?.description).toBe('更新后的描述');
    expect(api.readFile).not.toHaveBeenCalled();
  });

  it('does not let a slow first load overwrite application-saved content', async (): Promise<void> => {
    const api = createScannerAPI();
    const store = useWidgetStore();
    await store.init('/Users/test', api);
    const deferred = createDeferred<{ content: string }>();
    api.readFile.mockImplementationOnce((): Promise<{ content: string }> => deferred.promise);

    const loading = store.getWidget('weather');
    await vi.waitFor((): void => {
      expect(api.readFile).toHaveBeenCalledOnce();
    });
    store.updateWidgetContent('weather', createWidgetJson('保存后的描述'));
    deferred.resolve({ content: createWidgetJson('过期描述') });

    expect((await loading)?.definition?.description).toBe('保存后的描述');
    expect(store.getWidgetById('weather')?.definition?.description).toBe('保存后的描述');
  });

  it('reloads a replacement directory before resolving a shared first load', async (): Promise<void> => {
    const api = createScannerAPI();
    const store = useWidgetStore();
    await store.init('/Users/test', api);
    const deferred = createDeferred<{ content: string }>();
    api.readFile
      .mockImplementationOnce((): Promise<{ content: string }> => deferred.promise)
      .mockResolvedValueOnce({ content: createWidgetJson('替换后的描述') });

    const loading = store.getWidget('weather');
    await vi.waitFor((): void => {
      expect(api.readFile).toHaveBeenCalledOnce();
    });
    store.handleWidgetDirectory('unlink', '/Users/test/.tibis/widgets/weather');
    store.handleWidgetDirectory('add', '/Users/test/.tibis/widgets/weather');
    deferred.resolve({ content: createWidgetJson('过期描述') });

    expect((await loading)?.definition?.description).toBe('替换后的描述');
    expect(api.readFile).toHaveBeenCalledTimes(2);
  });

  it('reloads a replacement directory when the stale first load rejects', async (): Promise<void> => {
    const api = createScannerAPI();
    const store = useWidgetStore();
    await store.init('/Users/test', api);
    const deferred = createDeferred<{ content: string }>();
    api.readFile
      .mockImplementationOnce((): Promise<{ content: string }> => deferred.promise)
      .mockResolvedValueOnce({ content: createWidgetJson('替换失败后的描述') });

    const loading = store.getWidget('weather');
    await vi.waitFor((): void => {
      expect(api.readFile).toHaveBeenCalledOnce();
    });
    store.handleWidgetDirectory('unlink', '/Users/test/.tibis/widgets/weather');
    store.handleWidgetDirectory('add', '/Users/test/.tibis/widgets/weather');
    deferred.reject(new Error('stale entry removed'));

    expect((await loading)?.definition?.description).toBe('替换失败后的描述');
    expect(api.readFile).toHaveBeenCalledTimes(2);
  });

  it('loads all entries while isolating individual failures', async (): Promise<void> => {
    const api = createScannerAPI();
    api.readWorkspaceDirectory.mockResolvedValue({
      entries: [
        { name: 'weather', type: 'directory' },
        { name: 'travel', type: 'directory' }
      ]
    });
    api.readFile.mockImplementation((filePath: string): Promise<{ content: string }> => {
      return filePath.includes('/weather/') ? Promise.resolve({ content: createWidgetJson('天气描述') }) : Promise.reject(new Error('travel offline'));
    });
    const store = useWidgetStore();
    await store.init('/Users/test', api);

    const results = await store.getWidgets();

    expect(results.map((entry): string => entry.id)).toEqual(['weather', 'travel']);
    expect(store.getWidgetById('weather')?.definition?.description).toBe('天气描述');
    expect(store.getWidgetById('travel')?.loadError).toBe('travel offline');
  });

  it('preserves loaded content and disabled state across directory refreshes', async (): Promise<void> => {
    const api = createScannerAPI();
    const store = useWidgetStore();
    await store.init('/Users/test', api);
    await store.getWidget('weather');
    store.toggleWidget('weather');

    await store.refreshWidgets();

    expect(store.getWidgetById('weather')?.enabled).toBe(false);
    expect(store.getWidgetById('weather')?.definition?.description).toBe('初始描述');
    expect(api.readFile).toHaveBeenCalledOnce();
  });

  it('repeats a directory refresh when a watcher event arrives during scanning', async (): Promise<void> => {
    const api = createScannerAPI();
    api.readWorkspaceDirectory.mockResolvedValueOnce({ entries: [] });
    const store = useWidgetStore();
    await store.init('/Users/test', api);
    const deferred = createDeferred<{ entries: Array<{ name: string; type: 'directory' }> }>();
    api.readWorkspaceDirectory
      .mockImplementationOnce((): Promise<{ entries: Array<{ name: string; type: 'directory' }> }> => deferred.promise)
      .mockResolvedValueOnce({ entries: [{ name: 'weather', type: 'directory' }] });

    const refreshing = store.refreshWidgets();
    await vi.waitFor((): void => {
      expect(api.readWorkspaceDirectory).toHaveBeenCalledTimes(2);
    });
    store.handleWidgetDirectory('add', '/Users/test/.tibis/widgets/weather');
    deferred.resolve({ entries: [] });
    await refreshing;

    expect(api.readWorkspaceDirectory).toHaveBeenCalledTimes(3);
    expect(store.getWidgetById('weather')).toBeDefined();
  });

  it('preserves a disabled ID after directory removal and re-addition', async (): Promise<void> => {
    const api = createScannerAPI();
    const store = useWidgetStore();
    await store.init('/Users/test', api);
    store.toggleWidget('weather');
    api.readWorkspaceDirectory.mockResolvedValueOnce({ entries: [] });
    await store.refreshWidgets();
    api.readWorkspaceDirectory.mockResolvedValueOnce({ entries: [{ name: 'weather', type: 'directory' }] });

    await store.refreshWidgets();

    expect(store.getWidgetById('weather')?.enabled).toBe(false);
  });

  it('adds and removes directory indices without reading entry content', async (): Promise<void> => {
    const api = createScannerAPI();
    api.readWorkspaceDirectory.mockResolvedValue({ entries: [] });
    const store = useWidgetStore();
    await store.init('/Users/test', api);

    store.handleWidgetDirectory('add', '/Users/test/.tibis/widgets/weather');

    expect(store.getWidgetById('weather')).toMatchObject({
      id: 'weather',
      filePath: WIDGET_FILE_PATH
    });
    expect(store.getWidgetById('weather')?.sourceContent).toBeUndefined();
    expect(api.readFile).not.toHaveBeenCalled();

    store.handleWidgetDirectory('unlink', '/Users/test/.tibis/widgets/weather');
    expect(store.getWidgetById('weather')).toBeUndefined();
  });

  it('waits for initialization after the layout declares it pending', async (): Promise<void> => {
    const api = createScannerAPI();
    const store = useWidgetStore();
    store.prepareInitialization();
    let completed = false;
    const waiting = store.waitForInit().then((): void => {
      completed = true;
    });
    await Promise.resolve();

    expect(completed).toBe(false);
    await store.init('/Users/test', api);
    await waiting;
    expect(completed).toBe(true);
  });
});
