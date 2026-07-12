/**
 * @file ipc.mts
 * @description 文件系统基础操作 IPC handler 注册。
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { DirectoryInstallLockManager } from './install-lock.mjs';

/** 所有渲染窗口共享的目录安装锁。 */
const directoryInstallLocks = new DirectoryInstallLockManager();
/** 已注册销毁监听的渲染进程。 */
const trackedInstallLockOwners = new Set<number>();

/**
 * 监听渲染进程销毁并释放其遗留安装锁。
 * @param event - IPC 调用事件
 */
function trackInstallLockOwner(event: IpcMainInvokeEvent): void {
  const ownerId = event.sender.id;
  if (trackedInstallLockOwners.has(ownerId)) {
    return;
  }

  trackedInstallLockOwners.add(ownerId);
  event.sender.once('destroyed', (): void => {
    trackedInstallLockOwners.delete(ownerId);
    directoryInstallLocks.releaseOwner(ownerId);
  });
}

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
 * 判断文件系统错误是否仅表示路径不存在。
 * @param error - 文件系统错误
 * @returns 是否为 ENOENT 或 ENOTDIR
 */
function isMissingPathError(error: unknown): boolean {
  if (!(error instanceof Error) || !('code' in error)) {
    return false;
  }

  const { code } = error as NodeJS.ErrnoException;
  return code === 'ENOENT' || code === 'ENOTDIR';
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
  } catch (error: unknown) {
    if (!isMissingPathError(error)) {
      throw error;
    }

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

  ipcMain.handle('fs:getPathStatus', async (_event, targetPath: string) => getFilePathStatus(targetPath));

  ipcMain.handle('fs:writeFile', async (_event, filePath: string, content: string) => {
    await fs.promises.writeFile(filePath, content, 'utf-8');
  });

  ipcMain.handle('fs:renameFile', async (_event, oldPath: string, newPath: string) => {
    await fs.promises.rename(oldPath, newPath);
  });

  ipcMain.handle('fs:ensureDir', async (_event, dirPath: string) => {
    await fs.promises.mkdir(dirPath, { recursive: true });
  });

  ipcMain.handle('fs:acquireDirectoryInstallLock', async (event: IpcMainInvokeEvent, targetPath: string) => {
    trackInstallLockOwner(event);
    return directoryInstallLocks.acquire(targetPath, event.sender.id);
  });

  ipcMain.handle('fs:releaseDirectoryInstallLock', (event: IpcMainInvokeEvent, token: string) => {
    directoryInstallLocks.release(token, event.sender.id);
  });
}
