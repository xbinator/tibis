/* @vitest-environment jsdom */
/**
 * @file useRichEditorLoad.test.ts
 * @description 验证 useRichEditorLoad 状态机的状态转移、取消、事务 meta 等行为。
 */
import { nextTick } from 'vue';
import { Editor } from '@tiptap/core';
import { describe, expect, test, afterEach } from 'vitest';
import { useRichEditorLoad } from '@/components/BEditor/hooks/useRichEditorLoad';
import type { RichLoadCompletePayload } from '@/components/BEditor/adapters/types';
import { createRichMarkdownSchemaExtensions, createRichEditorRuntimeOnlyExtensions } from '@/components/BEditor/hooks/useExtensions';
import { createSourceLineTracker } from '@/components/BEditor/adapters/sourceLineMapping';

/**
 * 空占位文档 JSON
 */
const EMPTY_PARAGRAPH_JSON = {
  type: 'doc' as const,
  content: [{ type: 'paragraph' as const }],
};

/**
 * 创建测试用 editor（空占位初始化）
 */
function createTestEditor(): Editor {
  const tracker = createSourceLineTracker();
  const schemaResult = createRichMarkdownSchemaExtensions('test-load', tracker);
  const runtimeExts = createRichEditorRuntimeOnlyExtensions('test-load');
  return new Editor({
    extensions: [...schemaResult.extensions, ...runtimeExts],
    content: EMPTY_PARAGRAPH_JSON,
    editable: false,
  });
}

describe('useRichEditorLoad', () => {
  let editor: Editor | null = null;
  let onLoadCompletePayloads: RichLoadCompletePayload[] = [];
  let onLoadFailedErrors: string[] = [];

  function setup() {
    editor = createTestEditor();
    onLoadCompletePayloads = [];
    onLoadFailedErrors = [];

    return useRichEditorLoad({
      getEditor: () => (editor && !editor.isDestroyed ? editor : undefined),
      getEditorInstanceId: () => 'test-load',
      onLoadComplete: (payload) => { onLoadCompletePayloads.push(payload); },
      onLoadFailed: (error) => { onLoadFailedErrors.push(error); },
    });
  }

  afterEach(() => {
    if (editor && !editor.isDestroyed) {
      editor.destroy();
      editor = null;
    }
  });

  describe('state machine basics', () => {
    test('initial state is idle', () => {
      const { loadState } = setup();
      expect(loadState.value.phase).toBe('idle');
      expect(loadState.value.progress).toBe(0);
    });

    test('startLoad transitions idle -> loading', async () => {
      const { loadState, startLoad } = setup();
      const promise = startLoad('# Hello\n\nWorld');
      // startLoad 内部 setTimeout(0) yield，此时状态应为 loading
      expect(loadState.value.phase).toBe('loading');
      await promise;
    });

    test('startLoad completes with ready state', async () => {
      const { loadState, startLoad } = setup();
      await startLoad('# Hello\n\nWorld');
      await nextTick();
      expect(loadState.value.phase).toBe('ready');
      expect(loadState.value.progress).toBe(1);
    });

    test('editor content is set after successful load', async () => {
      const { startLoad } = setup();
      await startLoad('# 标题\n\n段落内容');
      await nextTick();
      expect(editor!.state.doc.textContent).toContain('标题');
      expect(editor!.state.doc.textContent).toContain('段落内容');
    });
  });

  describe('cancelLoad', () => {
    test('cancelLoad during loading transitions to idle', async () => {
      const { loadState, startLoad, cancelLoad } = setup();
      const loadPromise = startLoad('# Hello\n\nWorld');
      cancelLoad('switch-source');
      await loadPromise;
      expect(loadState.value.phase).toBe('idle');
    });

    test('cancelled load does not call onLoadComplete', async () => {
      const { startLoad, cancelLoad } = setup();
      const loadPromise = startLoad('# Hello\n\nWorld');
      cancelLoad('switch-source');
      await loadPromise;
      expect(onLoadCompletePayloads).toHaveLength(0);
    });

    test('cancelled load results in empty editor placeholder', async () => {
      const { startLoad, cancelLoad } = setup();
      const loadPromise = startLoad('# Hello\n\nWorld');
      cancelLoad('switch-source');
      await loadPromise;
      expect(editor!.state.doc.textContent.trim()).toBe('');
    });
  });

  describe('isLoadTransaction', () => {
    test('identifies loading transaction meta', () => {
      const { isLoadTransaction } = setup();
      const tr = editor!.state.tr.setMeta('bEditorRichLoad', true);
      expect(isLoadTransaction(tr)).toBe(true);
    });

    test('returns false for normal transactions', () => {
      const { isLoadTransaction } = setup();
      const tr = editor!.state.tr.insertText('hello');
      expect(isLoadTransaction(tr)).toBe(false);
    });
  });

  describe('isReload tracking', () => {
    test('first load has isReload=false', async () => {
      const { loadState, startLoad } = setup();
      await startLoad('# First');
      expect(loadState.value.isReload).toBe(false);
    });

    test('second load with isReload:true has isReload=true', async () => {
      const { loadState, startLoad } = setup();
      await startLoad('# First');
      await nextTick();
      await startLoad('# Second', { isReload: true });
      expect(loadState.value.isReload).toBe(true);
    });
  });

  describe('getLoadSource', () => {
    test('returns null initially', () => {
      const { getLoadSource } = setup();
      expect(getLoadSource()).toBeNull();
    });

    test('returns source markdown during loading', async () => {
      const { getLoadSource, startLoad } = setup();
      await startLoad('# Test');
      expect(getLoadSource()).toBe('# Test');
    });
  });
});
