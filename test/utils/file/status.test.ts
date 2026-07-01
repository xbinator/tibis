/**
 * @file status.test.ts
 * @description 文件路径状态工具测试。
 */
import { describe, expect, it, type Mock, vi } from 'vitest';
import { canReadDirectory, type PathStatusReader } from '@/utils/file/status';

/**
 * 路径状态读取器测试替身。
 */
interface PathStatusReaderMock extends PathStatusReader {
  /** 路径状态读取 mock */
  getPathStatus: Mock<NonNullable<PathStatusReader['getPathStatus']>>;
}

/**
 * 创建路径状态读取器测试替身。
 * @param status - 默认路径状态
 * @returns 路径状态读取器测试替身
 */
function createPathStatusReader(status: Awaited<ReturnType<NonNullable<PathStatusReader['getPathStatus']>>>): PathStatusReaderMock {
  return {
    getPathStatus: vi.fn<NonNullable<PathStatusReader['getPathStatus']>>().mockResolvedValue(status)
  };
}

describe('canReadDirectory', (): void => {
  it('keeps compatibility when path status API is unavailable', async (): Promise<void> => {
    await expect(canReadDirectory('/Users/test/.agents/skills', {})).resolves.toBe(true);
  });

  it('returns true only for existing directories', async (): Promise<void> => {
    const api = createPathStatusReader({ exists: true, isFile: false, isDirectory: true });

    await expect(canReadDirectory('/Users/test/.agents/skills', api)).resolves.toBe(true);
    expect(api.getPathStatus).toHaveBeenCalledWith('/Users/test/.agents/skills');
  });

  it('returns false for missing paths and files', async (): Promise<void> => {
    const missingApi = createPathStatusReader({ exists: false, isFile: false, isDirectory: false });
    const fileApi = createPathStatusReader({ exists: true, isFile: true, isDirectory: false });

    await expect(canReadDirectory('/Users/test/.agents/skills', missingApi)).resolves.toBe(false);
    await expect(canReadDirectory('/Users/test/.agents/skills', fileApi)).resolves.toBe(false);
  });

  it('returns false when path status lookup fails', async (): Promise<void> => {
    const api = createPathStatusReader({ exists: true, isFile: false, isDirectory: true });
    api.getPathStatus.mockRejectedValue(new Error('permission denied'));

    await expect(canReadDirectory('/Users/test/.agents/skills', api)).resolves.toBe(false);
  });
});
