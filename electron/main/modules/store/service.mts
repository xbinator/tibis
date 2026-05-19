/**
 * @file service.mts
 * @description 初始化并暴露主进程 Electron Store 实例。
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { app } from 'electron';
import ElectronStore from 'electron-store';

/**
 * 主进程持久化配置结构。
 */
interface StoreSchema extends Record<string, unknown> {
  /** 工作区数据盐值。 */
  salt: string;
}

/**
 * Electron Store 运行时实例类型。
 */
type StoreType = ElectronStore<StoreSchema> & {
  /** 读取指定键的值。 */
  get: (key: string) => unknown;
  /** 写入指定键的值。 */
  set: (key: string, value: unknown) => void;
  /** 删除指定键的值。 */
  delete: (key: string) => void;
};

let storeInstance: StoreType | null = null;

const STORE_NAME = 'tibis-secure-store';

/**
 * 获取 Electron Store 数据文件路径。
 * @returns Store JSON 文件的绝对路径。
 */
function getStorePath(): string {
  return path.join(app.getPath('userData'), `${STORE_NAME}.json`);
}

/**
 * 清理无法被 Electron Store 读取的损坏数据文件。
 */
function clearCorruptedStore(): void {
  const storePath = getStorePath();
  if (fs.existsSync(storePath)) {
    try {
      fs.unlinkSync(storePath);
      console.log('[store] Cleared corrupted store file');
    } catch (error) {
      console.error('[store] Failed to clear corrupted store:', error);
    }
  }
}

/**
 * 初始化主进程 Store 实例。
 */
export async function initStore(): Promise<void> {
  try {
    storeInstance = new ElectronStore<StoreSchema>({
      name: STORE_NAME,
      defaults: { salt: '' }
    }) as StoreType;
  } catch (error) {
    console.error('[store] Failed to initialize store, attempting to clear corrupted data:', error);
    clearCorruptedStore();

    storeInstance = new ElectronStore<StoreSchema>({
      name: STORE_NAME,
      defaults: { salt: '' }
    }) as StoreType;

    console.log('[store] Store reinitialized successfully');
  }
}

/**
 * 获取已初始化的主进程 Store 实例。
 * @returns 主进程 Store 实例。
 */
export function getStore(): StoreType {
  if (!storeInstance) {
    throw new Error('Store not initialized. Call initStore() first.');
  }
  return storeInstance;
}
