/**
 * @file path-utils.test.ts
 * @description 跨平台共享路径拼接与安全相对路径测试。
 */
import { describe, expect, it } from 'vitest';
import { joinFilePath, normalizeSafeRelativeFilePath } from '@/shared/workspace/pathUtils';

describe('joinFilePath', (): void => {
  it('preserves a Windows UNC prefix', (): void => {
    expect(joinFilePath('\\\\server\\share\\user', '.agents', 'skills')).toBe('//server/share/user/.agents/skills');
  });

  it('normalizes Windows drive and POSIX paths without changing their roots', (): void => {
    expect(joinFilePath('C:\\Users\\test', '.agents', 'skills')).toBe('C:/Users/test/.agents/skills');
    expect(joinFilePath('/Users/test', '.agents', 'skills')).toBe('/Users/test/.agents/skills');
  });
});

describe('normalizeSafeRelativeFilePath', (): void => {
  it('normalizes separators and rejects traversal or Windows reserved segments', (): void => {
    expect(normalizeSafeRelativeFilePath('assets\\icon.png')).toBe('assets/icon.png');
    expect(() => normalizeSafeRelativeFilePath('../outside.txt')).toThrow('路径不安全');
    expect(() => normalizeSafeRelativeFilePath('assets/CON.txt')).toThrow('路径不安全');
  });
});
