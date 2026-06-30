/**
 * @file use-element-variables.test.ts
 * @description 验证 BWidget 元素变量 hook 从Widget schema 与预览上下文生成变量候选。
 */
import { ref } from 'vue';
import { describe, expect, it } from 'vitest';
import { useElementVariables } from '@/components/BWidget/hooks/useElementVariables';
import type { WidgetData } from '@/components/BWidget/types';
import type { Variable, VariableOptionGroup } from '@/components/BPromptEditor/types';

/**
 * 测试用变量树节点。
 */
interface VariableTreeNode extends Variable {
  /** 子级变量节点 */
  children?: VariableTreeNode[];
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
        unit: {
          type: 'string',
          description: '温度单位'
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
        'wind-speed': {
          type: 'number',
          description: '风速'
        }
      }
    },
    outputSchema: {
      type: 'object',
      properties: {
        condition: {
          type: 'string',
          description: '天气概况'
        },
        'temperature.celsius': {
          type: 'number',
          description: '摄氏温度'
        }
      }
    },
    metadata: {
      previewContext: {
        input: {
          city: '上海'
        },
        state: {
          weather: {
            temperature: 28
          },
          'weather-data': {
            'feels.like': 31
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
 * 读取变量树根节点。
 * @param groups - 变量分组
 * @returns 变量树根节点列表
 */
function readVariableTrees(groups: VariableOptionGroup[]): VariableTreeNode[] {
  return groups.flatMap((group: VariableOptionGroup): VariableTreeNode[] => group.options as VariableTreeNode[]);
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
 * 扁平读取变量值。
 * @param groups - 变量分组
 * @returns 变量值列表
 */
function readVariableValues(groups: VariableOptionGroup[]): string[] {
  return flattenVariableTree(readVariableTrees(groups)).map((item: VariableTreeNode): string => item.value);
}

/**
 * 扁平读取变量标签。
 * @param groups - 变量分组
 * @returns 变量标签列表
 */
function readVariableLabels(groups: VariableOptionGroup[]): string[] {
  return flattenVariableTree(readVariableTrees(groups)).map((item: VariableTreeNode): string => item.label);
}

/**
 * 扁平读取变量选项。
 * @param groups - 变量分组
 * @returns 变量选项列表
 */
function readVariables(groups: VariableOptionGroup[]): VariableTreeNode[] {
  return flattenVariableTree(readVariableTrees(groups));
}

/**
 * 按变量值查找变量节点。
 * @param groups - 变量分组
 * @param value - 变量值
 * @returns 匹配到的变量节点
 */
function findVariable(groups: VariableOptionGroup[], value: string): VariableTreeNode | undefined {
  return readVariables(groups).find((item: VariableTreeNode): boolean => item.value === value);
}

describe('useElementVariables', (): void => {
  it('provides variables from input schema, preview state, output schema and last result', (): void => {
    const dataItem = ref<WidgetData | undefined>(createWidgetData());
    const { variableOptions } = useElementVariables((): WidgetData | undefined => dataItem.value);
    const values = readVariableValues(variableOptions.value);
    const labels = readVariableLabels(variableOptions.value);

    expect(values).toContain('input.city');
    expect(values).toContain('input.unit');
    expect(values).toContain('input.user');
    expect(values).toContain('input.user.name');
    expect(values).toContain('input["wind-speed"]');
    expect(values).toContain('state.weather');
    expect(values).toContain('state.weather.temperature');
    expect(values).toContain('state["weather-data"]["feels.like"]');
    expect(values).toContain('output.condition');
    expect(values).toContain('output["temperature.celsius"]');
    expect(values).toContain('lastResult');
    expect(labels).toContain('城市名称');
    expect(labels).toContain('温度单位');
    expect(labels).toContain('用户');
    expect(labels).toContain('用户名');
    expect(labels).toContain('temperature');
    expect(labels).toContain('天气概况');
  });

  it('nests object children under selectable parent variables', (): void => {
    const dataItem = ref<WidgetData | undefined>(createWidgetData());
    const { variableOptions } = useElementVariables((): WidgetData | undefined => dataItem.value);
    const roots = readVariableTrees(variableOptions.value);
    const inputVariable = findVariable(variableOptions.value, 'input');
    const userVariable = findVariable(variableOptions.value, 'input.user');
    const stateVariable = findVariable(variableOptions.value, 'state');
    const weatherVariable = findVariable(variableOptions.value, 'state.weather');

    expect(roots.map((item: VariableTreeNode): string => item.value)).toEqual(['input', 'state', 'output', 'lastResult']);
    expect(inputVariable?.children?.map((item: VariableTreeNode): string => item.value)).toEqual([
      'input.city',
      'input.unit',
      'input.user',
      'input["wind-speed"]'
    ]);
    expect(userVariable).toMatchObject({
      label: '用户',
      value: 'input.user',
      children: [
        {
          label: '用户名',
          value: 'input.user.name'
        }
      ]
    });
    expect(stateVariable?.children?.map((item: VariableTreeNode): string => item.value)).toEqual(['state.weather', 'state["weather-data"]']);
    expect(weatherVariable).toMatchObject({
      label: 'weather',
      value: 'state.weather',
      children: [
        {
          label: 'temperature',
          value: 'state.weather.temperature'
        }
      ]
    });
  });

  it('does not duplicate variable paths in the description field', (): void => {
    const dataItem = ref<WidgetData | undefined>(createWidgetData());
    const { variableOptions } = useElementVariables((): WidgetData | undefined => dataItem.value);
    const variables = readVariables(variableOptions.value);
    const cityVariable = variables.find((item: Variable): boolean => item.value === 'input.city');
    const temperatureVariable = variables.find((item: Variable): boolean => item.value === 'state.weather.temperature');

    expect(cityVariable).toEqual({
      label: '城市名称',
      value: 'input.city'
    });
    expect(temperatureVariable).toEqual({
      label: 'temperature',
      value: 'state.weather.temperature'
    });
    expect(variables.filter((item: Variable): boolean => item.description === item.value)).toEqual([]);
  });

  it('falls back to root variables when widget data is not ready', (): void => {
    const dataItem = ref<WidgetData | undefined>();
    const { variableOptions } = useElementVariables((): WidgetData | undefined => dataItem.value);

    expect(readVariableValues(variableOptions.value)).toEqual(['input', 'state', 'output', 'lastResult']);
  });
});
