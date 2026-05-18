/* @vitest-environment jsdom */
/**
 * @file richCodeBlockInitialHighlight.test.ts
 * @description 验证富文本代码块初次挂载时已经生成语法高亮 token。
 */
import type { VueWrapper } from '@vue/test-utils';
import type { ComponentPublicInstance } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import PaneRichEditor from '@/components/BEditor/panes/PaneRichEditor.vue';

vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: vi.fn()
  })
}));

vi.mock('@/stores/files', () => ({
  useFilesStore: () => ({
    openFile: vi.fn()
  })
}));

vi.mock('@/hooks/useNavigate', () => ({
  useNavigate: () => ({
    onLink: vi.fn()
  })
}));

vi.mock('localforage', () => ({
  default: {
    config: vi.fn(),
    createInstance: vi.fn(() => ({
      getItem: vi.fn(() => Promise.resolve(null)),
      setItem: vi.fn(() => Promise.resolve()),
      removeItem: vi.fn(() => Promise.resolve()),
      clear: vi.fn(() => Promise.resolve())
    })),
    getItem: vi.fn(() => Promise.resolve(null)),
    setItem: vi.fn(() => Promise.resolve()),
    removeItem: vi.fn(() => Promise.resolve()),
    clear: vi.fn(() => Promise.resolve())
  }
}));

/**
 * 富文本面板公开实例。
 */
type PaneRichEditorVm = ComponentPublicInstance;

/**
 * 等待编辑器挂载和 ProseMirror 装饰稳定。
 */
async function flushEditorWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

/**
 * 挂载富文本编辑器面板。
 * @param value - 初始 Markdown 内容
 * @returns 挂载后的组件包装器
 */
function mountPaneRichEditor(value: string): VueWrapper<PaneRichEditorVm> {
  return mount(PaneRichEditor, {
    attachTo: document.body,
    props: {
      value,
      outlineContent: '',
      editable: true,
      editorState: {
        id: 'rich-code-block-initial-highlight',
        name: 'rich-code-block-initial-highlight.md',
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
        SelectionToolbarRich: true,
        ASelect: true
      }
    }
  });
}

describe('PaneRichEditor initial code block highlight', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  test('renders lowlight token classes on the first mounted code block', async () => {
    const wrapper = mountPaneRichEditor(['```ts', 'const answer = 42', '```'].join('\n'));

    await flushEditorWork();

    expect(wrapper.get('.b-markdown-codeblock code').html()).toContain('hljs-keyword');
    expect(wrapper.get('.b-markdown-codeblock code').html()).toContain('hljs-number');

    wrapper.unmount();
  });

  test('renders lowlight token classes when code block content is loaded after mount', async () => {
    const wrapper = mountPaneRichEditor('');
    const markdown = ['```ts', 'const answer = 42', '```'].join('\n');

    await flushEditorWork();
    await wrapper.setProps({
      value: markdown,
      editorState: {
        id: 'rich-code-block-initial-highlight',
        name: 'rich-code-block-initial-highlight.md',
        content: markdown,
        ext: 'md',
        path: null
      }
    });
    await flushEditorWork();

    expect(wrapper.get('.b-markdown-codeblock code').html()).toContain('hljs-keyword');
    expect(wrapper.get('.b-markdown-codeblock code').html()).toContain('hljs-number');

    wrapper.unmount();
  });

  test('keeps code blocks without language as plain text on first render', async () => {
    const wrapper = mountPaneRichEditor(['```', 'const answer = 42', '```'].join('\n'));

    await flushEditorWork();

    expect(wrapper.get('.b-markdown-codeblock code').html()).not.toContain('hljs-');
    expect(wrapper.get('.b-markdown-codeblock code').classes()).toContain('language-plaintext');

    wrapper.unmount();
  });
});
