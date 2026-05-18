/**
 * @file export-to-pdf.test.ts
 * @description 验证 PDF 导出渲染使用临时 HTML 文件而非 data URL，并在结束后清理临时文件。
 */

import { access } from 'node:fs/promises';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const browserWindowState = vi.hoisted(() => ({
  loadFileMock: vi.fn<(filePath: string) => Promise<void>>(),
  loadURLMock: vi.fn<(url: string) => Promise<void>>(),
  printToPdfMock: vi.fn<() => Promise<Buffer>>(),
  destroyMock: vi.fn<() => void>(),
  loadedFilePath: '' as string
}));

vi.mock('electron', () => ({
  BrowserWindow: class BrowserWindow {
    public webContents = {
      printToPDF: browserWindowState.printToPdfMock
    };

    public async loadFile(filePath: string): Promise<void> {
      browserWindowState.loadedFilePath = filePath;
      await browserWindowState.loadFileMock(filePath);
    }

    public async loadURL(url: string): Promise<void> {
      await browserWindowState.loadURLMock(url);
    }

    public destroy(): void {
      browserWindowState.destroyMock();
    }
  },
  ipcMain: {
    handle: vi.fn()
  }
}));

describe('renderPdfBufferFromHtml', () => {
  beforeEach(() => {
    vi.resetModules();
    browserWindowState.loadedFilePath = '';
    browserWindowState.loadFileMock.mockReset();
    browserWindowState.loadURLMock.mockReset();
    browserWindowState.printToPdfMock.mockReset();
    browserWindowState.destroyMock.mockReset();
    browserWindowState.printToPdfMock.mockResolvedValue(Buffer.from('pdf'));
  });

  it('loads html from a temporary file and removes the file after printing', async () => {
    browserWindowState.loadFileMock.mockImplementation(async (filePath: string) => {
      await expect(access(filePath)).resolves.toBeUndefined();
    });

    const { renderPdfBufferFromHtml } = await import('../../../electron/main/modules/dialog/ipc.mjs');

    await expect(renderPdfBufferFromHtml('<html><body>Hello</body></html>')).resolves.toEqual(Buffer.from('pdf'));

    expect(browserWindowState.loadFileMock).toHaveBeenCalledTimes(1);
    expect(browserWindowState.loadURLMock).not.toHaveBeenCalled();
    expect(browserWindowState.destroyMock).toHaveBeenCalledTimes(1);
    await expect(access(browserWindowState.loadedFilePath)).rejects.toThrow();
  });
});
