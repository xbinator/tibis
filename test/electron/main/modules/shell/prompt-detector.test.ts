/**
 * @file prompt-detector.test.ts
 * @description 保守 PromptDetector 决策矩阵与固定优先级测试。
 */
import type { ShellScreenActivity, ShellScreenSnapshot, StablePromptRegion } from '../../../../../electron/main/modules/shell/interaction/types.mts';
import { describe, expect, it } from 'vitest';
import { detectPrompt } from '../../../../../electron/main/modules/shell/interaction/prompt-detector.mts';

/**
 * 创建 detector 输入。
 * @param content - 提示区域文本
 * @param activity - 可选活动信号
 * @param selectedIndex - 可选默认选项索引
 * @returns detector 参数
 */
function createInput(content: string, activity: Partial<ShellScreenActivity>, selectedIndex?: number): [ShellScreenSnapshot, StablePromptRegion] {
  const cursor = { row: 2, column: 3, visible: true };
  return [
    {
      sequence: 1,
      content,
      cursor,
      selectedIndex,
      activity: { spinner: false, progress: false, compiling: false, streamingLogs: false, ...activity },
      createdAt: 100
    },
    { content, cursor, selectedIndex, screenHash: 'hash' }
  ];
}

describe('PromptDetector', (): void => {
  it.each(['Continue? [Y/n]', 'Continue (y/N):'])('recognizes explicit boolean default: %s', (content: string): void => {
    expect(detectPrompt(...createInput(content, {}))).toMatchObject({ type: 'auto_default', promptKind: 'boolean_default' });
  });

  it('recognizes a visible selected wizard default', (): void => {
    expect(detectPrompt(...createInput('Choose package:\n❯ Alpha\n  Beta', {}, 0))).toMatchObject({
      type: 'auto_default',
      promptKind: 'wizard_default'
    });
  });

  it.each(['Continue? [Y/N]', 'Continue? [y/n]', 'Continue? [YY/n]', 'Continue? [Y/nn]', 'Status: Y/n text'])(
    'rejects an ambiguous boolean prompt: %s',
    (content: string): void => {
      expect(detectPrompt(...createInput(content, {}))).toEqual({ type: 'unknown' });
    }
  );

  it.each(['> option', 'Choose package:\n❯ Alpha', 'Choose package:\n❯ Alpha\n❯ Beta'])(
    'rejects an incomplete or ambiguous wizard: %s',
    (content: string): void => {
      expect(detectPrompt(...createInput(content, {}, 0))).toEqual({ type: 'unknown' });
    }
  );

  it.each<['text' | 'path' | 'account' | 'secret', string]>([
    ['text', 'Enter a custom value:'],
    ['path', 'Select installation path:'],
    ['account', 'Enter account email:'],
    ['secret', 'Enter API token:']
  ])('rejects unsupported %s input', (reason, content): void => {
    expect(detectPrompt(...createInput(content, {}))).toEqual({ type: 'unsupported_input', reason });
  });

  it.each<Partial<ShellScreenActivity>>([{ spinner: true }, { progress: true }, { compiling: true }, { streamingLogs: true }])(
    'treats reverse activity signals as active output',
    (activity): void => {
      expect(detectPrompt(...createInput('Continue? [Y/n]', activity))).toEqual({ type: 'active_output' });
    }
  );

  it('keeps unsupported input above active output and auto default', (): void => {
    expect(detectPrompt(...createInput('Password [Y/n]:', { spinner: true }))).toEqual({ type: 'unsupported_input', reason: 'secret' });
  });

  it('returns unknown for ambiguous prompt-like content', (): void => {
    expect(detectPrompt(...createInput('Ready for the next step?', {}))).toEqual({ type: 'unknown' });
  });
});
