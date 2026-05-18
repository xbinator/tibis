import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import type { ElectronExportPdfOptions, ElectronFileResult, ElectronOpenFileOptions, ElectronSaveFileOptions } from 'types/electron-api';
import { BrowserWindow, ipcMain } from 'electron';
import { showOpenDialog, showSaveDialog } from './utils.mjs';

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

/** 打开文件对话框锁 */
const openLock = new SingleRunner();
/** 保存文件对话框锁 */
const saveLock = new SingleRunner();
/** PDF 导出对话框锁 */
const exportPdfLock = new SingleRunner();

/**
 * 生成隐藏打印窗口，并将指定 HTML 渲染为 PDF 缓冲区。
 * Electron 主进程只负责通用的 HTML -> PDF 管道，不参与正文语义判断。
 * 这里使用临时 HTML 文件而非 data URL，避免大体积导出内容触发 URL 长度/合法性问题。
 * @param html - 已准备好的完整 HTML 文档
 * @returns PDF 二进制数据
 */
export async function renderPdfBufferFromHtml(html: string): Promise<Buffer> {
  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      sandbox: true
    }
  });
  const tempDirectory = await mkdtemp(path.join(tmpdir(), 'tibis-pdf-export-'));
  const tempHtmlPath = path.join(tempDirectory, 'export.html');

  try {
    await writeFile(tempHtmlPath, html, 'utf-8');
    await window.loadFile(tempHtmlPath);

    return await window.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true });
  } finally {
    window.destroy();
    await rm(tempDirectory, { recursive: true, force: true });
  }
}

export function registerDialogHandlers(): void {
  ipcMain.handle('dialog:openFile', async (_event, options?: ElectronOpenFileOptions): Promise<ElectronFileResult> => {
    return openLock.run(async () => {
      const result = await showOpenDialog({
        properties: ['openFile'],
        filters: options?.filters
      });

      if (result.canceled || !result.filePaths.length) {
        return { canceled: true, filePath: null, content: '', fileName: '', ext: '' } satisfies ElectronFileResult;
      }

      const { promises: fs } = await import('node:fs');
      const filePath = result.filePaths[0];
      const content = await fs.readFile(filePath, 'utf-8');
      const fileName = path.basename(filePath);
      const ext = path.extname(filePath).slice(1);

      return { canceled: false, filePath, content, fileName, ext } satisfies ElectronFileResult;
    });
  });

  ipcMain.handle('dialog:saveFile', async (_event, content: string, filePath?: string, options?: ElectronSaveFileOptions): Promise<string | null> => {
    if (filePath) {
      const { promises: fs } = await import('node:fs');
      await fs.writeFile(filePath, content, 'utf-8');
      return filePath;
    }

    return saveLock.run(async () => {
      const result = await showSaveDialog({
        filters: options?.filters,
        defaultPath: options?.defaultPath || 'untitled.md'
      });

      if (result.canceled || !result.filePath) {
        return null;
      }

      const { promises: fs } = await import('node:fs');
      await fs.writeFile(result.filePath, content, 'utf-8');
      return result.filePath;
    });
  });

  ipcMain.handle('dialog:exportPdf', async (_event, options: ElectronExportPdfOptions): Promise<string | null> => {
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
      await fs.writeFile(result.filePath, pdfBuffer);
      return result.filePath;
    });
  });
}
