/**
 * @file types.test.ts
 * @description BJsonGraph 类型定义测试。
 */

import { describe, expect, it } from 'vitest';
import type { EditorController } from '@/components/BMarkdown/adapters/types';
import type { BJsonGraphPublicInstance, JsonGraphState, JsonNodeInfo } from '@/components/BJsonGraph/types';

describe('BJsonGraph types', () => {
  it('JsonNodeInfo has required fields', () => {
    const node: JsonNodeInfo = {
      path: '/author/name',
      type: 'string',
      startOffset: 10,
      endOffset: 30,
      valueStartOffset: 20,
      valueEndOffset: 28,
      children: []
    };

    expect(node.path).toBe('/author/name');
    expect(node.type).toBe('string');
  });

  it('JsonNodeInfo root path is empty string', () => {
    const root: JsonNodeInfo = {
      path: '',
      type: 'object',
      startOffset: 0,
      endOffset: 100,
      valueStartOffset: 0,
      valueEndOffset: 100,
      children: ['/author', '/title']
    };

    expect(root.path).toBe('');
  });

  it('JsonNodeInfo optional key offsets', () => {
    const node: JsonNodeInfo = {
      path: '/author/name',
      type: 'string',
      startOffset: 10,
      endOffset: 30,
      keyStartOffset: 10,
      keyEndOffset: 16,
      valueStartOffset: 18,
      valueEndOffset: 28,
      key: 'name',
      value: 'Tibis',
      children: []
    };

    expect(node.keyStartOffset).toBe(10);
    expect(node.keyEndOffset).toBe(16);
  });

  it('JsonGraphState tracks split collapsed sets', () => {
    const state: JsonGraphState = {
      autoCollapsedPaths: new Set(['/author']),
      userCollapsedPaths: new Set(['/meta']),
      userExpandedPaths: new Set(['/author/name'])
    };

    expect(state.autoCollapsedPaths.has('/author')).toBe(true);
    expect(state.userCollapsedPaths.has('/meta')).toBe(true);
    expect(state.userExpandedPaths.has('/author/name')).toBe(true);
  });

  it('BJsonGraphPublicInstance is assignable to EditorController', () => {
    const editorController: EditorController = {} as BJsonGraphPublicInstance;

    expect(editorController).toBeDefined();
  });
});
