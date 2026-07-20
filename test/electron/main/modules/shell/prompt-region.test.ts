/**
 * @file prompt-region.test.ts
 * @description Prompt region 提取、规范化和稳定 screenHash 测试。
 */
import type { ShellScreenSnapshot } from '../../../../../electron/main/modules/shell/interaction/types.mts';
import { describe, expect, it } from 'vitest';
import { createPromptRegion } from '../../../../../electron/main/modules/shell/interaction/prompt-region.mts';

/**
 * 创建测试 Screen Snapshot。
 * @param content - 可见终端内容
 * @returns Screen Snapshot
 */
function createSnapshot(content: string): ShellScreenSnapshot {
  return {
    sequence: 1,
    content,
    cursor: { row: 2, column: 4, visible: true },
    activity: { spinner: false, progress: false, compiling: false, streamingLogs: false },
    createdAt: 100
  };
}

describe('PromptRegionStabilizer', (): void => {
  it('normalizes CRLF, NFC, NBSP, and trailing whitespace into one hash', (): void => {
    const first = createPromptRegion(createSnapshot('Cafe\u0301\r\n\u00a0Continue? [Y/n]   \r\n'));
    const second = createPromptRegion(createSnapshot('Café\n Continue? [Y/n]\n'));

    expect(first?.screenHash).toBe(second?.screenHash);
  });

  it('hashes only the current prompt block and ignores earlier logs', (): void => {
    const first = createPromptRegion(createSnapshot('Downloaded 10 files\nChoose one:\n❯ Alpha\n  Beta'));
    const second = createPromptRegion(createSnapshot('Compiled 99 files\nChoose one:\n❯ Alpha\n  Beta'));

    expect(first?.screenHash).toBe(second?.screenHash);
    expect(first?.content).toBe('Choose one:\n❯ Alpha\n  Beta');
  });

  it('returns null for a screen without a prompt-like bottom region', (): void => {
    expect(createPromptRegion(createSnapshot('building project\nfinished module'))).toBeNull();
  });

  it('rejects a wizard without two options and one selected marker', (): void => {
    expect(createPromptRegion(createSnapshot('Choose package:\n❯ Alpha'))).toBeNull();
    expect(createPromptRegion(createSnapshot('Choose package:\n❯ Alpha\n❯ Beta'))).toBeNull();
  });

  it('keeps an input cursor with its header so unsupported input can be detected', (): void => {
    const region = createPromptRegion(createSnapshot('Enter API token:\n>'));

    expect(region?.content).toBe('Enter API token:\n>');
  });
});
