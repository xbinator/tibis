/**
 * @file scanner.test.ts
 * @description 小组件文件扫描器测试。
 */
import { describe, expect, it, type Mock, vi } from 'vitest';
import { scanWidgets, type WidgetScannerAPI } from '@/ai/widget/scanner';

/**
 * 小组件扫描器测试 API。
 */
interface WidgetScannerAPIMock extends WidgetScannerAPI {
  /** 获取安装锁 mock */
  acquireDirectoryInstallLock: Mock<NonNullable<WidgetScannerAPI['acquireDirectoryInstallLock']>>;
  /** 读取文件 mock */
  readFile: Mock<WidgetScannerAPI['readFile']>;
  /** 读取目录 mock */
  readWorkspaceDirectory: Mock<WidgetScannerAPI['readWorkspaceDirectory']>;
  /** 路径状态 mock */
  getPathStatus: Mock<NonNullable<WidgetScannerAPI['getPathStatus']>>;
  /** 移动文件到回收站 mock */
  trashFile: Mock<NonNullable<WidgetScannerAPI['trashFile']>>;
  /** 重命名目录 mock */
  renameFile: Mock<NonNullable<WidgetScannerAPI['renameFile']>>;
  /** 释放安装锁 mock */
  releaseDirectoryInstallLock: Mock<NonNullable<WidgetScannerAPI['releaseDirectoryInstallLock']>>;
}

/**
 * 创建扫描器测试 API。
 * @returns 扫描器依赖 API
 */
function createScannerAPI(): WidgetScannerAPIMock {
  return {
    acquireDirectoryInstallLock: vi.fn<NonNullable<WidgetScannerAPI['acquireDirectoryInstallLock']>>().mockResolvedValue('widget-lock'),
    readFile: vi.fn<WidgetScannerAPI['readFile']>(),
    readWorkspaceDirectory: vi.fn<WidgetScannerAPI['readWorkspaceDirectory']>(),
    getPathStatus: vi.fn<NonNullable<WidgetScannerAPI['getPathStatus']>>().mockResolvedValue({ exists: true, isFile: false, isDirectory: true }),
    trashFile: vi.fn<NonNullable<WidgetScannerAPI['trashFile']>>(),
    renameFile: vi.fn<NonNullable<WidgetScannerAPI['renameFile']>>(),
    releaseDirectoryInstallLock: vi.fn<NonNullable<WidgetScannerAPI['releaseDirectoryInstallLock']>>().mockResolvedValue(undefined)
  };
}

describe('scanWidgets', (): void => {
  it('cleans an interrupted rejected install before scanning widgets', async (): Promise<void> => {
    const api = createScannerAPI();
    api.readWorkspaceDirectory.mockResolvedValueOnce({ entries: [{ name: '.install-test.json', type: 'file' }] }).mockResolvedValueOnce({ entries: [] });
    api.readFile.mockResolvedValue({
      content: JSON.stringify({ version: 1, targetName: 'weather', temporaryName: '.tmp-test', backupName: '.bak-test' })
    });
    api.getPathStatus.mockImplementation(async (path: string) => ({
      exists: path.endsWith('/widgets') || path.endsWith('/.tmp-test'),
      isFile: false,
      isDirectory: path.endsWith('/widgets') || path.endsWith('/.tmp-test')
    }));

    await scanWidgets({ homeDir: '/Users/test' }, api);

    expect(api.trashFile).toHaveBeenCalledWith('/Users/test/.tibis/widgets/.tmp-test');
    expect(api.trashFile).toHaveBeenCalledWith('/Users/test/.tibis/widgets/.install-test.json');
  });

  it('scans widget directories from .tibis/widgets and uses directory name as id', async (): Promise<void> => {
    const api = createScannerAPI();
    api.readWorkspaceDirectory.mockResolvedValue({
      entries: [
        { name: 'weather', type: 'directory' },
        { name: 'notes.md', type: 'file' },
        { name: '.draft', type: 'directory' }
      ]
    });
    api.readFile.mockResolvedValue({
      content: JSON.stringify({
        name: '天气',
        description: '查询指定城市天气'
      })
    });

    const widgets = await scanWidgets({ homeDir: '/Users/test' }, api);

    expect(api.readWorkspaceDirectory).toHaveBeenCalledWith({ directoryPath: '/Users/test/.tibis/widgets' });
    expect(api.readFile).toHaveBeenCalledWith('/Users/test/.tibis/widgets/weather/widget.json');
    expect(widgets).toHaveLength(1);
    expect(widgets[0]).toMatchObject({
      id: 'weather',
      name: '天气',
      description: '查询指定城市天气',
      filePath: '/Users/test/.tibis/widgets/weather/widget.json',
      enabled: true
    });
    expect(widgets[0]?.data.elements).toEqual([]);
  });

  it('skips directory reads when the widget directory does not exist', async (): Promise<void> => {
    const api = createScannerAPI();
    api.getPathStatus.mockResolvedValue({ exists: false, isFile: false, isDirectory: false });

    const widgets = await scanWidgets({ homeDir: '/Users/test' }, api);

    expect(api.getPathStatus).toHaveBeenCalledWith('/Users/test/.tibis/widgets');
    expect(api.readWorkspaceDirectory).not.toHaveBeenCalled();
    expect(widgets).toEqual([]);
  });
});
