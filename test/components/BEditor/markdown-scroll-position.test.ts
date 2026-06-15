/**
 * @file markdown-scroll-position.test.ts
 * @description Markdown 编辑器 KeepAlive 滚动位置恢复测试。
 * @vitest-environment jsdom
 */
/* eslint-disable vue/one-component-per-file -- 测试需要内联 KeepAlive 宿主和 BScrollbar 桩组件。 */
import { defineComponent, nextTick, ref, watch } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { mount, type VueWrapper } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Markdown from '@/components/BEditor/Markdown.vue';
import type { EditorState } from '@/components/BEditor/types';

vi.mock('@/shared/platform', () => ({
  native: {
    exportPdf: vi.fn(),
    updateMenuItem: vi.fn()
  }
}));

vi.mock('@/utils/modal', () => ({
  Modal: {
    confirm: vi.fn(),
    delete: vi.fn(),
    input: vi.fn()
  }
}));

/**
 * 最近一次创建的滚动元素，用于模拟浏览器在 KeepAlive 切换后丢失 scrollTop。
 */
let latestScrollElement: HTMLDivElement | null = null;

/**
 * Markdown 测试中需要访问的滚动位置控制能力。
 */
interface MarkdownScrollController {
  /** 缓存当前滚动位置 */
  rememberScrollPosition: () => void;
  /** 恢复最近一次缓存的滚动位置 */
  restoreScrollPosition: () => Promise<void>;
}

/**
 * Vue Test Utils 暴露的组件内部实例结构。
 */
interface ExposedMarkdownInstance {
  /** Vue 内部组件实例 */
  $: {
    /** defineExpose 暴露对象 */
    exposed?: Partial<MarkdownScrollController>;
  };
}

/**
 * 创建测试用编辑器状态。
 * @returns Markdown 编辑器状态
 */
function createEditorState(): EditorState {
  return {
    id: 'markdown-scroll-file',
    name: 'scroll.md',
    path: '/workspace/scroll.md',
    ext: 'md',
    content: '# Title\n\nContent'
  };
}

/**
 * 挂载 KeepAlive 包裹的 Markdown 编辑器。
 * @returns 测试包装器
 */
function mountKeepAliveMarkdown(): VueWrapper {
  return mount(
    defineComponent({
      name: 'MarkdownKeepAliveHarness',
      components: { Markdown },
      setup() {
        const visible = ref(true);
        const content = ref('# Title\n\nContent');
        const outlineContent = ref('');
        const editorState = ref(createEditorState());

        return {
          visible,
          content,
          outlineContent,
          editorState
        };
      },
      template: `
        <KeepAlive>
          <Markdown
            v-if="visible"
            v-model:content="content"
            v-model:outline-content="outlineContent"
            :editor-state="editorState"
            :editable="true"
            :active="true"
          />
        </KeepAlive>
      `
    }),
    {
      attachTo: document.body,
      global: {
        stubs: {
          Sidebar: true,
          PaneRichEditor: true,
          PaneSourceEditor: true,
          SelectionToolbarRich: true,
          SelectionToolbarSource: true,
          SelectionAIInput: true,
          SelectionCommentInput: true,
          CommentCard: true,
          FindBar: true,
          BScrollbar: defineComponent({
            name: 'BScrollbar',
            emits: ['scroll'],
            setup(_, { emit, expose }) {
              const scrollElement = ref<HTMLDivElement | null>(null);

              /**
               * 获取测试滚动元素。
               * @returns 当前滚动元素
               */
              function getScrollElement(): HTMLDivElement | null {
                return scrollElement.value;
              }

              /**
               * 滚动到指定位置。
               * @param options - 滚动参数
               */
              function scrollTo(options: ScrollToOptions): void {
                if (!scrollElement.value) {
                  return;
                }

                if (typeof options.top === 'number') {
                  scrollElement.value.scrollTop = options.top;
                }
                if (typeof options.left === 'number') {
                  scrollElement.value.scrollLeft = options.left;
                }
              }

              expose({ getScrollElement, scrollTo });

              watch(
                scrollElement,
                (element: HTMLDivElement | null): void => {
                  latestScrollElement = element;
                },
                { immediate: true }
              );

              /**
               * 转发滚动事件。
               * @param event - 原生滚动事件
               */
              function emitScroll(event: Event): void {
                emit('scroll', event);
              }

              return {
                emitScroll,
                scrollElement
              };
            },
            template: '<div ref="scrollElement" class="test-scrollbar" @scroll="emitScroll"><slot /></div>'
          })
        }
      }
    }
  );
}

describe('Markdown KeepAlive scroll position', () => {
  beforeEach((): void => {
    setActivePinia(createPinia());
    document.body.innerHTML = '';
    latestScrollElement = null;
  });

  it('restores the previous scrollbar position after the cached tab is activated again', async (): Promise<void> => {
    const wrapper = mountKeepAliveMarkdown();
    const harness = wrapper.vm as unknown as { visible: boolean };

    await nextTick();
    expect(latestScrollElement).not.toBeNull();

    if (!latestScrollElement) {
      throw new Error('scroll element not mounted');
    }

    latestScrollElement.scrollTop = 420;
    latestScrollElement.scrollLeft = 18;
    latestScrollElement.dispatchEvent(new Event('scroll'));

    harness.visible = false;
    await nextTick();

    latestScrollElement.scrollTop = 0;
    latestScrollElement.scrollLeft = 0;

    harness.visible = true;
    await nextTick();
    await nextTick();

    expect(latestScrollElement.scrollTop).toBe(420);
    expect(latestScrollElement.scrollLeft).toBe(18);
  });

  it('does not overwrite the cached position from a detached scrollbar during tab deactivation', async (): Promise<void> => {
    const wrapper = mountKeepAliveMarkdown();
    const harness = wrapper.vm as unknown as { visible: boolean };

    await nextTick();
    expect(latestScrollElement).not.toBeNull();

    const { exposed } = (wrapper.findComponent(Markdown).vm as unknown as ExposedMarkdownInstance).$;
    const markdown = exposed as MarkdownScrollController;
    const scrollElement = latestScrollElement;
    if (!scrollElement) {
      throw new Error('scroll element not mounted');
    }

    scrollElement.scrollTop = 420;
    scrollElement.scrollLeft = 18;
    scrollElement.dispatchEvent(new Event('scroll'));

    harness.visible = false;
    await nextTick();

    scrollElement.scrollTop = 0;
    scrollElement.scrollLeft = 0;
    markdown.rememberScrollPosition();

    harness.visible = true;
    await nextTick();
    await markdown.restoreScrollPosition();

    expect(latestScrollElement?.scrollTop).toBe(420);
    expect(latestScrollElement?.scrollLeft).toBe(18);
  });
});
