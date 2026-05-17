/**
 * @file drivers-editor.test.ts
 * @description 通用 editorDriver 测试。
 */

import { describe, expect, it } from 'vitest';
import { editorDriver } from '@/views/editor/drivers/editor';

describe('editorDriver', () => {
  it('matches json files and only exposes search toolbar', () => {
    expect(
      editorDriver.match({
        id: 'json-1',
        name: 'config',
        ext: 'json',
        content: '{}',
        path: null
      })
    ).toBe(true);

    expect(
      editorDriver.match({
        id: 'md-1',
        name: 'doc',
        ext: 'md',
        content: '# demo',
        path: null
      })
    ).toBe(false);

    expect(editorDriver.toolbar).toEqual({
      showViewModeToggle: false,
      showStructuredViewToggle: false,
      showSearch: true
    });
  });
});
