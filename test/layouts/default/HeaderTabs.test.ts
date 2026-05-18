/**
 * @file HeaderTabs.test.ts
 * @description 验证 HeaderTabs 使用独立 overlay 渲染拖拽插入指示线。
 * @vitest-environment jsdom
 */

import { defineComponent, h } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DropdownOption, DropdownOptionItem } from '@/components/BDropdown/type';
import { useTabsStore } from '@/stores/workspace/tabs';

const routerPushMock = vi.fn(async () => undefined);
const confirmMock = vi.fn(async () => [false, false] as [boolean, boolean]);

const dragModuleMock = vi.hoisted(() => ({
  cleanup: vi.fn(),
  registerTabElement: vi.fn(() => () => undefined),
  unregisterTabElement: vi.fn(),
  draggingTabId: { value: null as string | null },
  dropTargetTabId: { value: null as string | null },
  dragInsertPosition: { value: null as 'before' | 'after' | null },
  dropIndicatorOffset: { value: null as number | null }
}));

vi.mock('vue-router', () => ({
  useRoute: () => ({
    fullPath: '/a'
  }),
  useRouter: () => ({
    push: routerPushMock
  })
}));

vi.mock('ant-design-vue', async () => {
  const vue = await import('vue');

  return {
    Dropdown: vue.defineComponent({
      name: 'DropdownStub',
      props: {
        open: {
          type: Boolean,
          default: false
        }
      },
      emits: ['openChange'],
      setup(props, { emit, slots }) {
        return () =>
          vue.h('div', { class: 'dropdown-stub' }, [
            vue.h(
              'div',
              {
                class: 'dropdown-stub__trigger',
                onContextmenu: (event: MouseEvent) => {
                  event.preventDefault();
                  emit('openChange', true);
                }
              },
              slots.default?.()
            ),
            props.open ? vue.h('div', { class: 'dropdown-stub__overlay' }, slots.overlay?.()) : null
          ]);
      }
    })
  };
});

vi.mock('@/layouts/default/hooks/useTabDragger', () => ({
  useTabDragger: () => ({
    cleanup: dragModuleMock.cleanup,
    registerTabElement: dragModuleMock.registerTabElement,
    unregisterTabElement: dragModuleMock.unregisterTabElement,
    state: {
      draggingTabId: dragModuleMock.draggingTabId,
      dropTargetTabId: dragModuleMock.dropTargetTabId,
      dragInsertPosition: dragModuleMock.dragInsertPosition,
      dropIndicatorOffset: dragModuleMock.dropIndicatorOffset
    }
  })
}));

vi.mock('@/utils/modal', () => ({
  Modal: {
    confirm: confirmMock
  }
}));

/**
 * 挂载 HeaderTabs，并提供最小 store 状态。
 * @returns HeaderTabs 组件包装器
 */
async function mountHeaderTabs() {
  const { default: HeaderTabs } = await import('@/layouts/default/components/HeaderTabs.vue');
  const pinia = createPinia();
  setActivePinia(pinia);
  const tabsStore = useTabsStore();
  tabsStore.tabs = [
    { id: 'tab-1', path: '/a', title: 'A' },
    { id: 'tab-2', path: '/b', title: 'B' }
  ];
  const wrapper = mount(HeaderTabs, {
    attachTo: document.body,
    global: {
      plugins: [pinia],
      stubs: {
        BDropdownMenu: defineComponent({
          name: 'BDropdownMenuStub',
          props: {
            options: {
              type: Array as () => DropdownOption[],
              required: true
            }
          },
          setup(props) {
            /**
             * 判断当前选项是否为可点击项。
             * @param option - 菜单选项
             * @returns 是否为普通菜单项
             */
            function isItem(option: DropdownOption): option is DropdownOptionItem {
              return option.type !== 'divider';
            }

            return () =>
              h(
                'div',
                { class: 'b-dropdown-menu' },
                props.options.map((option, index) => {
                  if (!isItem(option)) {
                    return h('div', { key: `divider-${index}`, class: 'b-dropdown-menu-item-divider' });
                  }

                  return h(
                    'div',
                    {
                      key: `item-${index}`,
                      class: 'b-dropdown-menu-item',
                      onClick: () => option.onClick?.()
                    },
                    option.label
                  );
                })
              );
          }
        })
      }
    }
  });
  await wrapper.vm.$nextTick();
  return wrapper;
}

describe('HeaderTabs', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useRealTimers();
    setActivePinia(createPinia());
    routerPushMock.mockReset();
    confirmMock.mockReset();
    confirmMock.mockResolvedValue([false, false]);
    dragModuleMock.cleanup.mockReset();
    dragModuleMock.registerTabElement.mockClear();
    dragModuleMock.unregisterTabElement.mockClear();
    dragModuleMock.draggingTabId.value = null;
    dragModuleMock.dropTargetTabId.value = null;
    dragModuleMock.dragInsertPosition.value = null;
    dragModuleMock.dropIndicatorOffset.value = null;
  });

  it('renders a drop indicator overlay at the first insertion position', async () => {
    dragModuleMock.dropIndicatorOffset.value = 0;
    const wrapper = await mountHeaderTabs();

    const indicator = wrapper.find('.header-tabs__drop-indicator');
    expect(indicator.exists()).toBe(true);
    expect(indicator.attributes('style')).toContain('left: 0px;');
    wrapper.unmount();
  });

  it('renders a drop indicator overlay after the last tab when dragging in the right overflow area', async () => {
    dragModuleMock.dropIndicatorOffset.value = 200;
    const wrapper = await mountHeaderTabs();

    const indicator = wrapper.find('.header-tabs__drop-indicator');
    expect(indicator.exists()).toBe(true);
    expect(indicator.attributes('style')).toContain('left: 199px;');
    wrapper.unmount();
  });

  it('uses the close button path to close the last tab without disabling the action', async () => {
    const wrapper = await mountHeaderTabs();
    const tabsStore = useTabsStore();
    tabsStore.tabs = [{ id: 'tab-1', path: '/a', title: 'A', cacheKey: 'cache:a' }];
    await wrapper.vm.$nextTick();

    await wrapper.find('.header-tab__close').trigger('click');

    expect(tabsStore.tabs).toEqual([]);
    expect(routerPushMock).toHaveBeenCalledWith('/welcome');
    wrapper.unmount();
  });

  it('confirms before context close when the target tab is dirty', async () => {
    const wrapper = await mountHeaderTabs();
    const tabsStore = useTabsStore();
    tabsStore.setDirty('tab-2');
    await wrapper.vm.$nextTick();

    await wrapper.findAll('.dropdown-stub__trigger')[1]?.trigger('contextmenu');
    await wrapper.vm.$nextTick();

    const menuItems = wrapper.findAll('.dropdown-stub')[1]?.findAll('.b-dropdown-menu-item') ?? [];
    const closeItem = menuItems.find((item) => item.text().trim() === '关闭');
    expect(closeItem).toBeTruthy();

    await closeItem!.trigger('click');

    expect(confirmMock).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it('closes saved tabs from the context menu without asking for confirmation', async () => {
    const wrapper = await mountHeaderTabs();
    const tabsStore = useTabsStore();
    tabsStore.setDirty('tab-2');
    await wrapper.vm.$nextTick();

    await wrapper.findAll('.dropdown-stub__trigger')[1]?.trigger('contextmenu');
    await wrapper.vm.$nextTick();

    const closeSavedItem = wrapper
      .findAll('.dropdown-stub')[1]
      ?.findAll('.b-dropdown-menu-item')
      .find((item) => item.text().trim() === '关闭已保存');
    expect(closeSavedItem).toBeTruthy();

    await closeSavedItem!.trigger('click');

    expect(confirmMock).not.toHaveBeenCalled();
    expect(tabsStore.tabs.map((tab) => tab.id)).toEqual(['tab-2']);
    wrapper.unmount();
  });

  it('keeps only one context menu open at a time', async () => {
    const wrapper = await mountHeaderTabs();
    const dropdowns = wrapper.findAll('.dropdown-stub__trigger');

    await dropdowns[0]?.trigger('contextmenu');
    await wrapper.vm.$nextTick();

    expect(wrapper.findAll('.dropdown-stub__overlay')).toHaveLength(1);
    expect(wrapper.findAll('.dropdown-stub')[0]?.find('.dropdown-stub__overlay').exists()).toBe(true);
    expect(wrapper.findAll('.dropdown-stub')[1]?.find('.dropdown-stub__overlay').exists()).toBe(false);

    wrapper.unmount();
  });

  it('waits for the first menu close animation before opening the second menu', async () => {
    vi.useFakeTimers();
    const wrapper = await mountHeaderTabs();
    const dropdowns = wrapper.findAll('.dropdown-stub__trigger');

    await dropdowns[0]?.trigger('contextmenu');
    await wrapper.vm.$nextTick();

    expect(wrapper.findAll('.dropdown-stub')[0]?.find('.dropdown-stub__overlay').exists()).toBe(true);

    await dropdowns[1]?.trigger('contextmenu');
    await wrapper.vm.$nextTick();

    expect(wrapper.findAll('.dropdown-stub__overlay')).toHaveLength(0);

    vi.advanceTimersByTime(200);
    await wrapper.vm.$nextTick();

    expect(wrapper.findAll('.dropdown-stub__overlay')).toHaveLength(1);
    expect(wrapper.findAll('.dropdown-stub')[0]?.find('.dropdown-stub__overlay').exists()).toBe(false);
    expect(wrapper.findAll('.dropdown-stub')[1]?.find('.dropdown-stub__overlay').exists()).toBe(true);

    wrapper.unmount();
  });
});
