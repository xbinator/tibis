import * as fs from 'node:fs';
import * as path from 'node:path';
import { ipcMain } from 'electron';
import { fileWatchService } from './service.mjs';
import { readWorkspaceDirectory, readWorkspaceFile, type ReadWorkspaceDirectoryRequest, type ReadWorkspaceFileRequest } from './workspace-read.mjs';

/**
 * 文件路径状态。
 */
export interface FilePathStatus {
  /** 路径是否存在。 */
  exists: boolean;
  /** 路径是否为普通文件。 */
  isFile: boolean;
  /** 路径是否为目录。 */
  isDirectory: boolean;
}

/**
 * 查询目标路径当前是否存在以及实体类型。
 * @param targetPath - 目标路径
 * @returns 路径状态
 */
export async function getFilePathStatus(targetPath: string): Promise<FilePathStatus> {
  try {
    const stats = await fs.promises.stat(targetPath);

    return {
      exists: true,
      isFile: stats.isFile(),
      isDirectory: stats.isDirectory()
    };
  } catch {
    return {
      exists: false,
      isFile: false,
      isDirectory: false
    };
  }
}

export function registerFileHandlers(): void {
  ipcMain.handle('fs:readFile', async (_event, filePath: string) => {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    const fileName = path.basename(filePath);
    const ext = path.extname(filePath).slice(1);
    return { content, fileName, ext };
  });

  ipcMain.handle('fs:readWorkspaceTextFile', async (_event, request: ReadWorkspaceFileRequest) => readWorkspaceFile(request));
  ipcMain.handle('fs:readWorkspaceDirectory', async (_event, request: ReadWorkspaceDirectoryRequest) => readWorkspaceDirectory(request));
  ipcMain.handle('fs:getPathStatus', async (_event, targetPath: string) => getFilePathStatus(targetPath));

  ipcMain.handle('fs:writeFile', async (_event, filePath: string, content: string) => {
    await fs.promises.writeFile(filePath, content, 'utf-8');
  });

  ipcMain.handle('fs:renameFile', async (_event, oldPath: string, newPath: string) => {
    await fs.promises.rename(oldPath, newPath);
  });

  ipcMain.handle('fs:watchFile', async (_event, filePath: string) => {
    await fileWatchService.watch(filePath);
  });

  ipcMain.handle('fs:unwatchFile', async (_event, filePath: string) => {
    await fileWatchService.unwatch(filePath);
  });

  ipcMain.handle('fs:unwatchAll', async () => {
    await fileWatchService.unwatchAll();
  });

  ipcMain.handle('fs:watchDirectory', async (_event, dirPath: string, globPattern?: string) => {
    await fileWatchService.watchDirectory(dirPath, globPattern);
  });

  ipcMain.handle('fs:unwatchDirectory', async (_event, dirPath: string, globPattern?: string) => {
    await fileWatchService.unwatchDirectory(dirPath, globPattern);
  });
}
