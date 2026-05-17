/**
 * @file unsavedPath.test.ts
 * @description 未保存文档虚拟路径工具测试。
 */
import { describe, expect, it } from 'vitest';
import { buildUnsavedPath, isUnsavedPath, parseUnsavedPath } from '@/utils/file';

describe('unsavedPath utilities', () => {
  it('builds an unsaved path with the default extension', () => {
    expect(buildUnsavedPath({ id: 'doc-1', fileName: 'My Note' })).toBe('unsaved://doc-1/My Note.md');
  });

  it('reuses the existing file extension when one is already present', () => {
    expect(buildUnsavedPath({ id: 'doc-1', fileName: 'draft.ts', ext: 'md' })).toBe('unsaved://doc-1/draft.ts');
  });

  it('parses an unsaved path into file id and file name', () => {
    expect(parseUnsavedPath('unsaved://draft123/draft.md')).toEqual({
      fileId: 'draft123',
      fileName: 'draft.md'
    });
  });

  it('detects unsaved paths and ignores regular paths', () => {
    expect(isUnsavedPath('unsaved://draft123/draft.md')).toBe(true);
    expect(isUnsavedPath('/tmp/draft.md')).toBe(false);
  });
});
