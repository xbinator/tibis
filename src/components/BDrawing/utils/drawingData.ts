/**
 * @file drawingData.ts
 * @description BDrawing 外部 DrawingData 默认值与契约字段归一化工具。
 */
import type { DrawingData, DrawingMetadata, DrawingSchemaObject, DrawingViewport } from '../types';
import { cloneDeep } from 'lodash-es';

/**
 * 画板能力 Schema 类型。
 */
export type DrawingSchemaKind = 'input' | 'output';

/**
 * 可归一化为 DrawingData 契约字段的数据。
 */
export interface DrawingDataContractCandidate {
  /** 画板能力标识符 */
  name?: unknown;
  /** 画板能力描述 */
  description?: unknown;
  /** 入参 schema */
  inputSchema?: unknown;
  /** 出参 schema */
  outputSchema?: unknown;
  /** 画板元信息 */
  metadata?: DrawingMetadata;
}

/** 查天气入参默认 schema。 */
const DEFAULT_DRAWING_INPUT_SCHEMA: DrawingSchemaObject = {
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
const DEFAULT_DRAWING_OUTPUT_SCHEMA: DrawingSchemaObject = {
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

/**
 * 读取指定类型的默认 schema 模板。
 * @param kind - schema 类型
 * @returns 默认 schema 模板
 */
function getDefaultDrawingSchemaTemplate(kind: DrawingSchemaKind): DrawingSchemaObject {
  return kind === 'input' ? DEFAULT_DRAWING_INPUT_SCHEMA : DEFAULT_DRAWING_OUTPUT_SCHEMA;
}

/**
 * 创建默认对象 schema。
 * @param kind - schema 类型
 * @returns 默认对象 schema
 */
export function createDefaultDrawingSchemaObject(kind: DrawingSchemaKind = 'input'): DrawingSchemaObject {
  return cloneDeep(getDefaultDrawingSchemaTemplate(kind));
}

/**
 * 判断值是否为可保存的 DrawingData 对象 schema。
 * @param value - 待检查值
 * @returns 是否为对象 schema
 */
function isDrawingSchemaObject(value: unknown): value is DrawingSchemaObject {
  return typeof value === 'object' && value !== null && (value as { type?: unknown }).type === 'object';
}

/**
 * 归一化 DrawingData 对象 schema。
 * @param value - 原始 schema
 * @param kind - schema 类型
 * @returns 可保存对象 schema
 */
export function normalizeDrawingSchemaObject(value: unknown, kind: DrawingSchemaKind = 'input'): DrawingSchemaObject {
  if (!isDrawingSchemaObject(value)) {
    return createDefaultDrawingSchemaObject(kind);
  }

  return {
    type: 'object',
    ...(typeof value.description === 'string' ? { description: value.description } : {}),
    properties: typeof value.properties === 'object' && value.properties !== null ? cloneDeep(value.properties) : {},
    required: Array.isArray(value.required) ? [...value.required].filter((item: unknown): item is string => typeof item === 'string') : []
  };
}

/**
 * 归一化 DrawingData 契约字段。
 * @param candidate - 原始候选值
 * @returns 契约字段
 */
export function normalizeDrawingDataContract(
  candidate: DrawingDataContractCandidate
): Pick<DrawingData, 'name' | 'description' | 'inputSchema' | 'outputSchema' | 'metadata'> {
  return {
    name: typeof candidate.name === 'string' ? candidate.name : '',
    description: typeof candidate.description === 'string' ? candidate.description : '',
    inputSchema: normalizeDrawingSchemaObject(candidate.inputSchema, 'input'),
    outputSchema: normalizeDrawingSchemaObject(candidate.outputSchema, 'output'),
    metadata: cloneDeep(candidate.metadata ?? {})
  };
}

/**
 * 创建默认视口。
 * @returns 默认视口
 */
export function createDefaultDrawingViewport(): DrawingViewport {
  return {
    center: { x: 0, y: 0 },
    zoom: 1
  };
}

/**
 * 创建空画板数据。
 * @returns 空画板数据
 */
export function createDefaultDrawingData(): DrawingData {
  return {
    ...normalizeDrawingDataContract({}),
    elements: [],
    viewport: createDefaultDrawingViewport()
  };
}
