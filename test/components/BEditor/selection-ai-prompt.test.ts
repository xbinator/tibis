/**
 * @file selection-ai-prompt.test.ts
 * @description BEditor 选区 AI 固定提示词测试。
 */
import { describe, expect, it } from 'vitest';
import { buildSelectionAIPrompt } from '@/components/BEditor/utils/selectionAIPrompt';

describe('buildSelectionAIPrompt', (): void => {
  it('builds the internal polish prompt from selected text and user instruction', (): void => {
    const prompt = buildSelectionAIPrompt('## 旧标题', '改得更自然');

    expect(prompt).toContain('你是一个 Markdown 内容编辑助手');
    expect(prompt).toContain('## 旧标题');
    expect(prompt).toContain('改得更自然');
    expect(prompt).not.toContain('{{SELECTED_TEXT}}');
    expect(prompt).not.toContain('{{USER_INPUT}}');
  });
});
