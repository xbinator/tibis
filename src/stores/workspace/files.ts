/**
 * @file files.ts
 * @description 管理最近文件列表，并提供统一的打开文件 usecase。
 */

import { defineStore } from 'pinia';
import { customAlphabet } from 'nanoid';
import { native } from '@/shared/platform';
import type { StoredFile } from '@/shared/storage';
import { recentFilesStorage, sortRecentFiles } from '@/shared/storage';

/**
 * files store 的状态定义。
 */
export interface FilesState {
  /** 最近文件列表，始终来自 storage 派生排序结果。 */
  recentFiles: StoredFile[] | null;
}

/**
 * 打开文件来源标记。
 */
export type OpenSource = 'welcome' | 'search' | 'menu' | 'platform-recent' | 'native-open' | 'drop' | 'new';

const createFileId = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz_', 8);
const inflightPaths = new Set<string>();
let writeQueue: Promise<void> = Promise.resolve();

/**
 * 串行化 store 写入动作，避免多个入口并发覆盖 recent 状态。
 * @param fn - 具体写入逻辑
 * @returns 写入结果
 */
function enqueueWrite<T>(fn: () => Promise<T>): Promise<T> {
  const result = writeQueue.then(fn);
  writeQueue = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

export const useFilesStore = defineStore('files', {
  state: (): FilesState => ({
    recentFiles: null
  }),

  actions: {
    /**
     * 从存储层刷新最近文件列表。
     * @returns 派生排序后的最近文件列表
     */
    async refreshRecentFiles(): Promise<StoredFile[]> {
      const files = await recentFilesStorage.getAllRecentFiles();
      this.recentFiles = files;
      return files;
    },

    /**
     * 写入后直接更新内存缓存并重排序，避免额外 IPC 读取全量数据。
     * @param updatedFile - 写入操作返回的最新文件记录
     */
    patchCache(updatedFile: StoredFile): void {
      if (this.recentFiles === null) return;
      const filtered = this.recentFiles.filter((f) => f.id !== updatedFile.id);
      filtered.unshift(updatedFile);
      this.recentFiles = sortRecentFiles(filtered);
    },

    /**
     * 从内存缓存中移除指定 ID 的记录，避免删除后重新 IPC 读取。
     * @param ids - 需要移除的文件 ID 列表
     */
    removeCacheEntries(ids: string[]): void {
      if (this.recentFiles === null) return;
      const idSet = new Set(ids);
      this.recentFiles = this.recentFiles.filter((f) => !idSet.has(f.id));
    },

    /**
     * 确保 store 已经加载最近文件列表。
     */
    async ensureLoaded(): Promise<void> {
      if (this.recentFiles !== null) return;

      await this.refreshRecentFiles();
      await this.syncRecentFiles();
    },

    /**
     * 按 ID 获取最近文件记录。
     * @param id - 文件 ID
     * @returns 命中的文件记录
     */
    async getFileById(id: string): Promise<StoredFile | undefined> {
      await this.ensureLoaded();

      return this.recentFiles?.find((file) => file.id === id);
    },

    /**
     * 按路径获取最近文件记录。
     * @param path - 磁盘路径
     * @returns 命中的文件记录
     */
    async getFileByPath(path: string): Promise<StoredFile | undefined> {
      await this.ensureLoaded();

      return this.recentFiles?.find((file) => file.path === path);
    },

    /**
     * 添加最近文件，直接更新内存缓存。
     * @param file - 需要写入的文件记录
     * @returns 写入后的文件记录
     */
    async addFile(file: StoredFile): Promise<StoredFile> {
      await recentFilesStorage.addRecentFile(file);
      this.patchCache(file);
      this.syncRecentFiles();
      return file;
    },

    /**
     * 更新最近文件记录，直接更新内存缓存。
     * @param id - 文件 ID
     * @param updates - 需要更新的字段
     * @returns 更新后的文件记录
     */
    async updateFile(id: string, updates: Partial<StoredFile>): Promise<StoredFile> {
      const nextFile = await recentFilesStorage.updateRecentFile(id, updates);
      this.patchCache(nextFile);
      this.syncRecentFiles();
      return nextFile;
    },

    /**
     * 打开已存在的最近文件，直接更新内存缓存。
     * @param id - 文件 ID
     * @param _source - 打开来源
     * @returns 被打开的文件记录
     */
    async openExistingFile(id: string): Promise<StoredFile> {
      await this.ensureLoaded();
      const touchedFile = await enqueueWrite(() => recentFilesStorage.touchRecentFile(id));
      this.patchCache(touchedFile);
      this.syncRecentFiles();
      return touchedFile;
    },

    /**
     * 按磁盘路径打开文件；若不存在于最近文件，则读取磁盘并创建记录。
     * @param path - 磁盘路径
     * @param source - 打开来源
     * @returns 被打开或创建的文件记录
     */
    async openOrCreateByPath(path: string): Promise<StoredFile | null> {
      if (inflightPaths.has(path)) return null;

      inflightPaths.add(path);

      try {
        await this.ensureLoaded();

        const existingFile = await this.getFileByPath(path);
        if (existingFile) {
          return this.openExistingFile(existingFile.id);
        }

        const file = await native.readFile(path);
        const now = Date.now();
        const createdFile: StoredFile = {
          id: createFileId(),
          path,
          content: file.content,
          savedContent: file.content,
          name: file.name,
          ext: file.ext,
          createdAt: now,
          openedAt: now,
          savedAt: now
        };

        await enqueueWrite(async () => {
          await recentFilesStorage.addRecentFile(createdFile);
        });

        this.patchCache(createdFile);
        this.syncRecentFiles();
        return createdFile;
      } finally {
        inflightPaths.delete(path);
      }
    },

    /**
     * 按磁盘路径强制读取最新内容；若最近文件已存在该路径，则覆盖缓存正文并保留原记录 ID。
     * @param path - 磁盘绝对路径
     * @returns 刷新后的文件记录；并发命中时返回 null
     */
    async openOrRefreshByPathFromDisk(path: string): Promise<StoredFile | null> {
      if (inflightPaths.has(path)) return null;

      inflightPaths.add(path);

      try {
        await this.ensureLoaded();

        const diskFile = await native.readFile(path);
        const existingFile = await this.getFileByPath(path);
        const now = Date.now();

        if (existingFile) {
          const refreshedFile = await recentFilesStorage.updateRecentFile(existingFile.id, {
            path,
            name: diskFile.name,
            ext: diskFile.ext,
            content: diskFile.content,
            savedContent: diskFile.content,
            openedAt: now,
            savedAt: now
          });

          this.patchCache(refreshedFile);
          this.syncRecentFiles();
          return refreshedFile;
        }

        const createdFile: StoredFile = {
          id: createFileId(),
          path,
          content: diskFile.content,
          savedContent: diskFile.content,
          name: diskFile.name,
          ext: diskFile.ext,
          createdAt: now,
          openedAt: now,
          savedAt: now
        };

        await enqueueWrite(async () => {
          await recentFilesStorage.addRecentFile(createdFile);
        });

        this.patchCache(createdFile);
        this.syncRecentFiles();
        return createdFile;
      } finally {
        inflightPaths.delete(path);
      }
    },

    /**
     * 创建一个新文件记录并视为已打开。
     * @param file - 新文件记录
     * @param _source - 打开来源
     * @returns 创建后的文件记录
     */
    async createAndOpen(file: StoredFile): Promise<StoredFile> {
      const now = Date.now();
      const createdFile: StoredFile = {
        ...file,
        createdAt: file.createdAt ?? now,
        openedAt: file.openedAt ?? now
      };

      await enqueueWrite(async () => {
        await recentFilesStorage.addRecentFile(createdFile);
      });

      this.patchCache(createdFile);
      this.syncRecentFiles();
      return createdFile;
    },

    /**
     * 删除一个或多个最近文件记录。
     * @param ids - 需要删除的文件 ID 列表
     */
    async removeFile(...ids: string[]): Promise<void> {
      await recentFilesStorage.removeRecentFile(...ids);
      this.removeCacheEntries(ids);
      this.syncRecentFiles();
    },

    /**
     * 清空最近文件列表。
     */
    async clearFiles(): Promise<void> {
      await recentFilesStorage.clearRecentFiles();
      this.recentFiles = [];
      this.syncRecentFiles();
    },

    /**
     * 将最近文件摘要同步给主进程系统快捷入口，避免正文内容进入系统菜单模型。
     */
    async syncRecentFiles(): Promise<void> {
      if (!native.syncRecentFiles || this.recentFiles === null) return;

      await native.syncRecentFiles(
        this.recentFiles.map((file) => ({
          id: file.id,
          name: file.name,
          ext: file.ext,
          path: file.path
        }))
      );
    }
  }
});
