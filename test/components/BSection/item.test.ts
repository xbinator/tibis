/**
 * @file item.test.ts
 * @description 验证 BSectionItem 前缀区域的布局配置。
 * @vitest-environment jsdom
 */
import { h } from 'vue';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import BSectionBlock from '@/components/BSection/Block.vue';
import BSectionItem from '@/components/BSection/Item.vue';

describe('BSectionItem', (): void => {
  it('applies numeric prefix min width as px to text prefix', (): void => {
    const wrapper = mount(BSectionItem, {
      props: {
        label: '宽',
        prefixMinWidth: 36
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

    expect(wrapper.find('.b-section-item__prefix').attributes('style') ?? '').toContain('min-width: 36px;');
    wrapper.unmount();
  });

  it('applies string prefix min width to icon prefix', (): void => {
    const wrapper = mount(BSectionItem, {
      props: {
        icon: 'lucide:type',
        prefixMinWidth: '2.5em'
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

    expect(wrapper.find('.b-section-item__prefix').attributes('style') ?? '').toContain('min-width: 2.5em;');
    wrapper.unmount();
  });

  it('applies numeric string prefix min width as px', (): void => {
    const wrapper = mount(BSectionItem, {
      props: {
        label: '名称',
        prefixMinWidth: '48'
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

    expect(wrapper.find('.b-section-item__prefix').attributes('style') ?? '').toContain('min-width: 48px;');
    wrapper.unmount();
  });

  it('uses prefix min width provided by parent block', (): void => {
    const wrapper = mount(BSectionBlock, {
      props: {
        title: '属性',
        prefixMinWidth: 52
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

    expect(wrapper.find('.b-section-item__prefix').attributes('style') ?? '').toContain('min-width: 52px;');
    wrapper.unmount();
  });

  it('prefers item prefix min width over parent block value', (): void => {
    const wrapper = mount(BSectionBlock, {
      props: {
        title: '属性',
        prefixMinWidth: 52
      },
      slots: {
        default: () => h(BSectionItem, { label: '名称', prefixMinWidth: 40 }, () => h('input', { class: 'field-input' }))
      },
      global: {
        stubs: {
          BIcon: true
        }
      }
    });

    expect(wrapper.find('.b-section-item__prefix').attributes('style') ?? '').toContain('min-width: 40px;');
    wrapper.unmount();
  });
});
