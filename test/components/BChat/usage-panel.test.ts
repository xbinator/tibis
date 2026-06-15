/**
 * @file usage-panel.test.ts
 * @description BChat 会话累计 Token 用量面板渲染测试。
 * @vitest-environment jsdom
 */
import { defineComponent } from 'vue';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import UsagePanel from '@/components/BChat/components/UsagePanel.vue';

/** BButton 测试替身。 */
const BButtonStub = defineComponent({
  name: 'BButton',
  template: '<button type="button"><slot /></button>'
});

describe('UsagePanel', () => {
  it('labels persisted token usage as session cumulative usage', (): void => {
    const wrapper = mount(UsagePanel, {
      props: {
        loading: false,
        usage: {
          inputTokens: 1200,
          outputTokens: 300,
          totalTokens: 1500
        },
        onClose: () => undefined
      },
      global: {
        stubs: {
          BButton: BButtonStub
        }
      }
    });

    expect(wrapper.text()).toContain('会话累计 Token');
    expect(wrapper.text()).toContain('累计总量');
    expect(wrapper.text()).toContain('1,500');
  });
});
