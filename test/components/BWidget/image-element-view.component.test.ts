/**
 * @file image-element-view.component.test.ts
 * @description 验证 BWidget 图片元素视图渲染、变量插值与占位逻辑。
 * @vitest-environment jsdom
 */
import type { VueWrapper } from '@vue/test-utils';
import type { WidgetRenderContext } from 'types/widget';
import type { VNode } from 'vue';
import { defineComponent, h, ref } from 'vue';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ImageElementView from '@/components/BWidget/elements/Image/index.vue';
import { provideRenderContext, type WidgetRenderContextOptions } from '@/components/BWidget/hooks/useRenderContext';
import type { WidgetShapeElement } from '@/components/BWidget/types';
import { createDefaultWidgetElementLoopConfig } from '@/components/BWidget/utils/widgetLoop';

/**
 * 图片元素视图挂载选项。
 */
interface ImageElementViewMountOptions {
  /** Widget 渲染上下文 */
  renderContext?: WidgetRenderContext;
  /** Widget 渲染选项 */
  renderOptions?: WidgetRenderContextOptions;
}

/**
 * 创建图片视图测试元素。
 * @param overrides - 元数据覆盖项
 * @returns 图片元素
 */
function createImageElement(overrides: { src?: string; fit?: string; alt?: string } = {}): WidgetShapeElement {
  return {
    id: 'image-1',
    name: 'image',
    label: '图片',
    icon: 'lucide:image',
    title: '图层名称',
    position: { x: 0, y: 0 },
    size: { width: 120, height: 80 },
    rotation: 0,
    style: {},
    loop: createDefaultWidgetElementLoopConfig(),
    metadata: {
      src: overrides.src ?? 'https://example.com/a.png',
      fit: overrides.fit ?? 'cover',
      ...(overrides.alt !== undefined ? { alt: overrides.alt } : {})
    }
  };
}

/**
 * 挂载图片元素视图。
 * @param element - 图片元素
 * @param options - 图片元素视图挂载选项
 * @returns 组件包装器
 */
function mountImageElementView(element: WidgetShapeElement, options: ImageElementViewMountOptions = {}): VueWrapper {
  const { renderContext, renderOptions } = options;
  const contextRef = ref<WidgetRenderContext | undefined>(renderContext);
  const Provider = defineComponent({
    name: 'ImageElementViewProvider',
    setup(): () => VNode {
      provideRenderContext(contextRef, renderOptions);

      return (): VNode => h(ImageElementView, { element });
    }
  });

  return mount(Provider);
}

describe('ImageElementView', (): void => {
  it('renders an img with src from element metadata', (): void => {
    const wrapper = mountImageElementView(createImageElement({ src: 'https://cdn.example.com/x.png' }));

    expect(wrapper.find('img').attributes('src')).toBe('https://cdn.example.com/x.png');
    wrapper.unmount();
  });

  it('resolves variable interpolation in src from render context', (): void => {
    const element = createImageElement({ src: '{{ avatar }}' });
    const wrapper = mountImageElementView(element, {
      renderContext: {
        input: {},
        output: undefined,
        data: {
          avatar: 'https://cdn.example.com/avatar.png'
        }
      },
      renderOptions: { mode: 'runtime' }
    });

    expect(wrapper.find('img').attributes('src')).toBe('https://cdn.example.com/avatar.png');
    wrapper.unmount();
  });

  it('shows the empty-src placeholder for variable-only src outside runtime mode', (): void => {
    const element = createImageElement({ src: '{{ avatar }}' });
    const wrapper = mountImageElementView(element, {
      renderContext: {
        input: {},
        output: undefined,
        data: {
          avatar: 'https://cdn.example.com/avatar.png'
        }
      }
    });

    expect(wrapper.find('img').exists()).toBe(false);
    expect(wrapper.find('.widget-image-element__placeholder').exists()).toBe(true);
    wrapper.unmount();
  });

  it('resolves variable interpolation in alt from render context', (): void => {
    const element = createImageElement({ alt: '{{ label }}' });
    const wrapper = mountImageElementView(element, {
      renderContext: {
        input: {},
        output: undefined,
        data: {
          label: '示意图'
        }
      },
      renderOptions: { mode: 'runtime' }
    });

    expect(wrapper.find('img').attributes('alt')).toBe('示意图');
    wrapper.unmount();
  });

  it('shows placeholder when src is empty', (): void => {
    const element = createImageElement({ src: '' });
    const wrapper = mountImageElementView(element);

    expect(wrapper.find('img').exists()).toBe(false);
    expect(wrapper.find('.widget-image-element__placeholder').exists()).toBe(true);
    wrapper.unmount();
  });

  it('applies object-fit from metadata fit to the img style', (): void => {
    const wrapper = mountImageElementView(createImageElement({ fit: 'contain' }));
    const style = wrapper.find('img').attributes('style') ?? '';

    expect(style).toContain('object-fit: contain');
    wrapper.unmount();
  });

  it('keeps the current image view behavior when metadata fit is invalid', (): void => {
    const element = createImageElement({ fit: 'invalid-fit' });
    const wrapper = mountImageElementView(element);
    const style = wrapper.find('img').attributes('style') ?? '';

    expect(style).not.toContain('object-fit: cover');
    expect(style).toContain('width: 100%');
    wrapper.unmount();
  });
});
