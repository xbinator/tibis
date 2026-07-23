/**
 * @file use-open-file.test.ts
 * @description 验证统一文件打开入口按最近记录类型路由。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

vi.mock('@/stores/workspace/recent', () => ({
  useRecentStore: () => ({
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

  it('creates markdown records without deciding the saved content baseline', async (): Promise<void> => {
    createAndOpenMock.mockResolvedValue({
      type: 'file',
      id: 'file-1',
      path: null,
      name: 'Untitled',
      ext: 'md',
      content: ''
    });

    const { createNewFile } = useOpenFile();
    await createNewFile();

    expect(createAndOpenMock).toHaveBeenCalledWith({
      type: 'file',
      id: expect.any(String),
      url: expect.stringMatching(/^\/editor\//),
      title: 'Untitled.md',
      description: '未保存文件',
      path: null,
      name: 'Untitled',
      ext: 'md',
      content: ''
    });
  });

  it('navigates to an installed widget without creating a content record', async (): Promise<void> => {
    const { openWidgetFile } = useOpenFile();
    await openWidgetFile('weather');

    expect(createAndOpenMock).not.toHaveBeenCalled();
    expect(routerPushMock).toHaveBeenCalledWith({ name: 'widget', params: { id: 'widget-weather' } });
  });
});
