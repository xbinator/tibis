/**
 * @file FindBar.test.ts
 * @description FindBar 组件搜索状态同步回归测试。
 */
/* @vitest-environment jsdom */

import { nextTick } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BMarkdownPublicInstance, EditorSearchState } from '@/components/BMarkdown/adapters/types';
import FindBar from '@/components/BMarkdown/components/FindBar.vue';
import { EditorShortcuts } from '@/constants/shortcuts';

/**
 * 捕获 registerShortcut 调用，以便在测试中直接触发快捷键 handler。
 */
const capturedShortcutHandlers: Map<string, () => void> = new Map();

/**
 * 快捷键 hook mock，避免测试依赖全局注册行为。
 */
vi.mock('@/hooks/useShortcuts', () => ({
  useShortcuts: () => ({
    registerShortcut: vi.fn((options: { key: string; handler: () => void }) => {
      capturedShortcutHandlers.set(options.key, options.handler);
    })
  })
}));

/**
 * 可观测的编辑器实例 mock。
 */
interface MockEditorInstance extends BMarkdownPublicInstance {
  /** 当前搜索状态快照 */
  snapshot: EditorSearchState;
  /** 设置搜索词 spy */
  setSearchTerm: ReturnType<typeof vi.fn<(term: string) => void>>;
  /** 查找下一个 spy */
  findNext: ReturnType<typeof vi.fn<() => void>>;
}

/**
 * 创建带搜索状态的编辑器实例 mock。
 * @returns 编辑器实例 mock
 */
function createEditorInstance(): MockEditorInstance {
  const snapshot: EditorSearchState = {
    currentIndex: 0,
    matchCount: 0,
    term: ''
  };

  /**
   * 设置搜索词并模拟匹配结果。
   * @param term - 搜索词
   */
  const setSearchTerm = vi.fn<(term: string) => void>((term: string): void => {
    snapshot.term = term;
    snapshot.currentIndex = 0;
    snapshot.matchCount = term ? 2 : 0;
  });

  /**
   * 切换到下一个匹配项，仅在已有搜索词时生效。
   */
  const findNext = vi.fn<() => void>((): void => {
    if (!snapshot.term || snapshot.matchCount === 0) {
      return;
    }

    snapshot.currentIndex = (snapshot.currentIndex + 1) % snapshot.matchCount;
  });

  /**
   * 切换到上一个匹配项，仅在已有搜索词时生效。
   */
  const findPrevious = vi.fn<() => void>((): void => {
    if (!snapshot.term || snapshot.matchCount === 0) {
      return;
    }

    snapshot.currentIndex = snapshot.currentIndex <= 0 ? snapshot.matchCount - 1 : snapshot.currentIndex - 1;
  });

  /**
   * 清理搜索状态。
   */
  function clearSearch(): void {
    snapshot.term = '';
    snapshot.currentIndex = 0;
    snapshot.matchCount = 0;
  }

  /**
   * 返回当前搜索状态。
   * @returns 搜索状态快照
   */
  function getSearchState(): EditorSearchState {
    return { ...snapshot };
  }

  return {
    snapshot,
    undo: vi.fn(),
    redo: vi.fn(),
    canUndo: vi.fn((): boolean => false),
    canRedo: vi.fn((): boolean => false),
    focusEditor: vi.fn(),
    getSelection: vi.fn(() => null),
    insertAtCursor: vi.fn(async (): Promise<void> => undefined),
    replaceSelection: vi.fn(async (): Promise<void> => undefined),
    replaceDocument: vi.fn(async (): Promise<void> => undefined),
    selectLineRange: vi.fn((): boolean => false),
    setSearchTerm,
    findNext,
    findPrevious,
    clearSearch,
    getSearchState
  };
}

/**
 * 挂载 FindBar 组件。
 * @param editorInstance - 编辑器实例
 * @returns 组件包装器
 */
function mountFindBar(editorInstance: BMarkdownPublicInstance): VueWrapper<InstanceType<typeof FindBar>> {
  return mount(FindBar, {
    props: {
      visible: true,
      editorInstance
    },
    global: {
      stubs: {
        Icon: {
          template: '<i class="icon-stub"></i>'
        }
      }
    }
  });
}

describe('FindBar', () => {
  beforeEach(() => {
    capturedShortcutHandlers.clear();
  });

  it('re-applies the current keyword after the editor instance changes so Enter keeps working', async () => {
    const firstEditorInstance = createEditorInstance();
    const wrapper = mountFindBar(firstEditorInstance);

    await wrapper.find('input').setValue('hello');
    expect(firstEditorInstance.setSearchTerm).toHaveBeenLastCalledWith('hello');
    expect(wrapper.find('.b-markdown-findbar__result').text()).toBe('1/2');

    const secondEditorInstance = createEditorInstance();
    await wrapper.setProps({ editorInstance: secondEditorInstance });
    await nextTick();

    expect(secondEditorInstance.setSearchTerm).toHaveBeenCalledWith('hello');

    await wrapper.find('input').trigger('keydown.enter');

    expect(secondEditorInstance.findNext).toHaveBeenCalledTimes(1);
    expect(wrapper.find('.b-markdown-findbar__result').text()).toBe('2/2');
  });

  it('re-syncs the keyword on Enter when the next editor instance still reports an empty search state', async () => {
    const firstEditorInstance = createEditorInstance();
    const wrapper = mountFindBar(firstEditorInstance);

    await wrapper.find('input').setValue('hello');
    expect(wrapper.find('.b-markdown-findbar__result').text()).toBe('1/2');

    const secondEditorInstance = createEditorInstance();
    await wrapper.setProps({ editorInstance: secondEditorInstance });

    secondEditorInstance.setSearchTerm.mockClear();
    secondEditorInstance.findNext.mockClear();
    secondEditorInstance.clearSearch();
    await nextTick();

    expect(wrapper.find('.b-markdown-findbar__result').text()).toBe('1/2');

    await wrapper.find('input').trigger('keydown.enter');

    expect(secondEditorInstance.setSearchTerm).toHaveBeenCalledWith('hello');
    expect(secondEditorInstance.findNext).toHaveBeenCalledTimes(1);
    expect(wrapper.find('.b-markdown-findbar__result').text()).toBe('2/2');
  });

  describe('Ctrl+F with selected text', () => {
    it('pre-fills the keyword with the selected text when Ctrl+F is triggered', async () => {
      const editorInstance = createEditorInstance();
      (editorInstance.getSelection as ReturnType<typeof vi.fn>).mockReturnValue({
        from: 0,
        to: 5,
        text: 'hello'
      });

      mount(FindBar, {
        props: {
          visible: false,
          editorInstance
        },
        global: {
          stubs: {
            Icon: { template: '<i class="icon-stub"></i>' }
          }
        }
      });

      const handler = capturedShortcutHandlers.get(EditorShortcuts.EDIT_FIND);
      expect(handler).toBeDefined();

      handler!();
      await nextTick();

      expect(editorInstance.setSearchTerm).toHaveBeenCalledWith('hello');
    });

    it('does not overwrite the keyword when there is no selection', async () => {
      const editorInstance = createEditorInstance();
      (editorInstance.getSelection as ReturnType<typeof vi.fn>).mockReturnValue(null);

      mount(FindBar, {
        props: {
          visible: false,
          editorInstance
        },
        global: {
          stubs: {
            Icon: { template: '<i class="icon-stub"></i>' }
          }
        }
      });

      const handler = capturedShortcutHandlers.get(EditorShortcuts.EDIT_FIND);
      handler!();
      await nextTick();

      expect(editorInstance.setSearchTerm).not.toHaveBeenCalled();
    });
  });
});
