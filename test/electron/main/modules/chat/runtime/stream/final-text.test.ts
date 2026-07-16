/**
 * @file final-text.test.ts
 * @description 强制最终回答内部工具协议泄漏防护测试。
 */
import { describe, expect, it } from 'vitest';
import { sanitizeFinalText } from '../../../../../../../electron/main/modules/chat/runtime/stream/final-text.mjs';

describe('final response text guard', (): void => {
  it('keeps an ordinary final answer unchanged', (): void => {
    expect(sanitizeFinalText('已经根据现有结果完成总结。')).toBe('已经根据现有结果完成总结。');
  });

  it('removes raw tool protocol while preserving the visible prefix', (): void => {
    const result = sanitizeFinalText('我再生成一张图。<tool_calls:abc><tool_call:abc>run_shell_command');

    expect(result).toContain('我再生成一张图。');
    expect(result).toContain('工具循环因重复调用已停止');
    expect(result).not.toContain('<tool_calls:abc>');
    expect(result).not.toContain('run_shell_command');
  });
});
