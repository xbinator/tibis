import { app, BrowserWindow } from 'electron';
import { registerAllIpcHandlers, initDatabase, closeDatabase, initStore, initLogger, setupAppMenu } from './modules/index.mjs';
import { createWindow } from './window.mjs';

// 设置应用名称（开发模式下也生效）
app.setName('Tibis');

function handleActivate(): void {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
}

function handleWindowAllClosed(): void {
  closeDatabase();
  if (process.platform !== 'darwin') {
    app.quit();
  }
}

async function bootstrap(): Promise<void> {
  // 初始化日志 (仅控制台)
  initLogger();

  // 初始化存储
  await initStore();
  // 初始化数据库
  await initDatabase();
  registerAllIpcHandlers();

  // 设置系统菜单
  setupAppMenu();

  // 创建窗口
  createWindow();

  app.on('activate', handleActivate);
}

app.whenReady().then(bootstrap);
app.on('window-all-closed', handleWindowAllClosed);
