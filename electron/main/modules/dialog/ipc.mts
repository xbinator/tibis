/**
 * @file ipc.mts
 * @description 原生文件对话框 IPC handler 注册。
 */
import * as path from 'node:path';
import type { ElectronFileResult, ElectronOpenFileOptions, ElectronSaveFileOptions } from 'types/electron-api';
import { ipcMain } from 'electron';
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
}
