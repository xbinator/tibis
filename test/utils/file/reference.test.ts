/**
 * @file reference.test.ts
 * @description 文件引用 token 解析测试。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FILE_REFERENCE_MESSAGE_TOKEN_PATTERN, extractFileReferenceLines, findFileReferenceTokens, parseFileReferenceToken } from '@/utils/file/reference';

const recentRecordsMock = vi.hoisted<{ value: unknown[] }>(() => ({
  value: []
}));

vi.mock('@/shared/storage', () => ({
  recentFilesStorage: {
    getAllRecentFiles: vi.fn(async () => recentRecordsMock.value),
    getRecentFile: vi.fn(async (id: string) =>
      recentRecordsMock.value.find((record) => typeof record === 'object' && record !== null && 'id' in record && record.id === id)
    )
  }
}));

beforeEach((): void => {
  recentRecordsMock.value = [];
});

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

  it('parses unencoded file paths with spaces', (): void => {
    const parsed = parseFileReferenceToken('#/Users/zhangbin/Desktop/Markdown 语法全量渲染测试.md');

    expect(parsed).toEqual(
      expect.objectContaining({
        rawPath: '/Users/zhangbin/Desktop/Markdown 语法全量渲染测试.md',
        filePath: '/Users/zhangbin/Desktop/Markdown 语法全量渲染测试.md',
        fileName: 'Markdown 语法全量渲染测试.md',
        startLine: 0,
        endLine: 0
      })
    );
  });

  it('matches encoded bracket file references in message text', (): void => {
    const content = '引用 {{#[](%2Fworkspace%2FMy%20Notes%2Fnote.md)}} 继续';
    const matches = [...content.matchAll(FILE_REFERENCE_MESSAGE_TOKEN_PATTERN)];

    expect(matches).toHaveLength(1);
    expect(matches[0]?.[1]).toBe('#[](%2Fworkspace%2FMy%20Notes%2Fnote.md)');
  });

  it('matches unencoded file references with spaces in message text', (): void => {
    const content = '引用 {{#/Users/zhangbin/Desktop/Markdown 语法全量渲染测试.md}} 继续';
    const matches = [...content.matchAll(FILE_REFERENCE_MESSAGE_TOKEN_PATTERN)];

    expect(matches).toHaveLength(1);
    expect(matches[0]?.[1]).toBe('#/Users/zhangbin/Desktop/Markdown 语法全量渲染测试.md');
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

  it('returns unencoded file references with spaces from message text', (): void => {
    const content = '读一下 {{#/Users/zhangbin/Desktop/Markdown 语法全量渲染测试.md}}';
    const tokens = findFileReferenceTokens(content);

    expect(tokens).toEqual([
      {
        token: '{{#/Users/zhangbin/Desktop/Markdown 语法全量渲染测试.md}}',
        start: 4,
        end: content.length,
        reference: expect.objectContaining({
          rawPath: '/Users/zhangbin/Desktop/Markdown 语法全量渲染测试.md',
          fileName: 'Markdown 语法全量渲染测试.md',
          startLine: 0,
          endLine: 0
        })
      }
    ]);
  });
});

describe('extractFileReferenceLines', (): void => {
  it('extracts full content for a matched saved file reference', async (): Promise<void> => {
    const token = findFileReferenceTokens('读 {{#/tmp/My Note.md}}')[0];
    if (!token) {
      throw new Error('Expected file reference token');
    }

    recentRecordsMock.value = [
      {
        type: 'file',
        id: 'file-1',
        path: '/tmp/My Note.md',
        content: 'line 1\nline 2',
        name: 'My Note',
        ext: 'md'
      }
    ];

    const reference = await extractFileReferenceLines(token);

    expect(reference).toEqual({
      token: '{{#/tmp/My Note.md}}',
      path: '/tmp/My Note.md',
      startLine: 0,
      endLine: 0,
      selectedContent: 'line 1\nline 2',
      fullContent: 'line 1\nline 2'
    });
  });
});
