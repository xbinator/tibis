/**
 * @file block.test.ts
 * @description 验证 BSectionBlock 标题、帮助位和扩展操作区布局。
 * @vitest-environment jsdom
 */
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import BSectionBlock from '@/components/BSection/Block.vue';

describe('BSectionBlock', (): void => {
  it('renders help content beside the title while keeping extra actions separate', (): void => {
    const wrapper = mount(BSectionBlock, {
      props: {
        title: '入参'
      },
      slots: {
        help: '<span class="help-icon">?</span>',
        extra: '<button class="edit-button">编辑</button>'
      },
      global: {
        stubs: {
          BIcon: true
        }
      }
    });

    const titleGroup = wrapper.find('.b-section-block__title-group');

    expect(titleGroup.find('.b-section-block__title').text()).toBe('入参');
    expect(titleGroup.find('.help-icon').exists()).toBe(true);
    expect(wrapper.find('.b-section-block__extra .edit-button').exists()).toBe(true);
    expect(wrapper.find('.b-section-block__extra .help-icon').exists()).toBe(false);
    wrapper.unmount();
  });
});
