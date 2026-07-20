/**
 * @file default-variable-chip.test.ts
 * @description 验证 BSmartEditor 默认保留变量 token 文本，不渲染为变量 chip。
 * @vitest-environment jsdom
 */
import { readFileSync } from 'node:fs';
import { nextTick } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import BSmartEditor from '@/components/BSmart/Editor.vue';
import type { Variable, VariableOptionGroup } from '@/components/BSmart/types';

/** BSmartEditor 源码。 */
const promptEditorSource = readFileSync('src/components/BSmart/Editor.vue', 'utf8');

/**
 * 测试用变量树节点。
 */
interface VariableTreeNode extends Variable {
  /** 子级变量节点 */
  children?: VariableTreeNode[];
}

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
          label: 'input',
          value: 'input',
          children: [
            {
              label: '城市',
              value: 'input.city',
              description: '当前城市'
            }
          ]
        }
      ] as VariableTreeNode[]
    }
  ];
}

/**
 * 挂载提示词编辑器。
 * @returns 编辑器包装器
 */
async function mountBSmartEditor(): Promise<VueWrapper> {
  const wrapper = mount(BSmartEditor, {
    props: {
      value: '{{input.city}} ',
      options: createVariableOptions()
    },
    attachTo: document.body
  });

  await nextTick();
  return wrapper;
}

/**
 * 读取默认变量 token 的主题配置片段。
 * @returns 变量 token 主题配置源码
 */
function readVariableTokenThemeSource(): string {
  const start = promptEditorSource.indexOf("'.b-prompt-variable-token': {");
  const end = promptEditorSource.indexOf('\n    }', start);

  return promptEditorSource.slice(start, end);
}

describe('BSmartEditor default variable token', (): void => {
  it('keeps matched variable token editable by default', async (): Promise<void> => {
    const wrapper = await mountBSmartEditor();

    expect(wrapper.find('.b-prompt-variable-chip').exists()).toBe(false);
    expect(wrapper.find('.b-prompt-variable-token').exists()).toBe(true);
    expect(wrapper.find('.cm-line').text()).toContain('{{input.city}}');

    wrapper.unmount();
  });

  it('keeps variable token text when variable labels change', async (): Promise<void> => {
    const wrapper = await mountBSmartEditor();

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

    expect(wrapper.find('.b-prompt-variable-chip').exists()).toBe(false);
    expect(wrapper.find('.b-prompt-variable-token').exists()).toBe(true);
    expect(wrapper.find('.cm-line').text()).toContain('{{input.city}}');

    wrapper.unmount();
  });

  it('uses primary text color without background for default variable token', (): void => {
    const variableTokenThemeSource = readVariableTokenThemeSource();

    expect(variableTokenThemeSource).toContain("color: 'var(--color-primary, #4080ff)'");
    expect(variableTokenThemeSource).not.toContain('padding');
    expect(variableTokenThemeSource).not.toContain('fontWeight');
    expect(variableTokenThemeSource).not.toContain('backgroundColor');
    expect(variableTokenThemeSource).not.toContain('borderRadius');
  });

  it('still supports explicit custom chip resolver decoration', async (): Promise<void> => {
    const wrapper = mount(BSmartEditor, {
      props: {
        value: '{{input.city}} ',
        options: createVariableOptions(),
        chipResolver: () => ({ className: 'custom-chip' })
      },
      attachTo: document.body
    });

    await nextTick();

    expect(wrapper.find('.custom-chip').exists()).toBe(true);
    expect(wrapper.find('.cm-line').text()).toContain('{{input.city}}');

    wrapper.unmount();
  });
});
