/**
 * @file merger.test.ts
 * @description 记忆去重合并、相似度判断、解析降级测试
 */
import { describe, expect, it } from 'vitest';
import { extractKeywords, isSimilar, mergeMemory, parseExtractionResult } from '@/ai/memory/merger';
import { createEmptyMemoryDoc } from '@/ai/memory/parser';
import type { ExtractedMemory, MemoryDoc } from '@/ai/memory/types';

describe('extractKeywords', () => {
  it('extracts meaningful English keywords', () => {
    const keywords = extractKeywords('always use TypeScript for new projects');
    expect(keywords).toContain('always');
    expect(keywords).toContain('typescript');
    expect(keywords).toContain('new');
    expect(keywords).toContain('projects');
    expect(keywords).not.toContain('for');
  });

  it('extracts Chinese keywords', () => {
    const keywords = extractKeywords('始终使用 TypeScript');
    expect(keywords).toContain('始终使用');
    expect(keywords).toContain('typescript');
  });

  it('filters out Chinese stop words', () => {
    const keywords = extractKeywords('这是一个好的项目');
    expect(keywords).not.toContain('的');
    expect(keywords).not.toContain('是');
    expect(keywords).toContain('这是一个好的项目');
  });

  it('filters out English stop words', () => {
    const keywords = extractKeywords('this is a test');
    expect(keywords).not.toContain('this');
    expect(keywords).not.toContain('is');
    expect(keywords).toContain('test');
  });

  it('handles empty string', () => {
    const keywords = extractKeywords('');
    expect(keywords).toHaveLength(0);
  });
});

describe('isSimilar', () => {
  it('returns true for identical strings', () => {
    expect(isSimilar('偏好函数式编程', '偏好函数式编程')).toBe(true);
  });

  it('returns true when one string contains the other', () => {
    expect(isSimilar('偏好函数式编程风格', '偏好函数式编程')).toBe(true);
    expect(isSimilar('偏好函数式编程', '偏好函数式编程风格')).toBe(true);
  });

  it('returns true for high keyword overlap', () => {
    expect(isSimilar('always use TypeScript for new projects', 'always use TypeScript in new projects')).toBe(true);
  });

  it('returns false for completely different strings', () => {
    expect(isSimilar('始终使用 TypeScript', '项目使用 Vue 3')).toBe(false);
  });

  it('respects custom threshold', () => {
    expect(isSimilar('always use TypeScript for new projects', 'always use TypeScript in new projects', 0.8)).toBe(true);
    expect(isSimilar('always use TypeScript', 'project uses Vue 3', 0.8)).toBe(false);
  });

  it('returns false for empty keyword lists', () => {
    expect(isSimilar('的', '了')).toBe(false);
  });
});

describe('parseExtractionResult', () => {
  it('parses valid JSON array directly', () => {
    const raw = JSON.stringify([{ action: 'add', section: 'Facts', content: '用户正在开发记忆系统', reason: '对话中提及' }]);
    const result = parseExtractionResult(raw);

    expect(result.items).toHaveLength(1);
    expect(result.items[0].action).toBe('add');
    expect(result.items[0].section).toBe('Facts');
    expect(result.items[0].content).toBe('用户正在开发记忆系统');
  });

  it('extracts JSON from markdown code block', () => {
    const raw = '```json\n[{"action":"add","section":"Facts","content":"事实一","reason":"测试"}]\n```';
    const result = parseExtractionResult(raw);

    expect(result.items).toHaveLength(1);
    expect(result.items[0].content).toBe('事实一');
  });

  it('extracts JSON array from surrounding text', () => {
    const raw = 'Here is the result:\n[{"action":"add","section":"Facts","content":"事实一","reason":"测试"}]\nDone.';
    const result = parseExtractionResult(raw);

    expect(result.items).toHaveLength(1);
    expect(result.items[0].content).toBe('事实一');
  });

  it('returns empty array for completely invalid input', () => {
    const result = parseExtractionResult('not json at all');

    expect(result.items).toHaveLength(0);
  });

  it('returns empty array for empty string', () => {
    const result = parseExtractionResult('');

    expect(result.items).toHaveLength(0);
  });

  it('filters out items with invalid action', () => {
    const raw = JSON.stringify([{ action: 'invalid', section: 'Facts', content: '内容', reason: '测试' }]);
    const result = parseExtractionResult(raw);

    expect(result.items).toHaveLength(0);
  });

  it('filters out items with invalid section', () => {
    const raw = JSON.stringify([{ action: 'add', section: 'Invalid', content: '内容', reason: '测试' }]);
    const result = parseExtractionResult(raw);

    expect(result.items).toHaveLength(0);
  });

  it('filters out items with empty content', () => {
    const raw = JSON.stringify([{ action: 'add', section: 'Facts', content: '  ', reason: '测试' }]);
    const result = parseExtractionResult(raw);

    expect(result.items).toHaveLength(0);
  });

  it('handles empty JSON array', () => {
    const result = parseExtractionResult('[]');

    expect(result.items).toHaveLength(0);
  });
});

describe('mergeMemory', () => {
  /** 创建带指定条目的测试用 MemoryDoc */
  function makeDoc(sections: Record<string, string[]>): MemoryDoc {
    const doc = createEmptyMemoryDoc();
    for (const [category, contents] of Object.entries(sections)) {
      const section = doc.sections.find((s) => s.category === category);
      if (section) {
        section.items = contents.map((content) => ({ content }));
      }
    }
    return doc;
  }

  it('adds new items to the correct section', () => {
    const current = makeDoc({ Instructions: ['规则一'] });
    const extracted: ExtractedMemory = {
      items: [{ action: 'add', section: 'Facts', content: '事实一', reason: '测试' }]
    };

    const result = mergeMemory(current, extracted);

    expect(result.sections.find((s) => s.category === 'Facts')?.items).toHaveLength(1);
    expect(result.sections.find((s) => s.category === 'Facts')?.items[0].content).toBe('事实一');
  });

  it('removes matching items', () => {
    const current = makeDoc({ Instructions: ['规则一', '规则二'] });
    const extracted: ExtractedMemory = {
      items: [{ action: 'remove', section: 'Instructions', content: '规则一', reason: '测试' }]
    };

    const result = mergeMemory(current, extracted);

    const instructions = result.sections.find((s) => s.category === 'Instructions')!;
    expect(instructions.items).toHaveLength(1);
    expect(instructions.items[0].content).toBe('规则二');
  });

  it('updates matching items', () => {
    const current = makeDoc({ Preferences: ['偏好函数式编程'] });
    const extracted: ExtractedMemory = {
      items: [{ action: 'update', section: 'Preferences', content: '偏好函数式编程风格', reason: '测试' }]
    };

    const result = mergeMemory(current, extracted);

    const preferences = result.sections.find((s) => s.category === 'Preferences')!;
    expect(preferences.items).toHaveLength(1);
    expect(preferences.items[0].content).toBe('偏好函数式编程风格');
  });

  it('blocks add when similar item already exists (similarity > 0.8)', () => {
    const current = makeDoc({ Preferences: ['always use TypeScript for new projects'] });
    const extracted: ExtractedMemory = {
      items: [{ action: 'add', section: 'Preferences', content: 'always use TypeScript in new projects', reason: '测试' }]
    };

    const result = mergeMemory(current, extracted);

    const preferences = result.sections.find((s) => s.category === 'Preferences')!;
    expect(preferences.items).toHaveLength(1);
    expect(preferences.items[0].content).toBe('always use TypeScript for new projects');
  });

  it('allows add when content is genuinely new', () => {
    const current = makeDoc({ Preferences: ['偏好函数式编程'] });
    const extracted: ExtractedMemory = {
      items: [{ action: 'add', section: 'Preferences', content: '偏好使用中文注释', reason: '测试' }]
    };

    const result = mergeMemory(current, extracted);

    const preferences = result.sections.find((s) => s.category === 'Preferences')!;
    expect(preferences.items).toHaveLength(2);
  });

  it('does not mutate the original doc', () => {
    const current = makeDoc({ Instructions: ['规则一'] });
    const extracted: ExtractedMemory = {
      items: [{ action: 'add', section: 'Instructions', content: '规则二', reason: '测试' }]
    };

    mergeMemory(current, extracted);

    expect(current.sections.find((s) => s.category === 'Instructions')?.items).toHaveLength(1);
  });

  it('ignores items with unknown section', () => {
    const current = makeDoc({ Instructions: ['规则一'] });
    const extracted: ExtractedMemory = {
      items: [{ action: 'add', section: 'Unknown' as never, content: '内容', reason: '测试' }]
    };

    const result = mergeMemory(current, extracted);

    expect(result.sections.find((s) => s.category === 'Instructions')?.items).toHaveLength(1);
  });

  it('handles empty extraction result', () => {
    const current = makeDoc({ Instructions: ['规则一'] });
    const extracted: ExtractedMemory = { items: [] };

    const result = mergeMemory(current, extracted);

    expect(result.sections.find((s) => s.category === 'Instructions')?.items).toHaveLength(1);
  });

  it('handles multiple operations in one extraction', () => {
    const current = makeDoc({
      Instructions: ['规则一', '规则二'],
      Preferences: ['偏好一']
    });
    const extracted: ExtractedMemory = {
      items: [
        { action: 'remove', section: 'Instructions', content: '规则一', reason: '删除' },
        { action: 'update', section: 'Preferences', content: '偏好一更新', reason: '更新' },
        { action: 'add', section: 'Facts', content: '新事实', reason: '新增' }
      ]
    };

    const result = mergeMemory(current, extracted);

    expect(result.sections.find((s) => s.category === 'Instructions')?.items).toHaveLength(1);
    expect(result.sections.find((s) => s.category === 'Preferences')?.items[0].content).toBe('偏好一更新');
    expect(result.sections.find((s) => s.category === 'Facts')?.items).toHaveLength(1);
  });
});
