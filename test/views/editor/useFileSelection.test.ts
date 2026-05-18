/**
 * @file useFileSelection.test.ts
 * @description useFileSelection 对一次性文件选区意图的消费测试。
 * @vitest-environment jsdom
 */

import { nextTick, ref } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { EditorPublicInstance } from '@/components/BEditor/types';
import { useFileSelectionIntentStore } from '@/stores/editor/fileSelectionIntent';
import { useFileSelection } from '@/views/editor/hooks/useFileSelection';
import type { EditorFile } from '@/views/editor/types';

/**
 * 创建最小 editor file 状态。
 * @param id - 文件 ID
 * @returns editor 文件状态
 */
function createEditorFile(id: string): EditorFile {
  return {
    id,
    name: 'demo',
    content: '',
    ext: 'md',
    path: null
  };
}

describe('useFileSelection', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  test('consumes matching intent after editor becomes ready', async () => {
    const store = useFileSelectionIntentStore();
    const selectLineRange = vi.fn(async () => true);
    const fileState = ref<EditorFile>(createEditorFile('file-1'));
    const isEditorReady = ref(true);
    const editorInstance = ref<EditorPublicInstance | null>({
      undo: vi.fn(),
      redo: vi.fn(),
      canUndo: vi.fn(() => false),
      canRedo: vi.fn(() => false),
      focusEditor: vi.fn(),
      getSelection: vi.fn(() => null),
      insertAtCursor: vi.fn(async () => undefined),
      replaceSelection: vi.fn(async () => undefined),
      replaceDocument: vi.fn(async () => undefined),
      selectLineRange,
      setSearchTerm: vi.fn(),
      findNext: vi.fn(),
      findPrevious: vi.fn(),
      clearSearch: vi.fn(),
      getSearchState: vi.fn(() => ({ currentIndex: 0, matchCount: 0, term: '' }))
    });

    useFileSelection({
      fileState,
      isEditorReady,
      editorInstance
    });

    store.setIntent({
      intentId: 'intent-1',
      fileId: 'file-1',
      startLine: 4,
      endLine: 6
    });

    await nextTick();
    await nextTick();
    await Promise.resolve();

    expect(selectLineRange).toHaveBeenCalledWith(4, 6);
    expect(store.intent).toBeNull();
  });
});
