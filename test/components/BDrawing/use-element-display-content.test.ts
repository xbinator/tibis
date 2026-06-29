/**
 * @file use-element-display-content.test.ts
 * @description 验证 BDrawing 元素展示内容 hook 读取模板字段并解析渲染上下文。
 * @vitest-environment jsdom
 */
/* eslint-disable vue/one-component-per-file */
import type { VueWrapper } from '@vue/test-utils';
import type { Component, VNode } from 'vue';
import { defineComponent, h, ref } from 'vue';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { useElementDisplayContent } from '@/components/BDrawing/hooks/useElementDisplayContent';
import { provideRenderContext } from '@/components/BDrawing/hooks/useRenderContext';
import type { DrawingRenderContext, DrawingShapeElement } from '@/components/BDrawing/types';

/**
 * 创建文本展示测试元素。
 * @param content - 元素内容模板
 * @returns 文本元素
 */
function createDisplayElement(content?: string): DrawingShapeElement {
  return {
    id: 'text-1',
    name: 'text',
    label: '文本',
    icon: 'lucide:type',
    title: '图层名称',
    position: { x: 0, y: 0 },
    size: { width: 120, height: 32 },
    rotation: 0,
    style: {},
    metadata: {
      content,
      subtitle: '副标题：{{ input.city }}'
    }
  };
}

/**
 * 挂载展示内容测试组件。
 * @param element - 元素数据
 * @param renderContext - 画布渲染上下文
 * @returns 组件包装器
 */
function mountDisplayContent(element: DrawingShapeElement, renderContext?: DrawingRenderContext): VueWrapper {
  const elementRef = ref<DrawingShapeElement | undefined>(element);
  const contextRef = ref<DrawingRenderContext | undefined>(renderContext);
  const Consumer: Component = {
    name: 'ElementDisplayContentConsumer',
    setup(): () => VNode {
      const content = useElementDisplayContent(elementRef, 'content');

      return (): VNode => h('span', content.value);
    }
  };
  const Provider = defineComponent({
    name: 'ElementDisplayContentProvider',
    setup(): () => VNode {
      provideRenderContext(contextRef);

      return (): VNode => h(Consumer);
    }
  });

  return mount(Provider);
}

describe('useElementDisplayContent', (): void => {
  it('reads a template field and resolves it from the drawing render context', (): void => {
    const wrapper = mountDisplayContent(createDisplayElement('{{ input.city }} 天气'), {
      input: {
        city: '上海'
      },
      state: {}
    });

    expect(wrapper.text()).toBe('上海 天气');
    wrapper.unmount();
  });

  it('renders an empty string when the default content field is missing', (): void => {
    const wrapper = mountDisplayContent(createDisplayElement());

    expect(wrapper.text()).toBe('');
    wrapper.unmount();
  });

  it('supports an explicit field name for secondary template content', (): void => {
    const elementRef = ref<DrawingShapeElement | undefined>(createDisplayElement('正文'));
    const contextRef = ref<DrawingRenderContext | undefined>({
      input: {
        city: '上海'
      },
      state: {}
    });
    const Consumer: Component = {
      name: 'ExplicitElementDisplayContentConsumer',
      setup(): () => VNode {
        const content = useElementDisplayContent(elementRef, 'subtitle');

        return (): VNode => h('span', content.value);
      }
    };
    const Provider = defineComponent({
      name: 'ExplicitElementDisplayContentProvider',
      setup(): () => VNode {
        provideRenderContext(contextRef);

        return (): VNode => h(Consumer);
      }
    });
    const wrapper = mount(Provider);

    expect(wrapper.text()).toBe('副标题：上海');
    wrapper.unmount();
  });
});
