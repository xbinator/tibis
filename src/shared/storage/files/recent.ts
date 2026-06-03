/**
 * @file recent.ts
 * @description 最近记录存储的读写、排序派生与时间字段归一化（支持文件 + WebView 网页）。
 */

import type { StoredFile, WebviewRecord, RecentRecord } from './types';
import { isEqual, isNumber, noop } from 'lodash-es';
import { getElectronAPI } from '../../platform/electron-api';
import { hashString } from '../../utils/hash';

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
function normalizeStoredFiles(files: RecentRecord[]): { files: RecentRecord[]; changed: boolean } {
  let changed = false;

  const normalizedFiles = files.map((file) => {
    if (file.type === 'file') {
      const normalized = normalizeStoredFile(file as StoredFile);
      if (!changed && !isEqual(normalized, file)) {
        changed = true;
      }
      return normalized;
    }
    return file;
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
 * 依据 openedAt 降序排列记录。
 * file 记录回退到 modifiedAt → createdAt；webview 记录仅按 openedAt 排序。
 */
export function sortRecentFiles(records: RecentRecord[]): RecentRecord[] {
  return [...records].sort((a, b) => {
    const aTime = normalizeTime(a.openedAt);
    const bTime = normalizeTime(b.openedAt);
    const diff = bTime - aTime;

    if (diff !== 0) return diff;

    // file 记录有 modifiedAt / createdAt 回退，webview 记录没有
    if (a.type === 'file' && b.type === 'file') {
      return (
        normalizeTime((a as StoredFile).modifiedAt) - normalizeTime((b as StoredFile).modifiedAt) || normalizeTime(a.createdAt) - normalizeTime(b.createdAt)
      );
    }

    return 0;
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
 * 读取原始最近记录数组并执行必要的模型归一化。
 * 若归一化后数据有变化，立即回写以保持存储一致性。
 * 对缺失 type 字段的旧记录自动补 'file'（迁移逻辑）。
 */
async function readRecentFiles(): Promise<RecentRecord[]> {
  const stored = (await getElectronStoreValue<(StoredFile | WebviewRecord)[]>(RECENT_FILES_KEY)) ?? [];
  const { files, changed: normalized } = normalizeStoredFiles(stored);

  // 迁移：旧记录补 type: 'file'
  let migrated = false;
  const patchedFiles = files.map((record) => {
    if (record.type) return record;
    migrated = true;
    return { ...(record as Record<string, unknown>), type: 'file' as const } as StoredFile;
  });

  if (normalized || migrated) {
    await setElectronStoreValue(RECENT_FILES_KEY, patchedFiles);
  }
  return patchedFiles;
}

/**
 * 将最近记录数组写回 Electron store，超出上限的记录会被截断。
 */
async function writeRecentFiles(files: RecentRecord[]): Promise<void> {
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
   * 确保 type: 'file' 字段存在。
   */
  async addRecentFile(file: StoredFile): Promise<void> {
    await enqueueWrite(async () => {
      const files = await readRecentFiles();
      const now = Date.now();
      const normalized = normalizeStoredFile({
        ...file,
        type: 'file' as const,
        createdAt: file.createdAt ?? now,
        openedAt: file.openedAt ?? now
      });

      // 去重后前置，降低下次读取时重排的成本
      const deduped = files.filter((item) => item.id !== normalized.id);
      deduped.unshift(normalized);

      await writeRecentFiles(deduped);
    });
  },

  /** 获取按最近打开时间派生排序后的记录列表。 */
  async getAllRecentFiles(): Promise<RecentRecord[]> {
    const files = await readRecentFiles();
    return sortRecentFiles(files);
  },

  /**
   * 读取单个最近记录。
   * 直接在原始数组中查找，避免为单条查询执行不必要的全量排序。
   */
  async getRecentFile(id: string): Promise<RecentRecord | null> {
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

      const file = files[index] as StoredFile;
      const prevOpenedAt = file.openedAt;
      const nextOpenedAt = isNumber(updates.openedAt) && Number.isFinite(updates.openedAt) && updates.openedAt ? updates.openedAt : prevOpenedAt;

      const nextFile = normalizeStoredFile({ ...file, ...updates, openedAt: nextOpenedAt });
      files[index] = nextFile;
      await writeRecentFiles(files);

      return nextFile;
    });
  },

  /**
   * 更新指定记录的 openedAt 为当前时间，并将其前置到原始存储数组头部。
   */
  async touchRecentFile(id: string): Promise<StoredFile> {
    return enqueueWrite(async () => {
      const files = await readRecentFiles();
      const index = files.findIndex((item) => item.type === 'file' && item.id === id);

      if (index === -1) throw new Error(`File not found: ${id}`);

      const file = files[index] as StoredFile;
      const touched: StoredFile = { ...file, openedAt: Date.now() };

      // 移除原位置，前置到头部；读侧的 sortRecentFiles 会统一做派生排序
      files.splice(index, 1);
      files.unshift(touched);

      await writeRecentFiles(files);
      return touched;
    });
  },

  /**
   * 添加或覆盖 webview 记录。
   * 根据 URL 生成 hash id，同 URL 自动去重（更新 title 和 openedAt）。
   */
  async addWebviewRecord(url: string, title: string): Promise<WebviewRecord> {
    return enqueueWrite(async () => {
      const files = await readRecentFiles();
      const id = hashString(url);
      const now = Date.now();

      // 查找是否已有该 URL 的记录
      const existingIndex = files.findIndex((item) => item.type === 'webview' && (item as WebviewRecord).id === id);
      if (existingIndex !== -1) {
        // 更新已有记录
        const existing = files[existingIndex] as WebviewRecord;
        const updated: WebviewRecord = { ...existing, title, openedAt: now };
        files[existingIndex] = updated;
        await writeRecentFiles(files);
        return updated;
      }

      // 新建记录
      const record: WebviewRecord = {
        type: 'webview',
        id,
        url,
        title,
        createdAt: now,
        openedAt: now
      };
      files.unshift(record);
      await writeRecentFiles(files);
      return record;
    });
  },

  /**
   * 更新 webview 记录的 openedAt 为当前时间。
   * @param id - webview 记录 ID
   * @returns 更新后的记录
   */
  async touchWebviewRecord(id: string): Promise<WebviewRecord> {
    return enqueueWrite(async () => {
      const files = await readRecentFiles();
      const index = files.findIndex((item) => item.type === 'webview' && item.id === id);

      if (index === -1) throw new Error(`Webview record not found: ${id}`);

      const record = files[index] as WebviewRecord;
      const touched: WebviewRecord = { ...record, openedAt: Date.now() };
      files.splice(index, 1);
      files.unshift(touched);
      await writeRecentFiles(files);
      return touched;
    });
  },

  /** 从最近记录列表中移除一个或多个记录。 */
  async removeRecentFile(...ids: string[]): Promise<void> {
    await enqueueWrite(async () => {
      const files = await readRecentFiles();
      const idSet = new Set(ids);
      await writeRecentFiles(files.filter((file) => !idSet.has(file.id)));
    });
  },

  /** 清空最近记录列表。 */
  async clearRecentFiles(): Promise<void> {
    await writeRecentFiles([]);
  },

  /** 清空底层存储键值。 */
  async clear(): Promise<void> {
    await setElectronStoreValue(RECENT_FILES_KEY, []);
  }
};

export type { StoredFile };
