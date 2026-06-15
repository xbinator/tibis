/**
 * @file editor-scroll-controller.test.ts
 * @description BEditor 滚动位置控制器转发测试。
 * @vitest-environment jsdom
 */
import { defineComponent, nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BEditor from '@/components/BEditor/index.vue';
import type { EditorState } from '@/components/BEditor/types';

const childMethods = vi.hoisted(() => ({
  markdownRemember: vi.fn(),
  markdownRestore: vi.fn().mockResolvedValue(undefined),
  monacoRemember: vi.fn(),
  monacoRestore: vi.fn().mockResolvedValue(undefined)
}));

/**
 * 创建测试用控制器桩。
 * @returns 编辑器控制器桩
 */
function createEditorControllerStub(): Record<string, unknown> {
  return {
    undo: vi.fn(),
    redo: vi.fn(),
    canUndo: vi.fn(() => false),
    canRedo: vi.fn(() => false),
    focusEditor: vi.fn(),
    focusEditorAtStart: vi.fn(),
    setSearchTerm: vi.fn(),
    findNext: vi.fn(),
    findPrevious: vi.fn(),
    clearSearch: vi.fn(),
    getSelection: vi.fn(() => null),
    insertAtCursor: vi.fn().mockResolvedValue(undefined),
    replaceSelection: vi.fn().mockResolvedValue(undefined),
    replaceDocument: vi.fn().mockResolvedValue(undefined),
    selectLineRange: vi.fn(() => false),
    getSearchState: vi.fn(() => ({ currentIndex: 0, matchCount: 0, term: '' })),
    scrollToAnchor: vi.fn(() => false),
    getActiveAnchorId: vi.fn(() => '')
  };
}

vi.mock('@/ai/tools/context/editor', () => ({
  editorToolContextRegistry: {
    register: vi.fn(),
    unregister: vi.fn()
  }
}));

vi.mock('@/components/BEditor/hooks/useEditorToolContext', () => ({
  createEditorToolContext: vi.fn(() => ({}))
}));

vi.mock('@/components/BEditor/Markdown.vue', async () => {
  const { defineComponent: defineVueComponent, h } = await import('vue');

  return {
    default: defineVueComponent({
      name: 'Markdown',
      props: {
        content: {
          type: String,
          default: ''
        }
      },
      emits: ['update:content'],
      setup(_, { expose }) {
        expose({
          editorController: createEditorControllerStub(),
          rememberScrollPosition: childMethods.markdownRemember,
          restoreScrollPosition: childMethods.markdownRestore,
          scrollToAnchor: vi.fn(),
          getActiveAnchorId: vi.fn(() => '')
        });

        return (): ReturnType<typeof h> => h('div', { class: 'markdown-stub' });
      }
    })
  };
});

vi.mock('@/components/BEditor/Monaco.vue', async () => {
  const { defineComponent: defineVueComponent, h } = await import('vue');

  return {
    default: defineVueComponent({
      name: 'Monaco',
      props: {
        content: {
          type: String,
          default: ''
        }
      },
      emits: ['update:content'],
      setup(_, { expose }) {
        expose({
          editorController: createEditorControllerStub(),
          rememberScrollPosition: childMethods.monacoRemember,
          restoreScrollPosition: childMethods.monacoRestore
        });

        return (): ReturnType<typeof h> => h('div', { class: 'monaco-stub' });
      }
    })
  };
});

/**
 * 创建编辑器状态。
 * @param ext - 文件扩展名
 * @returns 编辑器状态
 */
function createEditorState(ext: string): EditorState {
  return {
    id: `file-${ext}`,
    name: `file.${ext}`,
    path: `/workspace/file.${ext}`,
    ext,
    content: ''
  };
}

/**
 * 挂载 BEditor。
 * @param state - 编辑器状态
 * @returns 组件包装器
 */
function mountBEditor(state: EditorState): ReturnType<typeof mount> {
  return mount(
    defineComponent({
      name: 'BEditorHarness',
      components: { BEditor },
      setup() {
        return { state };
      },
      template: '<BEditor ref="editor" v-model:value="state" />'
    })
  );
}

describe('BEditor scroll controller', () => {
  beforeEach((): void => {
    vi.clearAllMocks();
  });

  it('forwards scroll snapshot commands to the Monaco editor for non-Markdown files', async (): Promise<void> => {
    const wrapper = mountBEditor(createEditorState('json'));

    await nextTick();
    const editor = wrapper.vm.$refs.editor as { rememberScrollPosition: () => void; restoreScrollPosition: () => Promise<void> };

    editor.rememberScrollPosition();
    await editor.restoreScrollPosition();

    expect(childMethods.monacoRemember).toHaveBeenCalledTimes(1);
    expect(childMethods.monacoRestore).toHaveBeenCalledTimes(1);
    expect(childMethods.markdownRemember).not.toHaveBeenCalled();
    expect(childMethods.markdownRestore).not.toHaveBeenCalled();
  });
});
