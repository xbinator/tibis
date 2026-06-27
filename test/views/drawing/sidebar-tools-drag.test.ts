/**
 * @file sidebar-tools-drag.test.ts
 * @description 验证画图侧栏工具使用公共拖拽创建能力。
 * @vitest-environment jsdom
 */
import { defineComponent, nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import type { DrawingElementSchema } from '@/components/BDrawing/elements';
import SidebarTools from '@/views/drawing/components/SidebarTools.vue';
import { provideDragger, type DraggerItem } from '@/views/drawing/hooks/useDragger';

/** 测试工具 schema。 */
const toolSchema = vi.hoisted(
  (): DrawingElementSchema => ({
    name: 'layout',
    label: '布局容器',
    icon: 'lucide:layout-template'
  })
);

vi.mock('@/components/BDrawing/elements', () => ({
  DRAWING_ELEMENT_SCHEMAS: [toolSchema]
}));

describe('SidebarTools drag', (): void => {
  it('starts custom element drag with the whole schema instead of native draggable', async (): Promise<void> => {
    const startDrag = vi.fn<(_schema: DraggerItem, _event?: PointerEvent) => void>();
    const Host = defineComponent({
      name: 'SidebarToolsDragHost',
      components: {
        SidebarTools
      },
      setup(): Record<string, never> {
        provideDragger({ startDrag });

        return {};
      },
      template: '<SidebarTools />'
    });
    const wrapper = mount(Host, {
      global: {
        stubs: {
          BIcon: true
        }
      }
    });
    const tool = wrapper.find('.sidebar-panel__tool-item');

    tool.element.dispatchEvent(
      new MouseEvent('pointerdown', {
        bubbles: true,
        button: 0,
        cancelable: true,
        clientX: 10,
        clientY: 20
      })
    );
    await nextTick();

    expect(tool.attributes('draggable')).toBeUndefined();
    expect(startDrag).toHaveBeenCalledTimes(1);
    expect(startDrag.mock.calls[0]?.[0]).toMatchObject({
      name: 'layout',
      label: '布局容器'
    });
    expect(startDrag.mock.calls[0]?.[1]).toBeInstanceOf(MouseEvent);
    expect(startDrag.mock.calls[0]).toHaveLength(2);
    wrapper.unmount();
  });
});
