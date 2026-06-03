/**
 * @file AddressBar.test.ts
 * @description 验证 WebView 地址栏更多菜单事件与图标渲染。
 * @vitest-environment jsdom
 */
import { defineComponent } from 'vue';
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import type { DropdownOption } from '@/components/BDropdown/type';
import AddressBar from '@/views/webview/web/components/AddressBar.vue';

vi.mock('@/hooks/useClipboard', () => ({
  useClipboard: () => ({
    clipboard: vi.fn()
  })
}));

/**
 * 地址栏更多菜单桩组件。
 */
const DropdownMenuStub = defineComponent({
  name: 'BDropdownMenuStub',
  props: {
    options: {
      type: Array as () => DropdownOption[],
      required: true
    }
  },
  setup(props) {
    /**
     * 过滤普通菜单项，跳过分割线。
     */
    const menuItems = props.options.filter((option) => option.type !== 'divider');

    return {
      menuItems
    };
  },
  template: `
    <div class="dropdown-menu-stub">
      <button
        v-for="option in menuItems"
        :key="option.value"
        class="dropdown-menu-item"
        :data-value="option.value"
        @click="option.onClick?.()"
      >
        {{ option.label }}
      </button>
    </div>
  `
});

describe('AddressBar', () => {
  it('renders both the more actions button and the open-in-browser button', () => {
    const wrapper = mount(AddressBar, {
      props: {
        url: 'https://example.com'
      },
      global: {
        stubs: {
          BButton: {
            template: '<button :data-icon="icon" @click="$emit(\'click\')"><slot /></button>',
            props: ['icon', 'tooltip', 'type', 'size', 'square', 'disabled', 'placement']
          },
          BIcon: {
            template: '<i class="icon-stub" @click="$emit(\'click\')" />',
            props: ['icon']
          },
          BDropdown: {
            template: '<div class="dropdown-stub"><slot /><slot name="overlay" /></div>',
            props: ['placement']
          },
          BDropdownMenu: DropdownMenuStub
        }
      }
    });

    const icons = wrapper.findAll('button').map((button) => button.attributes('data-icon'));

    expect(icons).toContain('lucide:more-vertical');
    expect(icons).toContain('lucide:external-link');
  });

  it('emits screenshot and cache actions from the more actions menu', async () => {
    const wrapper = mount(AddressBar, {
      props: {
        url: 'https://example.com'
      },
      global: {
        stubs: {
          BButton: {
            template: '<button :data-icon="icon" @click="$emit(\'click\')"><slot /></button>',
            props: ['icon', 'tooltip', 'type', 'size', 'square', 'disabled', 'placement']
          },
          BIcon: {
            template: '<i class="icon-stub" @click="$emit(\'click\')" />',
            props: ['icon']
          },
          BDropdown: {
            template: '<div class="dropdown-stub"><slot /><slot name="overlay" /></div>',
            props: ['placement']
          },
          BDropdownMenu: DropdownMenuStub
        }
      }
    });

    await wrapper.get('[data-value="capture-viewport"]').trigger('click');
    await wrapper.get('[data-value="capture-full-page"]').trigger('click');
    await wrapper.get('[data-value="clear-cache"]').trigger('click');

    expect(wrapper.emitted('captureViewportScreenshot')).toEqual([[]]);
    expect(wrapper.emitted('captureFullPageScreenshot')).toEqual([[]]);
    expect(wrapper.emitted('clearCache')).toEqual([[]]);
  });
});
