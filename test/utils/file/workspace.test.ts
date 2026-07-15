/**
 * @file workspace.test.ts
 * @description 工作区根边界解析与判断测试。
 */
import { describe, expect, it } from 'vitest';
import { workspace } from '@/utils/file/workspace';

describe('workspace.isAbsoluteFilePath', (): void => {
  it('detects Windows drive, POSIX and UNC prefixes', (): void => {
    expect(workspace.isAbsoluteFilePath('C:\\Users\\test')).toBe(true);
    expect(workspace.isAbsoluteFilePath('/home/test')).toBe(true);
    expect(workspace.isAbsoluteFilePath('//server/share')).toBe(true);
    expect(workspace.isAbsoluteFilePath('relative/path')).toBe(false);
  });
});

describe('workspace.resolveWithin', (): void => {
  it('resolves a relative path against a Windows drive root, preserving its separator', (): void => {
    expect(workspace.resolveWithin('assets/icon.png', 'C:\\workspace')).toBe('C:\\workspace\\assets\\icon.png');
  });

  it('resolves a relative path against a POSIX root with forward slashes', (): void => {
    expect(workspace.resolveWithin('assets/icon.png', '/workspace')).toBe('/workspace/assets/icon.png');
  });

  it('returns null when traversing above the root', (): void => {
    expect(workspace.resolveWithin('../outside.txt', 'C:\\workspace')).toBeNull();
  });

  it('returns null when the root is not absolute', (): void => {
    expect(workspace.resolveWithin('assets/icon.png', 'workspace')).toBeNull();
  });
});

describe('workspace.contains', (): void => {
  it('returns true when the target lives below the root', (): void => {
    expect(workspace.contains('C:\\workspace', 'C:/workspace/assets/icon.png')).toBe(true);
  });

  it('returns false when the target escapes the root', (): void => {
    expect(workspace.contains('C:\\workspace', 'C:/other/assets/icon.png')).toBe(false);
  });

  it('returns false when prefixes differ', (): void => {
    expect(workspace.contains('C:\\workspace', 'D:/workspace/assets/icon.png')).toBe(false);
  });
});
