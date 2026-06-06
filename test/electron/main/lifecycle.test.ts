/**
 * @file lifecycle.test.ts
 * @description 验证 Electron 应用窗口生命周期与数据库连接关闭策略。
 */
import { describe, expect, it } from 'vitest';
import {
  createPendingOpenFileQueue,
  resolveOpenFilePathsFromArgv,
  shouldCloseDatabaseOnWindowAllClosed,
  shouldDeferShortcutActionUntilBootstrapReady
} from '../../../electron/main/lifecycle.mts';

describe('shouldCloseDatabaseOnWindowAllClosed', () => {
  it('keeps database open on macOS when all windows are closed', (): void => {
    expect(shouldCloseDatabaseOnWindowAllClosed('darwin')).toBe(false);
  });

  it('allows database close on platforms that quit after all windows are closed', (): void => {
    expect(shouldCloseDatabaseOnWindowAllClosed('win32')).toBe(true);
    expect(shouldCloseDatabaseOnWindowAllClosed('linux')).toBe(true);
  });
});

describe('shouldDeferShortcutActionUntilBootstrapReady', () => {
  it('defers external shortcut actions until main bootstrap is ready', (): void => {
    expect(shouldDeferShortcutActionUntilBootstrapReady(false)).toBe(true);
  });

  it('allows external shortcut actions after main bootstrap is ready', (): void => {
    expect(shouldDeferShortcutActionUntilBootstrapReady(true)).toBe(false);
  });
});

describe('resolveOpenFilePathsFromArgv', () => {
  it('extracts markdown file paths from command line arguments', (): void => {
    expect(resolveOpenFilePathsFromArgv(['/Applications/Tibis.app/Contents/MacOS/Tibis', '--action=file:new', '/tmp/a.md', '/tmp/b.txt'])).toEqual([
      '/tmp/a.md'
    ]);
  });

  it('supports Windows markdown file paths and file URLs', (): void => {
    expect(resolveOpenFilePathsFromArgv(['Tibis.exe', 'C:\\Users\\demo\\Note.MARKDOWN', 'file:///tmp/readme.md'])).toEqual([
      'C:\\Users\\demo\\Note.MARKDOWN',
      '/tmp/readme.md'
    ]);
  });
});

describe('createPendingOpenFileQueue', () => {
  it('keeps open-file paths until renderer consumes them', (): void => {
    const queue = createPendingOpenFileQueue();

    queue.enqueue('/tmp/a.md');
    queue.enqueue('/tmp/b.md');

    expect(queue.hasPending()).toBe(true);
    expect(queue.consume()).toEqual(['/tmp/a.md', '/tmp/b.md']);
    expect(queue.consume()).toEqual([]);
    expect(queue.hasPending()).toBe(false);
  });
});
