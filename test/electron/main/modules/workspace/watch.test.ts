/**
 * @file watch.test.ts
 * @description Workspace 目录监听匹配规则测试。
 */
import { describe, expect, it } from 'vitest';
import { isDirectoryWatchMatch } from '../../../../../electron/main/modules/workspace/watch.mts';

describe('isDirectoryWatchMatch', (): void => {
  it('matches regular files when watching a whole directory', (): void => {
    const rootPath = '/Users/test/.tibis/widgets';

    expect(isDirectoryWatchMatch('/Users/test/.tibis/widgets/weather/widget.json', undefined, rootPath)).toBe(true);
    expect(isDirectoryWatchMatch('/Users/test/.tibis/widgets/weather/preview.png', undefined, rootPath)).toBe(true);
    expect(isDirectoryWatchMatch('/Users/test/.tibis/widgets/.draft/widget.json', undefined, rootPath)).toBe(false);
  });

  it('matches regular Skill files', (): void => {
    expect(isDirectoryWatchMatch('/Users/test/.agents/skills/demo/SKILL.md', '**/SKILL.md')).toBe(true);
    expect(isDirectoryWatchMatch('C:\\Users\\test\\.agents\\skills\\demo\\SKILL.md', '**/SKILL.md')).toBe(true);
  });

  it('ignores Skill files inside temporary installer directories', (): void => {
    expect(isDirectoryWatchMatch('/Users/test/.agents/skills/.tmp-abcd1234/SKILL.md', '**/SKILL.md')).toBe(false);
    expect(isDirectoryWatchMatch('C:\\Users\\test\\.agents\\skills\\.bak-abcd1234\\SKILL.md', '**/SKILL.md')).toBe(false);
  });

  it('ignores hidden Skill directories under the watched root', (): void => {
    const rootPath = '/Users/test/.agents/skills';

    expect(isDirectoryWatchMatch('/Users/test/.agents/skills/demo/SKILL.md', '**/SKILL.md', rootPath)).toBe(true);
    expect(isDirectoryWatchMatch('/Users/test/.agents/skills/.draft/SKILL.md', '**/SKILL.md', rootPath)).toBe(false);
  });
});
