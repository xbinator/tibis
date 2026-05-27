/**
 * @file recent.ts
 * @description 最近文件存储的读写、排序派生与时间字段归一化。
 */

import type { StoredFile } from './types';
import { isEqual, isNumber, noop } from 'lodash-es';
import { getElectronAPI } from '../../platform/electron-api';

const RECENT_FILES_KEY = 'recent_files';
const MAX_RECENT_FILES = 100;

let writeQueue: Promise<void> = Promise.resolve();

/**
 * 将单个文件记录归一化到当前存储模型。
 * 对于未保存的内存文件（path === null），将当前内容作为 savedContent 基线，
 * 防止首次入库后丢失 baseline。
 */
function normalizeStoredFile(file: StoredFile): StoredFile {
  if (file.savedContent === undefined && file.path === null) {
    return { ...file, savedContent: file.content };
  }
  return file;
}

/**
 * 批量归一化存储记录，返回归一化结果及是否产生了需要回写的变化。
 */
function normalizeStoredFiles(files: StoredFile[]): { files: StoredFile[]; changed: boolean } {
  let changed = false;

  const normalizedFiles = files.map((file) => {
    const normalized = normalizeStoredFile(file);
    if (!changed && !isEqual(normalized, file)) {
      changed = true;
    }
    return normalized;
  });

  return { files: normalizedFiles, changed };
}

/**
 * 将可选时间字段归一化为可排序数字，缺失或非有限数时返回 0。
 */
function normalizeTime(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * 依据 openedAt → modifiedAt → createdAt → 原始顺序 降序排列文件。
 */
export function sortRecentFiles(files: StoredFile[]): StoredFile[] {
  return [...files].sort((a, b) => {
    const diff =
      normalizeTime(b.openedAt) - normalizeTime(a.openedAt) ||
      normalizeTime(b.modifiedAt) - normalizeTime(a.modifiedAt) ||
      normalizeTime(b.createdAt) - normalizeTime(a.createdAt);

    // Array.prototype.sort 在现代引擎中为稳定排序，等值元素自动保留原始顺序，
    // 无需显式处理 index 作为最终 tiebreaker。
    return diff;
  });
}

/** 从 Electron store 读取指定键的值。 */
async function getElectronStoreValue<T>(key: string): Promise<T | null> {
  const value = await getElectronAPI().storeGet(key);
  return (value as T | null) ?? null;
}

/** 将值写入 Electron store。 */
async function setElectronStoreValue(key: string, value: unknown): Promise<void> {
  await getElectronAPI().storeSet(key, value);
}

/**
 * 读取原始最近文件数组并执行必要的模型归一化。
 * 若归一化后数据有变化，立即回写以保持存储一致性。
 */
async function readRecentFiles(): Promise<StoredFile[]> {
  const stored = (await getElectronStoreValue<StoredFile[]>(RECENT_FILES_KEY)) ?? [];
  const { files, changed } = normalizeStoredFiles(stored);
  if (changed) {
    await setElectronStoreValue(RECENT_FILES_KEY, files);
  }
  return files;
}

/**
 * 将最近文件数组写回 Electron store，超出上限的记录会被截断。
 */
async function writeRecentFiles(files: StoredFile[]): Promise<void> {
  await setElectronStoreValue(RECENT_FILES_KEY, files.slice(0, MAX_RECENT_FILES));
}

/**
 * 串行化读改写过程，避免并发操作互相覆盖。
 * 队列尾部的任务失败不会中断后续任务。
 */
function enqueueWrite<T>(fn: () => Promise<T>): Promise<T> {
  const result = writeQueue.then(fn);
  writeQueue = result.then(noop, noop);
  return result;
}

export const recentFilesStorage = {
  /**
   * 添加或覆盖最近文件记录。
   * createdAt / openedAt 缺失时自动补充为当前时间。
   */
  async addRecentFile(file: StoredFile): Promise<void> {
    await enqueueWrite(async () => {
      const files = await readRecentFiles();
      const now = Date.now();
      const normalized = normalizeStoredFile({
        ...file,
        createdAt: file.createdAt ?? now,
        openedAt: file.openedAt ?? now
      });

      // 去重后前置，降低下次读取时重排的成本
      const deduped = files.filter((item) => item.id !== normalized.id);
      deduped.unshift(normalized);

      await writeRecentFiles(deduped);
    });
  },

  /** 获取按最近打开时间派生排序后的文件列表。 */
  async getAllRecentFiles(): Promise<StoredFile[]> {
    const files = await readRecentFiles();
    return sortRecentFiles(files);
  },

  /**
   * 读取单个最近文件记录。
   * 直接在原始数组中查找，避免为单条查询执行不必要的全量排序。
   */
  async getRecentFile(id: string): Promise<StoredFile | null> {
    const files = await readRecentFiles();
    return files.find((file) => file.id === id) ?? null;
  },

  /**
   * 更新指定文件的部分字段。
   * openedAt 只接受正有限数，其余情况保留原值。
   */
  async updateRecentFile(id: string, updates: Partial<StoredFile>): Promise<StoredFile> {
    return enqueueWrite(async () => {
      const files = await readRecentFiles();
      const index = files.findIndex((item) => item.id === id);

      if (index === -1) throw new Error(`File not found: ${id}`);

      const prevOpenedAt = files[index].openedAt;
      const nextOpenedAt = isNumber(updates.openedAt) && Number.isFinite(updates.openedAt) && updates.openedAt ? updates.openedAt : prevOpenedAt;

      const nextFile = normalizeStoredFile({ ...files[index], ...updates, openedAt: nextOpenedAt });
      files[index] = nextFile;
      await writeRecentFiles(files);

      return nextFile;
    });
  },

  /**
   * 更新指定文件的 openedAt 为当前时间，并将其前置到原始存储数组头部。
   */
  async touchRecentFile(id: string): Promise<StoredFile> {
    return enqueueWrite(async () => {
      const files = await readRecentFiles();
      const index = files.findIndex((item) => item.id === id);

      if (index === -1) throw new Error(`File not found: ${id}`);

      const touched: StoredFile = { ...files[index], openedAt: Date.now() };

      // 移除原位置，前置到头部；读侧的 sortRecentFiles 会统一做派生排序
      files.splice(index, 1);
      files.unshift(touched);

      await writeRecentFiles(files);
      return touched;
    });
  },

  /** 从最近文件列表中移除一个或多个记录。 */
  async removeRecentFile(...ids: string[]): Promise<void> {
    await enqueueWrite(async () => {
      const files = await readRecentFiles();
      const idSet = new Set(ids);
      await writeRecentFiles(files.filter((file) => !idSet.has(file.id)));
    });
  },

  /** 清空最近文件列表。 */
  async clearRecentFiles(): Promise<void> {
    await writeRecentFiles([]);
  },

  /** 清空底层存储键值。 */
  async clear(): Promise<void> {
    await setElectronStoreValue(RECENT_FILES_KEY, []);
  }
};

export type { StoredFile };
