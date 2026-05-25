/**
 * @file ipc.mts
 * @description 导出功能 IPC handler 注册。
 */
import type { ElectronExportPdfOptions } from 'types/electron-api';
import { ipcMain } from 'electron';
import { showSaveDialog } from '../dialog/utils.mjs';
import { renderPdfBufferFromHtml } from './pdf-renderer.mjs';

/**
 * 单例运行器，确保同一时间只有一个异步操作在执行。
 * 后续调用会等待当前操作完成，而不是被丢弃。
 */
class SingleRunner {
  private pending: Promise<unknown> | null = null;

  /**
   * 执行异步操作，如果已有操作在执行则等待其完成。
   * @param fn - 要执行的异步函数
   * @returns 操作结果
   */
  run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.pending) {
      return this.pending as Promise<T>;
    }

    this.pending = fn().finally(() => {
      this.pending = null;
    });

    return this.pending as Promise<T>;
  }

  /**
   * 是否有操作正在执行。
   */
  get running(): boolean {
    return !!this.pending;
  }
}

/** PDF 导出对话框锁 */
const exportPdfLock = new SingleRunner();

/**
 * 注册导出功能 IPC handlers。
 */
export function registerExportHandlers(): void {
  ipcMain.handle('export:pdf', async (_event, options: ElectronExportPdfOptions): Promise<string | null> => {
    return exportPdfLock.run(async () => {
      const result = await showSaveDialog({
        filters: options.filters,
        defaultPath: options.defaultPath || 'untitled.pdf'
      });

      if (result.canceled || !result.filePath) {
        return null;
      }

      const pdfBuffer = await renderPdfBufferFromHtml(options.html);
      const { promises: fs } = await import('node:fs');

      // 先写入临时文件再 rename 原子替换，避免直接覆写导致 macOS 上创建时间不更新
      const tmpPath = `${result.filePath}.tibis-tmp`;
      await fs.writeFile(tmpPath, pdfBuffer);
      await fs.rename(tmpPath, result.filePath);

      return result.filePath;
    });
  });
}
