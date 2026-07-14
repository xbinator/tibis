/**
 * @file posix.test.ts
 * @description POSIX 路径工具集合测试，覆盖典型输入。
 */
import { describe, expect, it } from 'vitest';
import { posix } from '@/utils/file/posix';

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
