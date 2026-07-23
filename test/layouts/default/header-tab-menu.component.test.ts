/**
 * @file header-tab-menu.component.test.ts
 * @description HeaderTabMenu 单例右键菜单交互测试。
 * @vitest-environment jsdom
 */
import { readFileSync } from 'node:fs';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import HeaderTabMenu from '@/layouts/default/components/HeaderTabMenu.vue';

const headerTabMenuSource = readFileSync('src/layouts/default/components/HeaderTabMenu.vue', 'utf8');

/**
 * 挂载 HeaderTabMenu。
 * @returns 菜单包装器
 */
function mountMenu(): ReturnType<typeof mount> {
  return mount(HeaderTabMenu, {
    props: {
      open: true,
      position: { x: 80, y: 120 },
      items: [
        { key: 'close', label: '关闭' },
        { key: 'closeRight', label: '关闭右侧', disabled: true },
        { type: 'divider', key: 'resource-divider' },
        { key: 'copyAddress', label: '复制地址' }
      ]
    },
    attachTo: document.body
  });
}

describe('HeaderTabMenu', (): void => {
  it('emits select when an enabled menu item is clicked', async (): Promise<void> => {
    const wrapper = mountMenu();

    await wrapper.findAll('.header-tab-menu__item')[0]?.trigger('click');

    expect(wrapper.emitted('select')?.[0]).toEqual(['close']);
    wrapper.unmount();
  });

  it('renders menu text without item icons', (): void => {
    const wrapper = mountMenu();

    expect(wrapper.find('.header-tab-menu__icon').exists()).toBe(false);
    expect(wrapper.find('.icon-stub').exists()).toBe(false);
    wrapper.unmount();
  });

  it('does not emit select when a disabled menu item is clicked', async (): Promise<void> => {
    const wrapper = mountMenu();

    await wrapper.findAll('.header-tab-menu__item')[1]?.trigger('click');

    expect(wrapper.emitted('select')).toBeUndefined();
    wrapper.unmount();
  });

  it('emits close when Escape is pressed', async (): Promise<void> => {
    const wrapper = mountMenu();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(wrapper.emitted('close')).toHaveLength(1);
    wrapper.unmount();
  });

  it('does not render when closed', (): void => {
    const wrapper = mount(HeaderTabMenu, {
      props: {
        open: false,
        position: { x: 0, y: 0 },
        items: []
      }
    });

    expect(wrapper.find('.header-tab-menu').exists()).toBe(false);
  });

  it('animates entry without transitioning menu coordinates', (): void => {
    expect(headerTabMenuSource).toContain('animation: header-tab-menu-enter');
    expect(headerTabMenuSource).not.toMatch(/transition[^;{]*(left|top)/u);
  });
});
