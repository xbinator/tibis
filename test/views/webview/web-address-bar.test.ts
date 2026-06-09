/**
 * @file web-address-bar.test.ts
 * @description 验证 WebView 地址栏调试按钮事件。
 * @vitest-environment jsdom
 */
import { defineComponent } from 'vue';
import { shallowMount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import AddressBar from '@/views/webview/web/components/AddressBar.vue';

/**
 * BButton 测试替身，保留 tooltip 与 icon 这类可检索属性。
 */
const BButtonStub = defineComponent({
  name: 'BButton',
  props: {
    /** 按钮提示文案。 */
    tooltip: {
      type: String,
      default: ''
    },
    /** 按钮图标名。 */
    icon: {
      type: String,
      default: ''
    }
  },
  emits: ['click'],
  template: '<button type="button" :data-tooltip="tooltip" :data-icon="icon" @click="$emit(\'click\')"><slot /></button>'
});

/**
 * 挂载 WebView 地址栏。
 * @returns 地址栏包装器
 */
function mountAddressBar(): ReturnType<typeof shallowMount> {
  return shallowMount(AddressBar, {
    props: {
      url: 'https://example.com'
    },
    global: {
      stubs: {
        BButton: BButtonStub,
        BDropdown: true,
        BDropdownMenu: true,
        BIcon: true
      }
    }
  });
}

describe('webview web AddressBar', () => {
  it('emits openDevTools when debug button is clicked', async (): Promise<void> => {
    const wrapper = mountAddressBar();
    const debugButton = wrapper.find('[data-tooltip="打开开发者工具"]');

    expect(debugButton.exists()).toBe(true);

    await debugButton.trigger('click');

    expect(wrapper.emitted('openDevTools')).toHaveLength(1);
  });
});
