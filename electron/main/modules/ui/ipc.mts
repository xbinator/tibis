/**
 * @file ipc.mts
 * @description UI 层 IPC handler 注册，包含系统操作、窗口控制、菜单和快捷入口。
 */
import os from 'node:os';
import path from 'node:path';
import type { RecentFileShortcutInput } from './model.mjs';
import type { ElectronImagePreviewRequest, ElectronImagePreviewResult } from 'types/electron-api';
import { ipcMain, Menu, shell } from 'electron';
import { getFocusedWindow } from '../../window.mjs';
import { getImagePreviewService } from './image-preview.mjs';
import { updateShortcuts } from './shortcuts.mjs';

/**
 * 注册 UI 层 IPC handlers。
 */
export function registerUiHandlers(): void {
  // 系统操作
  ipcMain.handle('ui:openExternal', async (_event, url: string) => {
    await shell.openExternal(url);
  });

  ipcMain.handle('ui:previewImage', async (_event, request: ElectronImagePreviewRequest): Promise<ElectronImagePreviewResult> => {
    return getImagePreviewService().previewImage(request);
  });

  ipcMain.handle('ui:trashFile', async (_event, filePath: string) => {
    // 业务层传入的路径统一为 / 分隔符，需在调用 shell.trashItem 前转换为平台原生分隔符，
    // 否则 Windows 上的 SHFileOperation 会拒绝正斜杠路径并抛出 "Failed to parse path"。
    const normalizedPath = path.normalize(filePath);
    await shell.trashItem(normalizedPath);
  });

  ipcMain.handle('ui:showItemInFolder', async (_event, filePath: string) => {
    shell.showItemInFolder(filePath);
  });

  ipcMain.handle('ui:getRelativePath', async (_event, filePath: string) => {
    const relativePath = path.relative(process.cwd(), filePath);
    return relativePath || '.';
  });

  ipcMain.handle('ui:getCwd', async () => {
    return process.cwd();
  });

  ipcMain.handle('ui:getHomeDir', async () => {
    return os.homedir();
  });

  // 窗口控制
  ipcMain.handle('ui:setTitle', async (_event, title: string) => {
    const win = getFocusedWindow();
    if (win) {
      win.setTitle(title);
    }
  });

  ipcMain.handle('ui:minimize', async () => {
    const win = getFocusedWindow();
    if (win) {
      win.minimize();
    }
  });

  ipcMain.handle('ui:maximize', async () => {
    const win = getFocusedWindow();
    if (win) {
      if (win.isMaximized()) {
        win.unmaximize();
      } else {
        win.maximize();
      }
    }
  });

  ipcMain.handle('ui:close', async () => {
    const win = getFocusedWindow();
    if (win) {
      win.close();
    }
  });

  ipcMain.handle('ui:isMaximized', async () => {
    const win = getFocusedWindow();
    return win ? win.isMaximized() : false;
  });

  ipcMain.handle('ui:isFullScreen', async () => {
    const win = getFocusedWindow();
    return win ? win.isFullScreen() : false;
  });

  // 菜单项更新
  ipcMain.on('ui:updateMenuItem', (_event, id: string, properties: { checked?: boolean }) => {
    const menu = Menu.getApplicationMenu();
    if (!menu) return;

    const item = menu.getMenuItemById(id);
    if (item && typeof properties.checked === 'boolean') {
      item.checked = properties.checked;
    }
  });

  // 快捷入口最近文件同步
  ipcMain.handle('ui:syncRecentFiles', async (_event, files: RecentFileShortcutInput[]) => {
    updateShortcuts(files);
  });
}
