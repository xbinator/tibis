/**
 * @file quickActions.test.ts
 * @description QuickActions 快捷操作菜单测试，验证导出 PDF 菜单项会触发对应事件。
 */
/* @vitest-environment jsdom */

import { defineComponent } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import QuickActions from '@/components/BEditor/shared/QuickActions.vue';

/**
 * 下拉菜单桩组件。
 * 通过渲染按钮模拟菜单项点击，便于验证 option.onClick 行为。
 */
const DropdownMenuStub = defineComponent({
  name: 'BDropdownMenu',
  props: {
    options: {
      type: Array,
      required: true
    }
  },
  template: `
    <div class="dropdown-menu-stub">
      <button
        v-for="option in options.filter((item) => item.type !== 'divider')"
        :key="option.value"
        type="button"
        :data-option-value="option.value"
        @click="option.onClick?.()"
      >
        {{ option.label }}
      </button>
    </div>
  `
});

/**
 * 挂载 QuickActions 组件。
 * @returns 组件挂载结果
 */
function mountQuickActions(): VueWrapper<InstanceType<typeof QuickActions>> {
  return mount(QuickActions, {
    props: {
      filePath: '/tmp/demo.md',
      showOutline: false,
      'onUpdate:showOutline': () => {
        // noop
      }
    },
    global: {
      stubs: {
        BDropdown: {
          name: 'BDropdown',
          template: '<div class="dropdown-stub"><slot /><slot name="overlay" /></div>'
        },
        BButton: {
          name: 'BButton',
          template: '<button type="button"><slot /></button>'
        },
        BDropdownMenu: DropdownMenuStub,
        Icon: true
      }
    }
  });
}

describe('QuickActions', () => {
  it('emits export-pdf when export action is clicked', async () => {
    const wrapper = mountQuickActions();

    await wrapper.get('[data-option-value="export-pdf"]').trigger('click');

    expect(wrapper.emitted('export-pdf')).toHaveLength(1);
  });
});
