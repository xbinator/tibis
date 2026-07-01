/**
 * @file text-element-view.component.test.ts
 * @description 验证 BWidget 文本元素视图使用元素 metadata 内容渲染。
 * @vitest-environment jsdom
 */
import type { VueWrapper } from '@vue/test-utils';
import type { VNode } from 'vue';
import { defineComponent, h, ref } from 'vue';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import TextElementView from '@/components/BWidget/elements/Text/index.vue';
import { provideRenderContext } from '@/components/BWidget/hooks/useRenderContext';
import type { WidgetRenderContext, WidgetShapeElement } from '@/components/BWidget/types';

/**
 * 创建文本视图测试元素。
 * @returns 文本元素
 */
function createTextElement(): WidgetShapeElement {
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
      content: '正文内容'
    }
  };
}

/**
 * 挂载文本元素视图。
 * @param element - 文本元素
 * @param renderContext - Widget 渲染上下文
 * @returns 组件包装器
 */
function mountTextElementView(element: WidgetShapeElement, renderContext?: WidgetRenderContext): VueWrapper {
  const contextRef = ref<WidgetRenderContext | undefined>(renderContext);
  const Provider = defineComponent({
    name: 'TextElementViewProvider',
    setup(): () => VNode {
      provideRenderContext(contextRef);

      return (): VNode => h(TextElementView, { element });
    }
  });

  return mount(Provider);
}

describe('TextElementView', (): void => {
  it('renders text content from element metadata instead of the layer title', (): void => {
    const wrapper = mountTextElementView(createTextElement());

    expect(wrapper.text()).toBe('正文内容');
    wrapper.unmount();
  });

  it('renders an empty string instead of old title fallback when metadata content is missing', (): void => {
    const element = createTextElement();
    delete element.metadata.content;
    const wrapper = mountTextElementView(element);

    expect(wrapper.text()).toBe('');
    wrapper.unmount();
  });

  it('renders content binding from widget render context', (): void => {
    const element = createTextElement();
    element.metadata.content = '{{ input.city }} 当前 {{ state.weather.temperature }}°C';
    const wrapper = mountTextElementView(element, {
      input: { city: '上海' },
      state: {
        weather: {
          temperature: 28
        }
      }
    });

    expect(wrapper.text()).toBe('上海 当前 28°C');
    wrapper.unmount();
  });

  it('renders bracket binding paths produced for non-identifier field names', (): void => {
    const element = createTextElement();
    element.metadata.content = '{{ input["wind-speed"] }} / {{ state["weather-data"]["feels.like"] }}';
    const wrapper = mountTextElementView(element, {
      input: {
        'wind-speed': 12
      },
      state: {
        'weather-data': {
          'feels.like': 31
        }
      }
    });

    expect(wrapper.text()).toBe('12 / 31');
    wrapper.unmount();
  });

  it('falls back to static content when binding path cannot be resolved', (): void => {
    const element = createTextElement();
    element.metadata.content = '{{ state.weather.temperature }}°C';
    const wrapper = mountTextElementView(element, {
      input: {},
      state: {}
    });

    expect(wrapper.text()).toBe('{{ state.weather.temperature }}°C');
    wrapper.unmount();
  });

  it('does not execute filter-like binding expressions', (): void => {
    const element = createTextElement();
    element.metadata.content = '{{ state.weather.temperature | default("未知") }}';
    const wrapper = mountTextElementView(element, {
      input: {},
      state: {
        weather: {
          temperature: 28
        }
      }
    });

    expect(wrapper.text()).toBe('{{ state.weather.temperature | default("未知") }}');
    wrapper.unmount();
  });
});
