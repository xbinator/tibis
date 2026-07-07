/**
 * @file use-element-content.test.ts
 * @description 验证 BWidget 元素内容 hook 读取模板字段并解析渲染上下文。
 * @vitest-environment jsdom
 */
/* eslint-disable vue/one-component-per-file */
import type { VueWrapper } from '@vue/test-utils';
import type { WidgetRenderContext } from 'types/widget';
import type { Component, VNode } from 'vue';
import { defineComponent, h, ref } from 'vue';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { useElementContent } from '@/components/BWidget/hooks/useElementContent';
import { provideRenderContext } from '@/components/BWidget/hooks/useRenderContext';
import type { WidgetShapeElement } from '@/components/BWidget/types';
import { createDefaultWidgetElementLoopConfig } from '@/components/BWidget/utils/widgetLoop';

/**
 * 创建文本展示测试元素。
 * @param content - 元素内容模板
 * @returns 文本元素
 */
function createDisplayElement(content?: string): WidgetShapeElement {
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
    loop: createDefaultWidgetElementLoopConfig(),
    metadata: {
      content,
      subtitle: '副标题：{{ $input.city }}'
    }
  };
}

/**
 * 挂载展示内容测试组件。
 * @param element - 元素数据
 * @param renderContext - Widget 渲染上下文
 * @returns 组件包装器
 */
function mountDisplayContent(element: WidgetShapeElement, renderContext?: WidgetRenderContext): VueWrapper {
  const elementRef = ref<WidgetShapeElement | undefined>(element);
  const contextRef = ref<WidgetRenderContext | undefined>(renderContext);
  const Consumer: Component = {
    name: 'ElementContentConsumer',
    setup(): () => VNode {
      const content = useElementContent(elementRef, 'content');

      return (): VNode => h('span', content.value);
    }
  };
  const Provider = defineComponent({
    name: 'ElementContentProvider',
    setup(): () => VNode {
      provideRenderContext(contextRef);

      return (): VNode => h(Consumer);
    }
  });

  return mount(Provider);
}

describe('useElementContent', (): void => {
  it('reads a template field and resolves it from the widget render context', (): void => {
    const wrapper = mountDisplayContent(createDisplayElement('{{ $input.city }} 天气'), {
      input: {
          city: '上海'
        },
        output: undefined,
      data: {}
    });

    expect(wrapper.text()).toBe('上海 天气');
    wrapper.unmount();
  });

  it('formats complex binding values as readable JSON text', (): void => {
    const wrapper = mountDisplayContent(createDisplayElement('{{ weather }}'), {
      input: {},
        output: undefined,
      data: {
        weather: {
          condition: '晴',
          temperature: 28
        }
      }
    });

    expect(wrapper.text()).toBe('{\n  "condition": "晴",\n  "temperature": 28\n}');
    expect(wrapper.text()).not.toContain('[object Object]');
    wrapper.unmount();
  });

  it('renders an empty string when the default content field is missing', (): void => {
    const wrapper = mountDisplayContent(createDisplayElement());

    expect(wrapper.text()).toBe('');
    wrapper.unmount();
  });

  it('supports an explicit field name for secondary template content', (): void => {
    const elementRef = ref<WidgetShapeElement | undefined>(createDisplayElement('正文'));
    const contextRef = ref<WidgetRenderContext | undefined>({
      input: {
          city: '上海'
        },
        output: undefined,
      data: {}
    });
    const Consumer: Component = {
      name: 'ExplicitElementContentConsumer',
      setup(): () => VNode {
        const content = useElementContent(elementRef, 'subtitle');

        return (): VNode => h('span', content.value);
      }
    };
    const Provider = defineComponent({
      name: 'ExplicitElementContentProvider',
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
