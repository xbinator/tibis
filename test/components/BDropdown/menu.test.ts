/**
 * @file menu.test.ts
 * @description BDropdownMenu 默认菜单项内容渲染测试。
 * @vitest-environment jsdom
 */
import { defineComponent } from 'vue';
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import BDropdownMenu from '@/components/BDropdown/Menu.vue';

vi.mock('@/components/BTruncateText/index.vue', () => ({
  default: {
    name: 'BTruncateText',
    props: {
      text: { type: String, default: '' }
    },
    template: '<span class="truncate-text-stub">{{ text }}</span>'
  }
}));

/** 图标测试替身，用于读取默认菜单渲染传递的图标属性。 */
const BIconStub = defineComponent({
  name: 'BIcon',
  props: {
    icon: { type: String, required: true },
    size: { type: Number, default: undefined }
  },
  template: '<i class="icon-stub" :data-icon="icon" :data-size="size"></i>'
});

/**
 * 挂载使用默认菜单项渲染器的下拉菜单。
 * @returns 下拉菜单组件包装器
 */
function mountMenu(): ReturnType<typeof mount> {
  return mount(BDropdownMenu, {
    props: {
      options: [
        {
          value: 'edit',
          label: '编辑',
          icon: 'lucide:pencil',
          iconSize: 18
        }
      ]
    },
    global: {
      stubs: {
        BIcon: BIconStub
      }
    }
  });
}

describe('BDropdownMenu', (): void => {
  it('renders the configured icon and size in the default menu item', (): void => {
    const wrapper = mountMenu();
    const icon = wrapper.findComponent(BIconStub);

    expect(icon.exists()).toBe(true);
    expect(icon.props()).toMatchObject({
      icon: 'lucide:pencil',
      size: 18
    });
    expect(wrapper.text()).toContain('编辑');
  });
});
