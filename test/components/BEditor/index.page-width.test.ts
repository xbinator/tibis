/**
 * @file index.page-width.test.ts
 * @description 验证 BEditor 正文区页宽设置映射。
 */
/* @vitest-environment jsdom */
/* eslint-disable vue/one-component-per-file */

import { defineComponent } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount, VueWrapper } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BEditor from '@/components/BEditor/index.vue';
import { useEditorPreferencesStore } from '@/stores/editor/preferences';

const storage = new Map<string, string>();

vi.stubGlobal('localStorage', {
  getItem(key: string): string | null {
    return storage.get(key) ?? null;
  },
  setItem(key: string, value: string): void {
    storage.set(key, value);
  },
  removeItem(key: string): void {
    storage.delete(key);
  },
  clear(): void {
    storage.clear();
  }
});

/**
 * 滚动容器占位组件。
 */
const ScrollbarStub = defineComponent({
  name: 'BScrollbar',
  template: '<div class="scrollbar-stub"><slot /></div>'
});

/**
 * 富文本编辑器占位组件。
 */
const PaneRichEditorStub = defineComponent({
  name: 'PaneRichEditor',
  template: '<div class="pane-rich-editor-stub">rich</div>'
});

/**
 * 源码编辑器占位组件。
 */
const PaneSourceEditorStub = defineComponent({
  name: 'PaneSourceEditor',
  template: '<div class="pane-source-editor-stub">source</div>'
});

/**
 * 挂载编辑器组件。
 * @returns BEditor 挂载结果
 */
function mountEditor(): VueWrapper {
  return mount(BEditor, {
    props: {
      value: {
        id: 'doc-1',
        name: 'Doc',
        content: '# Title',
        ext: 'md',
        path: '/tmp/doc.md'
      }
    },
    global: {
      stubs: {
        BScrollbar: ScrollbarStub,
        Sidebar: true,
        QuickActions: true,
        FindBar: true,
        SelectionAIInput: true,
        SelectionToolbarRich: true,
        SelectionToolbarSource: true,
        PaneRichEditor: PaneRichEditorStub,
        PaneSourceEditor: PaneSourceEditorStub
      }
    }
  });
}

/**
 * 挂载编辑器并等待异步子组件完成收敛，避免测试环境销毁时仍有动态导入悬挂。
 * @returns 已稳定的编辑器挂载结果
 */
async function mountSettledEditor(): Promise<VueWrapper> {
  const wrapper = mountEditor();
  await flushPromises();
  return wrapper;
}

describe('BEditor page width', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('uses 900px max width in default mode', async () => {
    const wrapper = await mountSettledEditor();
    expect(wrapper.find('.b-markdown-container').attributes('style')).toContain('--editor-page-max-width: 900px;');
    wrapper.unmount();
  });

  it('uses 1200px max width in wide mode', async () => {
    const editorPreferencesStore = useEditorPreferencesStore();
    editorPreferencesStore.setPageWidth('wide');

    const wrapper = await mountSettledEditor();
    expect(wrapper.find('.b-markdown-container').attributes('style')).toContain('--editor-page-max-width: 1200px;');
    wrapper.unmount();
  });

  it('uses none max width in full mode', async () => {
    const editorPreferencesStore = useEditorPreferencesStore();
    editorPreferencesStore.setPageWidth('full');

    const wrapper = await mountSettledEditor();
    expect(wrapper.find('.b-markdown-container').attributes('style')).toContain('--editor-page-max-width: none;');
    wrapper.unmount();
  });

  it('uses source mode from editor preferences when view-mode is not passed', async () => {
    const editorPreferencesStore = useEditorPreferencesStore();
    editorPreferencesStore.setViewMode('source');

    const wrapper = await mountSettledEditor();

    expect(wrapper.find('.pane-source-editor-stub').exists()).toBe(true);
    expect(wrapper.find('.pane-rich-editor-stub').exists()).toBe(false);

    wrapper.unmount();
  });
});
