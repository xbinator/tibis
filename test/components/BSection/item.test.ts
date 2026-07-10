/**
 * @file item.test.ts
 * @description 验证 BSectionItem 标签区域的布局配置。
 * @vitest-environment jsdom
 */
import { h } from 'vue';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import BSectionBlock from '@/components/BSection/Block.vue';
import BSectionItem from '@/components/BSection/Item.vue';

describe('BSectionItem', (): void => {
  it('applies numeric label min width as px to text label', (): void => {
    const wrapper = mount(BSectionItem, {
      props: {
        label: '宽',
        labelMinWidth: 36
      },
      slots: {
        default: '<input class="field-input" />'
      },
      global: {
        stubs: {
          BIcon: true
        }
      }
    });

    expect(wrapper.find('.b-section-item__label').attributes('style') ?? '').toContain('min-width: 36px;');
    wrapper.unmount();
  });

  it('applies string label min width to icon label', (): void => {
    const wrapper = mount(BSectionItem, {
      props: {
        icon: 'lucide:type',
        labelMinWidth: '2.5em'
      },
      slots: {
        default: '<input class="field-input" />'
      },
      global: {
        stubs: {
          BIcon: true
        }
      }
    });

    expect(wrapper.find('.b-section-item__label').attributes('style') ?? '').toContain('min-width: 2.5em;');
    wrapper.unmount();
  });

  it('applies numeric string label min width as px', (): void => {
    const wrapper = mount(BSectionItem, {
      props: {
        label: '名称',
        labelMinWidth: '48'
      },
      slots: {
        default: '<input class="field-input" />'
      },
      global: {
        stubs: {
          BIcon: true
        }
      }
    });

    expect(wrapper.find('.b-section-item__label').attributes('style') ?? '').toContain('min-width: 48px;');
    wrapper.unmount();
  });

  it('uses label min width provided by parent block', (): void => {
    const wrapper = mount(BSectionBlock, {
      props: {
        title: '属性',
        labelMinWidth: 52
      },
      slots: {
        default: () => h(BSectionItem, { label: '名称' }, () => h('input', { class: 'field-input' }))
      },
      global: {
        stubs: {
          BIcon: true
        }
      }
    });

    expect(wrapper.find('.b-section-item__label').attributes('style') ?? '').toContain('min-width: 52px;');
    wrapper.unmount();
  });

  it('prefers item label min width over parent block value', (): void => {
    const wrapper = mount(BSectionBlock, {
      props: {
        title: '属性',
        labelMinWidth: 52
      },
      slots: {
        default: () => h(BSectionItem, { label: '名称', labelMinWidth: 40 }, () => h('input', { class: 'field-input' }))
      },
      global: {
        stubs: {
          BIcon: true
        }
      }
    });

    expect(wrapper.find('.b-section-item__label').attributes('style') ?? '').toContain('min-width: 40px;');
    wrapper.unmount();
  });

  it('renders label extra content at the end of label area', (): void => {
    const wrapper = mount(BSectionItem, {
      props: {
        label: '列数',
        direction: 'vertical'
      },
      slots: {
        'label-extra': '<button class="mode-switch">自适应</button>',
        default: '<input class="field-input" />'
      },
      global: {
        stubs: {
          BIcon: true
        }
      }
    });

    const label = wrapper.find('.b-section-item__label');
    const labelExtra = label.find('.b-section-item__label-extra');

    expect(label.text()).toContain('列数');
    expect(labelExtra.find('.mode-switch').exists()).toBe(true);
    expect(wrapper.find('.b-section-item__content .mode-switch').exists()).toBe(false);
    wrapper.unmount();
  });
});
