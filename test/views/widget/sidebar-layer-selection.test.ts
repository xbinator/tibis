/**
 * @file sidebar-layer-selection.test.ts
 * @description 验证Widget 页面图层列表点击选择行为。
 * @vitest-environment jsdom
 */
/* eslint-disable vue/one-component-per-file */
import { readFileSync } from 'node:fs';
import { defineComponent } from 'vue';
import type { PropType } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import BDraggable from '@/components/BDraggable/index.vue';
import type { WidgetElement } from '@/components/BWidget/types';
import { createDefaultWidgetElementLoopConfig } from '@/components/BWidget/utils/widgetLoop';
import SidebarLayer from '@/views/widget/components/SidebarLayer.vue';

/** 图层列表组件源码。 */
const sidebarLayerSource = readFileSync('src/views/widget/components/SidebarLayer.vue', 'utf8');

/**
 * 创建测试图层元素。
 * @param id - 元素 ID
 * @param title - 元素名称
 * @returns 测试图层元素
 */
function createLayerElement(id: string, title: string): WidgetElement {
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
    loop: createDefaultWidgetElementLoopConfig(),
    metadata: {}
  };
}

/**
 * 创建测试组合图层元素。
 * @returns 测试组合元素
 */
function createLayerGroupElement(): WidgetElement {
  return {
    ...createLayerElement('group-1', '组合'),
    name: 'group',
    label: '组合',
    icon: 'lucide:group',
    children: [createLayerElement('node-1', '节点 1'), createLayerElement('node-2', '节点 2')]
  };
}

/**
 * 创建包含嵌套组合的测试图层元素。
 * @returns 嵌套组合元素
 */
function createNestedLayerGroupElement(): WidgetElement {
  return {
    ...createLayerElement('group-1', '外层组合'),
    name: 'group',
    label: '组合',
    icon: 'lucide:group',
    children: [
      createLayerElement('node-1', '节点 1'),
      {
        ...createLayerElement('group-2', '内层组合'),
        name: 'group',
        label: '组合',
        icon: 'lucide:group',
        children: [createLayerElement('node-4', '节点 4')]
      }
    ]
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

/**
 * 挂载包含组合图层的图层列表组件。
 * @returns 图层列表包装器
 */
function mountGroupedSidebarLayer(activeElementId: string | null = null): VueWrapper {
  return mount(SidebarLayer, {
    props: {
      elements: [createLayerGroupElement(), createLayerElement('node-3', '节点 3')],
      activeElementId,
      selectedElementIds: ['group-1']
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

/**
 * 挂载包含嵌套组合图层的图层列表组件。
 * @returns 图层列表包装器
 */
function mountNestedGroupedSidebarLayer(): VueWrapper {
  return mount(SidebarLayer, {
    props: {
      elements: [createNestedLayerGroupElement(), createLayerElement('node-3', '节点 3')],
      selectedElementIds: ['group-2']
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

/**
 * 挂载带固定投放预览状态的图层列表组件。
 * @param dropTargetId - 固定展示投放预览的图层 ID
 * @param draggingKey - 当前拖拽源图层 ID
 * @returns 图层列表包装器
 */
function mountDropPreviewSidebarLayer(dropTargetId = 'group-1', draggingKey: string | null = null): VueWrapper {
  return mount(SidebarLayer, {
    props: {
      elements: [createLayerGroupElement(), createLayerElement('node-3', '节点 3')],
      selectedElementIds: []
    },
    global: {
      stubs: {
        BDraggable: defineComponent({
          name: 'BDraggable',
          props: {
            handleClass: {
              type: String,
              default: ''
            },
            list: {
              type: Array as PropType<Array<{ id: string }>>,
              required: true
            }
          },
          setup(): { draggingKey: string | null; dropTargetId: string } {
            return { draggingKey, dropTargetId };
          },
          template: `
            <div class="sidebar-panel__layer-list">
              <template
                v-for="item in list"
                :key="item.id"
              >
                <slot
                  :item="item"
                  :handle-class="handleClass"
                  :dragging-key="draggingKey"
                  :drop-position="item.id === dropTargetId ? 'after' : null"
                ></slot>
              </template>
              <div class="b-draggable__indicator"></div>
            </div>
          `
        }),
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

    expect(wrapper.emitted('select-elements')?.[0]).toEqual([[expect.objectContaining({ id: 'node-1' })]]);
    wrapper.unmount();
  });

  it('renders grouped elements as a group row with child layers', async (): Promise<void> => {
    const wrapper = mountGroupedSidebarLayer();

    expect(wrapper.findAll('.sidebar-panel__layer-item')).toHaveLength(4);
    expect(wrapper.find('.sidebar-panel__layer-group-title').text()).toBe('组合 (2)');
    expect(wrapper.findAll('.sidebar-panel__layer-child .sidebar-panel__layer-title').map((item) => item.text())).toEqual(['节点 2', '节点 1']);
    expect(wrapper.find('.sidebar-panel__layer-item.is-group').classes()).toContain('is-active');
    expect(wrapper.find('.sidebar-panel__layer-item.is-group').classes()).not.toContain('has-group-background');

    await wrapper.find('.sidebar-panel__layer-row.is-group').trigger('click');

    expect(wrapper.emitted('select-elements')?.[0]).toEqual([[expect.objectContaining({ id: 'group-1' })]]);
    wrapper.unmount();
  });

  it('highlights only the active child row inside the selected group', (): void => {
    const wrapper = mountGroupedSidebarLayer('node-2');
    const childRows = wrapper.findAll('.sidebar-panel__layer-child');

    expect(wrapper.find('.sidebar-panel__layer-item.is-group').classes()).toContain('is-active');
    expect(childRows[0].classes()).toContain('is-active');
    expect(childRows[1].classes()).not.toContain('is-active');
    wrapper.unmount();
  });

  it('renders nested group children recursively with normal row actions', async (): Promise<void> => {
    const wrapper = mountNestedGroupedSidebarLayer();
    const titles = wrapper.findAll('.sidebar-panel__layer-title, .sidebar-panel__layer-group-title').map((item) => item.text());
    const nestedGroupRow = wrapper.findAll('.sidebar-panel__layer-row').find((row) => row.text().includes('内层组合'));

    expect(titles).toEqual(['节点 3', '外层组合 (2)', '内层组合 (1)', '节点 4', '节点 1']);
    expect(nestedGroupRow?.classes()).toContain('is-active');
    expect(nestedGroupRow?.classes()).toContain('sidebar-panel__layer-child');
    expect(wrapper.findAll('.sidebar-panel__layer-child .sidebar-panel__layer-drag-handle')).toHaveLength(3);
    expect(wrapper.findAll('.sidebar-panel__layer-child .sidebar-panel__layer-action')).toHaveLength(6);

    const nodeActionButtons = wrapper.findAll('.sidebar-panel__layer-child').at(1)?.findAll('.sidebar-panel__layer-action') ?? [];
    await nodeActionButtons[0]?.trigger('click');
    await nodeActionButtons[1]?.trigger('click');

    expect(wrapper.emitted('copy-elements')?.[0]).toEqual([[expect.objectContaining({ id: 'node-4' })]]);
    expect(wrapper.emitted('delete-elements')?.[0]).toEqual([[expect.objectContaining({ id: 'node-4' })]]);
    wrapper.unmount();
  });

  it('collapses grouped children and keeps child rows aligned with regular layer styles', async (): Promise<void> => {
    const wrapper = mountGroupedSidebarLayer();

    expect(wrapper.findAll('.sidebar-panel__layer-child')).toHaveLength(2);
    expect(wrapper.findAll('.sidebar-panel__layer-child .sidebar-panel__layer-select')).toHaveLength(2);
    expect(sidebarLayerSource).toContain('getLayerRowStyle');

    await wrapper.find('.sidebar-panel__layer-collapse').trigger('click');

    expect(wrapper.findAll('.sidebar-panel__layer-child')).toHaveLength(0);
    wrapper.unmount();
  });

  it('hides collapse placeholders when the current level has no collapsible groups', (): void => {
    const flatWrapper = mountSidebarLayer();
    const groupedWrapper = mountGroupedSidebarLayer();

    expect(flatWrapper.findAll('.sidebar-panel__layer-collapse-placeholder')).toHaveLength(0);
    expect(groupedWrapper.findAll('.sidebar-panel__layer-child .sidebar-panel__layer-collapse-placeholder')).toHaveLength(0);
    expect(groupedWrapper.findAll('.sidebar-panel__layer-collapse-placeholder')).toHaveLength(1);
    flatWrapper.unmount();
    groupedWrapper.unmount();
  });

  it('renders child layer cards with a visible nested offset', (): void => {
    const wrapper = mountGroupedSidebarLayer();
    const childRow = wrapper.find('.sidebar-panel__layer-child');

    expect(childRow.attributes('style')).toContain('margin-left: 16px');
    expect(childRow.attributes('style')).toContain('width: calc(100% - 16px)');
    expect(sidebarLayerSource).not.toContain('.sidebar-panel__layer-row.sidebar-panel__layer-child::before');
    wrapper.unmount();
  });

  it('renders the drop indicator with the target layer depth', (): void => {
    const wrapper = mountDropPreviewSidebarLayer();
    const groupRow = wrapper.find('.sidebar-panel__layer-row.is-group');

    expect(groupRow.classes()).toContain('is-drop-inside');
    expect(groupRow.attributes('style')).toContain('--sidebar-layer-drop-offset: 16px');
    expect(sidebarLayerSource).toContain('getLayerRowClass(entry, dropPosition, draggingKey)');
    expect(sidebarLayerSource).toContain('.sidebar-panel__layer-list :deep(.b-draggable__indicator)');
    expect(sidebarLayerSource).toContain('display: none;');
    wrapper.unmount();
  });

  it('renders the last child after indicator at the parent layer depth', (): void => {
    const wrapper = mountDropPreviewSidebarLayer('node-1', 'node-2');
    const lastChildRow = wrapper.findAll('.sidebar-panel__layer-child').at(1);

    expect(lastChildRow?.classes()).toContain('is-drop-after');
    expect(lastChildRow?.attributes('style')).toContain('--sidebar-layer-drop-offset: -16px');
    wrapper.unmount();
  });

  it('renders an external layer after indicator at the child layer depth', (): void => {
    const wrapper = mountDropPreviewSidebarLayer('node-1', 'node-3');
    const lastChildRow = wrapper.findAll('.sidebar-panel__layer-child').at(1);

    expect(lastChildRow?.classes()).toContain('is-drop-after');
    expect(lastChildRow?.attributes('style')).toContain('--sidebar-layer-drop-offset: 0px');
    wrapper.unmount();
  });

  it('emits an inside move when dropping a layer after a group row', (): void => {
    const wrapper = mountGroupedSidebarLayer();
    const draggable = wrapper.findComponent(BDraggable);
    const sourceItem = {
      id: 'node-3',
      element: createLayerElement('node-3', '节点 3'),
      parentId: null,
      depth: 0,
      isGroup: false,
      childCount: 0
    };
    const targetItem = {
      id: 'group-1',
      element: createLayerGroupElement(),
      parentId: null,
      depth: 0,
      isGroup: true,
      childCount: 2
    };

    draggable.vm.$emit('move', {
      sourceKey: 'node-3',
      targetKey: 'group-1',
      position: 'after',
      sourceItem,
      targetItem,
      sourceIndex: 0,
      targetIndex: 1,
      nextList: []
    });

    expect(wrapper.emitted('move-elements')?.[0]).toEqual([{ sourceIds: ['node-3'], targetIds: ['group-1'], position: 'inside' }]);
    wrapper.unmount();
  });

  it('emits an after move when dropping a layer after a collapsed group row', async (): Promise<void> => {
    const wrapper = mountGroupedSidebarLayer();
    const draggable = wrapper.findComponent(BDraggable);
    const sourceItem = {
      id: 'node-3',
      element: createLayerElement('node-3', '节点 3'),
      parentId: null,
      depth: 0,
      isGroup: false,
      childCount: 0
    };
    const targetItem = {
      id: 'group-1',
      element: createLayerGroupElement(),
      parentId: null,
      depth: 0,
      isGroup: true,
      childCount: 2
    };

    await wrapper.find('.sidebar-panel__layer-collapse').trigger('click');
    draggable.vm.$emit('move', {
      sourceKey: 'node-3',
      targetKey: 'group-1',
      position: 'after',
      sourceItem,
      targetItem,
      sourceIndex: 0,
      targetIndex: 1,
      nextList: []
    });

    expect(wrapper.emitted('move-elements')?.[0]).toEqual([{ sourceIds: ['node-3'], targetIds: ['group-1'], position: 'after' }]);
    wrapper.unmount();
  });

  it('emits an inside move when dropping an external layer before the first child', (): void => {
    const wrapper = mountGroupedSidebarLayer();
    const draggable = wrapper.findComponent(BDraggable);
    const sourceItem = {
      id: 'node-3',
      element: createLayerElement('node-3', '节点 3'),
      parentId: null,
      depth: 0,
      isGroup: false,
      childCount: 0
    };
    const targetItem = {
      id: 'node-2',
      element: createLayerElement('node-2', '节点 2'),
      parentId: 'group-1',
      depth: 1,
      isGroup: false,
      childCount: 0
    };

    draggable.vm.$emit('move', {
      sourceKey: 'node-3',
      targetKey: 'node-2',
      position: 'before',
      sourceItem,
      targetItem,
      sourceIndex: 0,
      targetIndex: 2,
      nextList: []
    });

    expect(wrapper.emitted('move-elements')?.[0]).toEqual([{ sourceIds: ['node-3'], targetIds: ['group-1'], position: 'inside' }]);
    wrapper.unmount();
  });

  it('emits an after-parent move when dropping a child after the last sibling', (): void => {
    const wrapper = mountGroupedSidebarLayer();
    const draggable = wrapper.findComponent(BDraggable);
    const sourceItem = {
      id: 'node-2',
      element: createLayerElement('node-2', '节点 2'),
      parentId: 'group-1',
      depth: 1,
      isGroup: false,
      childCount: 0
    };
    const targetItem = {
      id: 'node-1',
      element: createLayerElement('node-1', '节点 1'),
      parentId: 'group-1',
      depth: 1,
      isGroup: false,
      childCount: 0
    };

    draggable.vm.$emit('move', {
      sourceKey: 'node-2',
      targetKey: 'node-1',
      position: 'after',
      sourceItem,
      targetItem,
      sourceIndex: 2,
      targetIndex: 3,
      nextList: []
    });

    expect(wrapper.emitted('move-elements')?.[0]).toEqual([{ sourceIds: ['node-2'], targetIds: ['group-1'], position: 'after' }]);
    wrapper.unmount();
  });

  it('emits an after-child move when dropping an external layer after the last child', (): void => {
    const wrapper = mountGroupedSidebarLayer();
    const draggable = wrapper.findComponent(BDraggable);
    const sourceItem = {
      id: 'node-3',
      element: createLayerElement('node-3', '节点 3'),
      parentId: null,
      depth: 0,
      isGroup: false,
      childCount: 0
    };
    const targetItem = {
      id: 'node-1',
      element: createLayerElement('node-1', '节点 1'),
      parentId: 'group-1',
      depth: 1,
      isGroup: false,
      childCount: 0
    };

    draggable.vm.$emit('move', {
      sourceKey: 'node-3',
      targetKey: 'node-1',
      position: 'after',
      sourceItem,
      targetItem,
      sourceIndex: 0,
      targetIndex: 3,
      nextList: []
    });

    expect(wrapper.emitted('move-elements')?.[0]).toEqual([{ sourceIds: ['node-3'], targetIds: ['node-1'], position: 'after' }]);
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

    expect(wrapper.emitted('copy-elements')?.[0]).toEqual([[expect.objectContaining({ id: 'node-2' })]]);
    expect(wrapper.emitted('delete-elements')?.[0]).toEqual([[expect.objectContaining({ id: 'node-2' })]]);
    expect(wrapper.emitted('select-elements')).toBeUndefined();
    wrapper.unmount();
  });

  it('shows layer action buttons only when the row is interactive', (): void => {
    expect(sidebarLayerSource).toContain('.sidebar-panel__layer-actions {');
    expect(sidebarLayerSource).toContain('opacity: 0;');
    expect(sidebarLayerSource).toContain('pointer-events: none;');
    expect(sidebarLayerSource).toContain('&:hover .sidebar-panel__layer-actions');
    expect(sidebarLayerSource).toContain('&:focus-within .sidebar-panel__layer-actions');
  });

  it('registers layer rows for dragging and renders insert indicators', (): void => {
    expect(sidebarLayerSource).toContain('<BDraggable');
    expect(sidebarLayerSource).toContain(':item-class="getDraggableItemClass"');
    expect(sidebarLayerSource).toContain('handle-class="sidebar-panel__layer-drag-handle"');
    expect(sidebarLayerSource).toContain('emit-unchanged-move');
    expect(sidebarLayerSource).not.toContain(':ref="itemRef"');
    expect(sidebarLayerSource).not.toContain('v-bind="handleAttrs"');
    expect(sidebarLayerSource).toContain('sidebar-panel__layer-drag-handle');
    expect(sidebarLayerSource).toContain('lucide:grip-vertical');
    expect(sidebarLayerSource).not.toContain('.sidebar-panel__layer-item.is-drop-before::before');
    expect(sidebarLayerSource).not.toContain('.sidebar-panel__layer-item.is-drop-after::after');
    expect(sidebarLayerSource).toContain('&.is-active.is-dragging');
  });
});
