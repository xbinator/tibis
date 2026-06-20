/**
 * @file file-part-parser.test.ts
 * @description BChat 输入文件 part 解析测试。
 */
import type { ChatMessageFilePartInput } from 'types/chat';
import { describe, expect, it } from 'vitest';
import { buildUserInputParts } from '@/components/BChat/utils/filePartParser';
import { encodeFileReferencePath } from '@/utils/file/reference';

describe('buildUserInputParts', (): void => {
  it('splits text and file references in source order', (): void => {
    const tokenPath = encodeFileReferencePath('src/foo.ts');
    const parts = buildUserInputParts(`fix {{#${tokenPath} 10-20}} please`, '/workspace');

    expect(parts[0]).toEqual({ type: 'text', text: 'fix ' });
    expect(parts[1]).toMatchObject({
      type: 'file',
      filename: 'foo.ts',
      mime: 'text/plain',
      path: 'src/foo.ts',
      url: 'file:///workspace/src/foo.ts?start=10&end=20',
      sourceText: { start: 4, value: `{{#${tokenPath} 10-20}}` }
    });
    expect(parts[2]).toEqual({ type: 'text', text: ' please' });
  });

  it('keeps unsaved paths as unsaved URL inputs', (): void => {
    const path = 'unsaved://file-1/Draft.md';
    const tokenPath = encodeFileReferencePath(path);
    const parts = buildUserInputParts(`read {{#${tokenPath}}}`, '/workspace');
    const filePart = parts[1] as ChatMessageFilePartInput;

    expect(filePart.type).toBe('file');
    expect(filePart.path).toBe(path);
    expect(filePart.url).toBe('unsaved://file-1/Draft.md');
  });
});
