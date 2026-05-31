/**
 * @file extractor.test.ts
 * @description 记忆提取 prompt 构建测试
 */
import { describe, expect, it } from 'vitest';
import { buildExtractionPrompt, getExtractionSystemPrompt } from '@/ai/memory/extractor';
import { createEmptyMemoryDoc } from '@/ai/memory/parser';
import type { ExtractionMessage } from '@/ai/memory/types';

describe('buildExtractionPrompt', () => {
  it('includes conversation content', () => {
    const messages: ExtractionMessage[] = [
      { role: 'user', content: '请帮我写一个记忆系统' },
      { role: 'assistant', content: '好的，我来帮你设计' }
    ];
    const doc = createEmptyMemoryDoc();

    const prompt = buildExtractionPrompt(messages, doc);

    expect(prompt).toContain('请帮我写一个记忆系统');
    expect(prompt).toContain('好的，我来帮你设计');
  });

  it('includes memory summary for non-empty doc', () => {
    const messages: ExtractionMessage[] = [
      { role: 'user', content: '你好' },
      { role: 'assistant', content: '你好！' }
    ];
    const doc = createEmptyMemoryDoc();
    doc.sections.find((s) => s.category === 'Instructions')!.items.push({ content: '始终使用 TypeScript' });

    const prompt = buildExtractionPrompt(messages, doc);

    expect(prompt).toContain('Instructions');
    expect(prompt).toContain('1 items');
    expect(prompt).toContain('始终使用 TypeScript');
  });

  it('shows empty summary for empty doc', () => {
    const messages: ExtractionMessage[] = [
      { role: 'user', content: '你好' },
      { role: 'assistant', content: '你好！' }
    ];
    const doc = createEmptyMemoryDoc();

    const prompt = buildExtractionPrompt(messages, doc);

    // 空文档时 memory summary 区域为空行
    expect(prompt).toContain('Existing memory summary (avoid duplicating these):');
  });

  it('includes output format constraints', () => {
    const messages: ExtractionMessage[] = [
      { role: 'user', content: '你好' },
      { role: 'assistant', content: '你好！' }
    ];
    const doc = createEmptyMemoryDoc();

    const prompt = buildExtractionPrompt(messages, doc);

    expect(prompt).toContain('Output ONLY valid JSON array');
    expect(prompt).toContain('"action"');
    expect(prompt).toContain('"section"');
    expect(prompt).toContain('"content"');
    expect(prompt).toContain('"reason"');
  });

  it('includes all category names in prompt', () => {
    const messages: ExtractionMessage[] = [
      { role: 'user', content: '你好' },
      { role: 'assistant', content: '你好！' }
    ];
    const doc = createEmptyMemoryDoc();

    const prompt = buildExtractionPrompt(messages, doc);

    expect(prompt).toContain('Instructions');
    expect(prompt).toContain('Preferences');
    expect(prompt).toContain('Habits');
    expect(prompt).toContain('Facts');
    expect(prompt).toContain('Projects');
    expect(prompt).toContain('Current Context');
  });

  it('truncates long first item in summary', () => {
    const messages: ExtractionMessage[] = [
      { role: 'user', content: '你好' },
      { role: 'assistant', content: '你好！' }
    ];
    const doc = createEmptyMemoryDoc();
    const longContent = '这是一条非常长的记忆内容'.repeat(10);
    doc.sections.find((s) => s.category === 'Facts')!.items.push({ content: longContent });

    const prompt = buildExtractionPrompt(messages, doc);

    expect(prompt).toContain('...');
  });
});

describe('getExtractionSystemPrompt', () => {
  it('contains output format constraints', () => {
    const systemPrompt = getExtractionSystemPrompt();

    expect(systemPrompt).toContain('Output ONLY valid JSON array');
    expect(systemPrompt).toContain('"action"');
  });

  it('lists all valid sections', () => {
    const systemPrompt = getExtractionSystemPrompt();

    expect(systemPrompt).toContain('- Instructions');
    expect(systemPrompt).toContain('- Preferences');
    expect(systemPrompt).toContain('- Habits');
    expect(systemPrompt).toContain('- Facts');
    expect(systemPrompt).toContain('- Projects');
    expect(systemPrompt).toContain('- Current Context');
  });
});
