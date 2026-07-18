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
  acquireDirectoryInstallLock: Mock<(targetDir: string) => Promise<string>>;
  /** 读取文件 mock */
  readFile: Mock<WidgetScannerAPI['readFile']>;
  /** 读取目录 mock */
  readWorkspaceDirectory: Mock<WidgetScannerAPI['readWorkspaceDirectory']>;
  /** 路径状态 mock */
  getPathStatus: Mock<NonNullable<WidgetScannerAPI['getPathStatus']>>;
  /** 移动文件到回收站 mock */
  trashFile: Mock<(filePath: string) => Promise<void>>;
  /** 重命名目录 mock */
  renameFile: Mock<(oldPath: string, newPath: string) => Promise<void>>;
  /** 释放安装锁 mock */
  releaseDirectoryInstallLock: Mock<(token: string) => Promise<void>>;
}

/**
 * 创建扫描器测试 API。
 * @returns 扫描器依赖 API
 */
function createScannerAPI(): WidgetScannerAPIMock {
  return {
    acquireDirectoryInstallLock: vi.fn<(targetDir: string) => Promise<string>>().mockResolvedValue('widget-lock'),
    readFile: vi.fn<WidgetScannerAPI['readFile']>(),
    readWorkspaceDirectory: vi.fn<WidgetScannerAPI['readWorkspaceDirectory']>(),
    getPathStatus: vi.fn<NonNullable<WidgetScannerAPI['getPathStatus']>>().mockResolvedValue({ exists: true, isFile: false, isDirectory: true }),
    trashFile: vi.fn<(filePath: string) => Promise<void>>(),
    renameFile: vi.fn<(oldPath: string, newPath: string) => Promise<void>>(),
    releaseDirectoryInstallLock: vi.fn<(token: string) => Promise<void>>().mockResolvedValue(undefined)
  };
}

describe('scanWidgets', (): void => {
  it('ignores stale install transaction files while scanning widgets', async (): Promise<void> => {
    const api = createScannerAPI();
    api.readWorkspaceDirectory.mockResolvedValue({
      entries: [
        { name: '.install-test.json', type: 'file' },
        { name: 'weather', type: 'directory' }
      ]
    });
    api.readFile.mockImplementation(async (filePath: string) => {
      if (filePath.endsWith('/.install-test.json')) {
        return { content: JSON.stringify({ version: 1, targetName: 'weather', temporaryName: '.tmp-test', backupName: '.bak-test' }) };
      }

      return { content: JSON.stringify({ name: '天气', description: '查询指定城市天气' }) };
    });
    api.getPathStatus.mockImplementation(async (filePath: string) => ({
      exists: filePath.endsWith('/widgets') || filePath.endsWith('/.tmp-test'),
      isFile: false,
      isDirectory: filePath.endsWith('/widgets') || filePath.endsWith('/.tmp-test')
    }));

    const widgets = await scanWidgets({ homeDir: '/Users/test' }, api);

    expect(api.renameFile).not.toHaveBeenCalled();
    expect(api.trashFile).not.toHaveBeenCalled();
    expect(widgets).toHaveLength(1);
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
