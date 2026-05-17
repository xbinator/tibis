/**
 * @file drivers-markdown.test.ts
 * @description Markdown driver 测试。
 */

import { describe, expect, it } from 'vitest';
import { markdownDriver } from '@/views/editor/drivers/markdown';

describe('markdownDriver', () => {
  it('matches markdown files and exposes markdown toolbar', () => {
    expect(
      markdownDriver.match({
        id: '1',
        name: 'doc',
        ext: 'md',
        content: '# demo',
        path: null
      })
    ).toBe(true);
    expect(
      markdownDriver.match({
        id: '2',
        name: 'data',
        ext: 'json',
        content: '{}',
        path: null
      })
    ).toBe(false);
    expect(markdownDriver.toolbar).toEqual({
      showViewModeToggle: true,
      showStructuredViewToggle: false,
      showSearch: true
    });
  });

  it('creates plain editor context with document and editor accessors', () => {
    const context = markdownDriver.createToolContext({
      fileState: {
        id: '1',
        name: 'doc',
        ext: 'md',
        content: '# demo',
        path: null
      },
      isActive: true,
      editorInstance: {
        getSelection: () => null,
        insertAtCursor: async () => undefined,
        replaceSelection: async () => undefined,
        replaceDocument: async () => undefined
      }
    });

    expect(context.document.title).toBe('doc.md');
    expect(context.editor.getSelection()).toBeNull();
  });
});
