/**
 * @file use-element-variables.test.ts
 * @description 验证 BDrawing 元素变量 hook 从画布 schema 与预览上下文生成变量候选。
 */
import { ref } from 'vue';
import { describe, expect, it } from 'vitest';
import { useElementVariables } from '@/components/BDrawing/hooks/useElementVariables';
import type { DrawingData } from '@/components/BDrawing/types';
import type { Variable, VariableOptionGroup } from '@/components/BPromptEditor/types';

/**
 * 创建测试画图数据。
 * @returns 测试画图数据
 */
function createDrawingData(): DrawingData {
  return {
    name: 'weather',
    description: '天气画布',
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
 * 扁平读取变量值。
 * @param groups - 变量分组
 * @returns 变量值列表
 */
function readVariableValues(groups: VariableOptionGroup[]): string[] {
  return groups.flatMap((group: VariableOptionGroup): string[] => group.options.map((item): string => item.value));
}

/**
 * 扁平读取变量标签。
 * @param groups - 变量分组
 * @returns 变量标签列表
 */
function readVariableLabels(groups: VariableOptionGroup[]): string[] {
  return groups.flatMap((group: VariableOptionGroup): string[] => group.options.map((item): string => item.label));
}

/**
 * 扁平读取变量选项。
 * @param groups - 变量分组
 * @returns 变量选项列表
 */
function readVariables(groups: VariableOptionGroup[]): Variable[] {
  return groups.flatMap((group: VariableOptionGroup): Variable[] => group.options);
}

describe('useElementVariables', (): void => {
  it('provides variables from input schema, preview state, output schema and last result', (): void => {
    const drawingData = ref<DrawingData | undefined>(createDrawingData());
    const { variableOptions } = useElementVariables((): DrawingData | undefined => drawingData.value);
    const values = readVariableValues(variableOptions.value);
    const labels = readVariableLabels(variableOptions.value);

    expect(values).toContain('input.city');
    expect(values).toContain('input.unit');
    expect(values).toContain('input["wind-speed"]');
    expect(values).toContain('state.weather.temperature');
    expect(values).toContain('state["weather-data"]["feels.like"]');
    expect(values).toContain('output.condition');
    expect(values).toContain('output["temperature.celsius"]');
    expect(values).toContain('lastResult');
    expect(labels).toContain('城市名称');
    expect(labels).toContain('温度单位');
    expect(labels).toContain('temperature');
    expect(labels).toContain('天气概况');
  });

  it('does not duplicate variable paths in the description field', (): void => {
    const drawingData = ref<DrawingData | undefined>(createDrawingData());
    const { variableOptions } = useElementVariables((): DrawingData | undefined => drawingData.value);
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

  it('falls back to root variables when drawing data is not ready', (): void => {
    const drawingData = ref<DrawingData | undefined>();
    const { variableOptions } = useElementVariables((): DrawingData | undefined => drawingData.value);

    expect(readVariableValues(variableOptions.value)).toEqual(['input', 'state', 'output', 'lastResult']);
  });
});
