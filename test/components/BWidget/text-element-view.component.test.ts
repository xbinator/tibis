/**
 * @file text-element-view.component.test.ts
 * @description 验证 BWidget 文本元素视图使用元素 metadata 内容渲染。
 * @vitest-environment jsdom
 */
import type { VueWrapper } from '@vue/test-utils';
import type { WidgetRenderContext } from 'types/widget';
import type { VNode } from 'vue';
import { defineComponent, h, ref } from 'vue';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import TextElementView from '@/components/BWidget/elements/Text/index.vue';
import { provideRenderContext, type WidgetRenderContextOptions } from '@/components/BWidget/hooks/useRenderContext';
import type { WidgetShapeElement } from '@/components/BWidget/types';
import { createDefaultWidgetElementLoopConfig } from '@/components/BWidget/utils/widgetLoop';

/**
 * 文本元素视图挂载选项。
 */
interface TextElementViewMountOptions {
  /** Widget 渲染上下文 */
  renderContext?: WidgetRenderContext;
  /** Widget 渲染选项 */
  renderOptions?: WidgetRenderContextOptions;
}

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
    loop: createDefaultWidgetElementLoopConfig(),
    metadata: {
      content: '正文内容'
    }
  };
}

/**
 * 挂载文本元素视图。
 * @param element - 文本元素
 * @param options - 文本元素视图挂载选项
 * @returns 组件包装器
 */
function mountTextElementView(element: WidgetShapeElement, options: TextElementViewMountOptions = {}): VueWrapper {
  const { renderContext, renderOptions } = options;
  const contextRef = ref<WidgetRenderContext | undefined>(renderContext);
  const Provider = defineComponent({
    name: 'TextElementViewProvider',
    setup(): () => VNode {
      provideRenderContext(contextRef, renderOptions);

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
    element.metadata.content = '{{ $input.city }} 当前 {{ weather.temperature }}°C';
    const wrapper = mountTextElementView(element, {
      renderContext: {
        input: { city: '上海' },
        output: undefined,
        data: {
          weather: {
            temperature: 28
          }
        }
      },
      renderOptions: { mode: 'runtime' }
    });

    expect(wrapper.text()).toBe('上海 当前 28°C');
    wrapper.unmount();
  });

  it('renders bracket binding paths produced for non-identifier field names', (): void => {
    const element = createTextElement();
    element.metadata.content = '{{ $input["wind-speed"] }} / {{ ["weather-data"]["feels.like"] }}';
    const wrapper = mountTextElementView(element, {
      renderContext: {
        input: {
          'wind-speed': 12
        },
        output: undefined,
        data: {
          'weather-data': {
            'feels.like': 31
          }
        }
      },
      renderOptions: { mode: 'runtime' }
    });

    expect(wrapper.text()).toBe('12 / 31');
    wrapper.unmount();
  });

  it('falls back to static content when binding path cannot be resolved', (): void => {
    const element = createTextElement();
    element.metadata.content = '{{ weather.temperature }}°C';
    const wrapper = mountTextElementView(element, {
      renderContext: {
        input: {},
        output: undefined,
        data: {}
      },
      renderOptions: { mode: 'runtime' }
    });

    expect(wrapper.text()).toBe('{{ weather.temperature }}°C');
    wrapper.unmount();
  });

  it('does not execute filter-like binding expressions', (): void => {
    const element = createTextElement();
    element.metadata.content = '{{ weather.temperature | default("未知") }}';
    const wrapper = mountTextElementView(element, {
      renderContext: {
        input: {},
        output: undefined,
        data: {
          weather: {
            temperature: 28
          }
        }
      },
      renderOptions: { mode: 'runtime' }
    });

    expect(wrapper.text()).toBe('{{ weather.temperature | default("未知") }}');
    wrapper.unmount();
  });

  it('renders safe ternary binding expressions', (): void => {
    const element = createTextElement();
    element.metadata.content = "{{ movie.hasScore ? movie.scoreText : '暂无' }}";
    const wrapper = mountTextElementView(element, {
      renderContext: {
        input: {},
        output: undefined,
        data: {
          movie: {
            hasScore: true,
            scoreText: '8.6'
          }
        }
      },
      renderOptions: { mode: 'runtime' }
    });

    expect(wrapper.text()).toBe('8.6');
    wrapper.unmount();
  });

  it('keeps method-call expressions as raw fallback text', (): void => {
    const element = createTextElement();
    element.metadata.content = '{{ movie.format() }}';
    const wrapper = mountTextElementView(element, {
      renderContext: {
        input: {},
        output: undefined,
        data: {
          movie: {
            format: '不可调用'
          }
        }
      },
      renderOptions: { mode: 'runtime' }
    });

    expect(wrapper.text()).toBe('{{ movie.format() }}');
    wrapper.unmount();
  });

  it('hides content binding placeholders outside runtime mode', (): void => {
    const element = createTextElement();
    element.metadata.content = '你好{{ message }}';
    const wrapper = mountTextElementView(element, {
      renderContext: {
        input: {},
        output: undefined,
        data: {
          message: '世界'
        }
      }
    });

    expect(wrapper.text()).toBe('你好');
    wrapper.unmount();
  });

  it('ignores cleared and non-positive maxLines values for line clamp', (): void => {
    const ignoredValues: Array<number | null> = [null, 0, -1];

    ignoredValues.forEach((maxLines: number | null): void => {
      const element = createTextElement();
      element.metadata.content = '第一行\n第二行\n第三行';
      element.metadata.maxLines = maxLines;
      const wrapper = mountTextElementView(element);
      const style = wrapper.find('.widget-text-element-content').attributes('style') ?? '';

      expect(style).not.toContain('-webkit-line-clamp');
      expect(style).not.toContain('display: -webkit-box');
      wrapper.unmount();
    });
  });
});
