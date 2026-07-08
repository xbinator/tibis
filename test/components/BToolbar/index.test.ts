/**
 * @file index.test.ts
 * @description 验证 BToolbar 菜单选中占位列的渲染条件。
 * @vitest-environment jsdom
 */
import { defineComponent, h, type PropType, type VNode } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import BToolbar from '@/components/BToolbar/index.vue';
import type { ToolbarOption, ToolbarOptions } from '@/components/BToolbar/types';

/** BDropdownButton 测试替身，用于直接渲染 menu 插槽内容。 */
const DropdownButtonStub = defineComponent({
  name: 'BDropdownButton',
  props: {
    options: {
      type: Array as PropType<ToolbarOptions>,
      default: (): ToolbarOptions => []
    }
  },
  setup(props, { slots }): () => VNode {
    return (): VNode =>
      h('div', { class: 'dropdown-button-stub' }, [
        h('div', { class: 'dropdown-button-stub__trigger' }, slots.default ? slots.default() : []),
        h(
          'div',
          { class: 'dropdown-button-stub__menu' },
          props.options
            .filter((option): option is ToolbarOption => option.type !== 'divider')
            .map(
              (record: ToolbarOption, index: number): VNode =>
                h('div', { class: 'dropdown-button-stub__item', key: `${record.value}-${index}` }, slots.menu ? slots.menu({ record }) : [])
            )
        )
      ]);
  }
});

/**
 * 挂载 BToolbar 组件。
 * @param props - 工具栏 props
 * @returns Vue Test Utils 包装器
 */
function mountToolbar(props: { showSelectedCheck?: boolean; options: ToolbarOptions }): VueWrapper {
  return mount(BToolbar, {
    props: {
      title: '视图',
      ...props
    },
    global: {
      stubs: {
        BDropdownButton: DropdownButtonStub,
        BIcon: {
          name: 'BIcon',
          props: ['icon'],
          template: '<i class="b-icon-stub" :data-icon="icon" />'
        },
        BTruncateText: {
          name: 'BTruncateText',
          props: ['text'],
          template: '<span class="b-truncate-text-stub">{{ text }}</span>'
        }
      }
    }
  });
}

describe('BToolbar', (): void => {
  it('showSelectedCheck 为 true 但没有 selected 项时不渲染勾选占位列', (): void => {
    const wrapper = mountToolbar({
      showSelectedCheck: true,
      options: [
        { value: 'source', label: '源码模式' },
        { value: 'preview', label: '预览模式' }
      ]
    });

    expect(wrapper.find('.toolbar-menu-item-check').exists()).toBe(false);
  });
});
