/**
 * @file selection.test.ts
 * @description BMonaco 选区时序测试。
 * @vitest-environment jsdom
 */
import { nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EditorState } from '@/components/BEditor/types';
import BMonaco from '@/components/BMonaco/index.vue';

/**
 * BMonaco 测试中访问的选区控制能力。
 */
interface BMonacoSelectionController {
  /** 按源码行号选中并滚动到对应范围。 */
  selectLineRange: (startLine: number, endLine: number) => boolean | Promise<boolean>;
}

const monacoMock = vi.hoisted(() => {
  const focus = vi.fn();
  const revealRangeInCenter = vi.fn();
  const setSelection = vi.fn();
  let resolveEditor: ((handle: unknown) => void) | null = null;

  /**
   * 创建受控的 Monaco 初始化 Promise。
   * @returns Monaco 编辑器句柄 Promise
   */
  function createEditorPromise(): Promise<unknown> {
    return new Promise<unknown>((resolve): void => {
      resolveEditor = resolve;
    });
  }

  /**
   * 创建测试用 Monaco 编辑器句柄。
   * @returns Monaco 编辑器句柄
   */
  function createEditorHandle(): unknown {
    const editor = {
      createDecorationsCollection: vi.fn(() => ({
        set: vi.fn(),
        clear: vi.fn()
      })),
      dispose: vi.fn(),
      focus,
      getScrollLeft: vi.fn(() => 0),
      getScrollTop: vi.fn(() => 0),
      getSelection: vi.fn(() => null),
      onDidScrollChange: vi.fn(() => ({ dispose: vi.fn() })),
      revealRangeInCenter,
      setScrollPosition: vi.fn(),
      setSelection,
      updateOptions: vi.fn()
    };

    const model = {
      dispose: vi.fn(),
      findMatches: vi.fn(() => []),
      getLineCount: vi.fn(() => 3),
      getLineMaxColumn: vi.fn((lineNumber: number): number => (lineNumber === 2 ? 12 : 6)),
      getOffsetAt: vi.fn(() => 0),
      getValueInRange: vi.fn(() => ''),
      onDidChangeContent: vi.fn(() => ({ dispose: vi.fn() }))
    };

    return {
      dispose: vi.fn(),
      focus,
      getEditor: vi.fn(() => editor),
      getModel: vi.fn(() => model),
      getValue: vi.fn(() => ['first', 'second line', 'third'].join('\n')),
      setValue: vi.fn(),
      updateOptions: vi.fn()
    };
  }

  /**
   * 结束受控的 Monaco 初始化流程。
   */
  function resolveCreateMonacoEditor(): void {
    if (!resolveEditor) {
      throw new Error('createMonacoEditor should be pending before resolving');
    }

    resolveEditor(createEditorHandle());
    resolveEditor = null;
  }

  return {
    createMonacoEditor: vi.fn(createEditorPromise),
    focus,
    resolveCreateMonacoEditor,
    revealRangeInCenter,
    setSelection
  };
});

vi.mock('@/components/BMonaco/utils/createMonaco', () => ({
  createMonacoEditor: monacoMock.createMonacoEditor,
  ensureTheme: vi.fn(() => 'theme'),
  getMonacoThemeName: vi.fn(() => 'theme')
}));

/**
 * 创建编辑器状态。
 * @returns 编辑器状态
 */
function createEditorState(): EditorState {
  return {
    id: 'monaco-selection-file',
    name: 'selection.json',
    path: '/workspace/selection.json',
    ext: 'json',
    content: ['first', 'second line', 'third'].join('\n')
  };
}

describe('BMonaco selection', () => {
  beforeEach((): void => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: false }))
    );
  });

  it('waits for Monaco initialization before selecting a line range', async (): Promise<void> => {
    const wrapper = mount(BMonaco, {
      attachTo: document.body,
      props: {
        value: ['first', 'second line', 'third'].join('\n'),
        language: 'json',
        editorState: createEditorState()
      }
    });

    const selectTask = (wrapper.vm as unknown as BMonacoSelectionController).selectLineRange(2, 2);

    await nextTick();
    expect(monacoMock.setSelection).not.toHaveBeenCalled();

    monacoMock.resolveCreateMonacoEditor();

    const selected = await selectTask;
    const expectedRange = {
      startLineNumber: 2,
      startColumn: 1,
      endLineNumber: 2,
      endColumn: 12
    };

    expect(selected).toBe(true);
    expect(monacoMock.setSelection).toHaveBeenCalledWith(expectedRange);
    expect(monacoMock.revealRangeInCenter).toHaveBeenCalledWith(expectedRange);
    expect(monacoMock.focus).toHaveBeenCalled();
  });
});
