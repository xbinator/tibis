/**
 * @file context-usage.component.test.ts
 * @description BChat 输入工具栏上下文使用量入口测试。
 * @vitest-environment jsdom
 */
import { defineComponent } from 'vue';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ContextUsage from '@/components/BChat/components/InputToolbar/ContextUsage.vue';

/** Tooltip 测试替身，直接暴露 title 便于断言。 */
const TooltipStub = defineComponent({
  name: 'Tooltip',
  props: {
    title: {
      type: String,
      default: ''
    }
  },
  template: '<div class="tooltip-stub" :data-title="title"><slot /></div>'
});

describe('ContextUsage', (): void => {
  it('formats the tooltip text like the context usage reference', (): void => {
    const wrapper = mount(ContextUsage, {
      props: {
        usedTokens: 54_700,
        contextWindow: 1_000_000
      },
      global: {
        stubs: {
          Tooltip: TooltipStub
        }
      }
    });

    const expected = '5.5% · 54.7K / 1000.0K 上下文已使用';
    expect(wrapper.find('.tooltip-stub').attributes('data-title')).toBe(expected);
    expect(wrapper.find('.context-usage').attributes('aria-label')).toBe(expected);
    expect(wrapper.find('.context-usage__progress').attributes('stroke-dasharray')).toBe('5.47 100');
  });

  it('clamps invalid values to a stable ring range', (): void => {
    const wrapper = mount(ContextUsage, {
      props: {
        usedTokens: 250_000,
        contextWindow: 200_000
      },
      global: {
        stubs: {
          Tooltip: TooltipStub
        }
      }
    });

    expect(wrapper.find('.tooltip-stub').attributes('data-title')).toBe('100.0% · 250.0K / 200.0K 上下文已使用');
    expect(wrapper.find('.context-usage__progress').attributes('stroke-dasharray')).toBe('100 100');
  });
});
