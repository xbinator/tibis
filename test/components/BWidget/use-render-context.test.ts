/**
 * @file use-render-context.test.ts
 * @description 验证 BWidget 渲染上下文 provide/inject hook。
 * @vitest-environment jsdom
 */
/* eslint-disable vue/one-component-per-file */
import { readFileSync } from 'node:fs';
import type { WidgetRenderContext } from 'types/widget';
import { defineComponent, h, nextTick, ref } from 'vue';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { provideRenderContext, useRenderContext } from '@/components/BWidget/hooks/useRenderContext';

/** 渲染上下文 hook 源码。 */
const USE_RENDER_CONTEXT_SOURCE = readFileSync('src/components/BWidget/hooks/useRenderContext.ts', 'utf-8');

/**
 * 创建测试渲染上下文。
 * @param city - 城市名称
 * @returns 渲染上下文
 */
function createRenderContext(city: string): WidgetRenderContext {
  return {
    input: { city },
    output: undefined,
    data: {}
  };
}

describe('useRenderContext', (): void => {
  it('keeps render state behind a single useRenderContext helper', (): void => {
    expect(USE_RENDER_CONTEXT_SOURCE).not.toContain('useRenderMode');
    expect(USE_RENDER_CONTEXT_SOURCE).not.toContain('useRenderContextOptions');
  });

  it('injects reactive widget render context from the nearest provider', async (): Promise<void> => {
    const renderContext = ref<WidgetRenderContext | undefined>(createRenderContext('上海'));
    const Consumer = defineComponent({
      name: 'RenderContextConsumer',
      setup(): () => ReturnType<typeof h> {
        const injectedContext = useRenderContext().renderContext;

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
        const injectedContext = useRenderContext().renderContext;

        return (): ReturnType<typeof h> => h('span', String(injectedContext.value?.input.city ?? ''));
      }
    });
    const wrapper = mount(Consumer);

    expect(wrapper.text()).toBe('');
    wrapper.unmount();
  });

  it('keeps parent render options when a child only overrides render context', (): void => {
    const parentContext = ref<WidgetRenderContext | undefined>(createRenderContext('上海'));
    const childContext = ref<WidgetRenderContext | undefined>(createRenderContext('杭州'));
    const Consumer = defineComponent({
      name: 'RenderModeConsumer',
      setup(): () => ReturnType<typeof h> {
        const injectedRenderState = useRenderContext();

        return (): ReturnType<typeof h> =>
          h('span', `${injectedRenderState.options.value.mode ?? ''}:${String(injectedRenderState.renderContext.value?.input.city ?? '')}`);
      }
    });
    const ChildProvider = defineComponent({
      name: 'RenderContextChildProvider',
      setup(): () => ReturnType<typeof h> {
        provideRenderContext(childContext);

        return (): ReturnType<typeof h> => h(Consumer);
      }
    });
    const ParentProvider = defineComponent({
      name: 'RenderContextParentProvider',
      setup(): () => ReturnType<typeof h> {
        provideRenderContext(parentContext, { mode: 'runtime' });

        return (): ReturnType<typeof h> => h(ChildProvider);
      }
    });
    const wrapper = mount(ParentProvider);

    expect(wrapper.text()).toBe('runtime:杭州');
    wrapper.unmount();
  });
});
