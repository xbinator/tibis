/**
 * @file front-matter.test.ts
 * @description BEditor Front Matter 默认数据测试。
 */
import { describe, expect, it } from 'vitest';
import { createDefaultFrontMatterData } from '@/components/BEditor/hooks/useFrontMatter';

describe('createDefaultFrontMatterData', (): void => {
  it('uses the current file name as the default title', (): void => {
    expect(createDefaultFrontMatterData('Meeting Notes.md')).toEqual({ title: 'Meeting Notes' });
  });

  it('falls back to Untitled when the file name is empty', (): void => {
    expect(createDefaultFrontMatterData('')).toEqual({ title: 'Untitled' });
  });
});
