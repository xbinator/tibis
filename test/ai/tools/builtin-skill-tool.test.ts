/**
 * @file builtin-skill-tool.test.ts
 * @description Skill 工具执行时最新源文件读取测试。
 */
import { describe, expect, it } from 'vitest';
import type { SkillDefinition } from '@/ai/skill/types';
import { createSkillTool, type SkillStoreLike } from '@/ai/tools/builtin/SkillTool';

/**
 * 创建测试 Skill 定义。
 * @param content - Skill 指令内容
 * @param contentHash - Skill 内容版本
 * @returns Skill 定义
 */
function createSkill(content: string, contentHash: string): SkillDefinition {
  return {
    name: 'weather',
    description: 'Weather instructions',
    content,
    contentHash,
    filePath: '/home/.agents/skills/weather/SKILL.md',
    dirPath: '/home/.agents/skills/weather',
    source: 'global',
    enabled: true,
    parsedAt: 1
  };
}

describe('SkillTool', (): void => {
  it('loads execution-time Skill content and version from the Store resolver', async (): Promise<void> => {
    const oldSkill = createSkill('old instructions', 'old-hash');
    const latestSkill = createSkill('latest instructions', 'latest-hash');
    const store = {
      initialized: true,
      getEnabledSkills: (): SkillDefinition[] => [oldSkill],
      getSkillByName: (): SkillDefinition => oldSkill,
      resolveLatestEnabledSkill: async (): Promise<SkillDefinition> => latestSkill
    } as SkillStoreLike;
    const tool = createSkillTool(store);

    const result = await tool.execute({ name: 'weather' });

    expect(result).toMatchObject({ status: 'success' });
    expect(result.status === 'success' ? result.data : '').toContain('latest instructions');
    expect(result.status === 'success' ? result.data : '').toContain('<content_hash>latest-hash</content_hash>');
    expect(result.status === 'success' ? result.data : '').not.toContain('old instructions');
  });
});
