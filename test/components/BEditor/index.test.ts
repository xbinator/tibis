/**
 * @file index.test.ts
 * @description BEditor 入口组件测试，验证统一入口会根据扩展名切换内部实现。
 */
/* @vitest-environment jsdom */

import { createPinia } from 'pinia';
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import BEditor from '@/components/BEditor/index.vue';

vi.mock('@/components/BMonaco/index.vue', () => ({
  default: {
    name: 'BMonaco',
    props: ['value', 'editable', 'editorState', 'language'],
    emits: ['update:value', 'editor-blur'],
    template: '<div class="b-monaco-stub"></div>'
  }
}));

vi.mock('@/components/BEditor/components/PaneRichEditor.vue', () => ({
  default: {
    name: 'PaneRichEditor',
    props: ['value', 'outlineContent', 'editorState', 'editable', 'onSearchMatchElementFocus'],
    emits: ['update:value', 'update:outlineContent', 'editor-blur'],
    template: '<div class="pane-rich-editor-stub"></div>'
  }
}));

vi.mock('@/components/BEditor/components/PaneSourceEditor.vue', () => ({
  default: {
    name: 'PaneSourceEditor',
    props: ['value', 'outlineContent', 'editorState', 'editable', 'editorId', 'onAnchorScroll'],
    emits: ['update:value', 'update:outlineContent', 'editor-blur'],
    template: '<div class="pane-source-editor-stub"></div>'
  }
}));

describe('BEditor', () => {
  it('renders BMonaco for json files', () => {
    const wrapper = mount(BEditor, {
      props: {
        value: {
          id: 'json-1',
          name: 'config',
          ext: 'json',
          content: '{}',
          path: null
        }
      },
      global: {
        plugins: [createPinia()]
      }
    });

    expect(wrapper.findComponent({ name: 'BMonaco' }).exists()).toBe(true);
  });

  it('renders PaneRichEditor for markdown files', async () => {
    const wrapper = mount(BEditor, {
      props: {
        value: {
          id: 'markdown-1',
          name: 'note',
          ext: 'md',
          content: '# Title',
          path: null
        }
      },
      global: {
        plugins: [createPinia()],
        stubs: {
          BScrollbar: {
            name: 'BScrollbar',
            template: '<div class="scrollbar-stub"><slot /></div>'
          },
          Sidebar: {
            name: 'Sidebar',
            template: '<div class="sidebar-stub" />'
          },
          QuickActions: {
            name: 'QuickActions',
            template: '<div class="quick-actions-stub" />'
          },
          FindBar: {
            name: 'FindBar',
            template: '<div class="find-bar-stub" />'
          }
        }
      }
    });

    await Promise.resolve();

    expect(wrapper.findComponent({ name: 'PaneRichEditor' }).exists()).toBe(true);
  });
});
