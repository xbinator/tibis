/**
 * @file parser.test.ts
 * @description Skill Markdown 内容版本测试。
 */
import { describe, expect, it } from 'vitest';
import { parseSkillMarkdown } from '@/ai/skill';
import { hashString } from '@/shared/utils/hash';

describe('parseSkillMarkdown content hash', (): void => {
  it('records a stable hash of the complete source text', (): void => {
    const source = ['---', 'name: weather', 'description: Weather instructions', '---', 'Read the latest weather data.'].join('\n');
    const changedSource = source.replace('latest', 'current');

    expect(parseSkillMarkdown(source, '/skills/weather/SKILL.md').contentHash).toBe(hashString(source));
    expect(parseSkillMarkdown(changedSource, '/skills/weather/SKILL.md').contentHash).not.toBe(hashString(source));
  });

  it('records the source hash when parsing fails', (): void => {
    const source = 'missing frontmatter';

    expect(parseSkillMarkdown(source, '/skills/broken/SKILL.md').contentHash).toBe(hashString(source));
  });
});
