/**
 * @file ipc.test.ts
 * @description 文件路径状态 IPC 基础行为测试。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getFilePathStatus } from '../../../../../electron/main/modules/file/ipc.mts';

/** 文件状态读取测试替身。 */
const statMock = vi.hoisted(() => vi.fn());

vi.mock('node:fs', () => ({
  promises: {
    stat: statMock
  }
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn()
  }
}));

describe('getFilePathStatus', (): void => {
  beforeEach((): void => {
    statMock.mockReset();
  });

  it('returns a missing status only for a missing path', async (): Promise<void> => {
    statMock.mockRejectedValue(Object.assign(new Error('missing'), { code: 'ENOENT' }));

    await expect(getFilePathStatus('/missing')).resolves.toEqual({ exists: false, isFile: false, isDirectory: false });
  });

  it('preserves permission errors for the installer and recovery flow', async (): Promise<void> => {
    const permissionError = Object.assign(new Error('permission denied'), { code: 'EACCES' });
    statMock.mockRejectedValue(permissionError);

    await expect(getFilePathStatus('/protected')).rejects.toBe(permissionError);
  });
});
