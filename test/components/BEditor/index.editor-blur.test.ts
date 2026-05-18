/**
 * @file index.editor-blur.test.ts
 * @description 验证 BEditor 仅在焦点真正离开编辑器时抛出 editor-blur。
 */
/* @vitest-environment jsdom */
/* eslint-disable vue/one-component-per-file */

import { defineComponent } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it } from 'vitest';
import BEditor from '@/components/BEditor/index.vue';

const PaneRichEditorStub = defineComponent({
  name: 'PaneRichEditor',
  emits: ['editor-blur'],
  template: '<button class="rich-editor" @blur="$emit(\'editor-blur\', $event)">rich</button>'
});

describe('BEditor editor-blur', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('re-emits editor-blur when focus leaves the whole editor', async () => {
    const wrapper = mount(BEditor, {
      props: {
        value: { id: 'doc', name: 'Doc', content: 'content', ext: 'md', path: '/tmp/doc.md' },
        showOutline: true
      },
      attachTo: document.body,
      global: {
        stubs: {
          PaneRichEditor: PaneRichEditorStub,
          PaneSourceEditor: true,
          SelectionAIInput: true,
          SelectionToolbarRich: true,
          SelectionToolbarSource: true,
          Sidebar: true,
          QuickActions: true,
          BScrollbar: { template: '<div><slot /></div>' },
          FindBar: true
        }
      }
    });

    const outside = document.createElement('button');
    document.body.appendChild(outside);

    await wrapper.get('.rich-editor').trigger('blur', { relatedTarget: outside });

    expect(wrapper.emitted('editor-blur')).toHaveLength(1);
  });

  it('does not emit editor-blur when focus moves inside the editor container', async () => {
    const wrapper = mount(BEditor, {
      props: {
        value: { id: 'doc', name: 'Doc', content: 'content', ext: 'md', path: '/tmp/doc.md' },
        showOutline: true
      },
      attachTo: document.body,
      global: {
        stubs: {
          PaneRichEditor: PaneRichEditorStub,
          PaneSourceEditor: true,
          SelectionAIInput: true,
          SelectionToolbarRich: true,
          SelectionToolbarSource: true,
          Sidebar: true,
          QuickActions: true,
          BScrollbar: { template: '<div><slot /></div>' },
          FindBar: true
        }
      }
    });

    const inside = document.createElement('button');
    inside.className = 'editor-toolbar-button';
    wrapper.element.appendChild(inside);

    await wrapper.get('.rich-editor').trigger('blur', { relatedTarget: inside });

    expect(wrapper.emitted('editor-blur')).toBeUndefined();
  });
});
