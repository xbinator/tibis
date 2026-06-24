import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow } from 'electron';
import { env } from './env.mjs';
import { normalizeAttachedWebviewUrl, sanitizeAttachedWebPreferences } from './modules/webview/ipc.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;

export function isDev(): boolean {
  return process.env.NODE_ENV === 'development' || !app.isPackaged;
}

export function getPreloadPath(): string {
  return path.join(__dirname, '../preload/index.mjs');
}

/**
 * 获取 `<webview>` 访客页 preload 脚本路径。
 * @returns `<webview>` 访客页 preload 脚本绝对路径
 */
export function getWebviewTagPreloadPath(): string {
  return path.join(__dirname, '../preload/webview-tag.mjs');
}

export function getDistPath(): string {
  return path.join(__dirname, '../../dist/index.html');
}

export function getDevServerUrl(): string {
  return `http://${env.DEV_SERVER_HOST}:${env.DEV_SERVER_PORT}`;
}

export function getIconPath(): string {
  // 统一图标名
  const iconName = process.platform === 'darwin' ? 'app.icns' : 'app.png';

  if (isDev()) {
    // 开发环境：直接读取资源文件夹
    return path.join(__dirname, '../../resources/icons', iconName);
  }

  // 生产环境（打包后）
  if (process.platform === 'darwin') {
    // macOS 打包后图标在 app 包内的 Contents/Resources
    return path.join(process.resourcesPath, 'app.icns');
  }

  // Windows / Linux
  return path.join(process.resourcesPath, 'icons', iconName);
}

export function createWindow(): BrowserWindow {
  const iconPath = getIconPath();
  const windowOptions: Electron.BrowserWindowConstructorOptions = {
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'Tibis',
    frame: false,
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 12, y: 10 },
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: true
    }
  };

  if (iconPath) {
    windowOptions.icon = iconPath;
  }

  mainWindow = new BrowserWindow(windowOptions);

  mainWindow.webContents.on('will-attach-webview', (event, webPreferences, params) => {
    try {
      params.src = normalizeAttachedWebviewUrl(params.src);
      delete webPreferences.preload;

      const mutableParams = params as Record<string, unknown>;
      delete mutableParams.preload;

      Object.assign(webPreferences, sanitizeAttachedWebPreferences(webPreferences as Record<string, unknown>));
      webPreferences.preload = getWebviewTagPreloadPath();
    } catch (error) {
      event.preventDefault();
      mainWindow?.webContents.send('webview:attach-rejected', {
        src: String(params.src || ''),
        reason: error instanceof Error ? error.message : 'Unknown webview attach error'
      });
    }
  });

  if (isDev()) {
    mainWindow.loadURL(getDevServerUrl());
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(getDistPath());
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

export function getWindow(): BrowserWindow | null {
  return mainWindow;
}

export function getFocusedWindow(): BrowserWindow | null {
  return BrowserWindow.getFocusedWindow();
}

export function getWindowFromWebContents(webContents: Electron.WebContents): BrowserWindow | null {
  return BrowserWindow.fromWebContents(webContents);
}
