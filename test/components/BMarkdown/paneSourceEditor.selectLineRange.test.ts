/**
 * @file paneSourceEditor.selectLineRange.test.ts
 * @description PaneSourceEditor 行范围选区能力测试。
 * @vitest-environment jsdom
 */

import type { EditorController } from '@/components/BEditor/adapters/types';
import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, test } from 'vitest';
import PaneSourceEditor from '@/components/BEditor/components/PaneSourceEditor.vue';

/**
 * 挂载 Source editor。
 * @returns 组件包装器
 */
function mountSourceEditor() {
  return mount(PaneSourceEditor, {
    props: {
      value: 'line 1\nline 2\nline 3',
      outlineContent: '',
      editorId: 'editor-1',
      editable: true,
      editorState: {
        id: 'editor-1',
        name: 'demo',
        content: 'line 1\nline 2\nline 3',
        ext: 'md',
        path: null
      }
    },
    global: {
      stubs: {
        SelectionToolbarSource: true,
        SelectionAIInput: true
      }
    }
  });
}

describe('PaneSourceEditor selectLineRange', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    setActivePinia(createPinia());
  });

  test('selects the requested source line range', async () => {
    const wrapper = mountSourceEditor();
    await Promise.resolve();

    const controller = wrapper.vm as unknown as EditorController;
    const selected = controller.selectLineRange(2, 3);

    expect(selected).toBe(true);
    expect(controller.getSelection()).toMatchObject({
      text: 'line 2\nline 3'
    });
  });
});
