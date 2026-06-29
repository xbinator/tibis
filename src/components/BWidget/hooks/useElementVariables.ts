/**
 * @file useElementVariables.ts
 * @description BWidget 元素 Setter 变量候选 hook。
 */
import type { Variable, VariableOptionGroup } from '../../BPromptEditor/types';
import type { WidgetData, WidgetSchemaProperty } from '../types';
import type { ComputedRef } from 'vue';
import { computed } from 'vue';
import { isPlainObject } from 'lodash-es';
import { formatWidgetBindingPath, isWidgetBindingPathSegmentAllowed, type WidgetBindingContextRoot } from '../utils/widgetBindings';
import { readWidgetPreviewRenderContext } from '../utils/widgetPreviewContext';

/**
 * Widget 数据读取函数。
 */
export type ElementDataItemReader = () => WidgetData | undefined;

/**
 * 元素变量 hook 返回值。
 */
export interface UseElementVariablesReturn {
  /** 当前可插入变量候选 */
  variableOptions: ComputedRef<VariableOptionGroup[]>;
}

/**
 * 判断未知值是否为可遍历对象记录。
 * @param value - 待判断的未知值
 * @returns 是否为对象记录
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return isPlainObject(value);
}

/**
 * 创建变量选项。
 * @param value - 变量路径
 * @param label - 显示名称
 * @param description - 变量说明
 * @returns 变量选项
 */
function createVariable(value: string, label: string, description?: string): Variable {
  return { label, value, description };
}

/**
 * 从 schema 属性中收集变量路径。
 * @param root - 上下文根名称
 * @param properties - schema 属性集合
 * @param parentSegments - 父级路径片段
 * @returns 变量选项列表
 */
function collectSchemaVariables(
  root: WidgetBindingContextRoot,
  properties: Record<string, WidgetSchemaProperty> | undefined,
  parentSegments: string[] = []
): Variable[] {
  if (!properties) {
    return [createVariable(root, root)];
  }

  const variables = Object.entries(properties).flatMap(([key, property]: [string, WidgetSchemaProperty]): Variable[] => {
    if (!isWidgetBindingPathSegmentAllowed(key)) {
      return [];
    }

    const segments = [...parentSegments, key];
    const path = formatWidgetBindingPath(root, segments);
    const current = createVariable(path, property.description ?? key);

    if (property.type === 'object' && property.properties) {
      return [current, ...collectSchemaVariables(root, property.properties, segments)];
    }

    return [current];
  });

  return variables.length > 0 ? variables : [createVariable(root, root)];
}

/**
 * 从对象记录中收集变量路径。
 * @param root - 上下文根名称
 * @param value - 对象记录
 * @param parentSegments - 父级路径片段
 * @returns 变量选项列表
 */
function collectRecordVariables(root: WidgetBindingContextRoot, value: Record<string, unknown>, parentSegments: string[] = []): Variable[] {
  const variables = Object.entries(value).flatMap(([key, item]: [string, unknown]): Variable[] => {
    if (!isWidgetBindingPathSegmentAllowed(key)) {
      return [];
    }

    const segments = [...parentSegments, key];
    const path = formatWidgetBindingPath(root, segments);
    const current = createVariable(path, key);

    if (isRecord(item)) {
      return [current, ...collectRecordVariables(root, item, segments)];
    }

    return [current];
  });

  return variables.length > 0 ? variables : [createVariable(root, root)];
}

/**
 * 创建变量分组。
 * @param options - 变量选项
 * @returns 变量分组
 */
function createVariableGroup(options: Variable[]): VariableOptionGroup {
  return {
    type: 'variable',
    options
  };
}

/**
 * 创建元素 Setter 可插入变量候选。
 * @param readDataItem - Widget 数据读取函数
 * @returns 变量候选响应式对象
 */
export function useElementVariables(readDataItem: ElementDataItemReader): UseElementVariablesReturn {
  const variableOptions = computed<VariableOptionGroup[]>((): VariableOptionGroup[] => {
    const dataItem = readDataItem();
    const previewContext = dataItem ? readWidgetPreviewRenderContext(dataItem.metadata) : undefined;
    const inputVariables = collectSchemaVariables('input', dataItem?.inputSchema.properties);
    const stateVariables = previewContext?.state ? collectRecordVariables('state', previewContext.state) : [createVariable('state', 'state')];
    const outputVariables = collectSchemaVariables('output', dataItem?.outputSchema.properties);

    return [createVariableGroup([...inputVariables, ...stateVariables, ...outputVariables, createVariable('lastResult', 'lastResult')])];
  });

  return {
    variableOptions
  };
}
