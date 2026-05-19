/**
 * @file index.test.ts
 * @description BSuspense 元件测试
 */
/* @vitest-environment jsdom */

import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import BSuspense from '@/components/BSuspense/index.vue';

describe('BSuspense', () => {
  it('active 为 true 时渲染默认插槽内容', () => {
    const wrapper = mount(BSuspense, {
      props: { active: true },
      slots: { default: '<div class="child">content</div>' }
    });

    expect(wrapper.find('.child').exists()).toBe(true);
  });

  it('active 为 false 时不渲染默认插槽内容', () => {
    const wrapper = mount(BSuspense, {
      props: { active: false },
      slots: { default: '<div class="child">content</div>' }
    });

    expect(wrapper.find('.child').exists()).toBe(false);
  });

  it('active 从 false 切换到 true 时挂载默认插槽', async () => {
    const wrapper = mount(BSuspense, {
      props: { active: false },
      slots: { default: '<div class="child">content</div>' }
    });

    expect(wrapper.find('.child').exists()).toBe(false);

    await wrapper.setProps({ active: true });

    expect(wrapper.find('.child').exists()).toBe(true);
  });

  it('active 为 false 时渲染 skeleton 插槽', () => {
    const wrapper = mount(BSuspense, {
      props: { active: false },
      slots: {
        default: '<div class="child">content</div>',
        skeleton: '<div class="skeleton">loading...</div>'
      }
    });

    expect(wrapper.find('.skeleton').exists()).toBe(true);
  });

  it('active 为 true 且 transition 非空时渲染默认插槽', () => {
    const wrapper = mount(BSuspense, {
      props: { active: true, transition: 'fade' },
      slots: { default: '<div class="child">content</div>' }
    });

    expect(wrapper.find('.child').exists()).toBe(true);
  });

  it('通过 class 属性透传到根元素', () => {
    const wrapper = mount(BSuspense, {
      props: { active: true },
      attrs: { class: 'external-class' },
      slots: { default: '<div>content</div>' }
    });

    expect(wrapper.classes()).toContain('external-class');
  });

  it('minHeight 数字形式在 active 为 false 时生效', () => {
    const wrapper = mount(BSuspense, {
      props: { active: false, minHeight: 200 }
    });

    expect(wrapper.attributes('style')).toContain('min-height: 200px');
  });

  it('minHeight 字符串形式在 active 为 false 时生效', () => {
    const wrapper = mount(BSuspense, {
      props: { active: false, minHeight: '50vh' }
    });

    expect(wrapper.attributes('style')).toContain('min-height: 50vh');
  });
});
