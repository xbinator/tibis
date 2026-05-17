/**
 * @file drivers.test.ts
 * @description EditorDriver 注册表测试。
 */

import { describe, expect, it } from 'vitest';
import { resolveEditorDriver } from '@/views/editor/drivers';
import type { EditorDriver } from '@/views/editor/drivers/types';

describe('EditorDriver registry', () => {
  it('resolveEditorDriver falls back to markdown driver for json files', () => {
    expect(
      resolveEditorDriver({
        id: '1',
        name: 'demo',
        ext: 'json',
        content: '{}',
        path: null
      }).id
    ).toBe('markdown');
  });

  it('resolveEditorDriver returns markdown driver for markdown files', () => {
    expect(
      resolveEditorDriver({
        id: '2',
        name: 'demo',
        ext: 'md',
        content: '# demo',
        path: null
      }).id
    ).toBe('markdown');
  });

  it('EditorDriver interface shape is consumable', () => {
    const driver: EditorDriver = resolveEditorDriver({
      id: '3',
      name: 'demo',
      ext: '',
      content: '',
      path: null
    });

    expect(driver.toolbar.showSearch).toBe(true);
    expect(driver.component).toBeTruthy();
  });
});
