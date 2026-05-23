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
function createMockElectronAPI(files: Record<string, string> = {}, directories: Record<string, Array<{ name: string; type: 'file' | 'directory' }>> = {}) {
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
    })
  };
}

describe('scanSkills', () => {
  it('discovers skills from project .agents/skills/ directory', async () => {
    const mockAPI = createMockElectronAPI(
      {
        '/workspace/.agents/skills/react-patterns/SKILL.md': '---\nname: react-patterns\ndescription: React patterns.\n---\n\n# React Patterns\nContent here.',
        '/workspace/.agents/skills/api-design/SKILL.md': '---\nname: api-design\ndescription: API design.\n---\n\n# API Design\nContent here.'
      },
      {
        '/workspace/.agents/skills': [
          { name: 'react-patterns', type: 'directory' as const },
          { name: 'api-design', type: 'directory' as const }
        ],
        '/workspace/.agents/skills/react-patterns': [{ name: 'SKILL.md', type: 'file' as const }],
        '/workspace/.agents/skills/api-design': [{ name: 'SKILL.md', type: 'file' as const }]
      }
    );

    const config: SkillScanConfig = {
      workspaceRoot: '/workspace'
    };

    const skills = await scanSkills(config, mockAPI);

    expect(skills).toHaveLength(2);
    expect(skills[0].name).toBe('react-patterns');
    expect(skills[1].name).toBe('api-design');
  });

  it('returns empty array when no skill directories exist', async () => {
    const mockAPI = createMockElectronAPI({}, {});

    const config: SkillScanConfig = {
      workspaceRoot: '/workspace'
    };

    const skills = await scanSkills(config, mockAPI);

    expect(skills).toEqual([]);
  });

  it('ignores non-standard skill directories because skill discovery is unified', async () => {
    const mockAPI = createMockElectronAPI(
      {
        '/workspace/.agents/skills/shared/SKILL.md': '---\nname: shared\ndescription: Project skill.\n---\n\n# Project',
        '/Users/test/skills/shared/SKILL.md': '---\nname: shared\ndescription: User skill.\n---\n\n# User'
      },
      {
        '/workspace/.agents/skills': [{ name: 'shared', type: 'directory' as const }],
        '/workspace/.agents/skills/shared': [{ name: 'SKILL.md', type: 'file' as const }],
        '/Users/test/skills': [{ name: 'shared', type: 'directory' as const }],
        '/Users/test/skills/shared': [{ name: 'SKILL.md', type: 'file' as const }]
      }
    );

    const skills = await scanSkills(
      {
        workspaceRoot: '/workspace'
      },
      mockAPI
    );

    expect(skills).toHaveLength(1);
    expect(skills[0].description).toBe('Project skill.');
    expect(skills[0].source).toBe('project');
  });

  it('skips skills with parse errors but includes them with parseError field', async () => {
    const mockAPI = createMockElectronAPI(
      {
        '/workspace/.agents/skills/bad-skill/SKILL.md': '# No frontmatter',
        '/workspace/.agents/skills/good-skill/SKILL.md': '---\nname: good-skill\ndescription: Good skill.\n---\n\n# Good'
      },
      {
        '/workspace/.agents/skills': [
          { name: 'bad-skill', type: 'directory' as const },
          { name: 'good-skill', type: 'directory' as const }
        ],
        '/workspace/.agents/skills/bad-skill': [{ name: 'SKILL.md', type: 'file' as const }],
        '/workspace/.agents/skills/good-skill': [{ name: 'SKILL.md', type: 'file' as const }]
      }
    );

    const config: SkillScanConfig = {
      workspaceRoot: '/workspace'
    };

    const skills = await scanSkills(config, mockAPI);

    expect(skills).toHaveLength(2);
    const badSkill = skills.find((s: { name: string }) => s.name === '');
    const goodSkill = skills.find((s: { name: string }) => s.name === 'good-skill');
    expect(badSkill?.parseError).toBeDefined();
    expect(goodSkill?.parseError).toBeUndefined();
  });
});
