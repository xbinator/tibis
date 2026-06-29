/**
 * @file default-variable-chip.test.ts
 * @description 验证 BPromptEditor 默认将变量 token 渲染为 value chip。
 * @vitest-environment jsdom
 */
import { nextTick } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { createVariableValueChipResolver } from '@/components/BPromptEditor/extensions/variableChip';
import BPromptEditor from '@/components/BPromptEditor/index.vue';
import type { VariableOptionGroup } from '@/components/BPromptEditor/types';

/**
 * 创建测试变量选项。
 * @returns 变量选项分组
 */
function createVariableOptions(): VariableOptionGroup[] {
  return [
    {
      type: 'variable',
      options: [
        {
          label: '城市',
          value: 'input.city',
          description: '当前城市'
        }
      ]
    }
  ];
}

/**
 * 挂载提示词编辑器。
 * @returns 编辑器包装器
 */
async function mountPromptEditor(): Promise<VueWrapper> {
  const wrapper = mount(BPromptEditor, {
    props: {
      value: '{{input.city}} ',
      options: createVariableOptions()
    },
    attachTo: document.body
  });

  await nextTick();
  return wrapper;
}

describe('BPromptEditor default variable chip', (): void => {
  it('renders matched variable token with its value by default', async (): Promise<void> => {
    const wrapper = await mountPromptEditor();

    const chip = wrapper.find('.b-prompt-variable-chip');
    expect(chip.exists()).toBe(true);
    expect(chip.text()).toBe('input.city');
    expect(wrapper.find('.cm-line').text()).not.toContain('{{input.city}}');

    wrapper.unmount();
  });

  it('keeps the default variable chip value when only the label changes', async (): Promise<void> => {
    const wrapper = await mountPromptEditor();

    await wrapper.setProps({
      options: [
        {
          type: 'variable',
          options: [
            {
              label: '目的地',
              value: 'input.city',
              description: '目标城市'
            }
          ]
        }
      ]
    });
    await nextTick();

    expect(wrapper.find('.b-prompt-variable-chip').text()).toBe('input.city');

    wrapper.unmount();
  });

  it('keeps custom chip resolver results before default variable chips', (): void => {
    const resolver = createVariableValueChipResolver(createVariableOptions()[0].options, () => ({ className: 'custom-chip' }));

    expect(resolver('input.city')).toEqual({ className: 'custom-chip' });
  });
});
