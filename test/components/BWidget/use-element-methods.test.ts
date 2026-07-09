/**
 * @file use-element-methods.test.ts
 * @description 验证 BWidget 元素方法 hook 从 Widget 上下文脚本生成动作函数候选。
 * @vitest-environment jsdom
 */
/* eslint-disable vue/one-component-per-file */
import type { Ref, VNode } from 'vue';
import { defineComponent, h, nextTick, ref } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { useElementMethods } from '@/components/BWidget/hooks/useElementMethods';
import { provideWidgetContext } from '@/components/BWidget/hooks/useWidgetContext';
import type { WidgetData } from '@/components/BWidget/types';
import { createDefaultWidgetData } from '@/components/BWidget/utils/widgetData';

/**
 * 创建测试 Widget 数据。
 * @param code - Widget 脚本源码
 * @returns 测试 Widget 数据
 */
function createWidgetData(code: string): WidgetData {
  return {
    ...createDefaultWidgetData(),
    execute: {
      code
    }
  };
}

/**
 * 格式化方法候选为可断言文本。
 * @param methodOptions - 方法候选
 * @returns 方法候选文本
 */
function formatMethodOptions(methodOptions: Array<{ parameters?: string[]; value: string }>): string {
  return methodOptions.map((option: { parameters?: string[]; value: string }): string => `${option.value}:${(option.parameters ?? []).join(',')}`).join('|');
}

/**
 * 挂载元素方法 hook 测试组件。
 * @param widgetData - Widget 数据引用
 * @returns 组件包装器
 */
function mountElementMethodsConsumer(widgetData: Ref<WidgetData | undefined>): VueWrapper {
  const selectedElementIds = ref<string[]>([]);
  const Consumer = defineComponent({
    name: 'ElementMethodsConsumer',
    setup(): () => VNode {
      const { methodOptions } = useElementMethods();

      return (): VNode => h('span', formatMethodOptions(methodOptions.value));
    }
  });
  const Provider = defineComponent({
    name: 'ElementMethodsProvider',
    setup(): () => VNode {
      provideWidgetContext({
        selectedElementIds,
        widgetData
      });

      return (): VNode => h(Consumer);
    }
  });

  return mount(Provider);
}

describe('useElementMethods', (): void => {
  it('reads public action methods from the current widget context script', async (): Promise<void> => {
    const widgetData = ref<WidgetData | undefined>(
      createWidgetData(['export default class ButtonWidget extends Widget {', '  onMounted() {}', '  buttonByClick(orderId) {}', '}'].join('\n'))
    );
    const wrapper = mountElementMethodsConsumer(widgetData);

    expect(wrapper.text()).toBe('buttonByClick:orderId');

    widgetData.value = createWidgetData(['export default class ButtonWidget extends Widget {', '  refreshList(page, pageSize) {}', '}'].join('\n'));
    await nextTick();

    expect(wrapper.text()).toBe('refreshList:page,pageSize');
    wrapper.unmount();
  });
});
