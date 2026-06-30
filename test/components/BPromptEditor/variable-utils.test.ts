/**
 * @file variable-utils.test.ts
 * @description 验证 BPromptEditor 变量树工具的可见节点计算。
 */
import { describe, expect, it } from 'vitest';
import { getVisibleVariables } from '@/components/BPromptEditor/utils/variables';
import type { Variable } from '@/components/BPromptEditor/types';

/**
 * 创建测试变量树。
 * @returns 测试变量树
 */
function createVariableTree(): Variable[] {
  return [
    {
      label: 'input',
      value: 'input',
      children: [
        {
          label: 'user',
          value: 'input.user',
          children: [
            {
              label: 'name',
              value: 'input.user.name',
              description: '用户名'
            }
          ]
        }
      ]
    },
    {
      label: 'state',
      value: 'state',
      children: [
        {
          label: 'weather',
          value: 'state.weather',
          children: [
            {
              label: 'temperature',
              value: 'state.weather.temperature'
            }
          ]
        }
      ]
    },
    {
      label: 'lastResult',
      value: 'lastResult'
    }
  ];
}

describe('BPromptEditor variable utilities', (): void => {
  it('hides descendants for collapsed tree nodes', (): void => {
    const variables = getVisibleVariables(createVariableTree(), new Set(['input']), '');

    expect(variables.map((variable): string => variable.value)).toEqual(['input', 'state', 'state.weather', 'state.weather.temperature', 'lastResult']);
    expect(variables[0]).toMatchObject({
      value: 'input',
      depth: 0,
      hasChildren: true,
      expanded: false
    });
    expect(variables[1]).toMatchObject({
      value: 'state',
      depth: 0,
      hasChildren: true,
      expanded: true
    });
  });

  it('keeps ancestor context visible while searching nested variables', (): void => {
    const variables = getVisibleVariables(createVariableTree(), new Set(['input']), '用户名');

    expect(variables.map((variable): string => variable.value)).toEqual(['input', 'input.user', 'input.user.name']);
    expect(variables.map((variable): number => variable.depth)).toEqual([0, 1, 2]);
    expect(variables.every((variable): boolean => variable.expanded)).toBe(true);
  });
});
