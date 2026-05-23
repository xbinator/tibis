/**
 * @file parser.test.ts
 * @description SKILL.md 解析器测试。
 */
import { describe, expect, it } from 'vitest';
import { parseSkillMarkdown } from '@/ai/skill/parser';

describe('parseSkillMarkdown', () => {
  it('parses valid SKILL.md with frontmatter and body', () => {
    const markdown = `---
name: react-patterns
description: Use when building React components.
---

# React Patterns

Follow these guidelines:
1. Prefer composition over inheritance`;

    const result = parseSkillMarkdown(markdown, '/path/to/SKILL.md');

    expect(result.name).toBe('react-patterns');
    expect(result.description).toBe('Use when building React components.');
    expect(result.content).toContain('# React Patterns');
    expect(result.content).toContain('Prefer composition over inheritance');
    expect(result.filePath).toBe('/path/to/SKILL.md');
    expect(result.dirPath).toBe('/path/to');
    expect(result.enabled).toBe(true);
    expect(result.parseError).toBeUndefined();
  });

  it('returns error when name is missing in frontmatter', () => {
    const markdown = `---
description: A skill without name.
---

# Content`;

    const result = parseSkillMarkdown(markdown, '/path/to/SKILL.md');

    expect(result.parseError).toBeDefined();
    expect(result.parseError).toContain('name');
  });

  it('returns error when description is missing in frontmatter', () => {
    const markdown = `---
name: my-skill
---

# Content`;

    const result = parseSkillMarkdown(markdown, '/path/to/SKILL.md');

    expect(result.parseError).toBeDefined();
    expect(result.parseError).toContain('description');
  });

  it('returns error when frontmatter is missing entirely', () => {
    const markdown = '# Just a heading\nNo frontmatter here.';

    const result = parseSkillMarkdown(markdown, '/path/to/SKILL.md');

    expect(result.parseError).toBeDefined();
    expect(result.parseError).toContain('frontmatter');
  });

  it('truncates content exceeding maxContentLength', () => {
    const longContent = 'A'.repeat(15000);
    const markdown = `---
name: long-skill
description: A very long skill.
---

${longContent}`;

    const result = parseSkillMarkdown(markdown, '/path/to/SKILL.md', { maxContentLength: 10000 });

    expect(result.content.length).toBeLessThan(11000);
    expect(result.content).toContain('Content truncated');
    expect(result.content).toContain('/path/to/SKILL.md');
  });

  it('does not truncate content within limit', () => {
    const shortContent = 'Short content';
    const markdown = `---
name: short-skill
description: A short skill.
---

${shortContent}`;

    const result = parseSkillMarkdown(markdown, '/path/to/SKILL.md', { maxContentLength: 10000 });

    expect(result.content).toBe(shortContent);
    expect(result.content).not.toContain('Content truncated');
  });

  it('handles empty body gracefully', () => {
    const markdown = `---
name: empty-skill
description: No body content.
---
`;

    const result = parseSkillMarkdown(markdown, '/path/to/SKILL.md');

    expect(result.name).toBe('empty-skill');
    expect(result.content).toBe('');
  });

  it('extracts dirPath from filePath correctly', () => {
    const markdown = `---
name: test-skill
description: Test.
---

Content`;

    const result = parseSkillMarkdown(markdown, '/workspace/.agents/skills/test-skill/SKILL.md');

    expect(result.dirPath).toBe('/workspace/.agents/skills/test-skill');
  });

  it('extracts dirPath from Windows filePath correctly', () => {
    const markdown = `---
name: test-skill
description: Test.
---

Content`;

    const result = parseSkillMarkdown(markdown, 'C:\\workspace\\.agents\\skills\\test-skill\\SKILL.md');

    expect(result.dirPath).toBe('C:\\workspace\\.agents\\skills\\test-skill');
  });
});
