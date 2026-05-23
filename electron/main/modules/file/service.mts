/**
 * @file service.mts
 * @description 提供主进程文件变化监听服务，支持文件级和目录级监听，并向所有窗口广播事件。
 */

import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
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
 * 判断目录监听事件是否匹配请求的 skill 文件模式。
 * @param filePath - 变更文件路径
 * @param globPattern - 调用方传入的匹配模式
 * @returns 是否应该广播 skill 变更事件
 */
export function isDirectoryWatchMatch(filePath: string, globPattern: string): boolean {
  if (globPattern.endsWith('SKILL.md')) {
    return path.basename(filePath) === 'SKILL.md';
  }

  if (globPattern.endsWith('*.md')) {
    return path.extname(filePath).toLowerCase() === '.md';
  }

  return path.basename(filePath) === path.basename(globPattern);
}

/**
 * 主进程文件监听服务，支持多个路径同时监听。
 */
class FileWatchService {
  /** 按文件路径保存已创建的 watcher。 */
  private readonly watchers = new Map<string, FileWatcher>();

  /** 按目录路径保存已创建的目录 watcher。 */
  private readonly directoryWatchers = new Map<string, FileWatcher>();

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
   * 注册指定目录的监听，匹配 glob 模式的文件变化时广播 skill:changed 事件。
   * @param dirPath - 需要监听的目录路径
   * @param globPattern - 文件匹配模式
   */
  async watchDirectory(dirPath: string, globPattern = `**/SKILL.md`): Promise<void> {
    const watcherKey = `${dirPath}:${globPattern}`;
    if (this.directoryWatchers.has(watcherKey)) return;

    const watcher = chokidar.watch(dirPath, {
      persistent: true,
      depth: 3,
      ignored: ['**/node_modules/**', '**/.git/**'],
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 100
      }
    });

    watcher.on('change', async (changedPath: string) => {
      if (!isDirectoryWatchMatch(changedPath, globPattern)) return;
      try {
        const content = await fsPromises.readFile(changedPath, 'utf-8');
        this.notifyWindowsSkill('change', changedPath, content);
      } catch (error: unknown) {
        console.error('DirectoryWatchService read error:', error);
      }
    });

    watcher.on('add', async (addedPath: string) => {
      if (!isDirectoryWatchMatch(addedPath, globPattern)) return;
      try {
        const content = await fsPromises.readFile(addedPath, 'utf-8');
        this.notifyWindowsSkill('add', addedPath, content);
      } catch (error: unknown) {
        console.error('DirectoryWatchService read error on add:', error);
      }
    });

    watcher.on('unlink', (removedPath: string) => {
      if (!isDirectoryWatchMatch(removedPath, globPattern)) return;
      this.notifyWindowsSkill('unlink', removedPath);
    });

    this.directoryWatchers.set(watcherKey, watcher);
  }

  /**
   * 停止监听指定目录。
   * @param dirPath - 需要停止监听的目录路径
   * @param globPattern - 文件匹配模式
   */
  async unwatchDirectory(dirPath: string, globPattern = `**/SKILL.md`): Promise<void> {
    const watcherKey = `${dirPath}:${globPattern}`;
    const watcher = this.directoryWatchers.get(watcherKey);
    if (!watcher) return;

    this.directoryWatchers.delete(watcherKey);
    await watcher.close();
  }

  /**
   * 向所有窗口广播 skill 目录变化事件。
   * @param type - 事件类型
   * @param filePath - 文件路径
   * @param content - 文件内容（仅 change/add 事件携带）
   */
  private notifyWindowsSkill(type: 'change' | 'add' | 'unlink', filePath: string, content?: string): void {
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send('skill:changed', { type, filePath, content });
    });
  }

  /**
   * 停止所有文件监听，用于应用退出或 watcher store dispose。
   */
  async unwatchAll(): Promise<void> {
    const fileWatchers = Array.from(this.watchers.values());
    const dirWatchers = Array.from(this.directoryWatchers.values());
    this.watchers.clear();
    this.directoryWatchers.clear();
    await Promise.all([...fileWatchers, ...dirWatchers].map((w) => w.close()));
  }
}

export const fileWatchService = new FileWatchService();
