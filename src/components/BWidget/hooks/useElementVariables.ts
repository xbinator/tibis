/**
 * @file useElementVariables.ts
 * @description BWidget 元素 Setter 变量候选 hook。
 */
import type { Variable, VariableOptionGroup } from '../../BPromptEditor/types';
import type { WidgetData, WidgetSchemaProperty } from '../types';
import type { ComputedRef } from 'vue';
import { computed } from 'vue';
import { formatWidgetBindingPath, isWidgetBindingPathSegmentAllowed, type WidgetBindingContextRoot } from '../utils/widgetBindings';
import { buildWidgetStateSchema } from '../utils/widgetStateSchema';

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
 * 创建变量选项。
 * @param value - 变量路径
 * @param label - 变量说明标签
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

    return [createVariable(path, property.description ?? '', undefined, children)];
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
  return createVariable(root, '', undefined, collectSchemaVariableChildren(root, properties));
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
 * 判断值是否为普通记录。
 * @param value - 待判断值
 * @returns 是否为普通记录
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * 读取 Widget execute 方法代码。
 * @param dataItem - Widget 数据
 * @returns execute 方法代码
 */
function readWidgetExecuteCode(dataItem: WidgetData | undefined): string {
  const executeMethod = dataItem?.execute;
  if (!isRecord(executeMethod)) {
    return '';
  }

  return typeof executeMethod.code === 'string' ? executeMethod.code : '';
}

/**
 * 创建元素 Setter 可插入变量候选。
 * @param readDataItem - Widget 数据读取函数
 * @returns 变量候选响应式对象
 */
export function useElementVariables(readDataItem: ElementDataItemReader): UseElementVariablesReturn {
  const variableOptions = computed<VariableOptionGroup[]>((): VariableOptionGroup[] => {
    const dataItem = readDataItem();
    const stateSchema = buildWidgetStateSchema(readWidgetExecuteCode(dataItem), dataItem?.inputSchema);
    const inputVariable = createSchemaRootVariable('input', dataItem?.inputSchema.properties);
    const stateVariable = createSchemaRootVariable('state', stateSchema.properties);
    const outputVariable = createSchemaRootVariable('output', dataItem?.outputSchema.properties);

    return [createVariableGroup([inputVariable, stateVariable, outputVariable])];
  });

  return {
    variableOptions
  };
}
