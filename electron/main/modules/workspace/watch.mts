/**
 * @file watch.mts
 * @description 提供主进程文件与资源目录变化监听服务，并向所有窗口广播事件。
 */

import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import chokidar from 'chokidar';
import { BrowserWindow } from 'electron';

/**
 * unlink → add 防抖窗口时长（毫秒）。
 * Git 回退等操作会快速触发 unlink + add，在此窗口内合并为 change 事件。
 */
const RECREATE_WINDOW_MS = 300;

/**
 * chokidar 文件监听器实例类型。
 */
type FileWatcher = ReturnType<typeof chokidar.watch>;

/**
 * 记录资源目录 watcher 的运行期错误，避免未处理的 error 事件终止主进程。
 * @param error - Chokidar 错误
 */
function handleResourceWatcherError(error: unknown): void {
  console.error('ResourceDirectoryWatchService error:', error);
}

/**
 * 等待 Chokidar 完成首次目录遍历。
 * @param watcher - Chokidar watcher
 * @returns watcher ready 信号
 */
function waitForWatcherReady(watcher: FileWatcher): Promise<void> {
  return new Promise<void>((resolve: () => void, reject: (error: unknown) => void): void => {
    /** ready 前的临时错误处理器。 */
    let handleError: (error: unknown) => void;

    /** 完成 watcher 注册。 */
    function handleReady(): void {
      watcher.off('error', handleError);
      resolve();
    }

    /** 拒绝 watcher 注册。 */
    handleError = (error: unknown): void => {
      watcher.off('ready', handleReady);
      reject(error);
    };

    watcher.once('ready', handleReady);
    watcher.once('error', handleError);
  });
}

/**
 * 统一监听路径分隔符，避免 Windows 反斜杠影响匹配。
 * @param filePath - 原始文件路径
 * @returns 使用 / 分隔的路径
 */
function normalizeWatchPath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

/**
 * 判断目录是否为资源根目录下的直接可见子目录。
 * @param dirPath - 待判断目录路径
 * @param rootPath - 资源根目录路径
 * @returns 仅直接且非隐藏子目录返回 true
 */
export function isResourceDirectory(dirPath: string, rootPath: string): boolean {
  const normalizedRoot = normalizeWatchPath(rootPath).replace(/\/+$/u, '');
  const normalizedDir = normalizeWatchPath(dirPath).replace(/\/+$/u, '');
  if (!normalizedDir.startsWith(`${normalizedRoot}/`)) {
    return false;
  }

  const relativePath = normalizedDir.slice(normalizedRoot.length + 1);
  return relativePath.length > 0 && !relativePath.includes('/') && !relativePath.startsWith('.');
}

/**
 * 主进程文件监听服务，支持多个路径同时监听。
 */
export class FileWatchService {
  /** 按文件路径保存已创建的 watcher。 */
  private readonly watchers = new Map<string, FileWatcher>();

  /** 按资源根目录保存直接子目录 watcher。 */
  private readonly resourceDirectoryWatchers = new Map<string, FileWatcher>();

  /** unlink 防抖定时器，用于合并 git 回退等场景的 unlink → add 序列。 */
  private readonly pendingUnlinks = new Map<string, NodeJS.Timeout>();

  /**
   * 向所有窗口广播文件变化事件。
   * @param type - 事件类型
   * @param filePath - 文件路径
   * @param content - 文件内容（仅 change 事件携带）
   */
  private notifyWindows(type: 'change' | 'unlink' | 'add', filePath: string, content?: string): void {
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send('file:changed', { type, filePath, content });
    });
  }

  /**
   * 注册指定路径的文件监听；重复注册同一路径时保持幂等。
   * @param filePath - 需要监听的文件路径
   */
  async watch(filePath: string): Promise<void> {
    if (this.watchers.has(filePath)) return;

    const watcher = chokidar.watch(filePath, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 100
      }
    });

    watcher.on('change', async (changedPath: string) => {
      try {
        const content = await fsPromises.readFile(changedPath, 'utf-8');
        this.notifyWindows('change', changedPath, content);
      } catch (error: unknown) {
        console.error('FileWatchService read error:', error);
      }
    });

    watcher.on('unlink', (removedPath: string) => {
      const timer = setTimeout(() => {
        this.pendingUnlinks.delete(removedPath);

        if (!fs.existsSync(removedPath)) {
          this.notifyWindows('unlink', removedPath);
        }
      }, RECREATE_WINDOW_MS);

      this.pendingUnlinks.set(removedPath, timer);
    });

    watcher.on('add', async (addedPath: string) => {
      const timer = this.pendingUnlinks.get(addedPath);

      if (timer) {
        clearTimeout(timer);
        this.pendingUnlinks.delete(addedPath);

        try {
          const content = await fsPromises.readFile(addedPath, 'utf-8');
          this.notifyWindows('change', addedPath, content);
        } catch (error: unknown) {
          console.error('FileWatchService read error on add:', error);
        }
        return;
      }

      this.notifyWindows('add', addedPath);
    });

    this.watchers.set(filePath, watcher);
  }

  /**
   * 停止监听指定路径。
   * @param filePath - 需要停止监听的文件路径
   */
  async unwatch(filePath: string): Promise<void> {
    const watcher = this.watchers.get(filePath);
    if (!watcher) return;

    this.watchers.delete(filePath);
    await watcher.close();
  }

  /**
   * 监听资源根目录的直接子目录新增与删除。
   * @param rootPath - Skill 或 Widget 资源根目录
   */
  async watchResourceDirectory(rootPath: string): Promise<void> {
    const normalizedRoot = normalizeWatchPath(rootPath).replace(/\/+$/u, '');
    if (this.resourceDirectoryWatchers.has(normalizedRoot)) {
      return;
    }

    const watcher = chokidar.watch(rootPath, {
      persistent: true,
      ignoreInitial: true,
      depth: 0
    });
    watcher.on('error', handleResourceWatcherError);
    watcher.on('addDir', (dirPath: string) => {
      if (isResourceDirectory(dirPath, normalizedRoot)) {
        this.notifyWindowsDirectory('add', normalizedRoot, normalizeWatchPath(dirPath));
      }
    });
    watcher.on('unlinkDir', (dirPath: string) => {
      if (isResourceDirectory(dirPath, normalizedRoot)) {
        this.notifyWindowsDirectory('unlink', normalizedRoot, normalizeWatchPath(dirPath));
      }
    });
    this.resourceDirectoryWatchers.set(normalizedRoot, watcher);
    try {
      // ready 之后再让 renderer 开始扫描，封住 watcher 初次遍历期间的事件窗口。
      await waitForWatcherReady(watcher);
    } catch (error: unknown) {
      this.resourceDirectoryWatchers.delete(normalizedRoot);
      await watcher.close();
      throw error;
    }
  }

  /**
   * 停止监听资源根目录。
   * @param rootPath - Skill 或 Widget 资源根目录
   */
  async unwatchResourceDirectory(rootPath: string): Promise<void> {
    const normalizedRoot = normalizeWatchPath(rootPath).replace(/\/+$/u, '');
    const watcher = this.resourceDirectoryWatchers.get(normalizedRoot);
    if (!watcher) {
      return;
    }

    this.resourceDirectoryWatchers.delete(normalizedRoot);
    await watcher.close();
  }

  /**
   * 向所有窗口广播资源目录变化事件。
   * @param type - 目录事件类型
   * @param rootPath - 被监听的资源根目录
   * @param dirPath - 新增或删除的直接子目录
   */
  private notifyWindowsDirectory(type: 'add' | 'unlink', rootPath: string, dirPath: string): void {
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send('directory:changed', { type, rootPath, dirPath });
    });
  }

  /**
   * 停止所有文件监听，用于应用退出或 watcher store dispose。
   */
  async unwatchAll(): Promise<void> {
    const fileWatchers = Array.from(this.watchers.values());
    const resourceDirectoryWatchers = Array.from(this.resourceDirectoryWatchers.values());
    this.watchers.clear();
    this.resourceDirectoryWatchers.clear();
    await Promise.all([...fileWatchers, ...resourceDirectoryWatchers].map((w) => w.close()));
  }
}

export const fileWatchService = new FileWatchService();
