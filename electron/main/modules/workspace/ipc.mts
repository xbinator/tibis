/**
 * @file ipc.mts
 * @description 工作区 IPC handler 注册，包含根目录、安全读取和文件监听。
 */
import { ipcMain } from 'electron';
import { readWorkspaceDirectory, readWorkspaceFile, type ReadWorkspaceDirectoryRequest, type ReadWorkspaceFileRequest } from './read.mjs';
import { ensureTibisWorkspaceRoot } from './root.mjs';
import { fileWatchService } from './watch.mjs';

/**
 * 注册工作区 IPC handlers。
 */
export function registerWorkspaceHandlers(): void {
  // 根目录
  ipcMain.handle('workspace:get-root', async () => {
    try {
      const result = await ensureTibisWorkspaceRoot();
      return result;
    } catch (error) {
      // 目录创建或规范化失败时返回 null，调用方据此判断工作区不可用
      return null;
    }
  });

  // 安全读取
  ipcMain.handle('fs:readWorkspaceTextFile', async (_event, request: ReadWorkspaceFileRequest) => readWorkspaceFile(request));
  ipcMain.handle('fs:readWorkspaceDirectory', async (_event, request: ReadWorkspaceDirectoryRequest) => readWorkspaceDirectory(request));

  // 文件监听
  ipcMain.handle('fs:watchFile', async (_event, filePath: string) => {
    await fileWatchService.watch(filePath);
  });

  ipcMain.handle('fs:unwatchFile', async (_event, filePath: string) => {
    await fileWatchService.unwatch(filePath);
  });

  ipcMain.handle('fs:unwatchAll', async () => {
    await fileWatchService.unwatchAll();
  });

  ipcMain.handle('fs:watchResourceDirectory', async (_event, rootPath: string) => {
    await fileWatchService.watchResourceDirectory(rootPath);
  });

  ipcMain.handle('fs:unwatchResourceDirectory', async (_event, rootPath: string) => {
    await fileWatchService.unwatchResourceDirectory(rootPath);
  });
}
