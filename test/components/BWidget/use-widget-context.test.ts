/**
 * @file use-widget-context.test.ts
 * @description 验证 BWidget 通用上下文 provide/inject hook。
 * @vitest-environment jsdom
 */
/* eslint-disable vue/one-component-per-file */
import { defineComponent, h, nextTick, ref } from 'vue';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { provideWidgetContext, useWidgetContext } from '@/components/BWidget/hooks/useWidgetContext';
import type { WidgetData } from '@/components/BWidget/types';
import { createDefaultWidgetData } from '@/components/BWidget/utils/widgetData';

/**
 * 创建测试 Widget 数据。
 * @param name - Widget 名称
 * @returns 测试 Widget 数据
 */
function createWidgetData(name: string): WidgetData {
  return {
    ...createDefaultWidgetData(),
    name
  };
}

describe('useWidgetContext', (): void => {
  it('injects reactive widget data and selected ids from the nearest provider', async (): Promise<void> => {
    const widgetData = ref<WidgetData | undefined>(createWidgetData('天气'));
    const selectedElementIds = ref<string[]>(['text-1']);
    const Consumer = defineComponent({
      name: 'WidgetContextConsumer',
      setup(): () => ReturnType<typeof h> {
        const context = useWidgetContext();

        return (): ReturnType<typeof h> => h('span', `${context.widgetData.value?.name ?? ''}:${context.selectedElementIds.value.join(',')}`);
      }
    });
    const Provider = defineComponent({
      name: 'WidgetContextProvider',
      setup(): () => ReturnType<typeof h> {
        provideWidgetContext({
          widgetData,
          selectedElementIds
        });

        return (): ReturnType<typeof h> => h(Consumer);
      }
    });
    const wrapper = mount(Provider);

    expect(wrapper.text()).toBe('天气:text-1');

    widgetData.value = createWidgetData('咖啡');
    selectedElementIds.value = ['rect-1', 'text-2'];
    await nextTick();

    expect(wrapper.text()).toBe('咖啡:rect-1,text-2');
    wrapper.unmount();
  });

  it('returns empty reactive widget context when no provider exists', (): void => {
    const Consumer = defineComponent({
      name: 'WidgetContextConsumer',
      setup(): () => ReturnType<typeof h> {
        const context = useWidgetContext();

        return (): ReturnType<typeof h> => h('span', `${context.widgetData.value?.name ?? ''}:${context.selectedElementIds.value.join(',')}`);
      }
    });
    const wrapper = mount(Consumer);

    expect(wrapper.text()).toBe(':');
    wrapper.unmount();
  });
});
