/**
 * @file inline-completion-context.test.ts
 * @description BEditor inline completion prompt/context utility tests.
 */
import { describe, expect, it } from 'vitest';
import {
  buildInlineCompletionPrompt,
  normalizeInlineCompletionText,
  shouldDisplayInlineCompletion,
  truncateInlineCompletionText
} from '@/components/BEditor/utils/inlineCompletionContext';

describe('inline completion context utilities', (): void => {
  it('builds a structured prompt around the cursor', (): void => {
    const prompt = buildInlineCompletionPrompt({
      filename: 'note.md',
      fileType: '.md',
      writingMode: 'rich',
      headingPath: ['Plan'],
      prefix: '# Plan\nThe next step',
      suffix: '\n\n## Later'
    });

    expect(prompt).toContain('## Document metadata');
    expect(prompt).toContain('- Filename: note.md');
    expect(prompt).toContain('Plan');
    expect(prompt).toContain('# Plan\nThe next step<cursor>');
    expect(prompt).toContain('## Text after cursor');
    expect(prompt).toContain('## Later');
  });

  it('normalizes model output before rendering ghost text', (): void => {
    expect(normalizeInlineCompletionText('```markdown\ncontinues here\n```')).toBe('continues here');
    expect(normalizeInlineCompletionText('<cursor>continues')).toBe('continues');
    expect(normalizeInlineCompletionText('---\ntitle: bad\n---\ncontinues')).toBe('continues');
  });

  it('limits long markdown generations to a short inline segment', (): void => {
    const longMarkdown = [
      '| 类型 | 来源 | 可读取 |',
      '|---|---|---|',
      '| PRD（必填） | 飞书文档 | 是 |',
      '',
      '### 1.2 需求要点',
      '',
      '把笔记本质检报告首屏的固定 3×3 九宫格升级为动态容器。'
    ].join('\n');

    expect(truncateInlineCompletionText(longMarkdown)).toBe('| 类型 | 来源 | 可读取 |');
  });

  it('rejects too-short and duplicate completions', (): void => {
    expect(shouldDisplayInlineCompletion(' a ', 'anything')).toBe(false);
    expect(shouldDisplayInlineCompletion('continued text', 'continued text already exists')).toBe(false);
    expect(shouldDisplayInlineCompletion('new thought', 'different suffix')).toBe(true);
  });
});
