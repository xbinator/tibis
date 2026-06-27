/**
 * @file sidebar-layer-selection.test.ts
 * @description 验证画图页面图层列表点击选择行为。
 * @vitest-environment jsdom
 */
import { readFileSync } from 'node:fs';
import { defineComponent } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import BDraggable from '@/components/BDraggable/index.vue';
import type { DrawingElement } from '@/components/BDrawing/types';
import SidebarLayer from '@/views/drawing/components/SidebarLayer.vue';

/** 图层列表组件源码。 */
const sidebarLayerSource = readFileSync('src/views/drawing/components/SidebarLayer.vue', 'utf8');

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
      components: {
        BDraggable
      },
      stubs: {
        BButton: defineComponent({
          name: 'BButton',
          props: {
            danger: {
              type: Boolean,
              default: false
            },
            icon: {
              type: String,
              default: ''
            }
          },
          emits: ['click'],
          template: '<button type="button" :class="$attrs.class" :data-danger="String(danger)" :data-icon="icon" @click="$emit(\'click\', $event)"></button>'
        }),
        BIcon: true
      }
    }
  });
}

describe('SidebarLayer selection', (): void => {
  it('emits the clicked layer element and keeps selected item highlighted', async (): Promise<void> => {
    const wrapper = mountSidebarLayer();
    const layerItems = wrapper.findAll('.sidebar-panel__layer-item');

    expect(layerItems.map((item) => item.text())).toEqual(['节点 2', '节点 1']);
    expect(layerItems[0].classes()).toContain('is-active');

    await layerItems[1].trigger('click');

    expect(wrapper.emitted('select-element')?.[0]).toEqual([expect.objectContaining({ id: 'node-1' })]);
    wrapper.unmount();
  });

  it('emits copy and delete actions without selecting the layer row', async (): Promise<void> => {
    const wrapper = mountSidebarLayer();
    const actionButtons = wrapper.findAll('.sidebar-panel__layer-action');

    expect(actionButtons[0].attributes('data-icon')).toBe('lucide:copy');
    expect(actionButtons[1].attributes('data-icon')).toBe('lucide:trash-2');
    expect(actionButtons[1].attributes('data-danger')).toBe('true');

    await actionButtons[0].trigger('click');
    await actionButtons[1].trigger('click');

    expect(wrapper.emitted('copy-element')?.[0]).toEqual([expect.objectContaining({ id: 'node-2' })]);
    expect(wrapper.emitted('delete-element')?.[0]).toEqual([expect.objectContaining({ id: 'node-2' })]);
    expect(wrapper.emitted('select-element')).toBeUndefined();
    wrapper.unmount();
  });

  it('shows layer action buttons only when the row is interactive', (): void => {
    expect(sidebarLayerSource).toContain('.sidebar-panel__layer-actions {');
    expect(sidebarLayerSource).toContain('opacity: 0;');
    expect(sidebarLayerSource).toContain('pointer-events: none;');
    expect(sidebarLayerSource).toContain('.sidebar-panel__layer-item:hover .sidebar-panel__layer-actions');
    expect(sidebarLayerSource).toContain('.sidebar-panel__layer-item:focus-within .sidebar-panel__layer-actions');
  });

  it('registers layer rows for dragging and renders insert indicators', (): void => {
    expect(sidebarLayerSource).toContain('<BDraggable');
    expect(sidebarLayerSource).toContain(':item-class="getDraggableItemClass"');
    expect(sidebarLayerSource).toContain('handle-class="sidebar-panel__layer-drag-handle"');
    expect(sidebarLayerSource).not.toContain(':ref="itemRef"');
    expect(sidebarLayerSource).not.toContain('v-bind="handleAttrs"');
    expect(sidebarLayerSource).toContain('sidebar-panel__layer-drag-handle');
    expect(sidebarLayerSource).toContain('lucide:grip-vertical');
    expect(sidebarLayerSource).not.toContain('.sidebar-panel__layer-item.is-drop-before::before');
    expect(sidebarLayerSource).not.toContain('.sidebar-panel__layer-item.is-drop-after::after');
    expect(sidebarLayerSource).toContain('.sidebar-panel__layer-item.is-active.is-dragging');
  });
});
