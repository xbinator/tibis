/**
 * @file use-open-file.test.ts
 * @description 验证统一文件打开入口按最近记录类型路由。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultWidgetData } from '@/components/BWidget/utils/widgetData';
import { useOpenFile } from '@/hooks/useOpenFile';

const routerPushMock = vi.hoisted(() => vi.fn());
const getFileByPathMock = vi.hoisted(() => vi.fn());
const getFileByIdMock = vi.hoisted(() => vi.fn());
const openOrRefreshByPathFromDiskMock = vi.hoisted(() => vi.fn());
const openExistingFileMock = vi.hoisted(() => vi.fn());
const createAndOpenMock = vi.hoisted(() => vi.fn());

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: routerPushMock })
}));

vi.mock('@/stores/workspace/files', () => ({
  useFilesStore: () => ({
    ensureLoaded: vi.fn(),
    recentFiles: [],
    getFileByPath: getFileByPathMock,
    getFileById: getFileByIdMock,
    openOrRefreshByPathFromDisk: openOrRefreshByPathFromDiskMock,
    openExistingFile: openExistingFileMock,
    createAndOpen: createAndOpenMock,
    removeFile: vi.fn()
  })
}));

vi.mock('@/stores/workspace/tabs', () => ({
  useTabsStore: () => ({
    tabs: []
  })
}));

vi.mock('@/shared/platform', () => ({
  native: {
    openFile: vi.fn()
  }
}));

vi.mock('@/utils/modal', () => ({
  Modal: {
    alert: vi.fn()
  }
}));

describe('useOpenFile', (): void => {
  beforeEach((): void => {
    routerPushMock.mockReset();
    getFileByPathMock.mockReset();
    getFileByIdMock.mockReset();
    openOrRefreshByPathFromDiskMock.mockReset();
    openExistingFileMock.mockReset();
    createAndOpenMock.mockReset();
  });

  it('routes widget records to widget', async (): Promise<void> => {
    openOrRefreshByPathFromDiskMock.mockResolvedValue({
      type: 'widget',
      id: 'widget-1',
      path: '/tmp/widget.json',
      name: 'board',
      ext: 'json',
      content: '{"elements":[]}',
      savedContent: ''
    });

    const { openFileByPath } = useOpenFile();
    await openFileByPath('/tmp/widget.json');

    expect(routerPushMock).toHaveBeenCalledWith({ name: 'widget', params: { id: 'widget-1' } });
  });

  it('routes file records to editor without parsing widget-shaped content', async (): Promise<void> => {
    openOrRefreshByPathFromDiskMock.mockResolvedValue({
      type: 'file',
      id: 'json-1',
      path: '/tmp/board.json',
      name: 'board',
      ext: 'json',
      content: '{"type":"widget","version":1,"elements":[]}',
      savedContent: ''
    });

    const { openFileByPath } = useOpenFile();
    await openFileByPath('/tmp/board.json');

    expect(routerPushMock).toHaveBeenCalledWith({ name: 'editor', params: { id: 'json-1' } });
  });

  it('opens an installed widget definition through the shared widget file session', async (): Promise<void> => {
    createAndOpenMock.mockResolvedValue({
      type: 'widget',
      id: 'widget-weather',
      path: '/tmp/widgets/weather/widget.json',
      name: 'weather',
      ext: 'json',
      content: '{"name":"天气"}',
      savedContent: '{"name":"天气"}'
    });

    const { openWidgetFile } = useOpenFile();
    await openWidgetFile({
      id: 'weather',
      name: '天气',
      description: '查询天气',
      data: { ...createDefaultWidgetData('weather'), name: '天气', description: '查询天气' },
      filePath: '/tmp/widgets/weather/widget.json',
      enabled: true,
      parsedAt: 1
    });

    expect(createAndOpenMock).toHaveBeenCalledWith({
      type: 'widget',
      id: 'widget-weather',
      path: '/tmp/widgets/weather/widget.json',
      name: 'weather',
      ext: 'json',
      content: expect.stringContaining('"name": "天气"'),
      savedContent: expect.stringContaining('"name": "天气"')
    });
    expect(routerPushMock).toHaveBeenCalledWith({ name: 'widget', params: { id: 'widget-weather' } });
  });
});
