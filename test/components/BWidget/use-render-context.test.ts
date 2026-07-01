/**
 * @file use-render-context.test.ts
 * @description 验证 BWidget 渲染上下文 provide/inject hook。
 * @vitest-environment jsdom
 */
/* eslint-disable vue/one-component-per-file */
import type { WidgetRenderContext } from 'types/widget';
import { defineComponent, h, nextTick, ref } from 'vue';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { provideRenderContext, useRenderContext } from '@/components/BWidget/hooks/useRenderContext';

/**
 * 创建测试渲染上下文。
 * @param city - 城市名称
 * @returns 渲染上下文
 */
function createRenderContext(city: string): WidgetRenderContext {
  return {
    input: { city },
    state: {}
  };
}

describe('useRenderContext', (): void => {
  it('injects reactive widget render context from the nearest provider', async (): Promise<void> => {
    const renderContext = ref<WidgetRenderContext | undefined>(createRenderContext('上海'));
    const Consumer = defineComponent({
      name: 'RenderContextConsumer',
      setup(): () => ReturnType<typeof h> {
        const injectedContext = useRenderContext();

        return (): ReturnType<typeof h> => h('span', String(injectedContext.value?.input.city ?? ''));
      }
    });
    const Provider = defineComponent({
      name: 'RenderContextProvider',
      setup(): () => ReturnType<typeof h> {
        provideRenderContext(renderContext);

        return (): ReturnType<typeof h> => h(Consumer);
      }
    });
    const wrapper = mount(Provider);

    expect(wrapper.text()).toBe('上海');

    renderContext.value = createRenderContext('杭州');
    await nextTick();

    expect(wrapper.text()).toBe('杭州');
    wrapper.unmount();
  });

  it('returns an empty reactive context when no provider exists', (): void => {
    const Consumer = defineComponent({
      name: 'RenderContextConsumer',
      setup(): () => ReturnType<typeof h> {
        const injectedContext = useRenderContext();

        return (): ReturnType<typeof h> => h('span', String(injectedContext.value?.input.city ?? ''));
      }
    });
    const wrapper = mount(Consumer);

    expect(wrapper.text()).toBe('');
    wrapper.unmount();
  });
});
