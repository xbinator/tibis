/**
 * @file widgetData.ts
 * @description BWidget 外部 WidgetData 默认值与契约字段归一化工具。
 */
import type { WidgetData, WidgetExecuteMethod, WidgetMetadata, WidgetSchemaObject, WidgetViewport } from '../types';
import { cloneDeep } from 'lodash-es';

/**
 * Widget能力 Schema 类型。
 */
export type WidgetSchemaKind = 'input' | 'state';

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
  /** 执行入口方法 */
  execute?: unknown;
  /** Widget元信息 */
  metadata?: WidgetMetadata;
}

/** 默认空对象 schema，具体字段由小组件配置按需声明。 */
const DEFAULT_WIDGET_EMPTY_SCHEMA: WidgetSchemaObject = {
  type: 'object',
  properties: {},
  required: []
};

/** 各类 schema 的默认模板。 */
const DEFAULT_WIDGET_SCHEMA_TEMPLATES: Record<WidgetSchemaKind, WidgetSchemaObject> = {
  input: DEFAULT_WIDGET_EMPTY_SCHEMA,
  state: DEFAULT_WIDGET_EMPTY_SCHEMA
};

/**
 * 创建默认对象 schema。
 * @param kind - schema 类型
 * @returns 默认对象 schema
 */
export function createDefaultWidgetSchemaObject(kind: WidgetSchemaKind = 'input'): WidgetSchemaObject {
  return cloneDeep(DEFAULT_WIDGET_SCHEMA_TEMPLATES[kind]);
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
 * 判断值是否为普通记录。
 * @param value - 待判断值
 * @returns 是否为普通记录
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * 归一化 Widget 执行入口方法。
 * @param value - 原始执行方法
 * @returns 可保存执行方法，缺失时返回 undefined
 */
function normalizeWidgetExecuteMethod(value: unknown): WidgetExecuteMethod | undefined {
  if (!isRecord(value) || typeof value.code !== 'string') {
    return undefined;
  }

  return {
    ...(typeof value.enabled === 'boolean' ? { enabled: value.enabled } : {}),
    ...(typeof value.description === 'string' ? { description: value.description } : {}),
    ...(typeof value.timeout === 'number' && Number.isFinite(value.timeout) ? { timeout: value.timeout } : {}),
    code: value.code
  };
}

/**
 * 归一化 WidgetData 契约字段。
 * @param candidate - 原始候选值
 * @returns 契约字段
 */
export function normalizeWidgetDataContract(
  candidate: WidgetDataContractCandidate
): Pick<WidgetData, 'name' | 'description' | 'inputSchema' | 'stateSchema' | 'execute' | 'metadata'> {
  const execute = normalizeWidgetExecuteMethod(candidate.execute);

  return {
    name: typeof candidate.name === 'string' ? candidate.name : '',
    description: typeof candidate.description === 'string' ? candidate.description : '',
    inputSchema: normalizeWidgetSchemaObject(candidate.inputSchema, 'input'),
    stateSchema: normalizeWidgetSchemaObject(candidate.stateSchema, 'state'),
    ...(execute ? { execute } : {}),
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
