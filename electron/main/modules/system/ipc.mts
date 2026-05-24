import os from 'node:os';
import path from 'node:path';
import { ipcMain, shell } from 'electron';

export function registerSystemHandlers(): void {
  ipcMain.handle('system:openExternal', async (_event, url: string) => {
    await shell.openExternal(url);
  });

  ipcMain.handle('system:trashFile', async (_event, filePath: string) => {
    await shell.trashItem(filePath);
  });

  ipcMain.handle('system:showItemInFolder', async (_event, filePath: string) => {
    shell.showItemInFolder(filePath);
  });

  ipcMain.handle('system:getRelativePath', async (_event, filePath: string) => {
    const relativePath = path.relative(process.cwd(), filePath);
    return relativePath || '.';
  });

  ipcMain.handle('system:getCwd', async () => {
    return process.cwd();
  });

  ipcMain.handle('system:getHomeDir', async () => {
    return os.homedir();
  });
}
