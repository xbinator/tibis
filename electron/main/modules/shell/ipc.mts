import path from 'node:path';
import { ipcMain, shell } from 'electron';

export function registerShellHandlers(): void {
  ipcMain.handle('shell:openExternal', async (_event, url: string) => {
    await shell.openExternal(url);
  });

  ipcMain.handle('shell:trashFile', async (_event, filePath: string) => {
    await shell.trashItem(filePath);
  });

  ipcMain.handle('shell:showItemInFolder', async (_event, filePath: string) => {
    shell.showItemInFolder(filePath);
  });

  ipcMain.handle('shell:getRelativePath', async (_event, filePath: string) => {
    const relativePath = path.relative(process.cwd(), filePath);
    return relativePath || '.';
  });
}
