/**
 * @file index.test.ts
 * @description BEditor 入口组件测试，验证 JSON 文件会命中 PaneMonacoEditor 分支。
 */
/* @vitest-environment jsdom */

import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import BEditor from '@/components/BEditor/index.vue';

vi.mock('@/components/BEditor/components/PaneMonacoEditor.vue', () => ({
  default: {
    name: 'PaneMonacoEditor',
    props: ['value', 'editable', 'editorState', 'language'],
    emits: ['update:value', 'editor-blur'],
    template: '<div class="pane-monaco-editor-stub"></div>'
  }
}));

describe('BEditor', () => {
  it('renders PaneMonacoEditor for json files', () => {
    const wrapper = mount(BEditor, {
      props: {
        value: {
          id: 'json-1',
          name: 'config',
          ext: 'json',
          content: '{}',
          path: null
        }
      }
    });

    expect(wrapper.findComponent({ name: 'PaneMonacoEditor' }).exists()).toBe(true);
  });
});
