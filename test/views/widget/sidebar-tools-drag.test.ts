/**
 * @file sidebar-tools-drag.test.ts
 * @description 验证Widget 侧栏工具使用公共拖拽创建能力。
 * @vitest-environment jsdom
 */
import type { DOMWrapper, VueWrapper } from '@vue/test-utils';
import type { Mock } from 'vitest';
import { defineComponent, nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import type { WidgetElementSchema } from '@/components/BWidget/elements';
import SidebarTools from '@/views/widget/components/SidebarTools.vue';
import { provideDragger, type DraggerItem } from '@/views/widget/hooks/useDragger';

/** 测试基础工具 schema。 */
const basicToolSchema = vi.hoisted(
  (): WidgetElementSchema => ({
    role: 'basic',
    name: 'layout',
    label: '布局容器',
    icon: 'lucide:layout-template'
  })
);

/** 测试第二个基础工具 schema。 */
const secondaryBasicToolSchema = vi.hoisted(
  (): WidgetElementSchema => ({
    role: 'basic',
    name: 'text-block',
    label: '文本块',
    icon: 'lucide:type'
  })
);

/** 测试交互工具 schema。 */
const interactionToolSchema = vi.hoisted(
  (): WidgetElementSchema => ({
    role: 'interaction',
    name: 'trigger',
    label: '触发器',
    icon: 'lucide:mouse-pointer-click'
  })
);

vi.mock('@/components/BWidget/elements', () => ({
  WIDGET_ELEMENT_SCHEMAS: [basicToolSchema, interactionToolSchema, secondaryBasicToolSchema]
}));

vi.mock('@/components/BWidget/elements/roles', () => ({
  WIDGET_ELEMENT_ROLES: [
    { key: 'basic', label: '基础' },
    { key: 'interaction', label: '交互' },
    { key: 'empty', label: '空分类' }
  ]
}));

/** 侧栏拖拽函数。 */
type StartDrag = (_schema: DraggerItem, _event?: PointerEvent) => void;

/**
 * 已挂载的侧栏工具测试上下文。
 */
interface MountSidebarToolsResult {
  /** 组件包装器 */
  wrapper: VueWrapper;
  /** 拖拽启动 mock */
  startDrag: Mock<StartDrag>;
}

/**
 * 挂载带拖拽上下文的侧栏工具组件。
 * @returns 组件包装器和拖拽启动 mock
 */
function mountSidebarTools(): MountSidebarToolsResult {
  const startDrag = vi.fn<StartDrag>();
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

  return { startDrag, wrapper };
}

describe('SidebarTools drag', (): void => {
  it('renders tools under ordered category headings', (): void => {
    const { wrapper } = mountSidebarTools();
    const categories = wrapper.findAll('.sidebar-tools__category');

    expect(categories).toHaveLength(2);
    expect(categories[0]?.find('.sidebar-tools__category-title').text()).toBe('基础');
    expect(categories[0]?.findAll('.sidebar-tools__tool-item').map((item: DOMWrapper<Element>): string => item.text())).toEqual(['布局容器', '文本块']);
    expect(categories[1]?.find('.sidebar-tools__category-title').text()).toBe('交互');
    expect(categories[1]?.findAll('.sidebar-tools__tool-item').map((item: DOMWrapper<Element>): string => item.text())).toEqual(['触发器']);
    expect(wrapper.text()).not.toContain('空分类');

    wrapper.unmount();
  });

  it('starts custom element drag with the whole schema instead of native draggable', async (): Promise<void> => {
    const { startDrag, wrapper } = mountSidebarTools();
    const tool = wrapper.find('.sidebar-tools__tool-item');

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
    expect(wrapper.findComponent(SidebarTools).emitted('drag-start')).toHaveLength(1);
    wrapper.unmount();
  });
});
