/**
 * @file recent.ts
 * @description 最近记录存储的读写、排序派生与时间字段归一化（支持文件 + WebView 网页）。
 */

import { isEqual, isNumber, noop } from 'lodash-es';
import { getElectronAPI } from '../../platform/electron-api';
import { hashString } from '../../utils/hash';
import {
  isDocumentRecord,
  isChatRecord,
  type StoredDocumentRecord,
  type StoredFile,
  type StoredWidget,
  type ChatRecentRecord,
  type WebviewRecord,
  type RecentRecord,
  type WebviewRecordOptions
} from './types';

const RECENT_FILES_KEY = 'recent_files';
const MAX_RECENT_FILES = 100;
const CHAT_RECENT_ID_PREFIX = 'chat:';

let writeQueue: Promise<void> = Promise.resolve();

/**
 * 将历史记录中的文本字段归一化为字符串。
 * @param value - 原始字段值
 * @returns 字符串字段，缺失或非字符串时返回空串
 */
function normalizeTextField(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * 将历史记录中的路径字段归一化为文件路径或 null。
 * @param value - 原始路径字段值
 * @returns 文件路径；缺失、空串或非字符串时返回 null
 */
function normalizePathField(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * 将历史记录中的正文内容归一化为字符串，并保留原始空白。
 * @param value - 原始正文内容
 * @returns 正文内容，缺失或非字符串时返回空串
 */
function normalizeContentField(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/**
 * 将可选 favicon 字段归一化为非空字符串。
 * @param value - 原始 favicon 字段
 * @returns 归一化后的 favicon URL，缺失或空串时返回 undefined
 */
function normalizeOptionalFavicon(value: unknown): string | undefined {
  const normalized = normalizeTextField(value);
  return normalized || undefined;
}

/**
 * 归一化必填聊天会话 ID。
 * @param sessionId - 原始聊天会话 ID
 * @returns 非空会话 ID
 */
function normalizeRequiredSessionId(sessionId: string): string {
  const normalizedSessionId = normalizeTextField(sessionId);
  if (!normalizedSessionId) throw new Error('Chat session id is required');

  return normalizedSessionId;
}

/**
 * 构建聊天会话最近记录 ID。
 * @param sessionId - 聊天会话 ID
 * @returns 最近记录 ID
 */
export function createChatRecentId(sessionId: string): string {
  return `${CHAT_RECENT_ID_PREFIX}${normalizeRequiredSessionId(sessionId)}`;
}

/**
 * 从历史记录字段中解析会话 ID。
 * @param value - 原始会话 ID
 * @param fallbackId - 原始记录 ID
 * @returns 归一化后的会话 ID
 */
function normalizeSessionId(value: unknown, fallbackId: unknown): string {
  const normalized = normalizeTextField(value);
  if (normalized) return normalized;

  const id = normalizeTextField(fallbackId);
  return id.startsWith(CHAT_RECENT_ID_PREFIX) ? id.slice(CHAT_RECENT_ID_PREFIX.length) : id;
}

/**
 * 从文件路径中推导文件名和扩展名。
 * @param filePath - 文件路径
 * @returns 文件名主体和扩展名
 */
function deriveFileTitleParts(filePath: string | null): { name: string; ext: string } {
  if (!filePath) return { name: '', ext: '' };

  const fileName = filePath.split(/[\\/]/).pop() ?? '';
  const matched = /^(.+?)(?:\.([^.]+))?$/.exec(fileName);

  return {
    name: matched?.[1] ?? fileName,
    ext: matched?.[2] ?? ''
  };
}

/**
 * 将可选时间字段归一化为可排序数字，缺失或非有限数时返回 0。
 */
function normalizeTime(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * 将单个文件型记录归一化到当前存储模型。
 * 对于未保存的内存文件（path === null），将当前内容作为 savedContent 基线，
 * 防止首次入库后丢失 baseline。
 * @param file - 文件型记录
 * @param type - 目标记录类型
 * @returns 归一化后的文件型记录
 */
function normalizeStoredDocumentRecord<T extends StoredDocumentRecord>(file: T, type: T['type']): T {
  const rawFile = file as unknown as Record<string, unknown>;
  const normalizedPath = normalizePathField(rawFile.path);
  const derivedTitleParts = deriveFileTitleParts(normalizedPath);
  const normalizedFile = {
    ...file,
    type,
    path: normalizedPath,
    content: normalizeContentField(rawFile.content),
    name: normalizeTextField(rawFile.name) || derivedTitleParts.name,
    ext: normalizeTextField(rawFile.ext).replace(/^\.+/, '') || derivedTitleParts.ext
  } as T;

  if (normalizedFile.savedContent === undefined && normalizedFile.path === null) {
    return { ...normalizedFile, savedContent: normalizedFile.content };
  }
  return normalizedFile;
}

/**
 * 将单个聊天最近记录归一化到当前存储模型。
 * @param record - 聊天最近记录
 * @returns 归一化后的聊天最近记录
 */
function normalizeChatRecord(record: ChatRecentRecord): ChatRecentRecord | null {
  const rawRecord = record as unknown as Record<string, unknown>;
  const sessionId = normalizeSessionId(rawRecord.sessionId, rawRecord.id);
  if (!sessionId) return null;

  return {
    type: 'chat',
    id: createChatRecentId(sessionId),
    sessionId,
    title: normalizeTextField(rawRecord.title) || '聊天',
    createdAt: normalizeTime(rawRecord.createdAt as number | undefined) || Date.now(),
    openedAt: normalizeTime(rawRecord.openedAt as number | undefined) || Date.now()
  };
}

/**
 * 批量归一化存储记录，返回归一化结果及是否产生了需要回写的变化。
 */
function normalizeStoredFiles(files: RecentRecord[]): { files: RecentRecord[]; changed: boolean } {
  let changed = false;
  const normalizedFiles: RecentRecord[] = [];

  for (const file of files) {
    const rawRecord = file as unknown as Record<string, unknown>;

    if (rawRecord.type === 'webview') {
      normalizedFiles.push(file);
      continue;
    }

    if (rawRecord.type === 'chat') {
      const normalized = normalizeChatRecord({ ...rawRecord, type: 'chat' } as ChatRecentRecord);
      if (!normalized) {
        changed = true;
        continue;
      }
      if (!changed && !isEqual(normalized, file)) {
        changed = true;
      }
      normalizedFiles.push(normalized);
      continue;
    }

    if (rawRecord.type === 'widget') {
      const normalized = normalizeStoredDocumentRecord({ ...rawRecord, type: 'widget' } as StoredWidget, 'widget');
      if (!changed && !isEqual(normalized, file)) {
        changed = true;
      }
      normalizedFiles.push(normalized);
      continue;
    }

    const normalized = normalizeStoredDocumentRecord({ ...rawRecord, type: 'file' } as StoredFile, 'file');
    if (!changed && !isEqual(normalized, file)) {
      changed = true;
    }
    normalizedFiles.push(normalized);
  }

  return { files: normalizedFiles, changed };
}

/**
 * 依据 openedAt 降序排列记录。
 * 文件型记录回退到 modifiedAt → createdAt；webview 记录仅按 openedAt 排序。
 */
export function sortRecentFiles(records: RecentRecord[]): RecentRecord[] {
  return [...records].sort((a, b) => {
    const aTime = normalizeTime(a.openedAt);
    const bTime = normalizeTime(b.openedAt);
    const diff = bTime - aTime;

    if (diff !== 0) return diff;

    // 文件型记录有 modifiedAt / createdAt 回退，webview 记录没有
    if (isDocumentRecord(a) && isDocumentRecord(b)) {
      return normalizeTime(a.modifiedAt) - normalizeTime(b.modifiedAt) || normalizeTime(a.createdAt) - normalizeTime(b.createdAt);
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
  const stored = (await getElectronStoreValue<RecentRecord[]>(RECENT_FILES_KEY)) ?? [];
  const { files, changed: normalized } = normalizeStoredFiles(stored);

  if (normalized) {
    await setElectronStoreValue(RECENT_FILES_KEY, files);
  }
  return files;
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
   * 添加或覆盖最近文件型记录。
   * createdAt / openedAt 缺失时自动补充为当前时间。
   * 保留普通文件与 Widget 的记录类型。
   */
  async addRecentFile(file: StoredDocumentRecord): Promise<void> {
    await enqueueWrite(async () => {
      const files = await readRecentFiles();
      const now = Date.now();
      const normalized = normalizeStoredDocumentRecord(
        {
          ...file,
          createdAt: file.createdAt ?? now,
          openedAt: file.openedAt ?? now
        },
        file.type
      );

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
  async updateRecentFile(id: string, updates: Partial<StoredDocumentRecord>): Promise<StoredDocumentRecord> {
    return enqueueWrite(async () => {
      const files = await readRecentFiles();
      const index = files.findIndex((item) => item.id === id);

      if (index === -1) throw new Error(`File not found: ${id}`);

      const file = files[index];
      if (!isDocumentRecord(file)) throw new Error(`File not found: ${id}`);

      const prevOpenedAt = file.openedAt;
      const nextOpenedAt = isNumber(updates.openedAt) && Number.isFinite(updates.openedAt) && updates.openedAt ? updates.openedAt : prevOpenedAt;

      const nextType = updates.type ?? file.type;
      const nextFile = normalizeStoredDocumentRecord({ ...file, ...updates, type: nextType, openedAt: nextOpenedAt }, nextType);
      files[index] = nextFile;
      await writeRecentFiles(files);

      return nextFile;
    });
  },

  /**
   * 更新指定记录的 openedAt 为当前时间，并将其前置到原始存储数组头部。
   */
  async touchRecentFile(id: string): Promise<StoredDocumentRecord> {
    return enqueueWrite(async () => {
      const files = await readRecentFiles();
      const index = files.findIndex((item) => isDocumentRecord(item) && item.id === id);

      if (index === -1) throw new Error(`File not found: ${id}`);

      const file = files[index];
      if (!isDocumentRecord(file)) throw new Error(`File not found: ${id}`);

      const touched: StoredDocumentRecord = { ...file, openedAt: Date.now() };

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
  async addWebviewRecord(url: string, title: string, options?: WebviewRecordOptions): Promise<WebviewRecord> {
    return enqueueWrite(async () => {
      const files = await readRecentFiles();
      const id = hashString(url);
      const now = Date.now();
      const normalizedFavicon = normalizeOptionalFavicon(options?.favicon);

      // 查找是否已有该 URL 的记录
      const existingIndex = files.findIndex((item) => item.type === 'webview' && (item as WebviewRecord).id === id);
      if (existingIndex !== -1) {
        // 更新已有记录
        const existing = files[existingIndex] as WebviewRecord;
        const updated: WebviewRecord = { ...existing, title, openedAt: now, ...(normalizedFavicon ? { favicon: normalizedFavicon } : {}) };
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
        openedAt: now,
        ...(normalizedFavicon ? { favicon: normalizedFavicon } : {})
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

  /**
   * 添加或覆盖聊天会话最近记录。
   * 根据会话 ID 生成稳定记录 ID，同一会话自动去重。
   */
  async addChatRecord(sessionId: string, title: string): Promise<ChatRecentRecord> {
    const normalizedSessionId = normalizeRequiredSessionId(sessionId);

    return enqueueWrite(async () => {
      const files = await readRecentFiles();
      const now = Date.now();
      const id = createChatRecentId(normalizedSessionId);
      const existingIndex = files.findIndex((item) => isChatRecord(item) && item.sessionId === normalizedSessionId);

      if (existingIndex !== -1) {
        const existing = files[existingIndex] as ChatRecentRecord;
        const updated: ChatRecentRecord = {
          ...existing,
          id,
          sessionId: normalizedSessionId,
          title: normalizeTextField(title) || existing.title,
          openedAt: now
        };
        files.splice(existingIndex, 1);
        files.unshift(updated);
        await writeRecentFiles(files);
        return updated;
      }

      const record: ChatRecentRecord = {
        type: 'chat',
        id,
        sessionId: normalizedSessionId,
        title: normalizeTextField(title) || '聊天',
        createdAt: now,
        openedAt: now
      };
      files.unshift(record);
      await writeRecentFiles(files);
      return record;
    });
  },

  /**
   * 更新聊天会话最近记录的 openedAt。
   * @param id - 聊天最近记录 ID
   * @returns 更新后的记录
   */
  async touchChatRecord(id: string): Promise<ChatRecentRecord> {
    return enqueueWrite(async () => {
      const files = await readRecentFiles();
      const index = files.findIndex((item) => isChatRecord(item) && item.id === id);

      if (index === -1) throw new Error(`Chat record not found: ${id}`);

      const record = files[index] as ChatRecentRecord;
      const touched: ChatRecentRecord = { ...record, openedAt: Date.now() };
      files.splice(index, 1);
      files.unshift(touched);
      await writeRecentFiles(files);
      return touched;
    });
  },

  /**
   * 更新已存在聊天会话最近记录的标题。
   * @param sessionId - 聊天会话 ID
   * @param title - 最新会话标题
   * @returns 更新后的记录；记录不存在时返回 null
   */
  async updateChatRecordTitle(sessionId: string, title: string): Promise<ChatRecentRecord | null> {
    const normalizedSessionId = normalizeRequiredSessionId(sessionId);

    return enqueueWrite(async () => {
      const files = await readRecentFiles();
      const index = files.findIndex((item) => isChatRecord(item) && item.sessionId === normalizedSessionId);

      if (index === -1) return null;

      const record = files[index] as ChatRecentRecord;
      const updated: ChatRecentRecord = {
        ...record,
        title: normalizeTextField(title) || record.title
      };
      files[index] = updated;
      await writeRecentFiles(files);
      return updated;
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

export type { ChatRecentRecord, StoredDocumentRecord, StoredFile, StoredWidget };
