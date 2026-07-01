/**
 * @file scanner.test.ts
 * @description Skill 文件扫描器测试。
 */
import { describe, expect, it, type Mock, vi } from 'vitest';
import { scanSkills, type SkillScannerAPI } from '@/ai/skill';

/**
 * Skill 扫描器测试 API。
 */
interface SkillScannerAPIMock extends SkillScannerAPI {
  /** 读取文件 mock */
  readFile: Mock<SkillScannerAPI['readFile']>;
  /** 读取目录 mock */
  readWorkspaceDirectory: Mock<SkillScannerAPI['readWorkspaceDirectory']>;
  /** 路径状态 mock */
  getPathStatus: Mock<NonNullable<SkillScannerAPI['getPathStatus']>>;
  /** 移动文件 mock */
  trashFile: Mock<NonNullable<SkillScannerAPI['trashFile']>>;
}

/**
 * 创建 Skill 扫描器测试 API。
 * @returns 扫描器依赖 API
 */
function createScannerAPI(): SkillScannerAPIMock {
  return {
    readFile: vi.fn<SkillScannerAPI['readFile']>(),
    readWorkspaceDirectory: vi.fn<SkillScannerAPI['readWorkspaceDirectory']>(),
    getPathStatus: vi.fn<NonNullable<SkillScannerAPI['getPathStatus']>>().mockResolvedValue({ exists: true, isFile: false, isDirectory: true }),
    trashFile: vi.fn<NonNullable<SkillScannerAPI['trashFile']>>()
  };
}

describe('scanSkills', (): void => {
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
