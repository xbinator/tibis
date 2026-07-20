/**
 * @file variable-utils.test.ts
 * @description 验证 BSmartEditor 变量树工具的可见节点计算。
 */
import { describe, expect, it } from 'vitest';
import type { Variable } from '@/components/BSmart/types';
import { getVisibleVariables } from '@/components/BSmart/utils/variables';

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
      label: 'data',
      value: 'data',
      children: [
        {
          label: 'weather',
          value: 'data.weather',
          children: [
            {
              label: 'temperature',
              value: 'data.weather.temperature'
            }
          ]
        }
      ]
    },
    {
      label: 'output',
      value: 'output'
    }
  ];
}

describe('BSmartEditor variable utilities', (): void => {
  it('hides descendants for collapsed tree nodes', (): void => {
    const variables = getVisibleVariables(createVariableTree(), new Set(['input']), '');

    expect(variables.map((variable): string => variable.value)).toEqual(['input', 'data', 'data.weather', 'data.weather.temperature', 'output']);
    expect(variables[0]).toMatchObject({
      value: 'input',
      depth: 0,
      hasChildren: true,
      expanded: false
    });
    expect(variables[1]).toMatchObject({
      value: 'data',
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

  it('does not mark toggle placeholders for leaf nodes', (): void => {
    const variables = getVisibleVariables(
      [
        {
          label: 'root',
          value: 'root',
          children: [
            {
              label: 'group',
              value: 'root.group',
              children: [
                {
                  label: 'leaf',
                  value: 'root.group.leaf'
                }
              ]
            },
            {
              label: 'plain',
              value: 'root.plain'
            }
          ]
        },
        {
          label: 'output',
          value: 'output'
        }
      ],
      new Set(),
      ''
    );

    expect(variables.find((variable) => variable.value === 'root.plain')?.showTogglePlaceholder).toBe(false);
    expect(variables.find((variable) => variable.value === 'root.group.leaf')?.showTogglePlaceholder).toBe(false);
    expect(variables.find((variable) => variable.value === 'output')?.showTogglePlaceholder).toBe(false);
  });
});
