/**
 * @file ipc.mts
 * @description 注册应用更新检查 IPC handler。
 */
import { app, ipcMain } from 'electron';
import { checkForUpdate, type UpdateCheckResult } from './service.mjs';

/**
 * 注册更新检查相关 IPC handlers。
 */
export function registerUpdaterHandlers(): void {
  ipcMain.handle('updater:checkForUpdate', async (): Promise<UpdateCheckResult> => {
    return checkForUpdate({ currentVersion: app.getVersion() });
  });
}
