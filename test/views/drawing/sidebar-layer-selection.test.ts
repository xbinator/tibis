/**
 * @file sidebar-layer-selection.test.ts
 * @description 验证画图页面图层列表点击选择行为。
 * @vitest-environment jsdom
 */
import { mount, type VueWrapper } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import type { DrawingElement } from '@/components/BDrawing/types';
import SidebarLayer from '@/views/drawing/components/SidebarLayer.vue';

/**
 * 创建测试图层元素。
 * @param id - 元素 ID
 * @param title - 元素名称
 * @returns 测试图层元素
 */
function createLayerElement(id: string, title: string): DrawingElement {
  return {
    id,
    name: 'rect',
    label: '矩形',
    icon: 'lucide:square',
    title,
    position: { x: 0, y: 0 },
    size: { width: 120, height: 80 },
    rotation: 0,
    style: {},
    metadata: {}
  };
}

/**
 * 挂载图层列表组件。
 * @returns 图层列表包装器
 */
function mountSidebarLayer(): VueWrapper {
  return mount(SidebarLayer, {
    props: {
      elements: [createLayerElement('node-1', '节点 1'), createLayerElement('node-2', '节点 2')],
      selectedElementIds: ['node-2']
    },
    global: {
      stubs: {
        BIcon: true
      }
    }
  });
}

describe('SidebarLayer selection', (): void => {
  it('emits the clicked layer element and keeps selected item highlighted', async (): Promise<void> => {
    const wrapper = mountSidebarLayer();
    const layerItems = wrapper.findAll('.sidebar-panel__layer-item');

    expect(layerItems[1].classes()).toContain('is-active');

    await layerItems[0].trigger('click');

    expect(wrapper.emitted('select-element')?.[0]).toEqual([expect.objectContaining({ id: 'node-1' })]);
    wrapper.unmount();
  });
});
