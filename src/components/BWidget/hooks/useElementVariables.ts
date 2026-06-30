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
 * @param children - 子级变量选项
 * @returns 变量选项
 */
function createVariable(value: string, label: string, description?: string, children: Variable[] = []): Variable {
  const variable: Variable = { label, value };

  if (description) {
    variable.description = description;
  }

  if (children.length > 0) {
    variable.children = children;
  }

  return variable;
}

/**
 * 从 schema 属性中收集子级变量路径。
 * @param root - 上下文根名称
 * @param properties - schema 属性集合
 * @param parentSegments - 父级路径片段
 * @returns 子级变量选项列表
 */
function collectSchemaVariableChildren(
  root: WidgetBindingContextRoot,
  properties: Record<string, WidgetSchemaProperty> | undefined,
  parentSegments: string[] = []
): Variable[] {
  if (!properties) {
    return [];
  }

  const variables = Object.entries(properties).flatMap(([key, property]: [string, WidgetSchemaProperty]): Variable[] => {
    if (!isWidgetBindingPathSegmentAllowed(key)) {
      return [];
    }

    const segments = [...parentSegments, key];
    const path = formatWidgetBindingPath(root, segments);
    const children = property.type === 'object' ? collectSchemaVariableChildren(root, property.properties, segments) : [];

    return [createVariable(path, property.description ?? key, undefined, children)];
  });

  return variables;
}

/**
 * 从对象记录中收集子级变量路径。
 * @param root - 上下文根名称
 * @param value - 对象记录
 * @param parentSegments - 父级路径片段
 * @returns 子级变量选项列表
 */
function collectRecordVariableChildren(root: WidgetBindingContextRoot, value: Record<string, unknown>, parentSegments: string[] = []): Variable[] {
  const variables = Object.entries(value).flatMap(([key, item]: [string, unknown]): Variable[] => {
    if (!isWidgetBindingPathSegmentAllowed(key)) {
      return [];
    }

    const segments = [...parentSegments, key];
    const path = formatWidgetBindingPath(root, segments);
    const children = isRecord(item) ? collectRecordVariableChildren(root, item, segments) : [];

    return [createVariable(path, key, undefined, children)];
  });

  return variables;
}

/**
 * 创建 schema 根变量。
 * @param root - 上下文根名称
 * @param properties - schema 属性集合
 * @returns schema 根变量
 */
function createSchemaRootVariable(root: WidgetBindingContextRoot, properties: Record<string, WidgetSchemaProperty> | undefined): Variable {
  return createVariable(root, root, undefined, collectSchemaVariableChildren(root, properties));
}

/**
 * 创建记录对象根变量。
 * @param root - 上下文根名称
 * @param value - 对象记录
 * @returns 记录对象根变量
 */
function createRecordRootVariable(root: WidgetBindingContextRoot, value: Record<string, unknown> | undefined): Variable {
  return createVariable(root, root, undefined, value ? collectRecordVariableChildren(root, value) : []);
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
    const inputVariable = createSchemaRootVariable('input', dataItem?.inputSchema.properties);
    const stateVariable = createRecordRootVariable('state', previewContext?.state);
    const outputVariable = createSchemaRootVariable('output', dataItem?.outputSchema.properties);

    return [createVariableGroup([inputVariable, stateVariable, outputVariable, createVariable('lastResult', 'lastResult')])];
  });

  return {
    variableOptions
  };
}
