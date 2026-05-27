/**
 * @file builtin-skill.test.ts
 * @description Skill 工具测试。
 */
import { describe, expect, it, vi } from 'vitest';
import type { SkillDefinition } from '@/ai/skill/types';
import { createSkillTool, SKILL_TOOL_NAME } from '@/ai/tools/builtin/SkillTool';

/**
 * 创建 mock skill store。
 * @param skills - 可用 skill 列表
 * @returns mock store
 */
function createMockSkillStore(skills: SkillDefinition[] = []) {
  return {
    getEnabledSkills: vi.fn(() => skills),
    getSkillByName: vi.fn((name: string) => skills.find((s) => s.name === name)),
    initialized: true
  };
}

const sampleSkill: SkillDefinition = {
  name: 'react-patterns',
  description: 'Use when building React components.',
  content: '# React Patterns\n\n1. Prefer composition over inheritance',
  filePath: '/workspace/.agents/skills/react-patterns/SKILL.md',
  dirPath: '/workspace/.agents/skills/react-patterns',
  source: 'global',
  enabled: true,
  parsedAt: Date.now()
};

describe('SkillTool', () => {
  it('has correct tool name', () => {
    expect(SKILL_TOOL_NAME).toBe('skill');
  });

  it('definition has read risk level', () => {
    const store = createMockSkillStore([sampleSkill]);
    const tool = createSkillTool(store);
    expect(tool.definition.riskLevel).toBe('read');
  });

  it('definition has dynamic description listing available skills', () => {
    const store = createMockSkillStore([sampleSkill]);
    const tool = createSkillTool(store);

    const desc = typeof tool.definition.description === 'function' ? tool.definition.description() : tool.definition.description;

    expect(desc).toContain('react-patterns');
    expect(desc).toContain('Use when building React components.');
  });

  it('definition shows no skills available when list is empty', () => {
    const store = createMockSkillStore([]);
    const tool = createSkillTool(store);

    const desc = typeof tool.definition.description === 'function' ? tool.definition.description() : tool.definition.description;

    expect(desc).toContain('No skills available');
  });

  it('caps dynamic description when many skills are available', () => {
    const skills = Array.from({ length: 80 }, (_, index) => ({
      ...sampleSkill,
      name: `skill-${index}`,
      description: `Use when doing specialized workflow number ${index} with a deliberately long description.`
    }));
    const store = createMockSkillStore(skills);
    const tool = createSkillTool(store);

    const desc = typeof tool.definition.description === 'function' ? tool.definition.description() : tool.definition.description;

    expect(desc.length).toBeLessThanOrEqual(4000);
    expect(desc).toContain('more skills omitted');
  });

  it('executes and returns skill content wrapped in skill_content tags', async () => {
    const store = createMockSkillStore([sampleSkill]);
    const tool = createSkillTool(store);

    const result = await tool.execute({ name: 'react-patterns' });

    expect(result.status).toBe('success');
    if (result.status !== 'success') throw new Error('Expected success');

    expect(result.data).toContain('<skill_content name="react-patterns">');
    expect(result.data).toContain('Prefer composition over inheritance');
    expect(result.data).toContain('</skill_content>');
  });

  it('includes skill directory guidance for bundled scripts and resources', async () => {
    const store = createMockSkillStore([sampleSkill]);
    const tool = createSkillTool(store);

    const result = await tool.execute({ name: 'react-patterns' });

    expect(result.status).toBe('success');
    if (result.status !== 'success') throw new Error('Expected success');

    expect(result.data).toContain('<skill_metadata>');
    expect(result.data).toContain('<dir_path>/workspace/.agents/skills/react-patterns</dir_path>');
    expect(result.data).toContain('run_shell_command');
  });

  it('returns failure when skill name not found', async () => {
    const store = createMockSkillStore([sampleSkill]);
    const tool = createSkillTool(store);

    const result = await tool.execute({ name: 'nonexistent' });

    expect(result.status).toBe('failure');
    if (result.status !== 'failure') throw new Error('Expected failure');

    expect(result.error.message).toContain('not found');
    expect(result.error.message).toContain('react-patterns');
  });

  it('does not require active document', () => {
    const store = createMockSkillStore([sampleSkill]);
    const tool = createSkillTool(store);
    expect(tool.definition.requiresActiveDocument).toBe(false);
  });
});
