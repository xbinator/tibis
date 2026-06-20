/**
 * @file reference.test.ts
 * @description 文件引用 token 解析测试。
 */
import { describe, expect, it } from 'vitest';
import { MESSAGE_REF_PATTERN } from '@/components/BChat/utils/fileReferenceContext';
import { findFileReferenceTokens, parseFileReferenceToken } from '@/utils/file/reference';

describe('parseFileReferenceToken', (): void => {
  it('parses encoded bracket file paths with spaces', (): void => {
    const parsed = parseFileReferenceToken('#[](%2Fworkspace%2FMy%20Notes%2Fnote.md)');

    expect(parsed).toEqual(
      expect.objectContaining({
        rawPath: '/workspace/My Notes/note.md',
        filePath: '/workspace/My Notes/note.md',
        fileName: 'note.md',
        startLine: 0,
        endLine: 0
      })
    );
  });

  it('matches encoded bracket file references in message text', (): void => {
    const content = '引用 {{#[](%2Fworkspace%2FMy%20Notes%2Fnote.md)}} 继续';
    const matches = [...content.matchAll(MESSAGE_REF_PATTERN)];

    expect(matches).toHaveLength(1);
    expect(matches[0]?.[1]).toBe('[](%2Fworkspace%2FMy%20Notes%2Fnote.md)');
  });

  it('parses source line ranges without render line fields', (): void => {
    const parsed = parseFileReferenceToken('#[](%2Fworkspace%2Fnote.md) 3-5');

    expect(parsed).toEqual(
      expect.objectContaining({
        startLine: 3,
        endLine: 5
      })
    );
    expect(parsed).not.toHaveProperty('renderStartLine');
    expect(parsed).not.toHaveProperty('renderEndLine');
  });

  it('ignores legacy render line ranges when parsing file references', (): void => {
    const parsed = parseFileReferenceToken('#[](%2Fworkspace%2Fnote.md) 3-5|8-10');

    expect(parsed).toEqual(
      expect.objectContaining({
        startLine: 3,
        endLine: 5
      })
    );
    expect(parsed).not.toHaveProperty('renderStartLine');
    expect(parsed).not.toHaveProperty('renderEndLine');
  });
});

describe('findFileReferenceTokens', (): void => {
  it('returns decoded file references with source offsets', (): void => {
    const content = `fix {{#[](${encodeURIComponent('src/foo.ts')}) 10-20}} please`;
    const tokens = findFileReferenceTokens(content);

    expect(tokens).toEqual([
      {
        token: `{{#[](${encodeURIComponent('src/foo.ts')}) 10-20}}`,
        start: 4,
        end: content.length - 7,
        reference: expect.objectContaining({
          rawPath: 'src/foo.ts',
          startLine: 10,
          endLine: 20,
          fileName: 'foo.ts'
        })
      }
    ]);
  });
});
