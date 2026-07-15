/**
 * @file scanner.test.ts
 * @description Skill 文件扫描器测试。
 */
import { describe, expect, it, type Mock, vi } from 'vitest';
import { scanSkills, type SkillScannerAPI } from '@/ai/skill/scanner';

/**
 * Skill 扫描器测试 API。
 */
interface SkillScannerAPIMock extends SkillScannerAPI {
  /** 获取安装锁 mock */
  acquireDirectoryInstallLock: Mock<NonNullable<SkillScannerAPI['acquireDirectoryInstallLock']>>;
  /** 读取文件 mock */
  readFile: Mock<SkillScannerAPI['readFile']>;
  /** 读取目录 mock */
  readWorkspaceDirectory: Mock<SkillScannerAPI['readWorkspaceDirectory']>;
  /** 路径状态 mock */
  getPathStatus: Mock<NonNullable<SkillScannerAPI['getPathStatus']>>;
  /** 移动文件 mock */
  trashFile: Mock<NonNullable<SkillScannerAPI['trashFile']>>;
  /** 重命名目录 mock */
  renameFile: Mock<NonNullable<SkillScannerAPI['renameFile']>>;
  /** 释放安装锁 mock */
  releaseDirectoryInstallLock: Mock<NonNullable<SkillScannerAPI['releaseDirectoryInstallLock']>>;
}

/**
 * 创建 Skill 扫描器测试 API。
 * @returns 扫描器依赖 API
 */
function createScannerAPI(): SkillScannerAPIMock {
  return {
    acquireDirectoryInstallLock: vi.fn<NonNullable<SkillScannerAPI['acquireDirectoryInstallLock']>>().mockResolvedValue('skill-lock'),
    readFile: vi.fn<SkillScannerAPI['readFile']>(),
    readWorkspaceDirectory: vi.fn<SkillScannerAPI['readWorkspaceDirectory']>(),
    getPathStatus: vi.fn<NonNullable<SkillScannerAPI['getPathStatus']>>().mockResolvedValue({ exists: true, isFile: false, isDirectory: true }),
    trashFile: vi.fn<NonNullable<SkillScannerAPI['trashFile']>>(),
    renameFile: vi.fn<NonNullable<SkillScannerAPI['renameFile']>>(),
    releaseDirectoryInstallLock: vi.fn<NonNullable<SkillScannerAPI['releaseDirectoryInstallLock']>>().mockResolvedValue(undefined)
  };
}

describe('scanSkills', (): void => {
  it('recovers an interrupted replacement before scanning skills', async (): Promise<void> => {
    const api = createScannerAPI();
    api.readWorkspaceDirectory.mockResolvedValueOnce({ entries: [{ name: '.install-test.json', type: 'file' }] }).mockResolvedValueOnce({ entries: [] });
    api.readFile.mockResolvedValue({
      content: JSON.stringify({ version: 1, targetName: 'demo', temporaryName: '.tmp-test', backupName: '.bak-test' })
    });
    api.getPathStatus.mockImplementation(async (path: string) => ({
      exists: path.endsWith('/skills') || path.endsWith('/.bak-test'),
      isFile: false,
      isDirectory: path.endsWith('/skills') || path.endsWith('/.bak-test')
    }));

    await scanSkills({ homeDir: '/Users/test' }, api);

    expect(api.renameFile).toHaveBeenCalledWith('/Users/test/.agents/skills/.bak-test', '/Users/test/.agents/skills/demo');
  });

  it('skips directory reads when the global skills directory does not exist', async (): Promise<void> => {
    const api = createScannerAPI();
    api.getPathStatus.mockResolvedValue({ exists: false, isFile: false, isDirectory: false });

    const skills = await scanSkills({ homeDir: '/Users/test' }, api);

    expect(api.getPathStatus).toHaveBeenCalledWith('/Users/test/.agents/skills');
    expect(api.readWorkspaceDirectory).not.toHaveBeenCalled();
    expect(skills).toEqual([]);
  });

  it('skips directory reads when checking the global skills directory fails', async (): Promise<void> => {
    const api = createScannerAPI();
    api.getPathStatus.mockRejectedValue(new Error('permission denied'));

    const skills = await scanSkills({ homeDir: '/Users/test' }, api);

    expect(api.getPathStatus).toHaveBeenCalledWith('/Users/test/.agents/skills');
    expect(api.readWorkspaceDirectory).not.toHaveBeenCalled();
    expect(skills).toEqual([]);
  });
});
