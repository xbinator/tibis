/**
 * @file model.test.ts
 * @description 验证系统快捷入口最近文件模型对历史坏数据的兼容行为。
 */
import { describe, expect, it } from 'vitest';
import { buildRecentFileShortcuts, type RecentFileShortcutInput } from '../../../../../electron/main/modules/ui/model.mts';

/**
 * 将历史坏数据模拟为主进程 IPC 输入。
 * @param value - 原始输入对象
 * @returns 最近文件快捷入口输入
 */
function createMalformedShortcutInput(value: unknown): RecentFileShortcutInput {
  return value as RecentFileShortcutInput;
}

describe('buildRecentFileShortcuts', () => {
  it('falls back to path basename when name and ext are missing', (): void => {
    const shortcuts = buildRecentFileShortcuts(
      [
        createMalformedShortcutInput({
          id: 'legacy-file',
          path: '/Users/demo/Documents/Legacy.md'
        })
      ],
      8
    );

    expect(shortcuts).toEqual([
      {
        id: 'legacy-file',
        title: 'Legacy.md',
        subtitle: '/Users/demo/Documents/Legacy.md',
        action: 'file:openRecent:legacy-file'
      }
    ]);
  });
});
