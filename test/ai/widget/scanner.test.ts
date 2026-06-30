/**
 * @file scanner.test.ts
 * @description 小组件文件扫描器测试。
 */
import { describe, expect, it, type Mock, vi } from 'vitest';
import { scanWidgets, type WidgetScannerAPI } from '@/ai/widget';

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
 * 创建扫描器测试 API。
 * @returns 扫描器依赖 API
 */
function createScannerAPI(): WidgetScannerAPIMock {
  return {
    readFile: vi.fn<WidgetScannerAPI['readFile']>(),
    readWorkspaceDirectory: vi.fn<WidgetScannerAPI['readWorkspaceDirectory']>()
  };
}

describe('scanWidgets', (): void => {
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
});
