/**
 * @file types.test.ts
 * @description Skill 类型定义测试。
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SKILL_MAX_CONTENT_LENGTH,
  type SkillDefinition,
  type SkillScanConfig,
  type SkillSource,
  type SkillChangeEvent
} from '@/ai/skill/types';

describe('Skill types', () => {
  it('exports DEFAULT_SKILL_MAX_CONTENT_LENGTH with correct value', () => {
    expect(DEFAULT_SKILL_MAX_CONTENT_LENGTH).toBe(10000);
  });

  it('SkillSource has expected variants', () => {
    const sources: SkillSource[] = ['builtin', 'global'];
    expect(sources).toHaveLength(2);
  });

  it('SkillDefinition has required fields', () => {
    const skill: SkillDefinition = {
      name: 'test-skill',
      description: 'A test skill',
      content: '# Test\nContent',
      filePath: '/path/to/SKILL.md',
      dirPath: '/path/to',
      source: 'global',
      enabled: true,
      parsedAt: Date.now()
    };
    expect(skill.name).toBe('test-skill');
    expect(skill.parseError).toBeUndefined();
  });

  it('SkillScanConfig has required fields', () => {
    const config: SkillScanConfig = {
      homeDir: '/Users/test'
    };
    expect(config.maxContentLength).toBeUndefined();
  });

  it('SkillChangeEvent has required fields', () => {
    const event: SkillChangeEvent = {
      type: 'change',
      filePath: '/path/to/SKILL.md'
    };
    expect(event.type).toBe('change');
  });
});
