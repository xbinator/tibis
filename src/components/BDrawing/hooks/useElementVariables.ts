/**
 * @file useElementVariables.ts
 * @description BDrawing 元素 Setter 变量候选 hook。
 */
import type { Variable, VariableOptionGroup } from '../../BPromptEditor/types';
import type { DrawingData, DrawingSchemaProperty } from '../types';
import type { ComputedRef } from 'vue';
import { computed } from 'vue';
import { isPlainObject } from 'lodash-es';
import { formatDrawingBindingPath, isDrawingBindingPathSegmentAllowed, type DrawingBindingContextRoot } from '../utils/drawingBindings';
import { readDrawingPreviewRenderContext } from '../utils/drawingPreviewContext';

/**
 * 画图数据读取函数。
 */
export type ElementDrawingDataReader = () => DrawingData | undefined;

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
  root: DrawingBindingContextRoot,
  properties: Record<string, DrawingSchemaProperty> | undefined,
  parentSegments: string[] = []
): Variable[] {
  if (!properties) {
    return [createVariable(root, root)];
  }

  const variables = Object.entries(properties).flatMap(([key, property]: [string, DrawingSchemaProperty]): Variable[] => {
    if (!isDrawingBindingPathSegmentAllowed(key)) {
      return [];
    }

    const segments = [...parentSegments, key];
    const path = formatDrawingBindingPath(root, segments);
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
function collectRecordVariables(root: DrawingBindingContextRoot, value: Record<string, unknown>, parentSegments: string[] = []): Variable[] {
  const variables = Object.entries(value).flatMap(([key, item]: [string, unknown]): Variable[] => {
    if (!isDrawingBindingPathSegmentAllowed(key)) {
      return [];
    }

    const segments = [...parentSegments, key];
    const path = formatDrawingBindingPath(root, segments);
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
 * @param readDrawingData - 画图数据读取函数
 * @returns 变量候选响应式对象
 */
export function useElementVariables(readDrawingData: ElementDrawingDataReader): UseElementVariablesReturn {
  const variableOptions = computed<VariableOptionGroup[]>((): VariableOptionGroup[] => {
    const drawingData = readDrawingData();
    const previewContext = drawingData ? readDrawingPreviewRenderContext(drawingData.metadata) : undefined;
    const inputVariables = collectSchemaVariables('input', drawingData?.inputSchema.properties);
    const stateVariables = previewContext?.state ? collectRecordVariables('state', previewContext.state) : [createVariable('state', 'state')];
    const outputVariables = collectSchemaVariables('output', drawingData?.outputSchema.properties);

    return [createVariableGroup([...inputVariables, ...stateVariables, ...outputVariables, createVariable('lastResult', 'lastResult')])];
  });

  return {
    variableOptions
  };
}
