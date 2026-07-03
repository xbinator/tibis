/**
 * @file use-open-file.test.ts
 * @description 验证统一文件打开入口对 .tibis 文件的路由分流。
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

  it('routes supported widget tibis files to widget', async (): Promise<void> => {
    openOrRefreshByPathFromDiskMock.mockResolvedValue({
      type: 'file',
      id: 'widget-1',
      path: '/tmp/board.tibis',
      name: 'board',
      ext: 'tibis',
      content: '{"type":"widget","version":1,"elements":[]}',
      savedContent: ''
    });

    const { openFileByPath } = useOpenFile();
    await openFileByPath('/tmp/board.tibis');

    expect(routerPushMock).toHaveBeenCalledWith({ name: 'widget', params: { id: 'widget-1' } });
  });

  it('routes invalid tibis files to editor', async (): Promise<void> => {
    openOrRefreshByPathFromDiskMock.mockResolvedValue({
      type: 'file',
      id: 'bad-1',
      path: '/tmp/bad.tibis',
      name: 'bad',
      ext: 'tibis',
      content: '{broken',
      savedContent: ''
    });

    const { openFileByPath } = useOpenFile();
    await openFileByPath('/tmp/bad.tibis');

    expect(routerPushMock).toHaveBeenCalledWith({ name: 'editor', params: { id: 'bad-1' } });
  });
});
