/**
 * @file widgetData.ts
 * @description BWidget 外部 WidgetData 默认值与契约字段归一化工具。
 */
import type { WidgetData, WidgetMetadata, WidgetSchemaObject, WidgetViewport } from '../types';
import { cloneDeep } from 'lodash-es';

/**
 * Widget能力 Schema 类型。
 */
export type WidgetSchemaKind = 'input' | 'state' | 'output';

/**
 * 可归一化为 WidgetData 契约字段的数据。
 */
export interface WidgetDataContractCandidate {
  /** Widget能力标识符 */
  name?: unknown;
  /** Widget能力描述 */
  description?: unknown;
  /** 入参 schema */
  inputSchema?: unknown;
  /** 运行状态 schema */
  stateSchema?: unknown;
  /** 出参 schema */
  outputSchema?: unknown;
  /** Widget元信息 */
  metadata?: WidgetMetadata;
}

/** 查天气入参默认 schema。 */
const DEFAULT_WIDGET_INPUT_SCHEMA: WidgetSchemaObject = {
  type: 'object',
  properties: {
    city: {
      type: 'string',
      description: '城市名称，例如上海'
    },
    date: {
      type: 'string',
      description: '查询日期，例如今天或明天'
    },
    unit: {
      type: 'string',
      description: '温度单位，celsius 或 fahrenheit'
    }
  },
  required: ['city']
};

/** 查天气出参默认 schema。 */
const DEFAULT_WIDGET_OUTPUT_SCHEMA: WidgetSchemaObject = {
  type: 'object',
  properties: {
    condition: {
      type: 'string',
      description: '天气概况'
    },
    temperatureCelsius: {
      type: 'number',
      description: '摄氏温度'
    },
    suggestion: {
      type: 'string',
      description: '出行建议'
    }
  },
  required: ['condition', 'temperatureCelsius']
};

/** 运行状态默认 schema，实际字段由 execute 代码中的 setState 推导。 */
const DEFAULT_WIDGET_STATE_SCHEMA: WidgetSchemaObject = {
  type: 'object',
  properties: {},
  required: []
};

/**
 * 读取指定类型的默认 schema 模板。
 * @param kind - schema 类型
 * @returns 默认 schema 模板
 */
function getDefaultWidgetSchemaTemplate(kind: WidgetSchemaKind): WidgetSchemaObject {
  if (kind === 'input') {
    return DEFAULT_WIDGET_INPUT_SCHEMA;
  }

  if (kind === 'state') {
    return DEFAULT_WIDGET_STATE_SCHEMA;
  }

  return DEFAULT_WIDGET_OUTPUT_SCHEMA;
}

/**
 * 创建默认对象 schema。
 * @param kind - schema 类型
 * @returns 默认对象 schema
 */
export function createDefaultWidgetSchemaObject(kind: WidgetSchemaKind = 'input'): WidgetSchemaObject {
  return cloneDeep(getDefaultWidgetSchemaTemplate(kind));
}

/**
 * 判断值是否为可保存的 WidgetData 对象 schema。
 * @param value - 待检查值
 * @returns 是否为对象 schema
 */
function isWidgetSchemaObject(value: unknown): value is WidgetSchemaObject {
  return typeof value === 'object' && value !== null && (value as { type?: unknown }).type === 'object';
}

/**
 * 归一化 WidgetData 对象 schema。
 * @param value - 原始 schema
 * @param kind - schema 类型
 * @returns 可保存对象 schema
 */
export function normalizeWidgetSchemaObject(value: unknown, kind: WidgetSchemaKind = 'input'): WidgetSchemaObject {
  if (!isWidgetSchemaObject(value)) {
    return createDefaultWidgetSchemaObject(kind);
  }

  return {
    type: 'object',
    ...(typeof value.description === 'string' ? { description: value.description } : {}),
    properties: typeof value.properties === 'object' && value.properties !== null ? cloneDeep(value.properties) : {},
    required: Array.isArray(value.required) ? [...value.required].filter((item: unknown): item is string => typeof item === 'string') : []
  };
}

/**
 * 归一化 WidgetData 契约字段。
 * @param candidate - 原始候选值
 * @returns 契约字段
 */
export function normalizeWidgetDataContract(
  candidate: WidgetDataContractCandidate
): Pick<WidgetData, 'name' | 'description' | 'inputSchema' | 'stateSchema' | 'outputSchema' | 'metadata'> {
  return {
    name: typeof candidate.name === 'string' ? candidate.name : '',
    description: typeof candidate.description === 'string' ? candidate.description : '',
    inputSchema: normalizeWidgetSchemaObject(candidate.inputSchema, 'input'),
    stateSchema: normalizeWidgetSchemaObject(candidate.stateSchema, 'state'),
    outputSchema: normalizeWidgetSchemaObject(candidate.outputSchema, 'output'),
    metadata: cloneDeep(candidate.metadata ?? {})
  };
}

/**
 * 创建默认视口。
 * @returns 默认视口
 */
export function createDefaultWidgetViewport(): WidgetViewport {
  return {
    center: { x: 0, y: 0 },
    zoom: 1
  };
}

/**
 * 创建空Widget数据。
 * @returns 空Widget数据
 */
export function createDefaultWidgetData(): WidgetData {
  return {
    ...normalizeWidgetDataContract({}),
    elements: [],
    viewport: createDefaultWidgetViewport()
  };
}
