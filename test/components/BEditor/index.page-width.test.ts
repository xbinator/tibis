/**
 * @file index.page-width.test.ts
 * @description 验证 BEditor 正文区页宽设置映射。
 */
/* @vitest-environment jsdom */

import { defineComponent } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BEditor from '@/components/BEditor/index.vue';
import { useSettingStore } from '@/stores/setting';

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
 * 挂载编辑器组件。
 * @returns BEditor 挂载结果
 */
function mountEditor() {
  return mount(BEditor, {
    props: {
      value: '# Title',
      title: 'Doc'
    },
    global: {
      stubs: {
        BScrollbar: ScrollbarStub,
        BEditorSidebar: true,
        FindBar: true,
        PaneRichEditor: true,
        PaneSourceEditor: true
      }
    }
  });
}

describe('BEditor page width', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('uses 900px max width in default mode', () => {
    const wrapper = mountEditor();

    expect(wrapper.find('.b-editor-container').attributes('style')).toContain('--editor-page-max-width: 900px;');
  });

  it('uses 1200px max width in wide mode', () => {
    const settingStore = useSettingStore();
    settingStore.setEditorPageWidth('wide');

    const wrapper = mountEditor();

    expect(wrapper.find('.b-editor-container').attributes('style')).toContain('--editor-page-max-width: 1200px;');
  });

  it('uses none max width in full mode', () => {
    const settingStore = useSettingStore();
    settingStore.setEditorPageWidth('full');

    const wrapper = mountEditor();

    expect(wrapper.find('.b-editor-container').attributes('style')).toContain('--editor-page-max-width: none;');
  });
});
