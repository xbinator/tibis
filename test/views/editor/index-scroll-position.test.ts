/**
 * @file index-scroll-position.test.ts
 * @description 编辑器页面 KeepAlive 激活时恢复 BEditor 滚动位置测试。
 * @vitest-environment jsdom
 */
import { defineComponent, nextTick, ref } from 'vue';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EditorPage from '@/views/editor/index.vue';

const bEditorMethods = vi.hoisted(() => ({
  rememberScrollPosition: vi.fn(),
  restoreScrollPosition: vi.fn()
}));

vi.mock('vue-router', () => ({
  useRoute: () => ({
    params: { id: 'scroll-file' }
  })
}));

vi.mock('@/components/BEditor/index.vue', async () => {
  const { defineComponent: defineVueComponent, h } = await import('vue');

  return {
    default: defineVueComponent({
      name: 'BEditor',
      props: {
        value: {
          type: Object,
          required: true
        },
        active: {
          type: Boolean,
          default: true
        }
      },
      emits: ['update:value', 'editor-blur', 'rename-file', 'save', 'save-as', 'copy-path', 'show-in-folder'],
      setup(_, { expose }) {
        expose({
          undo: vi.fn(),
          redo: vi.fn(),
          canUndo: (): boolean => false,
          canRedo: (): boolean => false,
          focusEditor: vi.fn(),
          focusEditorAtStart: vi.fn(),
          setSearchTerm: vi.fn(),
          findNext: vi.fn(),
          findPrevious: vi.fn(),
          clearSearch: vi.fn(),
          getSelection: (): null => null,
          insertAtCursor: vi.fn(),
          replaceSelection: vi.fn(),
          replaceDocument: vi.fn(),
          selectLineRange: vi.fn(),
          getSearchState: () => ({ currentIndex: 0, matchCount: 0, term: '' }),
          scrollToAnchor: vi.fn(),
          getActiveAnchorId: (): string => '',
          rememberScrollPosition: bEditorMethods.rememberScrollPosition,
          restoreScrollPosition: bEditorMethods.restoreScrollPosition
        });

        return (): ReturnType<typeof h> => h('div', { class: 'b-editor-stub' });
      }
    })
  };
});

vi.mock('@/views/editor/hooks/useSession', async () => {
  const { ref: vueRef } = await import('vue');

  return {
    useSession: () => ({
      fileState: vueRef({
        id: 'scroll-file',
        name: 'scroll.md',
        path: '/workspace/scroll.md',
        ext: 'md',
        content: '# Scroll'
      }),
      actions: {
        onEditorBlur: vi.fn(),
        onRename: vi.fn(),
        onSave: vi.fn(),
        onSaveAs: vi.fn(),
        onCopyPath: vi.fn(),
        onShowInFolder: vi.fn()
      }
    })
  };
});

vi.mock('@/views/editor/hooks/useBindings', () => ({
  useBindings: vi.fn()
}));

vi.mock('@/views/editor/hooks/useFileSelection', () => ({
  useFileSelection: vi.fn()
}));

/**
 * 挂载 KeepAlive 包裹的编辑器页面。
 * @returns 测试宿主上下文
 */
function mountKeepAliveEditorPage(): { visible: { value: boolean } } {
  const visible = ref(true);

  mount(
    defineComponent({
      name: 'EditorPageKeepAliveHarness',
      components: { EditorPage },
      setup() {
        return { visible };
      },
      template: '<KeepAlive><EditorPage v-if="visible" /></KeepAlive>'
    })
  );

  return { visible };
}

describe('editor page scroll position lifecycle', () => {
  beforeEach((): void => {
    vi.clearAllMocks();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback): number => {
      callback(0);
      return 1;
    });
  });

  it('asks BEditor to remember and restore scroll position around KeepAlive tab switches', async (): Promise<void> => {
    const { visible } = mountKeepAliveEditorPage();

    await nextTick();

    visible.value = false;
    await nextTick();

    expect(bEditorMethods.rememberScrollPosition).toHaveBeenCalledTimes(1);

    visible.value = true;
    await nextTick();
    await nextTick();

    expect(bEditorMethods.restoreScrollPosition).toHaveBeenCalledTimes(1);
  });
});
