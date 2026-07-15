/**
 * @file posix.test.ts
 * @description POSIX 路径工具集合测试，覆盖典型输入。
 */
import { describe, expect, it } from 'vitest';
import { posix } from '@/utils/file/posix';

describe('posix.slashify', (): void => {
  it('converts backslashes to forward slashes', (): void => {
    expect(posix.slashify('C:\\Users\\test')).toBe('C:/Users/test');
    expect(posix.slashify('a\\b\\c')).toBe('a/b/c');
  });

  it('keeps forward slashes unchanged', (): void => {
    expect(posix.slashify('a/b/c')).toBe('a/b/c');
  });
});

describe('posix.join', (): void => {
  it('preserves a Windows UNC prefix', (): void => {
    expect(posix.join('\\\\server\\share\\user', '.agents', 'skills')).toBe('//server/share/user/.agents/skills');
  });

  it('normalizes Windows drive and POSIX paths without changing their roots', (): void => {
    expect(posix.join('C:\\Users\\test', '.agents', 'skills')).toBe('C:/Users/test/.agents/skills');
    expect(posix.join('/Users/test', '.agents', 'skills')).toBe('/Users/test/.agents/skills');
  });
});

describe('posix.basename', (): void => {
  it('returns the trailing segment of a POSIX path', (): void => {
    expect(posix.basename('/home/.tibis/widgets/weather/widget.json')).toBe('widget.json');
  });

  it('strips trailing slashes before picking the last segment', (): void => {
    expect(posix.basename('/home/.tibis/widgets/weather/')).toBe('weather');
  });
});

describe('posix.dirname', (): void => {
  it('returns the parent directory for an absolute POSIX path', (): void => {
    expect(posix.dirname('/home/.tibis/widgets/weather/widget.json')).toBe('/home/.tibis/widgets/weather');
  });

  it('normalizes backslash separators to forward slashes', (): void => {
    expect(posix.dirname('C:\\Users\\test\\.tibis\\widgets\\weather\\widget.json')).toBe('C:/Users/test/.tibis/widgets/weather');
  });

  it('returns "/" for a top-level POSIX path', (): void => {
    expect(posix.dirname('/widget.json')).toBe('/');
  });

  it('returns "." for a bare file name', (): void => {
    expect(posix.dirname('widget.json')).toBe('.');
  });

  it('returns "." for an empty string', (): void => {
    expect(posix.dirname('')).toBe('.');
  });
});
