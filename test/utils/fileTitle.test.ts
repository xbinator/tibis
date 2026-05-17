/**
 * @file fileTitle.test.ts
 * @description 验证统一文件标题工具的展示规则。
 */

import { describe, expect, it } from 'vitest';
import { resolveFileTitle } from '@/utils/file';

describe('resolveFileTitle', () => {
  it('combines file name and extension when both are present', () => {
    expect(resolveFileTitle({ name: 'note', ext: 'md' })).toBe('note.md');
  });

  it('returns the file name when extension is empty', () => {
    expect(resolveFileTitle({ name: 'README', ext: '' })).toBe('README');
  });

  it('falls back to an untitled label when only extension is present', () => {
    expect(resolveFileTitle({ name: '', ext: 'txt' })).toBe('Untitled.txt');
  });

  it('falls back to Untitled when both name and extension are empty', () => {
    expect(resolveFileTitle({ name: '', ext: '' })).toBe('Untitled');
  });
});
