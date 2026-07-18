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
  acquireDirectoryInstallLock: Mock<(targetDir: string) => Promise<string>>;
  /** 读取文件 mock */
  readFile: Mock<SkillScannerAPI['readFile']>;
  /** 读取目录 mock */
  readWorkspaceDirectory: Mock<SkillScannerAPI['readWorkspaceDirectory']>;
  /** 路径状态 mock */
  getPathStatus: Mock<NonNullable<SkillScannerAPI['getPathStatus']>>;
  /** 移动文件 mock */
  trashFile: Mock<(filePath: string) => Promise<void>>;
  /** 重命名目录 mock */
  renameFile: Mock<(oldPath: string, newPath: string) => Promise<void>>;
  /** 释放安装锁 mock */
  releaseDirectoryInstallLock: Mock<(token: string) => Promise<void>>;
}

/**
 * 创建 Skill 扫描器测试 API。
 * @returns 扫描器依赖 API
 */
function createScannerAPI(): SkillScannerAPIMock {
  return {
    acquireDirectoryInstallLock: vi.fn<(targetDir: string) => Promise<string>>().mockResolvedValue('skill-lock'),
    readFile: vi.fn<SkillScannerAPI['readFile']>(),
    readWorkspaceDirectory: vi.fn<SkillScannerAPI['readWorkspaceDirectory']>(),
    getPathStatus: vi.fn<NonNullable<SkillScannerAPI['getPathStatus']>>().mockResolvedValue({ exists: true, isFile: false, isDirectory: true }),
    trashFile: vi.fn<(filePath: string) => Promise<void>>(),
    renameFile: vi.fn<(oldPath: string, newPath: string) => Promise<void>>(),
    releaseDirectoryInstallLock: vi.fn<(token: string) => Promise<void>>().mockResolvedValue(undefined)
  };
}

describe('scanSkills', (): void => {
  it('ignores stale install transaction files while scanning skills', async (): Promise<void> => {
    const api = createScannerAPI();
    api.readWorkspaceDirectory.mockResolvedValue({
      entries: [
        { name: '.install-test.json', type: 'file' },
        { name: 'demo', type: 'directory' }
      ]
    });
    api.readFile.mockImplementation(async (filePath: string) => {
      if (filePath.endsWith('/.install-test.json')) {
        return { content: JSON.stringify({ version: 1, targetName: 'demo', temporaryName: '.tmp-test', backupName: '.bak-test' }) };
      }

      return { content: ['---', 'name: demo', 'description: Demo skill', '---', 'body'].join('\n') };
    });
    api.getPathStatus.mockImplementation(async (filePath: string) => ({
      exists: filePath.endsWith('/skills') || filePath.endsWith('/.bak-test') || filePath.endsWith('/SKILL.md'),
      isFile: filePath.endsWith('/SKILL.md'),
      isDirectory: filePath.endsWith('/skills') || filePath.endsWith('/.bak-test')
    }));

    const skills = await scanSkills({ homeDir: '/Users/test' }, api);

    expect(api.renameFile).not.toHaveBeenCalled();
    expect(api.trashFile).not.toHaveBeenCalled();
    expect(skills).toHaveLength(1);
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
