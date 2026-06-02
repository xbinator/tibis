/**
 * @file DomInspectorPanel.test.ts
 * @description 验证 WebView DOM 检查看板组件渲染。
 * @vitest-environment jsdom
 */

import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import type { WebviewElementSelection } from '@/views/webview/shared/types';
import DomInspectorPanel from '@/views/webview/web/components/DomInspectorPanel.vue';

describe('DomInspectorPanel', () => {
  it('renders the selected element hierarchy, attributes and computed styles', () => {
    const selection: WebviewElementSelection = {
      tagName: 'BUTTON',
      id: 'submit',
      className: 'primary action',
      text: '提交',
      selector: 'button#submit',
      attributes: [
        { name: 'id', value: 'submit' },
        { name: 'class', value: 'primary action' },
        { name: 'type', value: 'button' }
      ],
      ancestors: [
        { tagName: 'HTML', selector: 'html' },
        { tagName: 'BODY', selector: 'body' },
        { tagName: 'FORM', selector: 'form.checkout' }
      ],
      computedStyles: {
        display: 'inline-flex',
        position: 'relative',
        color: 'rgb(255, 255, 255)'
      },
      rect: {
        x: 12,
        y: 24,
        width: 88,
        height: 32
      }
    };

    const wrapper = mount(DomInspectorPanel, {
      props: {
        selection
      },
      global: {
        stubs: {
          BButton: {
            template: '<button class="close-stub" @click="$emit(\'click\')"><slot /></button>',
            props: ['type', 'size', 'square', 'icon', 'tooltip']
          },
          BIcon: {
            template: '<i />',
            props: ['icon', 'size']
          }
        }
      }
    });

    expect(wrapper.text()).toContain('button#submit');
    expect(wrapper.text()).toContain('form.checkout');
    expect(wrapper.text()).toContain('type');
    expect(wrapper.text()).toContain('button');
    expect(wrapper.text()).toContain('display');
    expect(wrapper.text()).toContain('inline-flex');
    expect(wrapper.text()).toContain('88 x 32');
  });
});
