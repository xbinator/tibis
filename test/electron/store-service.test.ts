/**
 * @file store-service.test.ts
 * @description 验证主进程 store 服务使用普通 Electron Store 初始化。
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Electron Store 初始化选项的测试子集。
 */
interface ElectronStoreOptions {
  /** store 文件名。 */
  name?: string;
  /** store 默认值。 */
  defaults?: {
    /** 工作区 salt 默认值。 */
    salt: string;
  };
  /** 旧版安全存储链路传入的加密密钥。 */
  encryptionKey?: string;
}

/**
 * 测试期间使用的临时 userData 目录。
 */
let tempUserDataDir = '';

/**
 * 记录 Electron Store 构造参数，便于断言初始化行为。
 */
const electronStoreConstructorOptions: ElectronStoreOptions[] = [];

vi.mock('electron', () => ({
  app: {
    isPackaged: true,
    getPath: (name: string): string => {
      if (name !== 'userData') {
        throw new Error(`Unexpected app path request: ${name}`);
      }

      return tempUserDataDir;
    }
  }
}));

vi.mock('electron-store', () => {
  /**
   * Electron Store 测试替身，保留构造选项并提供最小 API。
   */
  class ElectronStoreMock {
    /**
     * 初始化测试替身。
     * @param options - Electron Store 初始化选项。
     */
    constructor(options: ElectronStoreOptions) {
      electronStoreConstructorOptions.push(options);
    }

    /**
     * 读取指定键的值。
     * @returns 测试替身不保存数据，始终返回 undefined。
     */
    get(): undefined {
      return undefined;
    }

    /**
     * 写入指定键的值。
     */
    set(): void {}

    /**
     * 删除指定键的值。
     */
    delete(): void {}
  }

  return {
    default: ElectronStoreMock
  };
});

describe('store service', () => {
  beforeEach(() => {
    vi.resetModules();
    tempUserDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tibis-store-service-'));
    electronStoreConstructorOptions.length = 0;
  });

  afterEach(() => {
    fs.rmSync(tempUserDataDir, { recursive: true, force: true });
  });

  it('initializes electron-store without secure storage encryption', async () => {
    const { initStore } = await import('../../electron/main/modules/store/service.mjs');

    await initStore();

    expect(electronStoreConstructorOptions).toEqual([
      {
        name: 'tibis-secure-store',
        defaults: { salt: '' }
      }
    ]);
    expect(fs.existsSync(path.join(tempUserDataDir, 'tibis-key.bin'))).toBe(false);
  });
});
