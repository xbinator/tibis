/**
 * @file text-setter.component.test.ts
 * @description 验证 BWidget 文本元素 Setter 使用单个 Prompt 编辑器编辑静态文本与动态变量。
 * @vitest-environment jsdom
 */
/* eslint-disable vue/one-component-per-file */
import { defineComponent } from 'vue';
import type { PropType } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import type { Variable, VariableOptionGroup } from '@/components/BPromptEditor/types';
import TextSetter from '@/components/BWidget/elements/Text/Setter.vue';
import type { WidgetData, WidgetElement } from '@/components/BWidget/types';

/** 已移除的旧根变量名。 */
const REMOVED_LEGACY_ROOT = ['last', 'Result'].join('');

/**
 * 测试用变量树节点。
 */
interface VariableTreeNode extends Variable {
  /** 子级变量节点 */
  children?: VariableTreeNode[];
}

/**
 * 创建测试文本元素。
 * @returns 测试文本元素
 */
function createTextElement(): WidgetElement {
  return {
    id: 'text-1',
    name: 'text',
    label: '文本',
    icon: 'lucide:type',
    title: '文本名称',
    position: { x: 0, y: 0 },
    size: { width: 100, height: 24 },
    rotation: 0,
    style: {},
    metadata: {
      content: '原始内容'
    }
  };
}

/**
 * 创建测试Widget 数据。
 * @returns 测试Widget 数据
 */
function createWidgetData(): WidgetData {
  return {
    name: 'weather',
    description: '天气 Widget',
    inputSchema: {
      type: 'object',
      properties: {
        city: {
          type: 'string',
          description: '城市名称'
        },
        user: {
          type: 'object',
          description: '用户',
          properties: {
            name: {
              type: 'string',
              description: '用户名'
            }
          }
        },
        weather: {
          type: 'object',
          description: '天气输入',
          properties: {
            temperature: {
              type: 'number',
              description: '温度'
            }
          },
          required: []
        }
      }
    },
    stateSchema: {
      type: 'object',
      properties: {}
    },
    execute: {
      code: [
        'export async function execute(ctx: WidgetSkillContext): Promise<ExecutionResult> {',
        '  const { input, setState, result } = ctx',
        '  setState("weather", { temperature: input.weather.temperature })',
        '  return result.success()',
        '}'
      ].join('\n')
    },
    metadata: {
      previewContext: {
        input: {
          city: '上海'
        },
        state: {
          weather: {
            temperature: 28
          }
        }
      }
    },
    elements: [],
    viewport: {
      center: { x: 0, y: 0 },
      zoom: 1
    }
  };
}

/**
 * 挂载文本 Setter。
 * @param element - 文本元素
 * @param dataItem - Widget 数据
 * @returns 组件包装器
 */
function mountTextSetter(element: WidgetElement, dataItem: WidgetData = createWidgetData()): VueWrapper {
  return mount(TextSetter, {
    props: {
      element,
      dataItem
    },
    global: {
      components: {
        BSectionBlock: defineComponent({
          name: 'BSectionBlockStub',
          props: {
            title: {
              type: String,
              required: true
            }
          },
          template: '<section data-testid="widget-text-setter" :data-title="title"><slot></slot></section>'
        }),
        BPromptEditor: defineComponent({
          name: 'BPromptEditorStub',
          props: {
            value: {
              type: String,
              default: ''
            },
            options: {
              type: Array as PropType<VariableOptionGroup[]>,
              default: (): VariableOptionGroup[] => []
            }
          },
          emits: {
            /**
             * 更新编辑器文本。
             * @param value - 新文本
             * @returns 是否允许触发事件
             */
            'update:value': (value: string): boolean => typeof value === 'string'
          },
          template: '<textarea data-testid="text-setter-prompt-editor" :value="value" @input="$emit(\'update:value\', $event.target.value)"></textarea>'
        })
      }
    }
  });
}

/**
 * 扁平化变量树。
 * @param variables - 变量树节点列表
 * @returns 扁平变量节点列表
 */
function flattenVariableTree(variables: VariableTreeNode[]): VariableTreeNode[] {
  return variables.flatMap((item: VariableTreeNode): VariableTreeNode[] => [item, ...flattenVariableTree(item.children ?? [])]);
}

/**
 * 读取变量分组中的全部变量。
 * @param options - 变量分组选项
 * @returns 扁平变量列表
 */
function readVariables(options: VariableOptionGroup[]): VariableTreeNode[] {
  return options.flatMap((group: VariableOptionGroup): VariableTreeNode[] => flattenVariableTree(group.options as VariableTreeNode[]));
}

describe('Text Setter', (): void => {
  it('edits static text and binding expression with one prompt editor', async (): Promise<void> => {
    const element = createTextElement();
    const wrapper = mountTextSetter(element);
    const editor = wrapper.findComponent({ name: 'BPromptEditorStub' });

    expect(wrapper.find('[data-testid="widget-text-setter"]').attributes('data-title')).toBe('内容');
    expect(wrapper.findAllComponents({ name: 'BPromptEditorStub' })).toHaveLength(1);
    expect(editor.props('value')).toBe('原始内容');

    await wrapper.find('[data-testid="text-setter-prompt-editor"]').setValue('{{ input.city }} 当前 {{ state.weather.temperature }}°C');

    expect(element.title).toBe('文本名称');
    expect(element.metadata.content).toBe('{{ input.city }} 当前 {{ state.weather.temperature }}°C');
    wrapper.unmount();
  });

  it('keeps unrelated metadata when editing the unified content value', async (): Promise<void> => {
    const element = createTextElement();
    element.metadata.helperText = '温度辅助信息';
    const wrapper = mountTextSetter(element);
    const editor = wrapper.findComponent({ name: 'BPromptEditorStub' });

    expect(editor.props('value')).toBe('原始内容');

    await wrapper.find('[data-testid="text-setter-prompt-editor"]').setValue('温度：{{ state.weather.temperature }}°C');

    expect(element.metadata.content).toBe('温度：{{ state.weather.temperature }}°C');
    expect(element.metadata.helperText).toBe('温度辅助信息');
    wrapper.unmount();
  });

  it('uses an empty editor value when metadata content is missing', (): void => {
    const element = createTextElement();
    delete element.metadata.content;
    const wrapper = mountTextSetter(element);
    const editor = wrapper.findComponent({ name: 'BPromptEditorStub' });

    expect(editor.props('value')).toBe('');
    wrapper.unmount();
  });

  it('provides widget context variables to the prompt editor', (): void => {
    const wrapper = mountTextSetter(createTextElement());
    const editor = wrapper.findComponent({ name: 'BPromptEditorStub' });
    const options = editor.props('options') as VariableOptionGroup[];
    const rootVariables = options.flatMap((group: VariableOptionGroup): string[] => group.options.map((item): string => item.value));
    const variables = readVariables(options).map((item: VariableTreeNode): string => item.value);
    const labels = readVariables(options).map((item: VariableTreeNode): string => item.label);

    expect(rootVariables).toEqual(['input', 'state']);
    expect(variables).toContain('input.city');
    expect(variables).toContain('input.user');
    expect(variables).toContain('input.user.name');
    expect(variables).toContain('state.weather.temperature');
    expect(variables).not.toContain('output.condition');
    expect(variables).not.toContain(REMOVED_LEGACY_ROOT);
    expect(labels).toContain('城市名称');
    expect(labels).toContain('用户');
    expect(labels).toContain('用户名');
    expect(labels).toContain('温度');
    wrapper.unmount();
  });
});
