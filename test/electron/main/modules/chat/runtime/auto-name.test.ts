/**
 * @file auto-name.test.ts
 * @description ChatRuntime 自动命名辅助函数测试。
 */
import { describe, expect, it } from 'vitest';
import { createAutoNamePrompt, normalizeAutoNameTitle } from '../../../../../../electron/main/modules/chat/runtime/model/auto-name.mjs';

describe('chat runtime auto-name helpers', () => {
  it('builds title prompt from user and assistant messages', (): void => {
    const prompt = createAutoNamePrompt({
      sessionId: 'session-1',
      userMessage: '帮我总结这篇文章',
      aiResponse: '这篇文章讲的是架构拆分。'
    });

    expect(prompt).toContain('用户: 帮我总结这篇文章');
    expect(prompt).toContain('AI: 这篇文章讲的是架构拆分。');
  });

  it('trims wrapping quotes from generated title', (): void => {
    expect(normalizeAutoNameTitle('“架构拆分”')).toBe('架构拆分');
    expect(normalizeAutoNameTitle('"Runtime Refactor"')).toBe('Runtime Refactor');
  });
});
