/**
 * @file context-usage-indicator.test.ts
 * @description BChatSidebar 输入栏上下文预算指示器渲染测试。
 * @vitest-environment jsdom
 */
import { defineComponent } from 'vue';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ContextUsage from '@/components/BChatSidebar/components/InputToolbar/ContextUsage.vue';
import { createContextUsageBudgetSnapshot } from '@/components/BChatSidebar/utils/contextUsageBudget';

/** BDropdown 测试替身，直接渲染默认插槽和 overlay 插槽。 */
const BDropdownStub = defineComponent({
  name: 'BDropdown',
  template: '<div><slot /><slot name="overlay" /></div>'
});

describe('ContextUsage', () => {
  it('renders usable input budget details from the snapshot', (): void => {
    const wrapper = mount(ContextUsage, {
      props: {
        usage: createContextUsageBudgetSnapshot(42, 200_000),
        usedTokens: 42,
        contextWindow: 200_000
      },
      global: {
        stubs: {
          BDropdown: BDropdownStub
        }
      }
    });

    expect(wrapper.text()).toContain('当前上下文估算');
    expect(wrapper.text()).toContain('当前输入估算');
    expect(wrapper.text()).toContain('可用输入预算');
    expect(wrapper.text()).toContain('输出预留');
    expect(wrapper.text()).toContain('剩余输入');
    expect(wrapper.text()).toContain('194.9K');
    expect(wrapper.text()).toContain('4.1K');
    expect(wrapper.text()).toContain('194.8K');
  });

  it('uses danger status classes when input budget is nearly exhausted', (): void => {
    const wrapper = mount(ContextUsage, {
      props: {
        usage: createContextUsageBudgetSnapshot(180_000, 200_000),
        usedTokens: 180_000,
        contextWindow: 200_000
      },
      global: {
        stubs: {
          BDropdown: BDropdownStub
        }
      }
    });

    expect(wrapper.find('.context-usage__ring--danger').exists()).toBe(true);
    expect(wrapper.find('.context-usage__progress-bar--danger').exists()).toBe(true);
  });
});
