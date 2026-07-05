/**
 * @file panel-sidebar.test.ts
 * @description 验证Widget 页面左侧侧栏 tab 默认展示与 splitter 折叠交互。
 * @vitest-environment jsdom
 */
/* eslint-disable vue/one-component-per-file */
import { defineComponent } from 'vue';
import { mount, VueWrapper } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import type { WidgetElement } from '@/components/BWidget/types';
import PanelSidebar from '@/views/widget/components/PanelSidebar.vue';

/**
 * BPanelSplitter 测试替身。
 */
const BPanelSplitterStub = defineComponent({
  name: 'BPanelSplitter',
  props: {
    size: {
      type: Number,
      required: true
    }
  },
  emits: ['update:size'],
  template: '<section class="panel-splitter-stub" :data-size="size"><slot /></section>'
});

/**
 * BButton 测试替身。
 */
const BButtonStub = defineComponent({
  name: 'BButton',
  props: {
    icon: {
      type: String,
      default: ''
    },
    type: {
      type: String,
      default: 'primary'
    }
  },
  emits: ['click'],
  template: '<button class="button-stub" :data-icon="icon" :data-type="type" @click="$emit(\'click\')"><slot /></button>'
});

/**
 * SidebarTools 测试替身。
 */
const SidebarToolsStub = defineComponent({
  name: 'SidebarTools',
  template: '<div class="sidebar-tools-stub">组件</div>'
});

/**
 * SidebarLayer 测试替身。
 */
const SidebarLayerStub = defineComponent({
  name: 'SidebarLayer',
  template: '<div class="sidebar-layer-stub">图层</div>'
});

/**
 * 挂载左侧侧栏。
 * @returns 左侧侧栏包装器
 */
function mountPanelSidebar(): VueWrapper {
  return mount(PanelSidebar, {
    props: {
      elements: [] as WidgetElement[]
    },
    global: {
      stubs: {
        BButton: BButtonStub,
        BPanelSplitter: BPanelSplitterStub,
        SidebarLayer: SidebarLayerStub,
        SidebarTools: SidebarToolsStub
      }
    }
  });
}

describe('PanelSidebar', (): void => {
  it('shows the tools tab by default instead of an empty expanded panel', (): void => {
    const wrapper = mountPanelSidebar();

    expect(wrapper.find('.sidebar-tools-stub').exists()).toBe(true);
    expect(wrapper.find('.panel-splitter-stub').attributes('data-size')).toBe('240');
    expect(wrapper.find('[data-icon="lucide:box"]').attributes('data-type')).toBe('secondary');

    wrapper.unmount();
  });
});
