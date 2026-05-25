/**
 * @file scanner.test.ts
 * @description Skill 扫描器测试。
 */
import { describe, expect, it, vi } from 'vitest';
import { scanSkills } from '@/ai/skill/scanner';
import type { SkillScanConfig } from '@/ai/skill/types';

/**
 * 创建 mock electronAPI。
 * @param files - 文件系统映射（路径 → 内容）
 * @param directories - 目录映射（路径 → 子条目列表）
 * @returns mock electronAPI
 */
function createMockElectronAPI(files: Record<string, string> = {}, directories: Record<string, Array<{ name: string; type: 'file' | 'directory' }>> = {}, overrides?: { trashFile?: ReturnType<typeof vi.fn> }) {
  return {
    readFile: vi.fn(async (filePath: string) => {
      const content = files[filePath];
      if (content === undefined) {
        throw new Error(`File not found: ${filePath}`);
      }
      return { content, fileName: 'SKILL.md', ext: 'md' };
    }),
    readWorkspaceDirectory: vi.fn(async (options: { directoryPath: string }) => {
      const entries = directories[options.directoryPath];
      if (entries === undefined) {
        throw new Error(`Directory not found: ${options.directoryPath}`);
      }
      return { entries };
    }),
    getPathStatus: vi.fn(async (targetPath: string) => {
      if (files[targetPath] !== undefined) {
        return { exists: true, isFile: true, isDirectory: false };
      }
      if (directories[targetPath] !== undefined) {
        return { exists: true, isFile: false, isDirectory: true };
      }
      return { exists: false, isFile: false, isDirectory: false };
    }),
    trashFile: overrides?.trashFile ?? vi.fn(async (_filePath: string) => {})
  };
}

describe('scanSkills', () => {
  it('discovers skills from user .agents/skills/ directory', async () => {
    const mockAPI = createMockElectronAPI(
      {
        '/Users/test/.agents/skills/react-patterns/SKILL.md': '---\nname: react-patterns\ndescription: React patterns.\n---\n\n# React Patterns\nContent here.',
        '/Users/test/.agents/skills/api-design/SKILL.md': '---\nname: api-design\ndescription: API design.\n---\n\n# API Design\nContent here.'
      },
      {
        '/Users/test/.agents/skills': [
          { name: 'react-patterns', type: 'directory' as const },
          { name: 'api-design', type: 'directory' as const }
        ],
        '/Users/test/.agents/skills/react-patterns': [{ name: 'SKILL.md', type: 'file' as const }],
        '/Users/test/.agents/skills/api-design': [{ name: 'SKILL.md', type: 'file' as const }]
      }
    );

    const config: SkillScanConfig = {
      homeDir: '/Users/test'
    };

    const skills = await scanSkills(config, mockAPI);

    expect(skills).toHaveLength(2);
    expect(skills[0].name).toBe('react-patterns');
    expect(skills[1].name).toBe('api-design');
  });

  it('returns empty array when no skill directories exist', async () => {
    const mockAPI = createMockElectronAPI({}, {});

    const config: SkillScanConfig = {
      homeDir: '/Users/test'
    };

    const skills = await scanSkills(config, mockAPI);

    expect(skills).toEqual([]);
  });

  it('ignores project skill directories because skill discovery is global', async () => {
    const mockAPI = createMockElectronAPI(
      {
        '/workspace/.agents/skills/shared/SKILL.md': '---\nname: shared\ndescription: Project skill.\n---\n\n# Project',
        '/Users/test/.agents/skills/shared/SKILL.md': '---\nname: shared\ndescription: User skill.\n---\n\n# User'
      },
      {
        '/workspace/.agents/skills': [{ name: 'shared', type: 'directory' as const }],
        '/workspace/.agents/skills/shared': [{ name: 'SKILL.md', type: 'file' as const }],
        '/Users/test/.agents/skills': [{ name: 'shared', type: 'directory' as const }],
        '/Users/test/.agents/skills/shared': [{ name: 'SKILL.md', type: 'file' as const }]
      }
    );

    const skills = await scanSkills(
      {
        homeDir: '/Users/test'
      },
      mockAPI
    );

    expect(skills).toHaveLength(1);
    expect(skills[0].description).toBe('User skill.');
    expect(skills[0].source).toBe('global');
  });

  it('skips skills with parse errors but includes them with parseError field', async () => {
    const mockAPI = createMockElectronAPI(
      {
        '/Users/test/.agents/skills/bad-skill/SKILL.md': '# No frontmatter',
        '/Users/test/.agents/skills/good-skill/SKILL.md': '---\nname: good-skill\ndescription: Good skill.\n---\n\n# Good'
      },
      {
        '/Users/test/.agents/skills': [
          { name: 'bad-skill', type: 'directory' as const },
          { name: 'good-skill', type: 'directory' as const }
        ],
        '/Users/test/.agents/skills/bad-skill': [{ name: 'SKILL.md', type: 'file' as const }],
        '/Users/test/.agents/skills/good-skill': [{ name: 'SKILL.md', type: 'file' as const }]
      }
    );

    const config: SkillScanConfig = {
      homeDir: '/Users/test'
    };

    const skills = await scanSkills(config, mockAPI);

    // Skills with parseError are filtered out, only valid skills are returned
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('good-skill');
    expect(skills[0].parseError).toBeUndefined();
  });

  it('skips dot-prefixed directories (.tmp-*, .bak-*)', async () => {
    const mockAPI = createMockElectronAPI(
      {
        '/Users/test/.agents/skills/.tmp-abc12345/SKILL.md': '---\nname: orphan-tmp\ndescription: Orphan temp.\n---\n\n# Orphan',
        '/Users/test/.agents/skills/.bak-def67890/SKILL.md': '---\nname: orphan-bak\ndescription: Orphan backup.\n---\n\n# Orphan',
        '/Users/test/.agents/skills/good-skill/SKILL.md': '---\nname: good-skill\ndescription: Good skill.\n---\n\n# Good'
      },
      {
        '/Users/test/.agents/skills': [
          { name: '.tmp-abc12345', type: 'directory' as const },
          { name: '.bak-def67890', type: 'directory' as const },
          { name: 'good-skill', type: 'directory' as const }
        ],
        '/Users/test/.agents/skills/.tmp-abc12345': [{ name: 'SKILL.md', type: 'file' as const }],
        '/Users/test/.agents/skills/.bak-def67890': [{ name: 'SKILL.md', type: 'file' as const }],
        '/Users/test/.agents/skills/good-skill': [{ name: 'SKILL.md', type: 'file' as const }]
      }
    );

    const skills = await scanSkills({ homeDir: '/Users/test' }, mockAPI);

    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('good-skill');
    // assert dot dirs were never read
    expect(mockAPI.readFile).not.toHaveBeenCalledWith('/Users/test/.agents/skills/.tmp-abc12345/SKILL.md');
    expect(mockAPI.readFile).not.toHaveBeenCalledWith('/Users/test/.agents/skills/.bak-def67890/SKILL.md');
  });

  it('cleans up orphan .tmp-* and .bak-* directories before scanning', async () => {
    const trashFile = vi.fn(async (_filePath: string) => {});
    const mockAPI = createMockElectronAPI(
      {
        '/Users/test/.agents/skills/good-skill/SKILL.md': '---\nname: good-skill\ndescription: Good skill.\n---\n\n# Good'
      },
      {
        '/Users/test/.agents/skills': [
          { name: '.tmp-xyz', type: 'directory' as const },
          { name: '.bak-old', type: 'directory' as const },
          { name: 'good-skill', type: 'directory' as const }
        ],
        '/Users/test/.agents/skills/good-skill': [{ name: 'SKILL.md', type: 'file' as const }]
      },
      { trashFile }
    );

    const skills = await scanSkills({ homeDir: '/Users/test' }, mockAPI);

    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('good-skill');
    expect(trashFile).toHaveBeenCalledTimes(2);
    expect(trashFile).toHaveBeenCalledWith('/Users/test/.agents/skills/.tmp-xyz');
    expect(trashFile).toHaveBeenCalledWith('/Users/test/.agents/skills/.bak-old');
  });

  it('skips skill directories without SKILL.md before reading file content', async () => {
    const mockAPI = createMockElectronAPI(
      {
        '/Users/test/.agents/skills/good-skill/SKILL.md': '---\nname: good-skill\ndescription: Good skill.\n---\n\n# Good'
      },
      {
        '/Users/test/.agents/skills': [
          { name: 'empty-skill', type: 'directory' as const },
          { name: 'good-skill', type: 'directory' as const }
        ],
        '/Users/test/.agents/skills/empty-skill': [],
        '/Users/test/.agents/skills/good-skill': [{ name: 'SKILL.md', type: 'file' as const }]
      }
    );

    const skills = await scanSkills({ homeDir: '/Users/test' }, mockAPI);

    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('good-skill');
    expect(mockAPI.readFile).not.toHaveBeenCalledWith('/Users/test/.agents/skills/empty-skill/SKILL.md');
  });
});
