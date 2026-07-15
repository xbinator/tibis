/**
 * @file builtin-skill-tool.test.ts
 * @description Skill 工具执行复用 Store 内容缓存测试。
 */
import { describe, expect, it, vi } from 'vitest';
import type { SkillDefinition, SkillEntry } from '@/ai/skill/types';
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
    parsedAt: 1
  };
}

/**
 * 创建已加载 Skill Store 条目。
 * @param definition - Skill 解析定义
 * @returns 已加载 Store 条目
 */
function createSkillEntry(definition: SkillDefinition): SkillEntry {
  return {
    id: 'weather-directory',
    dirPath: definition.dirPath,
    filePath: definition.filePath,
    source: 'global',
    enabled: true,
    revision: 1,
    sourceContent: definition.content,
    definition
  };
}

describe('SkillTool', (): void => {
  it('loads Skill content and version through the Store cache', async (): Promise<void> => {
    const skill = createSkillEntry(createSkill('cached instructions', 'cached-hash'));
    const getSkill = vi.fn(async (): Promise<SkillEntry | undefined> => skill);
    const store = {
      initialized: true,
      getEnabledSkills: (): SkillEntry[] => [skill],
      getSkillByName: (): SkillEntry => skill,
      getSkill
    } as SkillStoreLike;
    const tool = createSkillTool(store);

    const result = await tool.execute({ name: 'weather' });

    expect(getSkill).toHaveBeenCalledWith('weather-directory');
    expect(result).toMatchObject({ status: 'success' });
    expect(result.status === 'success' ? result.data : '').toContain('cached instructions');
    expect(result.status === 'success' ? result.data : '').toContain('<content_hash>cached-hash</content_hash>');
  });
});
