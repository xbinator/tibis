/**
 * @file injector.test.ts
 * @description 记忆注入 system prompt 构建与裁剪测试
 */
import { describe, expect, it } from 'vitest';
import { buildSystemPromptContext } from '@/ai/memory/injector';
import { createEmptyMemoryDoc } from '@/ai/memory/parser';

describe('buildSystemPromptContext', () => {
  it('returns empty string for empty doc', () => {
    const doc = createEmptyMemoryDoc();

    expect(buildSystemPromptContext(doc)).toBe('');
  });

  it('wraps content in <user_memory> tags', () => {
    const doc = createEmptyMemoryDoc();
    doc.sections.find((s) => s.category === 'Instructions')!.items.push({ content: '规则一' });

    const result = buildSystemPromptContext(doc);

    expect(result).toContain('<user_memory>');
    expect(result).toContain('</user_memory>');
  });

  it('includes Chinese header text', () => {
    const doc = createEmptyMemoryDoc();
    doc.sections.find((s) => s.category === 'Instructions')!.items.push({ content: '规则一' });

    const result = buildSystemPromptContext(doc);

    expect(result).toContain('以下是关于该用户的已知信息');
  });

  it('includes all non-empty sections', () => {
    const doc = createEmptyMemoryDoc();
    doc.sections.find((s) => s.category === 'Instructions')!.items.push({ content: '规则一' });
    doc.sections.find((s) => s.category === 'Facts')!.items.push({ content: '事实一' });

    const result = buildSystemPromptContext(doc);

    expect(result).toContain('# Instructions');
    expect(result).toContain('- 规则一');
    expect(result).toContain('# Facts');
    expect(result).toContain('- 事实一');
  });

  it('skips empty sections', () => {
    const doc = createEmptyMemoryDoc();
    doc.sections.find((s) => s.category === 'Instructions')!.items.push({ content: '规则一' });

    const result = buildSystemPromptContext(doc);

    expect(result).toContain('# Instructions');
    expect(result).not.toContain('# Preferences');
    expect(result).not.toContain('# Habits');
  });

  it('respects maxChars budget', () => {
    const doc = createEmptyMemoryDoc();

    // 在低优先级分区添加大量内容
    const projects = doc.sections.find((s) => s.category === 'Projects')!;
    for (let i = 0; i < 20; i++) {
      projects.items.push({ content: `项目 ${i}：这是一段较长的记忆内容用于测试裁剪功能` });
    }
    // 在高优先级分区添加少量内容
    doc.sections.find((s) => s.category === 'Instructions')!.items.push({ content: '规则一' });

    const result = buildSystemPromptContext(doc, 200);

    expect(result.length).toBeLessThanOrEqual(200);
    expect(result).toContain('<user_memory>');
    expect(result).toContain('</user_memory>');
    // 高优先级分区应保留
    expect(result).toContain('# Instructions');
  });

  it('prioritizes Instructions over Projects when pruning', () => {
    const doc = createEmptyMemoryDoc();

    // 只在低优先级分区添加内容
    doc.sections.find((s) => s.category === 'Projects')!.items.push({ content: '项目一' });
    doc.sections.find((s) => s.category === 'Instructions')!.items.push({ content: '规则一' });

    // 设置极小的 budget，只够一个分区
    const result = buildSystemPromptContext(doc, 200);

    expect(result).toContain('# Instructions');
    expect(result).toContain('规则一');
  });

  it('continues checking lower priority sections when a higher priority section is too large', () => {
    const doc = createEmptyMemoryDoc();
    doc.sections.find((s) => s.category === 'Instructions')!.items.push({ content: '超长规则'.repeat(80) });
    doc.sections.find((s) => s.category === 'Preferences')!.items.push({ content: '短偏好' });

    const result = buildSystemPromptContext(doc, 180);

    expect(result).not.toContain('# Instructions');
    expect(result).toContain('# Preferences');
    expect(result).toContain('短偏好');
  });

  it('returns empty string when budget is too small for any section', () => {
    const doc = createEmptyMemoryDoc();
    doc.sections
      .find((s) => s.category === 'Projects')!
      .items.push({
        content: '这是一个非常长的项目描述'.repeat(20)
      });

    const result = buildSystemPromptContext(doc, 50);

    expect(result).toBe('');
  });

  it('prunes by section priority order: Instructions > Preferences > Current Context > Facts > Habits > Projects', () => {
    const doc = createEmptyMemoryDoc();

    // 每个分区添加足够长的内容
    const longContent = (name: string) => `${name}：这是一段中等长度的记忆条目内容`.repeat(3);
    doc.sections.find((s) => s.category === 'Instructions')!.items.push({ content: longContent('规则') });
    doc.sections.find((s) => s.category === 'Preferences')!.items.push({ content: longContent('偏好') });
    doc.sections.find((s) => s.category === 'Current Context')!.items.push({ content: longContent('上下文') });
    doc.sections.find((s) => s.category === 'Facts')!.items.push({ content: longContent('事实') });
    doc.sections.find((s) => s.category === 'Habits')!.items.push({ content: longContent('习惯') });
    doc.sections.find((s) => s.category === 'Projects')!.items.push({ content: longContent('项目') });

    // 设置 budget 只够 2 个分区
    const result = buildSystemPromptContext(doc, 350);

    // 高优先级分区应该被保留
    expect(result).toContain('# Instructions');
    // Projects 最先被裁剪
    expect(result).not.toContain('# Projects');
  });
});
