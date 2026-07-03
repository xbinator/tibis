/**
 * @file useElementVariables.ts
 * @description BWidget 元素 Setter 变量候选 hook。
 */
import type { Variable, VariableOptionGroup } from '../../BPromptEditor/types';
import type { WidgetData, WidgetElement, WidgetElementLoopConfig, WidgetSchemaObject, WidgetSchemaProperty } from '../types';
import type { ComputedRef } from 'vue';
import { computed } from 'vue';
import { formatWidgetBindingPath, isWidgetBindingPathSegmentAllowed, parseWidgetBindingPath, type WidgetBindingContextRoot } from '../utils/widgetBindings';
import { buildWidgetDataSchema } from '../utils/widgetDataSchema';
import { readWidgetExecuteMethod } from '../utils/widgetExecuteMethod';
import {
  collectWidgetLoopDataSourceOptions,
  readWidgetElementLoopConfig,
  resolveWidgetElementLoopVariableNames,
  type WidgetLoopDataSourceOption
} from '../utils/widgetLoop';
import { findWidgetElementTreeNode } from '../utils/widgetTree';

/** 变量路径标识符匹配表达式。 */
const WIDGET_VARIABLE_IDENTIFIER_PATTERN = /^[A-Za-z_$][\w$]*$/;

/**
 * Widget 数据读取函数。
 */
export type ElementDataItemReader = () => WidgetData | undefined;

/**
 * Widget 元素读取函数。
 */
export type ElementTargetReader = () => WidgetElement | undefined;

/**
 * 元素变量 hook 返回值。
 */
export interface UseElementVariablesReturn {
  /** 当前可插入变量候选 */
  variableOptions: ComputedRef<VariableOptionGroup[]>;
  /** 当前可作为循环数据源的数组变量候选 */
  loopSourceOptions: ComputedRef<WidgetLoopDataSourceOption[]>;
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
 * 格式化局部变量路径片段。
 * @param segment - 路径片段
 * @returns 路径片段文本
 */
function formatLocalVariablePathSegment(segment: string): string {
  if (WIDGET_VARIABLE_IDENTIFIER_PATTERN.test(segment)) {
    return `.${segment}`;
  }

  if (/^\d+$/.test(segment)) {
    return `[${segment}]`;
  }

  return `[${JSON.stringify(segment)}]`;
}

/**
 * 格式化局部变量根路径。
 * @param rootName - 局部变量根名称
 * @returns 局部变量根路径
 */
function formatLocalVariableRoot(rootName: string): string {
  return WIDGET_VARIABLE_IDENTIFIER_PATTERN.test(rootName) ? rootName : `[${JSON.stringify(rootName)}]`;
}

/**
 * 格式化局部变量绑定路径。
 * @param rootName - 局部变量根名称
 * @param segments - 子级路径片段
 * @returns 局部变量路径
 */
function formatLocalVariablePath(rootName: string, segments: string[] = []): string {
  return segments.reduce((path: string, segment: string): string => `${path}${formatLocalVariablePathSegment(segment)}`, formatLocalVariableRoot(rootName));
}

/**
 * 从 schema 属性中收集循环项子级变量。
 * @param rootName - 循环项变量名
 * @param properties - schema 属性集合
 * @param parentSegments - 父级路径片段
 * @returns 子级变量选项列表
 */
function collectLoopItemVariableChildren(
  rootName: string,
  properties: Record<string, WidgetSchemaProperty> | undefined,
  parentSegments: string[] = []
): Variable[] {
  if (!properties) {
    return [];
  }

  return Object.entries(properties).flatMap(([key, property]: [string, WidgetSchemaProperty]): Variable[] => {
    if (!isWidgetBindingPathSegmentAllowed(key)) {
      return [];
    }

    const segments = [...parentSegments, key];
    const path = formatLocalVariablePath(rootName, segments);
    const children = property.type === 'object' ? collectLoopItemVariableChildren(rootName, property.properties, segments) : [];

    return [createVariable(path, property.description ?? '', undefined, children)];
  });
}

/**
 * 读取 schema 路径对应的属性。
 * @param schema - schema 对象
 * @param segments - 数据路径片段
 * @returns 匹配到的 schema 属性
 */
function readSchemaPropertyAtPath(schema: WidgetSchemaObject, segments: string[]): WidgetSchemaProperty | undefined {
  let currentProperties: Record<string, WidgetSchemaProperty> | undefined = schema.properties;
  let currentProperty: WidgetSchemaProperty | undefined;

  for (const segment of segments) {
    currentProperty = currentProperties?.[segment];
    if (!currentProperty) {
      return undefined;
    }

    currentProperties = currentProperty.type === 'object' ? currentProperty.properties : undefined;
  }

  return currentProperty;
}

/**
 * 读取循环数据源数组项 schema。
 * @param dataItem - Widget 数据
 * @param dataSchema - 静态推导 data schema
 * @param config - 循环配置
 * @returns 数组项 schema
 */
function readLoopItemSchema(dataItem: WidgetData, dataSchema: WidgetSchemaObject, config: WidgetElementLoopConfig): WidgetSchemaProperty | undefined {
  const path = parseWidgetBindingPath(config.source);
  if (!path || path.root === 'local') {
    return undefined;
  }

  const sourceSchema = path.root === 'input' ? dataItem.inputSchema : dataSchema;
  const sourceProperty = readSchemaPropertyAtPath(sourceSchema, path.segments);

  return sourceProperty?.type === 'array' ? sourceProperty.items : undefined;
}

/**
 * 读取当前元素可用的循环配置。
 * @param dataItem - Widget 数据
 * @param element - 当前元素
 * @returns 循环配置，缺少时返回 null
 */
function readElementLoopConfig(dataItem: WidgetData | undefined, element: WidgetElement | undefined): WidgetElementLoopConfig | null {
  if (!dataItem || !element) {
    return null;
  }

  const currentNode = findWidgetElementTreeNode(dataItem.elements, element.id);
  const pathElements = currentNode
    ? currentNode.path
        .map((elementId: string): WidgetElement | undefined => findWidgetElementTreeNode(dataItem.elements, elementId)?.element)
        .filter((item: WidgetElement | undefined): item is WidgetElement => item !== undefined)
    : [element];
  const loopOwner = pathElements.find((item: WidgetElement): boolean => readWidgetElementLoopConfig(item.metadata).enabled);

  return loopOwner ? readWidgetElementLoopConfig(loopOwner.metadata) : null;
}

/**
 * 创建循环局部变量候选。
 * @param dataItem - Widget 数据
 * @param dataSchema - 静态推导 data schema
 * @param element - 当前元素
 * @returns 循环局部变量候选
 */
function createLoopVariables(dataItem: WidgetData | undefined, dataSchema: WidgetSchemaObject, element: WidgetElement | undefined): Variable[] {
  const config = readElementLoopConfig(dataItem, element);
  if (!dataItem || !config) {
    return [];
  }

  const variableNames = resolveWidgetElementLoopVariableNames(config);
  const itemSchema = readLoopItemSchema(dataItem, dataSchema, config);
  const itemChildren = itemSchema?.type === 'object' ? collectLoopItemVariableChildren(variableNames.itemName, itemSchema.properties) : [];
  const variables = [createVariable(formatLocalVariableRoot(variableNames.itemName), '循环项', undefined, itemChildren)];

  if (variableNames.indexName !== variableNames.itemName) {
    variables.push(createVariable(formatLocalVariableRoot(variableNames.indexName), '循环索引'));
  }

  return variables;
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
 * 读取 Widget JS 脚本代码。
 * @param dataItem - Widget 数据
 * @returns JS 脚本代码
 */
function readWidgetMethodScriptCode(dataItem: WidgetData | undefined): string {
  if (!dataItem) {
    return '';
  }

  return readWidgetExecuteMethod(dataItem.execute).code;
}

/**
 * 创建元素 Setter 可插入变量候选。
 * @param readDataItem - Widget 数据读取函数
 * @returns 变量候选响应式对象
 */
export function useElementVariables(readDataItem: ElementDataItemReader, readElement?: ElementTargetReader): UseElementVariablesReturn {
  const currentDataItem = computed<WidgetData | undefined>((): WidgetData | undefined => readDataItem());
  const currentDataSchema = computed<WidgetSchemaObject>(
    (): WidgetSchemaObject => buildWidgetDataSchema(readWidgetMethodScriptCode(currentDataItem.value), currentDataItem.value?.inputSchema)
  );
  const variableOptions = computed<VariableOptionGroup[]>((): VariableOptionGroup[] => {
    const dataItem = currentDataItem.value;
    const loopVariables = createLoopVariables(dataItem, currentDataSchema.value, readElement?.());
    const inputVariable = createVariable('input', '', undefined, collectSchemaVariableChildren('input', dataItem?.inputSchema.properties));
    const dataVariables = collectSchemaVariableChildren('data', currentDataSchema.value.properties);

    return [createVariableGroup([...loopVariables, inputVariable, ...dataVariables])];
  });
  const loopSourceOptions = computed<WidgetLoopDataSourceOption[]>((): WidgetLoopDataSourceOption[] => {
    if (!currentDataItem.value) {
      return [];
    }

    return collectWidgetLoopDataSourceOptions(currentDataItem.value.inputSchema, currentDataSchema.value);
  });

  return {
    loopSourceOptions,
    variableOptions
  };
}
