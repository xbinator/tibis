// @vitest-environment jsdom
/**
 * @file paneRichEditor.anchor-link.test.ts
 * @description 验证富文本文内 hash 链接会滚动到对应标题。
 */
import type { VueWrapper } from '@vue/test-utils';
import type { ComponentPublicInstance } from 'vue';
import { ref } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import PaneRichEditor from '@/components/BEditor/components/PaneRichEditor.vue';

vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: vi.fn()
  })
}));

vi.mock('@/components/BEditor/hooks/useSelectionAssistant', () => ({
  useSelectionAssistant: () => ({
    toolbarVisible: ref(false),
    toolbarPosition: ref(null),
    aiInputVisible: ref(false),
    cachedSelectionRange: ref(null),
    panelPosition: ref(null),
    openAIInput: vi.fn(),
    closeAIInput: vi.fn(),
    applyAIResult: vi.fn(async () => undefined),
    setStreaming: vi.fn(),
    insertReference: vi.fn(),
    recomputeAllPositions: vi.fn()
  })
}));

/**
 * 富文本面板公开的最小实例接口。
 */
interface PaneRichEditorVm extends ComponentPublicInstance {
  /**
   * 聚焦编辑器。
   */
  focusEditor: () => void;
}

/**
 * 等待编辑器挂载与异步副作用稳定。
 */
async function flushEditorWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

/**
 * 挂载富文本编辑器。
 * @param value - 初始 Markdown 内容
 * @returns 组件包装器
 */
function mountPaneRichEditor(value: string): VueWrapper<PaneRichEditorVm> {
  return mount(PaneRichEditor, {
    attachTo: document.body,
    props: {
      value,
      outlineContent: '',
      editable: true,
      editorState: {
        id: 'rich-anchor-link',
        name: 'rich-anchor-link.md',
        content: value,
        ext: 'md',
        path: null
      }
    },
    global: {
      plugins: [createPinia()],
      stubs: {
        CurrentBlockMenu: true,
        FrontMatterCard: true,
        SelectionAIInput: true,
        SelectionToolbarRich: true
      }
    }
  }) as VueWrapper<PaneRichEditorVm>;
}

describe('PaneRichEditor anchor link navigation', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  test('scrolls to the matching heading when clicking an in-document hash link', async () => {
    const wrapper = mountPaneRichEditor(['[跳到规格驱动开发](#-什么是规格驱动开发)', '', '## 什么是规格驱动开发？', '', '正文'].join('\n'));

    await flushEditorWork();

    const heading = wrapper.element.querySelector('#rich-anchor-link-heading-0') as HTMLElement | null;
    const link = wrapper.element.querySelector('a[href="#-什么是规格驱动开发"]');

    expect(heading).not.toBeNull();
    expect(link).not.toBeNull();

    const scrollIntoViewMock = vi.fn();
    if (heading) {
      heading.scrollIntoView = scrollIntoViewMock;
    }

    link?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(scrollIntoViewMock).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });
});
