/**
 * @file ipc.mts
 * @description 工作区根目录 IPC handler 注册。
 */
import type { IpcMainInvokeEvent } from 'electron';
import { ipcMain } from 'electron';
import { ensureTibisWorkspaceRoot } from './root.mjs';

/**
 * 注册工作区根目录 IPC handlers。
 */
export function registerWorkspaceHandlers(): void {
  ipcMain.handle('workspace:get-root', async (_event: IpcMainInvokeEvent) => {
    try {
      const result = await ensureTibisWorkspaceRoot();
      return result;
    } catch (error) {
      // 目录创建或规范化失败时返回 null，调用方据此判断工作区不可用
      return null;
    }
  });
}
