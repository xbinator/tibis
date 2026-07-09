/**
 * @file button-element-view.component.test.ts
 * @description 验证 BWidget 按钮元素视图渲染文本和变量插值。
 * @vitest-environment jsdom
 */
import { readFileSync } from 'node:fs';
import type { VueWrapper } from '@vue/test-utils';
import type { WidgetRenderContext } from 'types/widget';
import type { VNode } from 'vue';
import { defineComponent, h, ref } from 'vue';
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import ButtonElementView from '@/components/BWidget/elements/Button/index.vue';
import { provideRenderContext } from '@/components/BWidget/hooks/useRenderContext';
import { provideWidgetRuntime, type WidgetRuntimeController } from '@/components/BWidget/hooks/useWidgetRuntime';
import type { WidgetShapeElement } from '@/components/BWidget/types';
import { createDefaultWidgetElementLoopConfig } from '@/components/BWidget/utils/widgetLoop';

/** 按钮元素视图源码。 */
const BUTTON_ELEMENT_VIEW_SOURCE = readFileSync('src/components/BWidget/elements/Button/index.vue', 'utf-8');

/**
 * 创建按钮视图测试元素。
 * @param text - 按钮文本模板
 * @returns 按钮元素
 */
function createButtonElement(text = '确认'): WidgetShapeElement {
  return {
    id: 'button-1',
    name: 'button',
    label: '按钮',
    icon: 'lucide:mouse-pointer-click',
    title: '图层名称',
    position: { x: 0, y: 0 },
    size: { width: 120, height: 40 },
    rotation: 0,
    style: {},
    loop: createDefaultWidgetElementLoopConfig(),
    metadata: {
      actions: [],
      disabled: false,
      loading: false,
      text
    }
  };
}

/**
 * 挂载按钮元素视图。
 * @param element - 按钮元素
 * @param renderContext - Widget 渲染上下文
 * @param runtime - Widget 运行态控制器
 * @returns 组件包装器
 */
function mountButtonElementView(element: WidgetShapeElement, renderContext?: WidgetRenderContext, runtime?: WidgetRuntimeController): VueWrapper {
  const contextRef = ref<WidgetRenderContext | undefined>(renderContext);
  const runtimeRef = ref<WidgetRuntimeController | undefined>(runtime);
  const Provider = defineComponent({
    name: 'ButtonElementViewProvider',
    setup(): () => VNode {
      provideRenderContext(contextRef);
      provideWidgetRuntime(runtimeRef);

      return (): VNode => h(ButtonElementView, { element });
    }
  });

  return mount(Provider);
}

describe('ButtonElementView', (): void => {
  it('keeps boolean and action argument parsing free of fallback plumbing', (): void => {
    expect(BUTTON_ELEMENT_VIEW_SOURCE).not.toContain('fallback');
    expect(BUTTON_ELEMENT_VIEW_SOURCE).not.toContain('normalizeButtonBoolean');
    expect(BUTTON_ELEMENT_VIEW_SOURCE).not.toContain('normalizeButtonActions');
    expect(BUTTON_ELEMENT_VIEW_SOURCE).not.toContain('buttonActionsValue');
  });

  it('renders a native button with text from element metadata', (): void => {
    const wrapper = mountButtonElementView(createButtonElement('立即提交'));
    const button = wrapper.find('button');

    expect(button.attributes('type')).toBe('button');
    expect(button.text()).toBe('立即提交');
    wrapper.unmount();
  });

  it('resolves variable interpolation in button text from render context', (): void => {
    const wrapper = mountButtonElementView(createButtonElement('确认 {{ $input.orderId }}'), {
      input: {
        orderId: 'A-1024'
      },
      output: undefined,
      data: {}
    });

    expect(wrapper.find('button').text()).toBe('确认 A-1024');
    wrapper.unmount();
  });

  it('renders an empty label when metadata text is missing', (): void => {
    const element = createButtonElement();
    delete element.metadata.text;
    const wrapper = mountButtonElementView(element);

    expect(wrapper.find('button').text()).toBe('');
    wrapper.unmount();
  });

  it('renders disabled and loading metadata on the native button', (): void => {
    const element = createButtonElement('提交');

    element.metadata.disabled = true;
    element.metadata.loading = true;

    const wrapper = mountButtonElementView(element);
    const button = wrapper.find('button');

    expect(button.attributes('disabled')).toBeDefined();
    expect(button.attributes('aria-busy')).toBe('true');
    expect(wrapper.find('.widget-button-element__loading').exists()).toBe(true);
    expect(wrapper.find('.widget-button-element__loading-spinner').exists()).toBe(true);
    wrapper.unmount();
  });

  it('resolves disabled and loading metadata from binding templates', (): void => {
    const element = createButtonElement('提交');

    element.metadata.disabled = '{{ disabled }}';
    element.metadata.loading = '{{ loading }}';

    const wrapper = mountButtonElementView(element, {
      input: {},
      output: undefined,
      data: {
        disabled: true,
        loading: true
      }
    });
    const button = wrapper.find('button');

    expect(button.attributes('disabled')).toBeDefined();
    expect(button.attributes('aria-busy')).toBe('true');
    expect(wrapper.find('.widget-button-element__loading').exists()).toBe(true);
    expect(wrapper.find('.widget-button-element__loading-spinner').exists()).toBe(true);
    wrapper.unmount();
  });

  it('runs configured action method with resolved arguments when clicked', async (): Promise<void> => {
    const element = createButtonElement('提交');
    const runtime: WidgetRuntimeController = {
      run: vi.fn(),
      runInteraction: vi.fn()
    };

    element.metadata.actions = [
      {
        args: ['{{ $input.coffeeId }}', '城市：{{ $input.city }}'],
        method: 'buttonByClick'
      },
      {
        args: [],
        method: 'refreshList'
      }
    ];

    const wrapper = mountButtonElementView(
      element,
      {
        input: {
          city: '上海',
          coffeeId: 'latte'
        },
        output: undefined,
        data: {}
      },
      runtime
    );

    await wrapper.find('button').trigger('click');

    expect(runtime.run).toHaveBeenNthCalledWith(1, 'buttonByClick', 'latte', '城市：上海');
    expect(runtime.run).toHaveBeenNthCalledWith(2, 'refreshList');
    expect(runtime.runInteraction).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('does not run action methods while disabled or loading', async (): Promise<void> => {
    const element = createButtonElement('提交');
    const runtime: WidgetRuntimeController = {
      run: vi.fn(),
      runInteraction: vi.fn()
    };

    element.metadata.actions = [
      {
        args: [],
        method: 'buttonByClick'
      }
    ];
    element.metadata.disabled = true;
    element.metadata.loading = true;

    const wrapper = mountButtonElementView(element, undefined, runtime);

    await wrapper.find('button').trigger('click');

    expect(runtime.run).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});
